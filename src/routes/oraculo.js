const express = require("express");
const { getHubspotContext } = require("../services/hubspot");
const { getVerdict } = require("../services/gemini");
const { postMessage } = require("../services/slack");
const { reloadKnowledgeBase } = require("../services/knowledgeBase");

const router = express.Router();

function checkSharedSecret(req, res, next) {
  const expected = process.env.WEBHOOK_SHARED_SECRET;
  if (!expected) return next(); // sem segredo configurado, nao bloqueia (so pra facilitar teste local)
  const got = req.header("X-Oraculo-Secret");
  if (got !== expected) {
    return res.status(401).json({ error: "Segredo invalido" });
  }
  next();
}

/**
 * Aceita os nomes de campo que o passo de webhook do Slack Workflow
 * Builder manda (exatamente como voce nomeou as variaveis do
 * formulario) e normaliza para um objeto interno fixo. Ajuste os
 * nomes da esquerda se o seu formulario usar rotulos diferentes.
 */
function normalizeForm(body) {
  const pick = (...keys) => keys.map((k) => body[k]).find((v) => v !== undefined && v !== "");
  return {
    solicitante: pick("Solicitante", "solicitante"),
    time: pick("Time", "time"),
    bu: pick("BU", "bu"),
    tipoDuvida: pick("Tipo de dúvida", "Tipo de Dúvida", "TipoDuvida", "tipo_duvida"),
    linkHubspot: pick("Link HubSpot", "Link do Hub", "LinkHubSpot", "link_hubspot"),
    contexto: pick("Contexto", "contexto"),
    channel: pick("channel", "Canal", "channel_id"),
  };
}

router.post("/webhook/oraculo", checkSharedSecret, async (req, res) => {
  const form = normalizeForm(req.body || {});
  const channel = form.channel || process.env.DEFAULT_SLACK_CHANNEL;

  if (!form.linkHubspot) {
    const msg =
      "*Veredito:* ESCALAR PARA HUMANO\n*Fundamentação:* Link da empresa/negócio no HubSpot não foi informado.\n*Escalada:* Peça ao solicitante para reenviar com o link preenchido.";
    if (channel) await postMessage({ channel, text: msg }).catch(() => {});
    return res.status(200).json({ ok: true, verdict: msg });
  }

  let hubspotContext = null;
  let hubspotError = null;
  try {
    hubspotContext = await getHubspotContext(form.linkHubspot, process.env.HUBSPOT_PRIVATE_APP_TOKEN);
  } catch (err) {
    hubspotError = err.message;
  }

  let verdictText;
  try {
    verdictText = await getVerdict({ form, hubspotContext, hubspotError });
  } catch (err) {
    verdictText = `*Veredito:* ESCALAR PARA HUMANO\n*Fundamentação:* Erro ao consultar o modelo de IA (${err.message}).\n*Escalada:* Tentar novamente ou acionar o time do Oráculo.`;
  }

  if (channel) {
    try {
      await postMessage({ channel, text: verdictText });
    } catch (err) {
      // Nao derruba a resposta HTTP so porque o post no Slack falhou -
      // devolve o veredito no corpo da resposta mesmo assim.
      return res.status(200).json({ ok: true, verdict: verdictText, slackPostError: err.message });
    }
  }

  return res.status(200).json({ ok: true, verdict: verdictText });
});

// Util para forcar releitura da base de conhecimento sem reiniciar o
// processo, depois de um git pull no servidor. Protegido pelo mesmo
// segredo do webhook.
router.post("/admin/reload-knowledge-base", checkSharedSecret, (req, res) => {
  const kb = reloadKnowledgeBase();
  res.json({ ok: true, files: kb.files });
});

module.exports = router;
