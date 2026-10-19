require("dotenv").config();
const express = require("express");
const oraculoRoutes = require("./routes/oraculo");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ ok: true, service: "oraculo-pre-vendas" });
});

app.use("/", oraculoRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Oraculo de Pre-Vendas rodando na porta ${port}`);
});
