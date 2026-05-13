// Code node "Prepare Upsert" del flujo n8n "Portfolio Consumption Sync".
//
// Lee los rows del nodo Snowflake (1 item por row, uppercase keys) y arma
// un payload PostgREST listo para upsert batch contra public.portfolio_consumption.
//
// Output: 1 item con json.rows = [...]. El nodo HTTP Request siguiente envia
// json.rows como body con Prefer: resolution=merge-duplicates,return=minimal.
//
// Reglas n8n: nada de optional chaining, nada de fetch, sin arrow functions
// dentro de configs de nodos posteriores.

const sfItems = $input.all();
const rows = [];
const fechaActualizado = new Date().toISOString();

for (let i = 0; i < sfItems.length; i++) {
  const r = (sfItems[i] && sfItems[i].json) ? sfItems[i].json : {};

  // SF n8n node devuelve uppercase normalmente, pero ser defensivo no cuesta.
  const periodoMes = r.PERIODO_MES !== undefined ? r.PERIODO_MES : r.periodo_mes;
  const clientId   = r.CLIENT_ID   !== undefined ? r.CLIENT_ID   : r.client_id;
  const clientName = r.CLIENT_NAME !== undefined ? r.CLIENT_NAME : r.client_name;
  const csmOwner   = r.CSM_OWNER   !== undefined ? r.CSM_OWNER   : r.csm_owner;
  const product    = r.PRODUCT     !== undefined ? r.PRODUCT     : r.product;
  const usageRaw   = r.USAGE       !== undefined ? r.USAGE       : r.usage;

  if (!periodoMes || !clientId || !product) continue;

  let periodoMesStr;
  if (typeof periodoMes === 'string') {
    periodoMesStr = periodoMes.slice(0, 10);            // "2026-04-01..." -> "2026-04-01"
  } else if (periodoMes instanceof Date) {
    periodoMesStr = periodoMes.toISOString().slice(0, 10);
  } else {
    periodoMesStr = String(periodoMes).slice(0, 10);
  }

  rows.push({
    periodo_mes:        periodoMesStr,
    client_id:          String(clientId),
    client_name:        clientName ? String(clientName) : null,
    csm_owner:          csmOwner   ? String(csmOwner)   : null,
    product:            String(product),
    usage:              Number(usageRaw) || 0,
    fecha_actualizado:  fechaActualizado
  });
}

return [{
  json: {
    rows: rows,
    count: rows.length,
    sf_items: sfItems.length,
    run_at: fechaActualizado
  }
}];
