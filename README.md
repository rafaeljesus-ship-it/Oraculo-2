# Oráculo de Pré-Vendas (caminho externo: GitHub + Render + Gemini)

Backend que recebe o formulário do Slack Workflow Builder, consulta o
HubSpot em tempo real, cruza com a base de conhecimento da política de
abordagem e responde no canal do Slack com o veredito — sem depender do
Breeze/Agent Builder do HubSpot.

Esta é a versão com **Gemini** apenas (sem GPT por enquanto), conforme
decidido em outubro/2026.

## Arquitetura

```
Slack Workflow Builder (formulário)
  → etapa "De um webhook" → POST /webhook/oraculo (este servidor, no Render)
      → consulta o HubSpot (CRM em tempo real)
      → monta o prompt com a base de conhecimento (knowledge-base/)
      → chama a API do Gemini
      → posta o veredito de volta no canal via Slack API (chat.postMessage)
```

## Estrutura

```
src/
  server.js              — servidor Express
  routes/oraculo.js       — rota POST /webhook/oraculo
  services/
    hubspot.js             — le o link do HubSpot, busca negocio/empresa em tempo real
    gemini.js               — monta o prompt e chama a API do Gemini
    slack.js                 — posta a resposta no canal do Slack
    knowledgeBase.js          — le os .md de knowledge-base/ e concatena
knowledge-base/             — copia da base de conhecimento (politica de abordagem,
                               duplicidade, motivos de perdido, regras de prospeccao)
```

A pasta `knowledge-base/` é uma cópia da base de conhecimento do projeto
(`oraculo-abordagem/base-conhecimento/` + `instrucoes-v2-atual.md`). Sempre
que a base mudar lá, copie os arquivos atualizados pra cá, faça commit e
dê `git push` — o servidor lê os arquivos do disco a cada deploy (ou via
o endpoint `/admin/reload-knowledge-base`, sem precisar reiniciar).

## Passo a passo para colocar no ar

### 1. Gemini — pegar a chave de API
1. Acesse https://aistudio.google.com/apikey
2. Crie uma API key (conta Google da Flash, se tiver Workspace, ou pessoal).
3. Guarde o valor — vai no `.env` / nas variáveis de ambiente do Render.

### 2. HubSpot — criar um Private App
1. No HubSpot: **Configurações → Integrações → Private Apps → Criar app privado**.
2. Dê um nome (ex: "Oráculo de Pré-Vendas").
3. Em **Escopos**, habilite leitura em:
   - `crm.objects.companies.read`
   - `crm.objects.deals.read`
   - `crm.objects.owners.read`
4. Crie o app e copie o **token de acesso** gerado — vai no `.env`.
5. **Confirme com o Admin do HubSpot o internal name real da propriedade
   de AM/LTO/KAM** (hoje o código usa `am_responsavel` como placeholder em
   `src/services/hubspot.js` — procure os dois `TODO: confirmar internal
   name real` e ajuste antes de ir pra produção).

### 3. Slack — criar o app/bot
1. Vá em https://api.slack.com/apps → **Create New App → From scratch**.
2. Em **OAuth & Permissions**, adicione o escopo `chat:write`.
3. Instale o app no workspace da Flash e copie o **Bot User OAuth Token**
   (começa com `xoxb-`) — vai no `.env`.
4. Adicione o bot ao canal onde o Oráculo vai responder (`/invite
   @NomeDoApp` no canal, ou pelo menu de integrações do canal).

### 4. Deploy no Render
1. Suba este repositório no GitHub (veja seção abaixo).
2. No [Render](https://render.com), **New → Web Service**, conecte o
   repositório.
3. Configuração:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Plano:** Free (suficiente para teste; ver ressalvas no `CLAUDE.md`
     do projeto sobre cold start de ~1 min após 15 min de inatividade).
4. Em **Environment**, adicione as variáveis do `.env.example`:
   `GEMINI_API_KEY`, `GEMINI_MODEL`, `HUBSPOT_PRIVATE_APP_TOKEN`,
   `SLACK_BOT_TOKEN`, `WEBHOOK_SHARED_SECRET`, `DEFAULT_SLACK_CHANNEL`
   (ID do canal, formato `C0123456789` — pegue em "Copiar ID do canal"
   no menu do canal no Slack).
5. Deploy. Anote a URL pública gerada (ex:
   `https://oraculo-pre-vendas.onrender.com`).

### 5. Slack Workflow Builder — ligar o formulário ao servidor
1. No workflow do formulário (gatilho "De um atalho do Slack" com os
   campos Solicitante, Time, BU, Tipo de dúvida, Link HubSpot, Contexto),
   adicione uma etapa **"Enviar dados para um webhook"** (ou "De um
   webhook" / "Send data to a webhook", dependendo da tradução da sua
   versão do Slack).
2. **URL:** `https://<sua-url-no-render>.onrender.com/webhook/oraculo`
3. **Headers:** adicione `X-Oraculo-Secret` com o mesmo valor de
   `WEBHOOK_SHARED_SECRET` configurado no Render.
4. **Corpo (payload):** inclua os campos do formulário, usando "Inserir
   uma variável" para cada um — nomeie exatamente como no formulário
   (`Solicitante`, `Time`, `BU`, `Tipo de dúvida`, `Link HubSpot`,
   `Contexto`), mais um campo `channel` com a variável **"Canal em que o
   fluxo de trabalho foi usado"**.
5. Publique o workflow.

Esse passo substitui as etapas "Gerar resposta da IA" e "Enviar mensagem"
que estavam no caminho 100%-Slack — agora é o webhook que dispara todo o
processamento no servidor.

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha as chaves
npm run dev
```

Teste com:
```bash
curl -X POST http://localhost:3000/webhook/oraculo \
  -H "Content-Type: application/json" \
  -H "X-Oraculo-Secret: <seu WEBHOOK_SHARED_SECRET>" \
  -d '{
    "Solicitante": "Rafa",
    "Time": "BDR Outbound",
    "BU": "Benefícios",
    "Tipo de dúvida": "Posso abordar essa empresa?",
    "Link HubSpot": "https://app.hubspot.com/contacts/5938567/record/0-3/65817315739",
    "Contexto": "teste local"
  }'
```

## Pendências antes de ir pra produção

Ver `CLAUDE.md` do projeto principal (`oraculo-abordagem/`) para a lista
completa de pendências de política (geladeira, versão da política de
duplicidade, tiers T2-T5, etc.). Específico deste backend:

- [ ] Confirmar o internal name real da propriedade de AM/LTO/KAM no
      HubSpot (`src/services/hubspot.js`).
- [ ] Validar com casos reais do gabarito (`knowledge-base/06-casos-resolvidos.md`
      depois de validado) antes de abrir pro canal oficial.
- [ ] Decidir se/quando adicionar a API do GPT como alternativa ou
      fallback ao Gemini.
