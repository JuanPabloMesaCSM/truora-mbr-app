// Code node "Build Whitelist" del flujo "Portfolio Consumption Sync".
//
// Toma los rows del nodo Supabase "Get Clientes Whitelist" (cartera activa
// con sus 3 TCIs por producto) y devuelve la lista combinada de TCIs
// (DI U BGC U CE).
//
// 2026-06-11 — BATCHING. El query general subio a 12 meses (ver
// portfolio_subproduct_migration.sql). 95 clientes x 12 meses en UN solo
// request al Query Endpoint CH supera el timeout de ~30s ("The service was not
// able to process your request. Timeout error."). Por eso ahora emitimos N
// items, uno por LOTE de ~BATCH_SIZE TCIs. El nodo HTTP corre 1 vez por item
// (lote) => N requests chicos; "Prepare Upsert" agrega TODAS las respuestas via
// $input.all(). El lookup (webhook portfolio-client-lookup) NO usa este node:
// consulta 1 solo cliente, sin timeout.
//
// IMPORTANTE: el nodo HTTP debe leer el CSV del ITEM ACTUAL (`$json.tci_list_csv`),
// NO `$('Build Whitelist').first()...` (eso solo tomaria el primer lote).
//
// Cada item de salida:
//   tci_list_csv:   "tci1,tci2,..."   <- CSV plano para {client_id:String} (splitByChar)
//   tci_list_array: [...]             <- por si se necesita el array
//   tci_list:       "'tci1',..."      <- SQL-ready para el fallback SF legacy (por lote)
//   batch_index / batch_count / clientes_en_batch / total_clientes
//
// Reglas n8n: nada de optional chaining, nada de fetch.

const items = $input.all();
const tciSet = new Set();

// Limpia un TCI: trim + filtro de vacios. Importante porque hay filas en
// `clientes` con `\r\n` colado al final (caso real PuntoRed CONEXRED) y otras
// con string vacio "" en lugar de null (caso Confiamos.client_id_bgc).
function cleanTci(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

for (let i = 0; i < items.length; i++) {
  const r = (items[i] && items[i].json) ? items[i].json : {};
  const di  = cleanTci(r.client_id_di);
  const bgc = cleanTci(r.client_id_bgc);
  const ce  = cleanTci(r.client_id_ce);
  if (di)  tciSet.add(di);
  if (bgc) tciSet.add(bgc);
  if (ce)  tciSet.add(ce);
}

const tciArray = Array.from(tciSet);

// Tamano de lote. ~95 TCIs / 10 = ~10 lotes. BAJADO de 20 a 10 el 2026-06-13:
// el bloque VALIDATIONS_MR (revision manual) agrego una pasada mas sobre
// base_data y un lote de 20 TCIs x 12 meses se pasaba del timeout ~30s del
// Query Endpoint /run ("Timeout error" en el nodo HTTP, item 0). Con 10 TCIs
// cada lote corre comodo (~mitad del trabajo). Si algun lote AUN roza el limite
// (CH degradado, cliente muy pesado en el lote), bajar a 8 o 5.
const BATCH_SIZE = 10;

const batches = [];
for (let i = 0; i < tciArray.length; i += BATCH_SIZE) {
  batches.push(tciArray.slice(i, i + BATCH_SIZE));
}
// Garantizar al menos 1 item para no cortar el flujo si la whitelist viene vacia.
if (batches.length === 0) batches.push([]);

const out = [];
for (let b = 0; b < batches.length; b++) {
  const chunk = batches[b];

  // CSV plano sin comillas: "tci1,tci2,...". Si el lote viniera vacio usamos
  // '__none__' (token que no matchea ningun cliente) en vez de '' — porque ''
  // dispara la rama "{client_id} = '' OR ..." de la query maestra y devolveria
  // TODA la tabla.
  const csvRaw = chunk.join(',');
  const csv = csvRaw.length > 0 ? csvRaw : '__none__';

  // SQL-ready por lote para el fallback SF legacy.
  const escaped = [];
  for (const t of chunk) escaped.push("'" + String(t).replace(/'/g, "''") + "'");
  const sql = escaped.length > 0 ? escaped.join(',') : "''";

  out.push({
    json: {
      tci_list_csv:      csv,
      tci_list_array:    chunk,
      tci_list:          sql,
      // ch_body: objeto LISTO para el HTTP node. El body del HTTP se setea como
      // expresion `={{ $json.ch_body }}` (Body Content Type: JSON + Using JSON).
      // Asi evitamos el inline `={{ { ... } }}` que en algunas versiones de n8n
      // se previsualiza como "[object Object]" (memoria feedback_n8n_http_body_json_bug).
      ch_body: {
        queryVariables: { client_id: csv },
        format: 'JSONEachRow'
      },
      batch_index:       b,
      batch_count:       batches.length,
      batch_size:        BATCH_SIZE,
      clientes_en_batch: chunk.length,
      total_clientes:    tciArray.length
    }
  });
}

return out;
