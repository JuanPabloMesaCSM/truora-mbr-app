// agent_ch_query_format.js
// Code node — workflow "ch-agent-query", DESPUES del HTTP Request a CH.
// Mode: Run Once for All Items.
//
// El HTTP Request node devuelve la response cruda de CH.
// CH Query Endpoint devuelve algo tipo:
//   { meta: [...], data: [...], rows: N, statistics: {...} }
// Lo aplanamos a { ok, rows, row_count, took_ms }.

const item = $input.first().json;
const buildJson = $('Code: Build CH Request').first().json;
const tookMs = Date.now() - (buildJson.started_at || Date.now());

// HTTP node con responseFormat=JSON pone la response directamente en .json
const chResponse = item;

// Defensive: CH puede devolver shape distinto segun config del endpoint
const rows = chResponse && Array.isArray(chResponse.data) ? chResponse.data : [];
const rowCount = (chResponse && typeof chResponse.rows === 'number') ? chResponse.rows : rows.length;

return [{
  json: {
    ok: true,
    rows: rows,
    row_count: rowCount,
    took_ms: tookMs,
    endpoint_id: buildJson.endpoint_id,
    ch_statistics: (chResponse && chResponse.statistics) ? chResponse.statistics : null,
  }
}];
