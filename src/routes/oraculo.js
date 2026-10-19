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

/**
 * Logica central, compartilhada pelo caminho Slack (/webhook/oraculo) e
 * pelo caminho da pagina web (/api/consulta): consulta o HubSpot,
 * monta o prompt com a base de conhecimento e chama o Gemini. Nunca
 * posta no Slack - isso fica a cargo de quem chama esta funcao.
 */
async function resolveVerdict(form) {
  if (!form.linkHubspot) {
    return "*Veredito:* ESCALAR PARA HUMANO\n*Fundamentação:* Link da empresa/negócio no HubSpot não foi informado.\n*Escalada:* Peça ao solicitante para reenviar com o link preenchido.";
  }

  let hubspotContext = null;
  let hubspotError = null;
  try {
    hubspotContext = await getHubspotContext(form.linkHubspot, process.env.HUBSPOT_PRIVATE_APP_TOKEN);
  } catch (err) {
    hubspotError = err.message;
  }

  try {
    return await getVerdict({ form, hubspotContext, hubspotError });
  } catch (err) {
    return `*Veredito:* ESCALAR PARA HUMANO\n*Fundamentação:* Erro ao consultar o modelo de IA (${err.message}).\n*Escalada:* Tentar novamente ou acionar o time do Oráculo.`;
  }
}

router.post("/webhook/oraculo", checkSharedSecret, async (req, res) => {
  const form = normalizeForm(req.body || {});
  const channel = form.channel || process.env.DEFAULT_SLACK_CHANNEL;

  const verdictText = await resolveVerdict(form);

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

// --- Caminho alternativo: pagina web em public/index.html --------------
// Limite simples de taxa por IP em memoria, so pra evitar que a pagina
// publica seja usada para gastar credito de API sem controle. Nao
// sobrevive a reinicio/redeploy do processo - e so uma rede de
// seguranca basica, nao substitui autenticacao de verdade.
const rateLimitWindowMs = 10 * 60 * 1000; // 10 minutos
const rateLimitMax = 15;
const requestLog = new Map(); // ip -> [timestamps]

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < rateLimitWindowMs);
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > rateLimitMax;
}

router.post("/api/consulta", async (req, res) => {
  const accessCode = process.env.FRONTEND_ACCESS_CODE;
  if (accessCode && req.header("X-Access-Code") !== accessCode) {
    return res.status(401).json({ error: "Código de acesso inválido ou ausente." });
  }

  const ip = req.header("x-forwarded-for") || req.socket.remoteAddress || "desconhecido";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Muitas consultas em pouco tempo. Aguarde alguns minutos." });
  }

  const form = normalizeForm(req.body || {});
  const verdictText = await resolveVerdict(form);
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
