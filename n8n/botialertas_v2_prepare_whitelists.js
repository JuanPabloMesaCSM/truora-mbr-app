
// n8n Code node — BotiAlertas v2 / Prepare Whitelists
// Toma la salida del nodo Supabase "Get Clientes" (lista de filas con
// id, nombre, client_id_di, client_id_bgc, client_id_ce, csm_email) y produce
// UN solo item con tres strings VALUES listos para inyectar en los queries SF.
//
// Tambien expone un mapa { client_id_X -> { cliente_id, csm_email, nombre } }
// para que el Code node "classify" no tenga que volver a Supabase.
//
// Output (un solo item):
// {
//   di_values:  "('TCIxxx'),('TCIyyy'),..."        // o vacio + flag has_di
//   bgc_values: "('TCIxxx'),..."
//   ce_values:  "('TCIxxx'),..."
//   di_count:   N,
//   bgc_count:  N,
//   ce_count:   N,
//   client_map: { di: {...}, bgc: {...}, ce: {...} }
// }
//
// REGLAS n8n (CLAUDE.md):
//   * Sin optional chaining (?.).
//   * Guards explicitos antes de leer propiedades anidadas.
//   * Sin fetch().

// Admin emails: NO tienen cartera real. Las filas de clientes con estos
// csm_email son duplicados administrativos creados para visibilidad RLS
// histórica. Se saltan acá para que el dedup quede con la fila del CSM real
// y los Telegram nunca le lleguen como "primarios" a Ana o JD.
// (Ellos siguen recibiendo BCC desde classify.js — eso pasa por chat_id, no
//  por este pool.)
const ADMIN_EMAILS = ['amarquez@truora.com', 'jdiaz@truora.com'];

const buckets = {
  di:  { ids: [], map: {} },
  bgc: { ids: [], map: {} },
  ce:  { ids: [], map: {} },
};

function pushIfValid(productKey, idRaw, row) {
  if (typeof idRaw !== 'string') return;
  const id = idRaw.trim();
  if (id.length === 0) return;
  // defensa contra ids con comilla simple; no deberia pasar pero por si acaso.
  const safe = id.replace(/'/g, '');
  if (safe.length === 0) return;
  // Dedup: la tabla `clientes` tiene 3 filas por cliente real (CSM real + 2
  // duplicados admin amarquez/jdiaz para visibilidad RLS). Si dejamos pasar los
  // duplicados, el VALUES string los repite y BGC/CE (que arrancan en
  // FROM client_list cl LEFT JOIN ...) emiten filas duplicadas → Telegram repite
  // alertas 3x. Nos quedamos con la primera ocurrencia: el csm_email asociado
  // al primer row gana, que es el real (las copias admin van al final).
  if (buckets[productKey].map[safe]) return;
  buckets[productKey].ids.push(safe);
  buckets[productKey].map[safe] = {
    // Supabase getAll devuelve la columna PK como `id`, no `cliente_id`.
    // boti_alertas.cliente_id es FK a clientes.id (uuid).
    cliente_id: row.id,
    nombre:     row.nombre,
    csm_email:  row.csm_email,    // puede ser null para oncall — se maneja en classify
  };
}

for (const item of items) {
  const j = item.json;
  if (!j) continue;
  // Saltar filas admin: Ana y JD no tienen cartera real, sus filas son
  // duplicados RLS. El dedup así queda con el CSM real para cada TCI.
  if (ADMIN_EMAILS.indexOf(j.csm_email) !== -1) continue;

  pushIfValid('di',  j.client_id_di,  j);
  pushIfValid('bgc', j.client_id_bgc, j);
  pushIfValid('ce',  j.client_id_ce,  j);
}

// Snowflake VALUES requiere al menos una fila; si una whitelist sale vacia,
// el query del producto correspondiente debe omitirse (controlar via IF en n8n).
// Para evitar SQL invalido enviamos un placeholder benign que no matchea a nada.
function buildValues(ids) {
  if (ids.length === 0) return "('__EMPTY__')";
  return ids.map(id => `('${id}')`).join(',');
}

return [{
  json: {
    di_values:  buildValues(buckets.di.ids),
    bgc_values: buildValues(buckets.bgc.ids),
    ce_values:  buildValues(buckets.ce.ids),

    di_count:  buckets.di.ids.length,
    bgc_count: buckets.bgc.ids.length,
    ce_count:  buckets.ce.ids.length,

    client_map: {
      di:  buckets.di.map,
      bgc: buckets.bgc.map,
      ce:  buckets.ce.map,
    },
  },
}];
