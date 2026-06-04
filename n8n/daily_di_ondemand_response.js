// n8n Code node — "Armar Respuesta" (webhook on-demand: reporte-di-diario)
// Mode: Run Once for All Items
// =========================================================================
// Lee por nombre los 2 Snowflake y devuelve el JSON que consume la página
// /reporte-di-diario. Normaliza las claves a minúsculas (Snowflake devuelve
// MAYÚSCULAS) para que el frontend use acceso directo.
//
// Salida: 1 item { json: { status, conversion: [...], razones: [...] } }
// El nodo "Respond to Webhook" debe responder con "First Incoming Item".
// Reglas n8n: sin optional chaining (?.).
// =========================================================================

const lower = (row) => {
  const out = {};
  if (!row) return out;
  const keys = Object.keys(row);
  for (let i = 0; i < keys.length; i++) {
    out[keys[i].toLowerCase()] = row[keys[i]];
  }
  return out;
};

const conv = $('SF Conversión').all().map((i) => lower(i.json));
const raz = $('SF Razones').all().map((i) => lower(i.json));

return [{
  json: {
    status: 'success',
    conversion: conv,
    razones: raz,
  },
}];
