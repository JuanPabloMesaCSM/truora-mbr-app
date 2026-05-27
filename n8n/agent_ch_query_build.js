// agent_ch_query_build.js (v3 — GET con query params, format=JSON)
// Code node — workflow "ch-agent-query"
// Mode: Run Once for All Items, Language: JavaScript.
//
// La autenticacion la maneja el Webhook node via Header Auth credential.
// Este node solo arma la URL al Query Endpoint de CH correspondiente.
//
// Recibe POST con body { endpoint_id, query_variables }.
// Construye URL GET con query string ?format=JSON&param_X=Y...
// Devuelve { ok, url, endpoint_id } o { ok: false, error }.

// ============================================================
// CONFIG — 7 endpoints CH expuestos al agente.
// Los 2 endpoints de BotiAlertas (0832340b, 7d75098b) NO se incluyen
// porque su data ya vive en boti_alertas Supabase — el agente la
// consulta via tool directo a Supabase.
// ============================================================
const CH_BASE_URL = 'https://queries.clickhouse.cloud';

const ENDPOINTS = {
  // Per-cliente queries
  client_summary_by_product: '7bea8ad7-0b1a-4b0f-aed1-e3017947de28', // summary global por producto/status
  client_di_by_flow:         'e0425fdf-0dc6-4302-ac99-c54bd8547cbd', // DI breakdown por flow_id
  client_bgc_by_country:     'ad039af3-4dbb-4c88-97bf-48753b554499', // BGC por country + check_type
  client_ce_by_flow:         '113d8964-6ac8-4e8f-a87c-bf91963915a3', // CE delivery rates por producto + flow
  client_monthly_trend:      'fa833763-db08-400c-b4ef-219f2c52fd4a', // tendencia mensual cross-producto
  client_granular_breakdown: '9a600a78-309e-4531-9ecc-f53d83490299', // desglose granular DI/BGC/CE (face_search, etc.)

  // Multi-cliente queries
  portfolio_consumption:     '69e67323-9847-4dc4-8759-a244f09d6e9e', // portfolio sync 3 meses (Array<TCI>)
};
// ============================================================

const item = $input.first().json;
const body = (item && item.body) ? item.body : item;

const endpointId = body && body.endpoint_id ? String(body.endpoint_id).toLowerCase() : '';
if (!endpointId) {
  return [{ json: { ok: false, error: 'Missing required field: endpoint_id', http_status: 400 } }];
}
if (!ENDPOINTS[endpointId]) {
  const allowed = Object.keys(ENDPOINTS).join(', ');
  return [{ json: { ok: false, error: 'Unknown endpoint_id "' + endpointId + '". Allowed: ' + allowed, http_status: 400 } }];
}

const uuid = ENDPOINTS[endpointId];

// Build query string from query_variables.
// CH expects ?param_X=value for each variable. Arrays usan formato ['v1','v2'].
const queryVars = (body && body.query_variables && typeof body.query_variables === 'object')
  ? body.query_variables : {};

const params = ['format=JSON'];
for (const key in queryVars) {
  if (Object.prototype.hasOwnProperty.call(queryVars, key)) {
    let val = queryVars[key];
    if (Array.isArray(val)) {
      // Format CH array literal: ['v1','v2','v3']
      val = "['" + val.map(function(v){ return String(v).replace(/'/g, "\\'"); }).join("','") + "']";
    }
    params.push('param_' + encodeURIComponent(key) + '=' + encodeURIComponent(String(val)));
  }
}

const url = CH_BASE_URL + '/run/' + uuid + '?' + params.join('&');

return [{
  json: {
    ok: true,
    url: url,
    endpoint_id: endpointId,
  }
}];
