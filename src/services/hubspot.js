const HUBSPOT_API = "https://api.hubapi.com";

// IDs de tipo de objeto que aparecem na URL do HubSpot (.../record/0-2/123)
const OBJECT_TYPE_BY_URL_ID = {
  "0-1": "contacts",
  "0-2": "companies",
  "0-3": "deals",
};

/**
 * Extrai o tipo de objeto e o ID a partir de um link do HubSpot.
 * Aceita formatos como:
 *   https://app.hubspot.com/contacts/<portalId>/record/0-3/<dealId>
 *   https://app.hubspot.com/contacts/<portalId>/company/<companyId>
 *   https://app-eu1.hubspot.com/contacts/<portalId>/record/0-2/<companyId>
 */
function parseHubspotLink(link) {
  if (!link) return null;

  const recordMatch = link.match(/record\/(0-\d)\/(\d+)/);
  if (recordMatch) {
    const [, typeId, objectId] = recordMatch;
    const objectType = OBJECT_TYPE_BY_URL_ID[typeId];
    if (objectType) return { objectType, objectId };
  }

  const companyMatch = link.match(/\/company\/(\d+)/);
  if (companyMatch) {
    return { objectType: "companies", objectId: companyMatch[1] };
  }

  const dealMatch = link.match(/\/deal\/(\d+)/);
  if (dealMatch) {
    return { objectType: "deals", objectId: dealMatch[1] };
  }

  return null;
}

async function hubspotFetch(path, token) {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HubSpot API ${res.status} em ${path}: ${body}`);
  }
  return res.json();
}

async function getOwnerName(ownerId, token) {
  if (!ownerId) return null;
  try {
    const owner = await hubspotFetch(`/crm/v3/owners/${ownerId}`, token);
    return [owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email;
  } catch {
    return null;
  }
}

/**
 * Propriedades de negocio (deal) que consideramos relevantes para o
 * Oraculo. "am_responsavel" e um NOME DE EXEMPLO - confirme com o time
 * de RevOps/Admin do HubSpot da Flash qual e o internal name real da
 * propriedade de AM/LTO/KAM antes de usar isso em producao (ver
 * pendencia "AM associado" no CLAUDE.md do projeto).
 */
const DEAL_PROPERTIES = [
  "dealname",
  "dealstage",
  "pipeline",
  "hubspot_owner_id",
  "closedate",
  "createdate",
  "hs_lastmodifieddate",
  "am_responsavel", // TODO: confirmar internal name real
];

const COMPANY_PROPERTIES = [
  "name",
  "hubspot_owner_id",
  "lifecyclestage",
  "numberofemployees",
  "am_responsavel", // TODO: confirmar internal name real
];

async function getDealContext(dealId, token) {
  const deal = await hubspotFetch(
    `/crm/v3/objects/deals/${dealId}?properties=${DEAL_PROPERTIES.join(",")}&associations=companies`,
    token
  );
  const ownerName = await getOwnerName(deal.properties.hubspot_owner_id, token);

  const companyAssoc = deal.associations?.companies?.results?.[0];
  let company = null;
  if (companyAssoc) {
    company = await hubspotFetch(
      `/crm/v3/objects/companies/${companyAssoc.id}?properties=${COMPANY_PROPERTIES.join(",")}`,
      token
    );
  }

  return {
    tipo: "negocio",
    negocioAberto: true,
    dealId,
    nome: deal.properties.dealname,
    etapa: deal.properties.dealstage,
    pipeline: deal.properties.pipeline,
    dono: ownerName,
    amResponsavel: deal.properties.am_responsavel || null,
    dataCriacao: deal.properties.createdate,
    ultimaAtividade: deal.properties.hs_lastmodifieddate,
    empresa: company
      ? {
          id: companyAssoc.id,
          nome: company.properties.name,
          dono: await getOwnerName(company.properties.hubspot_owner_id, token),
        }
      : null,
  };
}

async function getCompanyContext(companyId, token) {
  const company = await hubspotFetch(
    `/crm/v3/objects/companies/${companyId}?properties=${COMPANY_PROPERTIES.join(",")}&associations=deals`,
    token
  );
  const ownerName = await getOwnerName(company.properties.hubspot_owner_id, token);

  const dealAssociations = company.associations?.deals?.results || [];
  const deals = [];
  for (const assoc of dealAssociations.slice(0, 10)) {
    try {
      const deal = await hubspotFetch(
        `/crm/v3/objects/deals/${assoc.id}?properties=${DEAL_PROPERTIES.join(",")}`,
        token
      );
      deals.push({
        dealId: assoc.id,
        nome: deal.properties.dealname,
        etapa: deal.properties.dealstage,
        dono: await getOwnerName(deal.properties.hubspot_owner_id, token),
      });
    } catch {
      // ignora negocio individual que falhar, nao derruba a consulta toda
    }
  }

  return {
    tipo: "empresa",
    empresaId: companyId,
    nome: company.properties.name,
    donoDaEmpresa: ownerName,
    amResponsavel: company.properties.am_responsavel || null,
    numeroDeFuncionarios: company.properties.numberofemployees,
    negociosAssociados: deals,
    negocioAberto: deals.length > 0,
  };
}

/**
 * Ponto de entrada: recebe o link do HubSpot informado no formulario do
 * Slack e devolve um objeto com o contexto de CRM relevante para o
 * Oraculo decidir. Lanca erro se o link nao puder ser interpretado ou
 * se a chamada ao HubSpot falhar - quem chama deve tratar isso como
 * "dado insuficiente, escalar para humano", nunca inventar um contexto.
 */
async function getHubspotContext(link, token) {
  const parsed = parseHubspotLink(link);
  if (!parsed) {
    throw new Error(`Nao foi possivel identificar o tipo/ID de objeto no link: ${link}`);
  }

  if (parsed.objectType === "deals") {
    return getDealContext(parsed.objectId, token);
  }
  if (parsed.objectType === "companies") {
    return getCompanyContext(parsed.objectId, token);
  }

  throw new Error(`Tipo de objeto do HubSpot nao suportado ainda: ${parsed.objectType}`);
}

module.exports = { parseHubspotLink, getHubspotContext };
