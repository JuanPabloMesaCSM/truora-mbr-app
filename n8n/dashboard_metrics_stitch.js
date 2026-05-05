// Code node "Stitch" del workflow Dashboard Metrics Detail.
//
// Toma los outputs de Snowflake DI / BGC / CE (cuando corrieron) y arma el
// JSON final que devolvemos al frontend agrupado por (producto, bloque).
//
// IMPORTANTE: leemos los items por NOMBRE de nodo (no por slot del Merge),
// igual que el Classify de BotiAlertas v2. Si una rama no corrio porque
// run_<producto>=false, $('Snowflake X').all() devuelve [] y data.X queda null.
//
// Reglas n8n: nada de optional chaining, nada de fetch, nada de arrow funcs.

const params = $('Set Params').first().json;

function tryGetItems(nodeName) {
  try {
    const items = $(nodeName).all();
    return Array.isArray(items) ? items : [];
  } catch (e) {
    // El nodo no se ejecuto en esta corrida (gating del IF previo).
    return [];
  }
}

const itemsDi  = params.run_di  ? tryGetItems('Snowflake DI')  : [];
const itemsBgc = params.run_bgc ? tryGetItems('Snowflake BGC') : [];
const itemsCe  = params.run_ce  ? tryGetItems('Snowflake CE')  : [];

// Convierte filas planas (BLOQUE, PERIODO, COL1..COL_EXTRA4) en
// { '1_metricas_generales': [ {periodo, col1..col_extra4}, ... ], ... }
function parsearBloques(items) {
  const result = {};
  for (let i = 0; i < items.length; i++) {
    const j = items[i].json || {};
    const bloque = j.BLOQUE || j.bloque;
    if (!bloque) continue;
    if (!result[bloque]) result[bloque] = [];
    result[bloque].push({
      periodo:    j.PERIODO    || j.periodo    || null,
      col1:       j.COL1       || j.col1       || null,
      col2:       j.COL2       || j.col2       || null,
      col3:       j.COL3       || j.col3       || null,
      col4:       j.COL4       || j.col4       || null,
      col5:       j.COL5       || j.col5       || null,
      col6:       j.COL6       || j.col6       || null,
      col7:       j.COL7       || j.col7       || null,
      col8:       j.COL8       || j.col8       || null,
      col9:       j.COL9       || j.col9       || null,
      col10:      j.COL10      || j.col10      || null,
      col11:      j.COL11      || j.col11      || null,
      col_extra1: j.COL_EXTRA1 || j.col_extra1 || null,
      col_extra2: j.COL_EXTRA2 || j.col_extra2 || null,
      col_extra3: j.COL_EXTRA3 || j.col_extra3 || null,
      col_extra4: j.COL_EXTRA4 || j.col_extra4 || null
    });
  }
  return result;
}

const response = {
  ok: true,
  fecha_inicio: params.fecha_inicio,
  fecha_fin:    params.fecha_fin,
  productos:    params.productos,
  productos_ejecutados: {
    DI:  params.run_di,
    BGC: params.run_bgc,
    CE:  params.run_ce
  },
  data: {
    DI:  params.run_di  ? parsearBloques(itemsDi)  : null,
    BGC: params.run_bgc ? parsearBloques(itemsBgc) : null,
    CE:  params.run_ce  ? parsearBloques(itemsCe)  : null
  }
};

// Retornamos el response directo, NO envuelto en `response`. Asi el nodo
// Respond to Webhook puede usar "First Incoming Item" sin necesidad de
// expression — n8n a veces no evalua `{{ $json.response }}` correctamente
// dentro de Respond Body cuando Respond With es JSON, devolviendo el item
// envuelto al cliente.
return [{ json: response }];
