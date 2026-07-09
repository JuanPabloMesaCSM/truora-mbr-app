// agent_ch_query_build.js (v4 — 11 endpoints con nombres reales, GET + POST)
// Code node — workflow "ch-agent-query"
// Mode: Run Once for All Items, Language: JavaScript.
//
// Recibe POST con body { endpoint_id, query_variables }.
// Para GET endpoints: construye URL con ?format=JSON&param_X=Y...
// Para POST endpoints (portfolio_consumption, client_dashboard_detalle):
//   devuelve { method:'POST', url, post_body } — el HTTP Request node de n8n
//   debe bifurcarse según este campo (IF method=POST → modo POST + body JSON).
//
// ⚠️ CAMBIOS v4 (2026-06-03):
//   - Renombrados 4 endpoints a nombres reales (ya no mienten sobre su contenido):
//       client_summary_by_product → client_bgc_resumen
//       client_di_by_flow         → client_di_consumo_facturable
//       client_bgc_by_country     → client_bgc_pais_tipo
//       client_ce_by_flow         → client_ce_tasas
//       client_monthly_trend      → client_tendencia_global
//       client_granular_breakdown → client_dashboard_detalle
//   - Agregados 4 endpoints CE/BGC del Report Builder migrado a CH:
//       client_ce_consumo, client_ce_tendencia, client_ce_linea, client_bgc_historico
//   - Total: 11 endpoints (9 GET + 2 POST).
//
// TABLA DE PARAMS — respetar los nombres exactos de cada endpoint:
//   fecha_inicio / fecha_fin : BGC Resumen (7bea8ad7), CE todos (7d7/113/083/511)
//   from / to               : BGC País×Tipo (ad0), DI Consumo (e04), Tendencia Global (fa8)
//   fecha_inicio solo        : BGC Histórico (55b) — NO tiene fecha_fin
//   body JSON               : portfolio_consumption, client_dashboard_detalle (POST)

const CH_BASE_URL = 'https://queries.clickhouse.cloud';

const ENDPOINTS = {

  // ─── BGC (TZ UTC) ────────────────────────────────────────────────────────────
  // Billable: product IN ('checks_check','checks_continuous_check','checks_premium_collector')
  //           status='completed', check_type NOT IN ('document-validation','validation')
  //           FINAL + uniqExact(record_id), toDate(date_counted) UTC.

  client_bgc_resumen: {
    uuid: '7bea8ad7-0b1a-4b0f-aed1-e3017947de28',
    // params: client_id (String), fecha_inicio (YYYY-MM-DD), fecha_fin (YYYY-MM-DD)
    // Devuelve 1 fila:
    //   CUR_COMPLETADOS, CUR_TOTAL, CUR_ERRORES,
    //   PREV_COMPLETADOS, PREV_TOTAL, PREV_ERRORES,
    //   BASES_PREMIUM (array serializado [["DBI...","N"],...]  → ver const BGC_PREMIUM_DB en SlideCanvas)
  },

  client_bgc_pais_tipo: {
    uuid: 'ad039af3-4dbb-4c88-97bf-48753b554499',
    // params: client_id (String), from (YYYY-MM-DD), to (YYYY-MM-DD)   ← usa from/to, NO fecha_*
    // Devuelve N filas { COUNTRY, CHECK_TYPE, COMPLETADOS, TOTAL, ERRORES }
  },

  client_bgc_historico: {
    uuid: '55b9c609-4a7e-4f27-855f-378e5378ec46',
    // params: client_id (String), fecha_inicio (YYYY-MM-DD)   ← solo 1 fecha, sin fecha_fin
    // Devuelve 4 filas { MES (YYYY-MM-DD), COMPLETADOS } — zero-fill incluido
  },

  // ─── CE (TZ Bogotá) ──────────────────────────────────────────────────────────
  // Billable outbound: product∈{truconnect_outbound,truconnect_notification}
  //                    status∈{'success','delivered','read'}, excluye demo +17547045206.
  // Billable inbound : product='digital_identity_process', channel_type='inbound'.
  // TZ: toDate(toTimeZone(date_counted,'America/Bogota')).

  client_ce_consumo: {
    uuid: '7d75098b-7e2b-4718-8ca6-44707476d739',
    // params: client_id (String), fecha_inicio (YYYY-MM-DD), fecha_fin (YYYY-MM-DD)
    // Devuelve 1 fila:
    //   CUR_OUTBOUND, CUR_NOTIFICATION, CUR_INBOUND, CUR_TOTAL,
    //   PREV_OUTBOUND, PREV_NOTIFICATION, PREV_INBOUND, PREV_TOTAL
  },

  client_ce_tasas: {
    uuid: '113d8964-6ac8-4e8f-a87c-bf91963915a3',
    // params: client_id (String), fecha_inicio (YYYY-MM-DD), fecha_fin (YYYY-MM-DD)
    // Devuelve N filas { PRODUCT, DIRECTION, TOTAL, ENTREGADOS, LEIDOS, FALLIDOS, EN_TRANSITO, ... cur+prev }
    // Para reconciliación mensajes CE (tasas de entrega).
  },

  client_ce_tendencia: {
    uuid: '0832340b-d9e9-4299-a9a0-4c93fc2ec89d',
    // params: client_id (String), fecha_inicio (YYYY-MM-DD), fecha_fin (YYYY-MM-DD)
    // Devuelve 6 filas { MES (YYYY-MM-DD), OUTBOUND, NOTIFICATION, INBOUND, TOTAL } — zero-fill
  },

  client_ce_linea: {
    uuid: '5113cd40-c938-415e-93f9-1d8303f07ae7',
    // params: client_id (String), fecha_inicio (YYYY-MM-DD), fecha_fin (YYYY-MM-DD)
    // Devuelve N filas { LINEA (waba_phone_number), OUT_M0, NOTIF_M0, VOL_M0, VOL_M1, VOL_M2, STATUS }
    // Sirve tanto para Ce12 (tabla) como Ce14 (heatmap).
  },

  // ─── DI (TZ UTC) ─────────────────────────────────────────────────────────────
  // Billable: product LIKE 'validations_%', status∈{'success','failure'},
  //           is_validation_retry=false, validation_failure_status!='system_error',
  //           validation_declined_reason NOT IN ('no_face_detected',...),
  //           FINAL + uniqExact(record_id), toDate(date_counted) UTC.
  // ⚠️ Rescata clientes standalone (sin IDENTITY_PROCESS_ID) que el Report Builder DI da 0.

  client_di_consumo_facturable: {
    uuid: 'e0425fdf-0dc6-4302-ac99-c54bd8547cbd',
    // params: client_id (String), from (YYYY-MM-DD), to (YYYY-MM-DD)   ← usa from/to, NO fecha_*
    // Devuelve 1 fila plana:
    //   CUR_TOTAL, PREV_TOTAL,
    //   POR_TIPO  = [["validations_document_validation","N","exitosas","fallidas"], ...]
    //   HISTORICO = [["2026-04-01","N_total","N_exitosas"], ...]  — 4 meses
  },

  // ─── Cross-producto ──────────────────────────────────────────────────────────

  client_tendencia_global: {
    uuid: 'fa833763-db08-400c-b4ef-219f2c52fd4a',
    // params: client_id (String), from (YYYY-MM-DD), to (YYYY-MM-DD)
    // Devuelve tendencia mensual cross-producto (legacy global — DI+BGC+CE en 1 query).
  },

  // ─── Workflows automatizados (POST JSONEachRow) ───────────────────────────────
  // Menos útiles para consultas ad-hoc. Necesitan POST con body JSON en el HTTP node de n8n.
  // ⚠️ Si el HTTP Request del workflow está fijo en GET, debe bifurcarse con IF method='POST'.

  portfolio_consumption: {
    uuid: '81ef4b77-ef25-49bb-9610-66ba7ef01e16',
    post: true,
    // body: { tci_list: ['TCI...', 'TCI...'] }
    // Devuelve consumo 3 meses multi-cliente. Diseñado para Portfolio Sync, no consultas ad-hoc.
  },

  client_dashboard_detalle: {
    uuid: '9a600a78-309e-4531-9ecc-f53d83490299',
    post: true,
    // body: { client_id_di, client_id_bgc, client_id_ce, fecha_inicio, fecha_fin }
    // Devuelve desglose granular DI+BGC+CE. Diseñado para Dashboard Detail, no consultas ad-hoc.
  },
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

const ep = ENDPOINTS[endpointId];
const started_at = Date.now();
const queryVars = (body && body.query_variables && typeof body.query_variables === 'object')
  ? body.query_variables : {};

// ─── POST endpoints ───────────────────────────────────────────────────────────
if (ep.post) {
  const postUrl = CH_BASE_URL + '/run/' + ep.uuid + '?format=JSONEachRow';
  return [{
    json: {
      ok: true,
      method: 'POST',
      url: postUrl,
      post_body: JSON.stringify(queryVars),
      endpoint_id: endpointId,
      started_at: started_at,
    }
  }];
}

// ─── GET endpoints ────────────────────────────────────────────────────────────
const params = ['format=JSON'];
for (const key in queryVars) {
  if (Object.prototype.hasOwnProperty.call(queryVars, key)) {
    let val = queryVars[key];
    if (Array.isArray(val)) {
      val = "['" + val.map(function(v){ return String(v).replace(/'/g, "\\'"); }).join("','") + "']";
    }
    params.push('param_' + encodeURIComponent(key) + '=' + encodeURIComponent(String(val)));
  }
}

const url = CH_BASE_URL + '/run/' + ep.uuid + '?' + params.join('&');

return [{
  json: {
    ok: true,
    method: 'GET',
    url: url,
    endpoint_id: endpointId,
    started_at: started_at,
  }
}];
