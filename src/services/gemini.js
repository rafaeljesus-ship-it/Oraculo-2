const { GoogleGenerativeAI } = require("@google/generative-ai");
const { loadKnowledgeBase } = require("./knowledgeBase");

function buildPrompt({ form, hubspotContext, hubspotError }) {
  const kb = loadKnowledgeBase();

  const hubspotBlock = hubspotError
    ? `\n\nDADOS DO CRM (HUBSPOT): A consulta falhou com o erro abaixo. Isso conta como "dado incompleto/indisponivel" - siga a regra de ESCALAR PARA HUMANO das instrucoes.\nErro: ${hubspotError}`
    : `\n\nDADOS DO CRM (HUBSPOT), consultados agora em tempo real:\n${JSON.stringify(hubspotContext, null, 2)}`;

  return `Você é o Oráculo de Pré-Vendas da Flash. Abaixo estão (1) as instruções
do seu papel e a base de conhecimento completa com as regras oficiais, e
(2) os dados do caso concreto que você precisa decidir agora.

Use SOMENTE as regras do bloco de instruções/base de conhecimento abaixo.
Não invente regra, ID de regra ou dado de CRM que não esteja explicitamente
nos blocos fornecidos. Se a base não tiver regra clara para o caso, ou os
dados do CRM estiverem incompletos, não arrisque um veredito: responda que
o caso precisa ser escalado para um humano e diga o motivo, seguindo a
tabela de responsáveis por escalonamento das instruções.

===================== INSTRUÇÕES E BASE DE CONHECIMENTO =====================
${kb.text}
===============================================================================

===================== DADOS DO CASO ATUAL =====================
- Solicitante: ${form.solicitante || "(não informado)"}
- Time: ${form.time || "(não informado)"}
- BU: ${form.bu || "(não informado)"}
- Tier informado pelo solicitante: ${form.tier || "(não informado — confirme o tier real pelo registro do HubSpot)"}
- Tipo de dúvida: ${form.tipoDuvida || "(não informado)"}
- Link da empresa/negócio no HubSpot: ${form.linkHubspot || "(não informado)"}
- Contexto adicional do solicitante: ${form.contexto || "(nenhum)"}
${hubspotBlock}
=================================================================

Responda SEMPRE neste formato, em português, pronto para postar no Slack:

*Veredito:* <uma linha: PODE ABORDAR / NÃO PODE ABORDAR / ESCALAR PARA HUMANO>
*Fundamentação:* <regra(s) e ID(s) usados, documento-fonte, e dado(s) do CRM que embasam a decisão>
*Escalada:* <se aplicável, motivo da escalada e quem deve ser acionado, conforme a tabela de responsáveis; caso contrário, escreva "Não aplicável">`;
}

async function getVerdict({ form, hubspotContext, hubspotError }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
  });

  const prompt = buildPrompt({ form, hubspotContext, hubspotError });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

module.exports = { getVerdict, buildPrompt };
