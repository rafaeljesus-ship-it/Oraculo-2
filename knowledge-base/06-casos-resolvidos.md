# 06 · Casos resolvidos


**Versão:** [PREENCHER] | **Data:** [PREENCHER] | **Dono:** [PREENCHER]

Regra deste doc: 10 a 15 casos. Não reutilize aqui os casos do gabarito de teste, senão o teste perde valor.

### Modelo de caso

**Caso 01**
- **Solicitante:** Time [X] | BU [X] | Tier [X]
- **Tipo de dúvida:** [X]
- **Dados do CRM:** negócio aberto? etapa? última atividade? AM? grupo ID? [PREENCHER]
- **Contexto informado pelo BDR:** "[PREENCHER]"
- **Veredito esperado:** [PREENCHER]
- **Regras aplicadas:** [IDs, ex: AB-02, AB-T02]
- **Por que este caso importa:** [ex: Contexto contradiz o CRM]

### Casos que valem cobrir
1. Caso simples: pode abordar, sem negócio, sem histórico.
2. Caso simples: não pode, negócio aberto de outro dono.
3. Contexto do BDR contradiz o CRM (ex: diz "não é cliente" mas há grupo ID e AM).
4. Dados incompletos no CRM → escalar.
5. Duplicidade com empresa do mesmo grupo.
6. Motivo de perdido com descrição ambígua.
7. Solicitante insiste após veredito negativo → escalar.
8. T5 ou Enterprise.
9. Despesas.
10. Pessoas.
