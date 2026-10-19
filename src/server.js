require("dotenv").config();
const path = require("path");
const express = require("express");
const oraculoRoutes = require("./routes/oraculo");

const app = express();
app.use(express.json());

// Pagina web (caminho alternativo ao Slack) - serve public/index.html
// em "/" e os assets estaticos dessa mesma pasta.
app.use(express.static(path.join(__dirname, "..", "public")));

// Endpoint de status, usado para checar se o servidor esta de pe (health
// check do Render, ou teste manual). A raiz "/" agora serve a pagina,
// nao mais este JSON.
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "oraculo-pre-vendas" });
});

app.use("/", oraculoRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Oraculo de Pre-Vendas rodando na porta ${port}`);
});
