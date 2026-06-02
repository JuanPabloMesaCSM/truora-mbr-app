# Report Builder CE → ClickHouse — cambios n8n

Estado **✅ PUBLICADO/LIVE 2026-06-02**. Fase 1 (Ce1) + Fase 2 (Ce12/13/14) cableadas en el workflow VIVO y validadas end-to-end (Financiera + GDC datos, FMP render). El nodo `Preparar Datos` vivo = secciones **1 + 1b + 1c + 1d + 2 + 3 + 4** (la Fase 1 de abajo con los bloques `1c`+`1d` insertados entre `1b` y la sección 2).
SQL de los endpoints: `truora-mbr-app/clickhouse/ce_report_builder_migration.sql`.
Workflows n8n: `Report Builder CE` (`JiPo0n1sEUQbJ2k4`), `CE por Flujos y VRF` (`96t8Xl3WGpIaKCLb`).

## Endpoints CH (en n8n, vía GET + query params)
- `7d75098b-7e2b-4718-8ca6-44707476d739` → **CE Consumo** (Ce1). Guardado + validado.
- `113d8964-6ac8-4e8f-a87c-bf91963915a3` → **Tasas CE** (reconciliación/monitor). Guardado + validado. (Reemplazó el viejo CE-by-flow sin FINAL.)
- `0832340b-d9e9-4299-a9a0-4c93fc2ec89d` → **CE Tendencia** (`ce_tendencia_mensual`, Ce13). Era el "BGC Counter" libre de la Ola 3a; **ya NO queda reservado para BGC** → cuando migremos BGC habrá que crear otro endpoint.
- `5113cd40-c938-415e-93f9-1d8303f07ae7` → **CE Linea** (`ce_consumo_por_linea`, Ce12/Ce14). Endpoint **NUEVO** creado 2026-05-29 (no se reusó `e0425fdf`/`client_di_by_flow` porque está enchufado en el Report Builder DI + whitelist del agente Oppy).

## Config de los nodos HTTP (CH) — GET, NO POST
- Method **GET**, URL `https://queries.clickhouse.cloud/run/<uuid>`, Auth **Basic** (key CH).
- Send Query Parameters ON: `format=JSON`, `param_client_id`, `param_fecha_inicio`, `param_fecha_fin`.
  - `param_client_id` = `{{ $('Preparar Contexto').first().json.CLIENT_ID }}` (¡SIN `=` adelante! n8n agrega el `=` de Expression solo).
  - `param_fecha_inicio` = `{{ $('Preparar Contexto').first().json.fecha_inicio }}`
  - `param_fecha_fin` = `{{ $('Preparar Contexto').first().json.fecha_fin }}`
- Send Headers **OFF**, Send Body **OFF** (borrar `x-clickhouse-endpoint-version` / `Content-Type` / body `queryVariables` heredados del POST viejo).

## Wiring Fase 1 (hecho en copia)
- `Webhook` → **CH Consumo** (GET 7d7) → **Output parseado Consumo** (Code) → **Merge** (entrada nueva).
- `HTTP Request` existente → repuntado a `113` con params `fecha_inicio/fecha_fin` → `Output parseado CE Outbounds`.
- Parser (ambos): `const r=$input.first().json; return (r.data||[]).map(function(x){return {json:x};});`

## `Preparar Datos` — código completo Fase 1 (VALIDADO, Financiera abril → Ce1 480/750/11835, banner off)

```js
// ── 1. Data global desde Snowflake ───────────────────────
var globalRows = $('Snowflake').all();
var data = {};
for (var i = 0; i < globalRows.length; i++) {
  var row = globalRows[i].json;
  var bloque = row.BLOQUE;
  if (!bloque) continue;
  if (!data[bloque]) data[bloque] = [];
  var blockRow = { bloque: bloque };
  var cols = ['COL1','COL2','COL3','COL4','COL5','COL6','COL7','COL8','COL9','COL10','COL11','COL_EXTRA1','COL_EXTRA2','COL_EXTRA3','COL_EXTRA4'];
  for (var j = 0; j < cols.length; j++) {
    var key = cols[j];
    if (row[key] !== null && row[key] !== undefined) blockRow[key.toLowerCase()] = String(row[key]);
  }
  if (row.PERIODO) blockRow.periodo = String(row.PERIODO);
  data[bloque].push(blockRow);
}

// ── 1b. Override Ce1 con ClickHouse (endpoint 7d7 = facturable) ──
var consumoRows = [];
try { consumoRows = $('Output parseado Consumo').all().map(function(i){return i.json;}); } catch(e) {}
if (consumoRows.length && data['1_consumo_total'] && data['1_consumo_total'][0]) {
  var c = consumoRows[0];
  var ci=parseInt(c.CUR_INBOUND||0),  co=parseInt(c.CUR_OUTBOUND||0),  cn=parseInt(c.CUR_NOTIFICATION||0);
  var pi=parseInt(c.PREV_INBOUND||0), po=parseInt(c.PREV_OUTBOUND||0), pn=parseInt(c.PREV_NOTIFICATION||0);
  var ct=ci+co+cn, pt=pi+po+pn;
  var vp=function(a,b){return b>0?Math.round((a-b)/b*1000)/10:0;};
  var dr=function(a,b){return a>b?'UP':(a<b?'DOWN':'FLAT');};
  var bce1=data['1_consumo_total'][0];
  bce1.col1=String(ci); bce1.col2=String(co); bce1.col3=String(cn); bce1.col4=String(ct);
  bce1.col5=String(pi); bce1.col6=String(po); bce1.col7=String(pn); bce1.col8=String(pt);
  bce1.col9=String(vp(ct,pt)); bce1.col10=String(vp(co,po)); bce1.col11=String(vp(ci,pi));
  bce1.col_extra1=dr(ct,pt); bce1.col_extra2=dr(co,po); bce1.col_extra3=dr(ci,pi);
}

// ── 2. Flujos CE ─────────────────────────────────────────
var ceFlows = [];
for (var k = 0; k < items.length; k++) {
  var item = items[k].json;
  if (item._flow_structured) ceFlows.push(item._flow_structured);
}

// ── 3. Reconciliación: CH = fuente oficial → banner apagado ──
var tasasRows = [];
try { tasasRows = $('Output parseado CE Outbounds').all().map(function(i){return i.json;}); } catch(e) {}
var ch113 = { out:0, notif:0 };
for (var t1 = 0; t1 < tasasRows.length; t1++){
  var tr = tasasRows[t1];
  if (tr.product === 'truconnect_outbound')     ch113.out   = parseInt(tr.CUR_ENTREGADOS||0);
  if (tr.product === 'truconnect_notification') ch113.notif = parseInt(tr.CUR_ENTREGADOS||0);
}
var ch7 = { out: consumoRows.length?parseInt(consumoRows[0].CUR_OUTBOUND||0):0,
            notif: consumoRows.length?parseInt(consumoRows[0].CUR_NOTIFICATION||0):0 };
var monitor = [];
var dp = function(a,b){ return b>0 ? Math.abs((a-b)/b*100) : 0; };
if (dp(ch7.out,   ch113.out)   > 2) monitor.push('CH outbound 7d7='+ch7.out+' vs 113='+ch113.out);
if (dp(ch7.notif, ch113.notif) > 2) monitor.push('CH notif 7d7='+ch7.notif+' vs 113='+ch113.notif);

var reconciliacion = {
  fuente_oficial: 'ClickHouse (facturable)',
  tiene_alertas: false, total_alertas: 0, alertas: [],
  monitor: monitor,
  fuentes: { clickhouse: { outbound: ch7.out, notif: ch7.notif } }
};

// ── 4. Meta ──────────────────────────────────────────────
var ctx = $('Preparar Contexto').first().json;
var flowIds = ctx.flow_ids || 'ALL';
var modo = (flowIds === 'ALL') ? 'global' : 'flujos';
if (modo === 'flujos') {
  delete data['1_consumo_total']; delete data['2_eficiencia_campanas']; delete data['3_fallos_outbound'];
  delete data['5_flujo_inbound']; delete data['6_agentes_general']; delete data['7_agentes_top5'];
}

return [{ json: {
  status: 'success', data: data, ceFlows: ceFlows, reconciliacion: reconciliacion,
  meta: { cliente: ctx.cliente||'', periodo_reporte: ctx.periodo_reporte||'', nombre_csm: ctx.nombre_csm||'', modo: modo }
}}];
```

## Fase 2 — endpoints A + B VALIDADOS (GDC abril 2026)

**Endpoint A `ce_tendencia_mensual`** (UUID: `0832340b-d9e9-4299-a9a0-4c93fc2ec89d`) → `MES, OUTBOUND, NOTIFICATION, INBOUND, TOTAL`.
GDC abril: 2026-04 = 81130/3/6000/87133 (= Ce1 ✓); 6 meses con zero-fill.

**Endpoint B `ce_consumo_por_linea`** (UUID: `5113cd40-c938-415e-93f9-1d8303f07ae7`, nuevo) → `LINEA, OUT_M0, NOTIF_M0, VOL_M0, VOL_M1, VOL_M2`.
GDC abril: +573102997615 → 81130/3/81133/79792/78453. Σ OUT_M0/NOTIF_M0 = Ce1 ✓.

### Nodos nuevos
- `CH Tendencia` (GET A) → `Output parseado Tendencia` → Merge.
- `CH Linea` (GET B) → `Output parseado Linea` → Merge.
- Config GET idéntica a `CH Consumo` (param_client_id / param_fecha_inicio / param_fecha_fin, headers+body OFF).
- Parser (ambos): `const r=$input.first().json; return (r.data||[]).map(function(x){return {json:x};});`

### `Preparar Datos` — agregar DESPUÉS del bloque `1b` (reemplazos de array)
```js
// ── 1c. Override Ce13 (tendencia mensual) con ClickHouse ──
var tendRows = [];
try { tendRows = $('Output parseado Tendencia').all().map(function(i){return i.json;}); } catch(e) {}
if (tendRows.length && data['5c_tendencia_mensual']) {
  var arr13 = [];
  for (var m = 0; m < tendRows.length; m++) {
    var t = tendRows[m];
    arr13.push({
      bloque: '5c_tendencia_mensual',
      col1: String(parseInt(t.OUTBOUND||0)),
      col2: String(parseInt(t.NOTIFICATION||0)),
      col3: String(parseInt(t.INBOUND||0)),
      col4: String(parseInt(t.TOTAL||0)),
      periodo: String(t.MES).slice(0,10)
    });
  }
  data['5c_tendencia_mensual'] = arr13;
}

// ── 1d. Override Ce12 + Ce14 (por línea) con ClickHouse ──
var lineaRows = [];
try { lineaRows = $('Output parseado Linea').all().map(function(i){return i.json;}); } catch(e) {}
if (lineaRows.length) {
  var sumVolM0 = 0;
  for (var l = 0; l < lineaRows.length; l++) sumVolM0 += parseInt(lineaRows[l].VOL_M0||0);
  var periodoLinea = ($('Preparar Contexto').first().json.fecha_inicio) || '';

  if (data['5b_consumo_por_linea']) {
    var arr12 = [];
    for (var a = 0; a < lineaRows.length; a++) {
      var lr = lineaRows[a]; var vol0 = parseInt(lr.VOL_M0||0);
      arr12.push({
        bloque: '5b_consumo_por_linea',
        col1: String(lr.LINEA||''),
        col2: String(parseInt(lr.OUT_M0||0)),
        col3: String(parseInt(lr.NOTIF_M0||0)),
        col4: String(vol0),
        col5: String(sumVolM0>0 ? Math.round(vol0/sumVolM0*1000)/10 : 0),
        periodo: periodoLinea
      });
    }
    data['5b_consumo_por_linea'] = arr12;
  }

  if (data['5d_heatmap_lineas']) {
    var arr14 = [];
    for (var b = 0; b < lineaRows.length; b++) {
      var lr2 = lineaRows[b];
      var v0 = parseInt(lr2.VOL_M0||0), v1 = parseInt(lr2.VOL_M1||0), v2 = parseInt(lr2.VOL_M2||0);
      var estado = (v1===0 && v2===0 && v0>0) ? 'NEW'
                 : (v0===0 && (v1>0 || v2>0)) ? 'STOPPED' : 'ACTIVE';
      arr14.push({
        bloque: '5d_heatmap_lineas',
        col1: String(lr2.LINEA||''), col2: String(v0), col3: String(v1), col4: String(v2),
        col5: estado, periodo: periodoLinea
      });
    }
    data['5d_heatmap_lineas'] = arr14;
  }
}
```
- El guard `if (data['...'])` = solo se sobreescribe si el CSM seleccionó ese módulo (CH vacío → fallback SF). Mismo patrón que Ce1.
- Son **reemplazos de array completos**, no override de una fila.

## Gotchas de esta sesión
- **Editor ≠ endpoint**: correr el SQL en el editor de CH NO actualiza el endpoint. Hay que **Save** la query que respalda el endpoint, si no sirve la versión vieja (síntomas: "Substitution tci_list is not set" / "from is not set").
- **GET, no POST**: con params escalares, GET + `param_*` es lo que funciona. El POST con body daba los bugs de Ola 3a. Al duplicar un nodo viejo POST, borrar body + headers.
- **n8n Expression `=`**: no tipear `=` adelante de la expresión (error visto: `=2026-04-0...` → CH no parsea la fecha). Ver `feedback_n8n_expression_mode`.
