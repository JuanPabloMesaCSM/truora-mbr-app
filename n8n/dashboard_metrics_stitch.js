// Code node "Stitch" del workflow Dashboard Metrics Detail.
//
// Toma los outputs de Snowflake DI / BGC / CE y de la rama CH "Consumo Mensual"
// y arma el JSON final agrupado por (producto, bloque).
//
// IMPORTANTE: leemos los items por NOMBRE de nodo (no por slot del Merge),
// igual que el Classify de BotiAlertas v2. Si una rama no corrio porque
// run_<producto>=false, $('Snowflake X').all() devuelve [].
//
// Migrado 2026-05-11: el bloque `consumo_mensual` se removio de los 3 SQL SF
// y ahora viene de CH (endpoint "Dashboard Detail Consumo Mensual"). El nodo
// HTTP en n8n se llama "CH Consumo Mensual" y devuelve filas con
//   { periodo_mes, client_id, producto_root, product_identifier, usage }
// Las inyectamos en data.DI/BGC/CE.consumo_mensual segun `producto_root`.
//
// Reglas n8n: nada de optional chaining, nada de fetch, nada de arrow funcs.

const params = $('Set Params').first().json;

function tryGetItems(nodeName) {
  try {
    const items = $(nodeName).all();
    return Array.isArray(items) ? items : [];
  } catch (e) {
    return [];
  }
}

const itemsDi  = params.run_di  ? tryGetItems('Snowflake DI')  : [];
const itemsBgc = params.run_bgc ? tryGetItems('Snowflake BGC') : [];
const itemsCe  = params.run_ce  ? tryGetItems('Snowflake CE')  : [];
const itemsCh  = tryGetItems('CH Consumo Mensual');

// ----- 1) Parsear bloques SF (DI/BGC/CE) -----
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

const blocksDi  = params.run_di  ? parsearBloques(itemsDi)  : null;
const blocksBgc = params.run_bgc ? parsearBloques(itemsBgc) : null;
const blocksCe  = params.run_ce  ? parsearBloques(itemsCe)  : null;

// ----- 2) Parsear filas CH consumo_mensual y distribuir por producto -----
// CH devuelve JSONEachRow. n8n puede entregarnos:
//   (a) 1 item por fila (item.json = la fila)
//   (b) 1 item con item.json.data = [filas]
//   (c) 1 item con item.json.rows = [filas]
function extractChRows(items) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || !it.json) continue;
    const j = it.json;
    // Case A: data como string multilinea JSONEachRow ('{...}\n{...}\n...')
    // Este es el shape real que devuelve CH Cloud Query Endpoints con
    // format: 'JSONEachRow'. Cada linea (no vacia) es un JSON parseable.
    if (typeof j.data === 'string' && j.data.length > 0) {
      const lines = j.data.split('\n');
      for (let k = 0; k < lines.length; k++) {
        const line = lines[k].trim();
        if (!line) continue;
        try {
          out.push(JSON.parse(line));
        } catch (e) {
          // Linea corrupta — skip y continuamos.
        }
      }
      continue;
    }
    // Case B: data como array directo (por si n8n auto-parsea)
    if (Array.isArray(j.data)) {
      for (let k = 0; k < j.data.length; k++) out.push(j.data[k]);
      continue;
    }
    // Case C: rows como array (algunos endpoints CH)
    if (Array.isArray(j.rows)) {
      for (let k = 0; k < j.rows.length; k++) out.push(j.rows[k]);
      continue;
    }
    // Case D: el item ya es una fila individual (n8n split per-line)
    if (j.periodo_mes !== undefined || j.producto_root !== undefined) {
      out.push(j);
    }
  }
  return out;
}

const chRows = extractChRows(itemsCh);

// Mapeo producto_root CH -> bucket DI/BGC/CE
function bucketDe(productoRoot) {
  if (productoRoot === 'validations') return 'DI';
  if (productoRoot === 'checks')      return 'BGC';
  if (productoRoot === 'truconnect')  return 'CE';
  return null;
}

// Convertimos cada fila CH a la forma {periodo, col1, col2, ...} del SF legacy
// para que el frontend no tenga que cambiar nada.
//   col1 = product_identifier (ej 'document_validation', 'outbound', 'checks')
//   col2 = usage (string, como SF)
function chRowToConsumoMensual(r) {
  return {
    periodo:    r.periodo_mes || null,
    col1:       (r.product_identifier === null || r.product_identifier === undefined) ? null : String(r.product_identifier),
    col2:       (r.usage === null || r.usage === undefined) ? null : String(r.usage),
    col3:  null, col4:  null, col5:  null, col6:  null,
    col7:  null, col8:  null, col9:  null, col10: null, col11: null,
    col_extra1: null, col_extra2: null, col_extra3: null, col_extra4: null
  };
}

// Inyectamos las filas CH al bucket correcto, asegurando que solo se popule
// si la rama del producto se ejecuto (run_<producto>=true). Si el cliente no
// pidio DI, no le metemos consumo_mensual.DI aunque CH devuelva filas.
function inyectarConsumo(blocks, run, chRowsAll, bucketEsperado) {
  if (!run || !blocks) return;
  const filtradas = [];
  for (let i = 0; i < chRowsAll.length; i++) {
    const r = chRowsAll[i];
    if (!r) continue;
    if (bucketDe(r.producto_root) !== bucketEsperado) continue;
    if (!r.product_identifier) continue;
    filtradas.push(chRowToConsumoMensual(r));
  }
  if (filtradas.length > 0) {
    blocks.consumo_mensual = filtradas;
  } else {
    // Si CH no devolvio nada para este producto en el rango, dejamos array vacio
    // (mismo comportamiento que SF cuando no habia consumo).
    blocks.consumo_mensual = [];
  }
}

inyectarConsumo(blocksDi,  params.run_di,  chRows, 'DI');
inyectarConsumo(blocksBgc, params.run_bgc, chRows, 'BGC');
inyectarConsumo(blocksCe,  params.run_ce,  chRows, 'CE');

// ----- 2.5) Totales facturables del rango (header del dashboard) -----
// Suma las filas CH por bucket sobre todo el rango seleccionado. El frontend
// usa este bloque para el numerote del header en vez del COUNT de procesos /
// checks / mensajes de SF (que median eventos del rango, no counter facturable).
// El header ahora matchea exacto: front del cliente = consumo mensual = header.
//
// Shape:
//   totales_billable: {
//     total: 1571,
//     by_subproduct: { document_validation: 911, passive_liveness: 337, ... }
//   }
function computeTotalesBillable(chRowsAll, bucketEsperado) {
  let total = 0;
  const bySub = {};
  for (let i = 0; i < chRowsAll.length; i++) {
    const r = chRowsAll[i];
    if (!r) continue;
    if (bucketDe(r.producto_root) !== bucketEsperado) continue;
    if (!r.product_identifier) continue;
    const usage = Number(r.usage);
    if (!isFinite(usage)) continue;
    total += usage;
    if (bySub[r.product_identifier] === undefined) bySub[r.product_identifier] = 0;
    bySub[r.product_identifier] += usage;
  }
  return { total: total, by_subproduct: bySub };
}

if (blocksDi  && params.run_di)  blocksDi.totales_billable  = computeTotalesBillable(chRows, 'DI');
if (blocksBgc && params.run_bgc) blocksBgc.totales_billable = computeTotalesBillable(chRows, 'BGC');
if (blocksCe  && params.run_ce)  blocksCe.totales_billable  = computeTotalesBillable(chRows, 'CE');

// ----- 3) Response final -----
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
    DI:  blocksDi,
    BGC: blocksBgc,
    CE:  blocksCe
  },
  // Metricas de debug del stitch para troubleshooting cuando CH falla.
  _meta: {
    ch_items_raw:    itemsCh.length,
    ch_rows_parsed:  chRows.length,
    sf_items_di:     itemsDi.length,
    sf_items_bgc:    itemsBgc.length,
    sf_items_ce:     itemsCe.length
  }
};

return [{ json: response }];
