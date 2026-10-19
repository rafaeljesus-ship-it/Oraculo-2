const fs = require("fs");
const path = require("path");

const KB_DIR = path.join(__dirname, "..", "..", "knowledge-base");

// Ordem fixa para a leitura ficar previsivel (00 antes de 01, etc.)
const FILE_ORDER = [
  "instrucoes-agente.md",
  "00-como-usar-esta-base.md",
  "01-glossario.md",
  "02-posso-abordar.md",
  "03-duplicidade-de-negocio.md",
  "04-motivos-de-perdido.md",
  "05-regras-de-prospeccao.md",
  "06-casos-resolvidos.md",
];

let cachedKnowledgeBase = null;

/**
 * Le todos os arquivos .md da pasta knowledge-base/ e concatena em um
 * unico bloco de texto, com separadores claros por arquivo, para ser
 * injetado no prompt do Gemini. Mantem em cache em memoria depois da
 * primeira leitura - use reloadKnowledgeBase() para forcar releitura
 * sem reiniciar o processo (ex: depois de dar git pull no servidor).
 */
function loadKnowledgeBase() {
  if (cachedKnowledgeBase) return cachedKnowledgeBase;

  const filesOnDisk = fs.existsSync(KB_DIR)
    ? fs.readdirSync(KB_DIR).filter((f) => f.endsWith(".md"))
    : [];

  // Respeita FILE_ORDER primeiro, depois qualquer outro .md que apareca
  // na pasta e nao esteja na lista (para nao perder arquivo novo
  // silenciosamente).
  const orderedFiles = [
    ...FILE_ORDER.filter((f) => filesOnDisk.includes(f)),
    ...filesOnDisk.filter((f) => !FILE_ORDER.includes(f)),
  ];

  const blocks = orderedFiles.map((filename) => {
    const content = fs.readFileSync(path.join(KB_DIR, filename), "utf-8");
    return `\n\n===== ARQUIVO: ${filename} =====\n\n${content.trim()}`;
  });

  cachedKnowledgeBase = {
    files: orderedFiles,
    text: blocks.join("\n"),
  };

  return cachedKnowledgeBase;
}

function reloadKnowledgeBase() {
  cachedKnowledgeBase = null;
  return loadKnowledgeBase();
}

module.exports = { loadKnowledgeBase, reloadKnowledgeBase };
