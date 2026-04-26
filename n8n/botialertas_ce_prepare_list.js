// n8n Code node — BotiAlertas v2 / CE
// Convierte la salida del nodo Supabase (lista de client_id_ce) en el texto
// literal que inyecta la CTE `client_list` del query Snowflake.
//
// Input : items[] con { client_id: 'TCI...' }  (viene del nodo Supabase anterior)
// Output: un solo item con { ce_client_list_values: "('tci1'),('tci2'),..." }
//
// En el nodo Snowflake siguiente, la query usa {{CE_CLIENT_LIST_VALUES}}
// que se reemplaza por ={{ $json.ce_client_list_values }} en la expresion.
//
// NOTA: nada de optional chaining. Guards explicitos para respetar el runtime n8n.

const ids = [];
for (const item of items) {
  const j = item.json;
  if (j && typeof j.client_id === 'string' && j.client_id.length > 0) {
    // defensa contra ids con comilla simple; no deberia pasar pero por si acaso.
    const safe = j.client_id.replace(/'/g, '');
    if (safe.length > 0) ids.push(safe);
  }
}

if (ids.length === 0) {
  // Fail fast: sin clientes no hay query valido y el VALUES vacio es error SQL
  throw new Error('BotiAlertas CE: lista de client_id_ce vacia desde Supabase.');
}

const values = ids.map(id => `('${id}')`).join(',');

return [{
  json: {
    ce_client_list_values: values,
    ce_client_count: ids.length,
  },
}];
