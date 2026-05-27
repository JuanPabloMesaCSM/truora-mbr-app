// agent_sf_readonly_format.js (v2 — sin referencias a nodos previos)
// Code node — workflow "sf-agent-readonly", DESPUES del Snowflake node.
// Mode: Run Once for All Items.
//
// Lee SOLO del input ($input.all()). Funciona aunque renombres los nodos
// anteriores. Maneja 3 casos:
//   1. SF devolvio filas correctamente → { ok: true, rows, row_count }
//   2. SF devolvio 0 filas → { ok: true, rows: [], row_count: 0 }
//   3. SF fallo (Continue On Fail ON) → { ok: false, error, sf_error_detail }
//
// El SF error case es CRITICO para que el agente pueda auto-corregirse:
// el error message de Snowflake suele decir exactamente que columna no
// existe o que sintaxis tiene mal.

const items = $input.all();

// --- Caso: Snowflake fallo (Continue On Fail ON) ---
const firstItem = items[0];
const hasError = firstItem && (
  firstItem.error ||
  (firstItem.json && firstItem.json.error) ||
  (firstItem.json && firstItem.json.code && firstItem.json.message)
);

if (hasError) {
  const errDetail = firstItem.error
    || (firstItem.json && firstItem.json.error)
    || (firstItem.json && firstItem.json.message)
    || 'Unknown Snowflake error';
  return [{
    json: {
      ok: false,
      error: 'Snowflake execution failed: ' + String(errDetail).slice(0, 500),
      sf_error_detail: errDetail,
      http_status: 400,
    }
  }];
}

// --- Caso: Snowflake OK, consolidar filas ---
const rows = items
  .map(function(item) { return item.json; })
  .filter(function(r) { return r && typeof r === 'object' && Object.keys(r).length > 0; });

return [{
  json: {
    ok: true,
    rows: rows,
    row_count: rows.length,
    http_status: 200,
  }
}];
