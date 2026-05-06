// Code node "Build Whitelist" del flujo "Portfolio Consumption Sync".
//
// Toma los rows del nodo Supabase "Get Clientes Whitelist" (cartera activa
// con sus 3 TCIs por producto) y arma UN string SQL-ready con la lista
// combinada de TCIs (DI ∪ BGC ∪ CE), listo para inyectar en el WHERE IN
// del nodo Snowflake siguiente.
//
// Output: 1 item con
//   { tci_list: "'tci1','tci2',...", count: <int> }
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

// Escapamos comillas simples (defensivo — los TCIs no deberian tener, pero
// nunca asumir).
const escaped = [];
for (const t of tciSet) {
  escaped.push("'" + String(t).replace(/'/g, "''") + "'");
}

// Fallback si la cartera viene vacia: SQL valido que no matchea nada,
// para que el nodo SF no falle con sintaxis "WHERE IN ()".
const tciList = escaped.length > 0 ? escaped.join(',') : "''";

return [{
  json: {
    tci_list: tciList,
    count: tciSet.size,
    clientes_input: items.length
  }
}];
