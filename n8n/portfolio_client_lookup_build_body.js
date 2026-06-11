// Code node "Build CH Body" del flujo n8n "Portfolio Client Lookup".
//
// Lookup EFIMERO: consulta de CUALQUIER Client ID (aunque no este en la cartera)
// para ver su consumo por sub-producto SIN guardar nada en Supabase. Reusa el
// mismo endpoint CH `69e67323` que el cron Portfolio Sync (query maestra de
// counters), pero con un solo TCI.
//
// Lee el client_id del Webhook (acepta $json.body.client_id de POST JSON,
// $json.client_id pelado, o $json.query.client_id de GET) y lo deja como CSV
// para el param {client_id:String} (splitByChar) del endpoint.
//
// Reglas n8n: nada de optional chaining, nada de fetch.

const item = $input.first();
const j = (item && item.json) ? item.json : {};

function pick(obj, key) {
  if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  return null;
}

let raw = null;
if (j.body && pick(j.body, 'client_id') !== null) raw = j.body.client_id;
else if (pick(j, 'client_id') !== null) raw = j.client_id;
else if (j.query && pick(j.query, 'client_id') !== null) raw = j.query.client_id;

const clientId = raw === null ? '' : String(raw).trim();

// SENTINELA si viene vacio: el query de la maestra tiene la rama
// "{client_id} = '' OR client_id IN splitByChar(...)" => un '' devolveria TODA
// la cartera (70M filas). Para un lookup eso es peligroso, asi que mandamos un
// token que no matchea ningun cliente => 0 filas (la rama IN da false).
const clientIdCsv = clientId.length > 0 ? clientId : '__none__';

return [{
  json: {
    client_id_csv: clientIdCsv,   // un solo TCI (o '__none__' si vino vacio)
    requested:     clientId
  }
}];
