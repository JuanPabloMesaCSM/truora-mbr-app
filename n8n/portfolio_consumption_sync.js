// Code node "Prepare Upsert" del flujo n8n "Portfolio Consumption Sync".
//
// Migrado a ClickHouse 2026-05-11. Antes leia del nodo Snowflake (uppercase
// keys: PERIODO_MES, CLIENT_ID, CLIENT_NAME, CSM_OWNER, PRODUCT, USAGE).
// Ahora lee del nodo HTTP Request "ClickHouse Portfolio Endpoint" que
// devuelve JSONEachRow.
//
// 2026-06-11 — grano SUB-PRODUCTO (product identifier). El endpoint (query
// maestra de counters Truora) devuelve lowercase:
//   periodo_mes, client_id, product, sub_product, usage, nota
// Filas-total ('checks completos' / 'interacciones') se descartan aca.
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
// rowMap: dedup por PK (periodo_mes|client_id|product|sub_product). Necesario
// porque premium checks emite varias bases (IMSS, PEP FIMPE, ...) bajo el mismo
// pais => mismo sub_product => misma PK. Sin dedup, PostgREST con
// merge-duplicates falla "ON CONFLICT DO UPDATE cannot affect row a second time".
// Al sumar, premium queda agregado por pais (las bases se conservan en la NOTA).
const rowMap = new Map();
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

    // Caso (b0): body con `data` como STRING multilinea (JSONEachRow).
    // Es como devuelve el Query Endpoint CH: { data: "{...}\n{...}\n..." }.
    // Hay que split('\n') + JSON.parse por linea (skill dashboard-cartera gotcha 12).
    if (typeof j.data === 'string') {
      const lines = j.data.split('\n');
      for (let k = 0; k < lines.length; k++) {
        const line = lines[k].trim();
        if (!line) continue;
        try { out.push(JSON.parse(line)); } catch (e) {}
      }
      continue;
    }

    // Caso (b): body envuelto en .data (array ya parseado)
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

// Filas-TOTAL de la query maestra que NO se persisten: duplican la suma del
// detalle (decision 2026-06-11). 'checks completos' = suma de checks por pais;
// 'interacciones' = suma de truconnect por canal. El total por producto se
// calcula en el frontend sumando los sub-productos. Si se guardaran, el
// dashboard contaria doble.
const SUBPRODUCTOS_TOTAL = ['checks completos', 'interacciones'];

let descartadasTotal = 0;
let mergedDups = 0;

for (let i = 0; i < chRows.length; i++) {
  const r = chRows[i];
  if (!r) continue;

  const periodoMes = r.periodo_mes;
  const clientId   = r.client_id;
  const product    = r.product;
  const subProduct = r.sub_product;
  const usageRaw   = r.usage;
  const notaRaw    = r.nota;

  if (!periodoMes || !clientId || !product || !subProduct) continue;

  // Descartar filas-total (no se persisten).
  if (SUBPRODUCTOS_TOTAL.indexOf(String(subProduct)) !== -1) {
    descartadasTotal++;
    continue;
  }

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

  // nota puede venir vacia ('') o con saltos de linea (\n) del desglose por pais.
  const nota = (notaRaw === null || notaRaw === undefined) ? '' : String(notaRaw);
  const usageSafe = isNaN(usageNum) ? 0 : usageNum;

  const key = periodoMesStr + '|' + String(clientId) + '|' + String(product) + '|' + String(subProduct);
  const existing = rowMap.get(key);
  if (existing) {
    // Misma PK (caso premium: varias bases en el mismo pais). Sumar usage y
    // unir notas no vacias para preservar el desglose de cada base.
    existing.usage += usageSafe;
    if (nota) existing.nota = existing.nota ? (existing.nota + '\n' + nota) : nota;
    mergedDups++;
  } else {
    rowMap.set(key, {
      periodo_mes:        periodoMesStr,
      client_id:          String(clientId),
      client_name:        null,                          // CH no expone client_name
      csm_owner:          null,                          // CH no expone csm_owner
      product:            String(product),
      sub_product:        String(subProduct),
      usage:              usageSafe,
      nota:               nota,
      fecha_actualizado:  fechaActualizado
    });
  }
}

const rows = Array.from(rowMap.values());

return [{
  json: {
    rows: rows,
    count: rows.length,
    ch_items: httpItems.length,
    ch_rows_parsed: chRows.length,
    descartadas_total: descartadasTotal,   // filas 'checks completos' / 'interacciones' saltadas
    merged_dups: mergedDups,               // filas colapsadas por PK duplicada (premium por pais)
    run_at: fechaActualizado
  }
}];
