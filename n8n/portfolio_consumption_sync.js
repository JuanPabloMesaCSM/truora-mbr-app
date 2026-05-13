// Code node "Prepare Upsert" del flujo n8n "Portfolio Consumption Sync".
//
// Migrado a ClickHouse 2026-05-11. Antes leia del nodo Snowflake (uppercase
// keys: PERIODO_MES, CLIENT_ID, CLIENT_NAME, CSM_OWNER, PRODUCT, USAGE).
// Ahora lee del nodo HTTP Request "ClickHouse Portfolio Endpoint" que
// devuelve JSONEachRow con lowercase: periodo_mes, client_id, product, usage.
//
// CH NO devuelve client_name ni csm_owner (no existen como columnas en
// production.client_usage_records). Esos campos quedan NULL en el upsert
// y el frontend ya hace lookup contra `clientes.nombre` y la tabla `csm`
// para resolverlos (memoria `feedback_csm_clients_stale.md`).
//
// Output: 1 item con json.rows = [...]. El nodo HTTP Request siguiente
// (PostgREST upsert) envia json.rows como body con
// Prefer: resolution=merge-duplicates,return=minimal.
//
// Reglas n8n: nada de optional chaining, nada de fetch.

const httpItems = $input.all();
const rows = [];
const fechaActualizado = new Date().toISOString();

// El nodo HTTP del endpoint CH puede devolver el body de dos formas segun la
// configuracion: (a) 1 item por fila (JSONEachRow parseado item-por-item) o
// (b) 1 item con json.data = [...] (response body parseado como JSON entero).
// Detectamos ambos casos.
function extractChRows(items) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || !item.json) continue;
    const j = item.json;

    // Caso (b): body envuelto en .data
    if (Array.isArray(j.data)) {
      for (let k = 0; k < j.data.length; k++) out.push(j.data[k]);
      continue;
    }

    // Caso (b'): body envuelto en .rows (algunas respuestas CH)
    if (Array.isArray(j.rows)) {
      for (let k = 0; k < j.rows.length; k++) out.push(j.rows[k]);
      continue;
    }

    // Caso (a): item ya es la fila directa
    if (j.periodo_mes !== undefined || j.client_id !== undefined) {
      out.push(j);
    }
  }
  return out;
}

const chRows = extractChRows(httpItems);

for (let i = 0; i < chRows.length; i++) {
  const r = chRows[i];
  if (!r) continue;

  const periodoMes = r.periodo_mes;
  const clientId   = r.client_id;
  const product    = r.product;
  const usageRaw   = r.usage;

  if (!periodoMes || !clientId || !product) continue;

  let periodoMesStr;
  if (typeof periodoMes === 'string') {
    periodoMesStr = periodoMes.slice(0, 10);
  } else if (periodoMes instanceof Date) {
    periodoMesStr = periodoMes.toISOString().slice(0, 10);
  } else {
    periodoMesStr = String(periodoMes).slice(0, 10);
  }

  // CH devuelve usage como string (JSONEachRow numera como string para UInt64).
  // Number() convierte; si parsea NaN, fallback a 0.
  const usageNum = Number(usageRaw);

  rows.push({
    periodo_mes:        periodoMesStr,
    client_id:          String(clientId),
    client_name:        null,                          // CH no expone client_name
    csm_owner:          null,                          // CH no expone csm_owner
    product:            String(product),
    usage:              isNaN(usageNum) ? 0 : usageNum,
    fecha_actualizado:  fechaActualizado
  });
}

return [{
  json: {
    rows: rows,
    count: rows.length,
    ch_items: httpItems.length,
    ch_rows_parsed: chRows.length,
    run_at: fechaActualizado
  }
}];
