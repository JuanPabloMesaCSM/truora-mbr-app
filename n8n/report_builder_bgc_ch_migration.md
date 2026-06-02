# Report Builder BGC → ClickHouse — cambios n8n + frontend

Estado **2026-06-02**. Capa de datos validada (PEXTO + Indrive). **NO publicado.** Override n8n hecho; frontend en mock sin pushear.
SQL endpoints: `truora-mbr-app/clickhouse/bgc_report_builder_migration.sql`. Memoria: `project_bgc_report_builder_ch_migration`.
Workflows: `Report Builder BGC` (webhook `report-builder-bgc`) + subflujo `Custom Types` (webhook `report-builder-bgc-types`, descubre los check types custom del cliente → el front los pasa como `custom_types`).

## Arquitectura
`Webhook → Preparar Params → Snowflake → Calcular Métricas → Formatear Para Canvas → Respond`. Las ramas CH/Sheet/País×Tipo entran a un Merge → `Reconciliar BGC` → Calcular Métricas. **BGC mostraba SF; CH era solo reconciliación (como DI).** Migrar = override de bloques de volumen con CH en `Reconciliar BGC`. `Calcular Métricas` lee `.COL1..COL_EXTRA4` directo por `BLOQUE` (no recalcula), así que pisar los COL en `Reconciliar BGC` alcanza.

## Endpoints CH (GET + `param_*`, TZ UTC)
- `7bea8ad7-0b1a-4b0f-aed1-e3017947de28` → **BGC Resumen** (block 1, cur+prev) **+ columna `BASES_PREMIUM`** (block 8). Params `param_client_id`/`param_fecha_inicio`/`param_fecha_fin`. Parser `Output parseado` (JSONEachRow split). Fix in-place. `BASES_PREMIUM` = subquery escalar `groupArray((database_id, consultas))` con `ARRAY JOIN database_statuses` + `status='completed'` + `dbs.3='completed'` (billable per-base) → serializa en JSONEachRow como `[["DBI386…","21661"],["DBIad83…","9114"],…]` (consultas como string). NO se creó endpoint nuevo: premium se plegó acá (mismos params, no está en whitelist agente, override ya parsea este endpoint).
- `ad039af3-4dbb-4c88-97bf-48753b554499` → **BGC País×Tipo** (blocks 2/2b/3). Params `param_client_id`/**`param_from`/`param_to`** (mantiene from/to + columnas para no romper el agente; es `client_bgc_by_country`). Parser `Output parseado Pais Tipo BGC` (filtra por custom_types). Fix in-place REUSE.
- `55b9c609-4a7e-4f27-855f-378e5378ec46` → **BGC Histórico** (block 7, 4 meses). Params `param_client_id`/`param_fecha_inicio`. Parser `Output parseado Historico BGC` (`return (r.data||[]).map(x=>({json:x}))`). **NUEVO.**

Config nodos HTTP: GET, URL `.../run/<uuid>`, Basic Auth key CH, Send Query Params ON, valores en modo Expression `{{ $('Preparar Params').first().json.CLIENT_ID }}` etc. (SIN `=` adelante), Headers OFF, Body OFF.

## Col-mappings (cómo `Calcular Métricas` lee cada bloque)
- block 1 (`1_resumen_general`): col1=total, col2=completados, col3=errores, col4=score, col5=pass_rate, col6=rejection, col7=total_prev, col8=compl_prev, col9=score_prev, col10=pass_rate_prev, col11=var_checks, col_extra1=var_score, col_extra2=var_pass, col_extra3=dir_volumen, col_extra4=dir_score.
- block 2 (`2_por_pais`): col1=país, col2=total, col3=completados (lo que muestra), col4=errores, col5=score, col6=pass, col7=rejection, col8=pct_total.
- block 2b (`2b_pais_x_tipo`): col1=país, col2=tipo, col3=total, col4=completados (lo que muestra pág 6), col5=errores, col6=score, col7=pass, col8=rejection, col9=pct_pais, col10=pct_total.
- block 3 (`3_por_tipo`): col1=tipo, col2=total, col3=completados, col4=score, col5=pass, col6=pct_total.
- block 4/5/6 (score/labels): SF, no se tocan. block 7 (`7_historico_3meses`): col1=total, col2=compl, col3=err, col4=score, col5=pass, col6=tasa.
- block 8 (`8_bases_premium`): col1=database_id (hash DBI…), col2=consultas (billable). Una fila por base. El frontend `Bgc8Slide` mapea col1→nombre comercial+país (const `BGC_PREMIUM_DB` en `SlideCanvas.tsx`, fuente skill `clickhouse-counters-metabase.md`). Solo-CH, no existe en SF.

## DECISIÓN: headline = COMPLETADOS = front
TOTAL VERIFICACIONES (block 1 col1) = **completados** (NO comp+err, NO not_started). Validado: PEXTO 353.295, Indrive 181.784 = front exacto. `col3` (errores de proceso, status='error') se conserva pero NO suma al total — se muestra como nota secundaria en el front. País/tipos ya muestran completados. NOT_STARTED se excluye en todos lados (usar `completados`/`completados+errores`, nunca el `total_checks` crudo que incluye not_started — caso Indrive solo_imss ~15,5k not_started inflaban el total a 197.851).

## `Reconciliar BGC` — código completo (VALIDADO)
```js
// Override CH (billable) sobre bloques de volumen.
// Block 1 + 7: headline/volumen = completados (= front); score/pass ← SF.
// Blocks 2/2b/3 (país×tipo): volumen ← CH; score/pass/rejection ← SF (merge). Blocks 4/5/6 → SF.
var sfRows = $('Snowflake').all().map(function(i){ return i.json; });

var chRes = {};
try { var rr = $('Output parseado').all().map(function(i){ return i.json; }); if (rr.length) chRes = rr[0]; } catch(e) {}
var ch2 = [];
try { ch2 = $('Output parseado Pais Tipo BGC').all().map(function(i){ return i.json; }); } catch(e) {}
var ch3 = [];
try { ch3 = $('Output parseado Historico BGC').all().map(function(i){ return i.json; }); } catch(e) {}

var ni   = function(v){ var n = parseInt(v || 0); return isNaN(n) ? 0 : n; };
var vpct = function(a,b){ return b > 0 ? Math.round((a-b)/b*1000)/10 : 0; };
var dir  = function(a,b){ var p = b > 0 ? (a-b)/b*100 : 0; return Math.abs(p) < 0.05 ? 'FLAT' : (p > 0 ? 'UP' : 'DOWN'); };
var keep = function(o,k){ return (o && o[k] !== undefined && o[k] !== null) ? o[k] : '0'; };

// Block 1 (resumen) — headline = completados = front
var b1 = null;
for (var i = 0; i < sfRows.length; i++) { if (sfRows[i].BLOQUE === '1_resumen_general') { b1 = sfRows[i]; break; } }
var periodo = (b1 && b1.PERIODO) ? b1.PERIODO : '';
if (b1 && chRes.CUR_COMPLETADOS !== undefined) {
  var cc = ni(chRes.CUR_COMPLETADOS), ce = ni(chRes.CUR_ERRORES), ct = cc;
  var pcc = ni(chRes.PREV_COMPLETADOS), pt = pcc;
  b1.COL1 = String(ct); b1.COL2 = String(cc); b1.COL3 = String(ce);
  b1.COL7 = String(pt); b1.COL8 = String(pcc);
  b1.COL11 = String(vpct(ct, pt));
  b1.COL_EXTRA3 = dir(ct, pt);
}

// Block 7 (histórico) — volumen/mes = completados; match por mes
var chHist = {};
for (var h = 0; h < ch3.length; h++) { chHist[String(ch3[h].MES).slice(0,7)] = ch3[h]; }
for (var k = 0; k < sfRows.length; k++) {
  var r7 = sfRows[k];
  if (r7.BLOQUE === '7_historico_3meses') {
    var ch = chHist[String(r7.PERIODO).slice(0,7)];
    if (ch) {
      var cc7 = ni(ch.COMPLETADOS), e7 = ni(ch.ERRORES), t = cc7;
      r7.COL1 = String(t); r7.COL2 = String(cc7); r7.COL3 = String(e7);
      r7.COL6 = String((cc7+e7) > 0 ? Math.round(cc7/(cc7+e7)*1000)/10 : 0);
    }
  }
}

// Blocks 2/2b/3 (país×tipo) — volumen ← CH; score/pass/rejection ← SF (merge por clave)
if (ch2.length) {
  var sf2 = {}, sf2b = {}, sf3 = {};
  for (var s = 0; s < sfRows.length; s++) {
    var sr = sfRows[s];
    if (sr.BLOQUE === '2_por_pais')     sf2[String(sr.COL1)] = sr;
    if (sr.BLOQUE === '2b_pais_x_tipo') sf2b[String(sr.COL1) + '|' + String(sr.COL2)] = sr;
    if (sr.BLOQUE === '3_por_tipo')     sf3[String(sr.COL1)] = sr;
  }
  var porPais = {}, porTipo = {}, totCompl = 0, cells = [];
  for (var c = 0; c < ch2.length; c++) {
    var x = ch2[c];
    var pais = String(x.country || ''), tipo = String(x.check_type || '');
    var tot = ni(x.total_checks), comp = ni(x.completados), err = ni(x.errores);
    cells.push({ pais: pais, tipo: tipo, tot: tot, comp: comp, err: err });
    if (!porPais[pais]) porPais[pais] = { tot:0, comp:0, err:0 };
    porPais[pais].tot += tot; porPais[pais].comp += comp; porPais[pais].err += err;
    if (!porTipo[tipo]) porTipo[tipo] = { tot:0, comp:0, err:0 };
    porTipo[tipo].tot += tot; porTipo[tipo].comp += comp; porTipo[tipo].err += err;
    totCompl += comp;
  }
  var pctT = function(n){ return totCompl > 0 ? Math.round(n/totCompl*1000)/10 : 0; };
  var new2 = [], new2b = [], new3 = [];
  Object.keys(porPais).forEach(function(p){
    var a = porPais[p], sfr = sf2[p];
    new2.push({ BLOQUE:'2_por_pais', PERIODO: periodo,
      COL1: p, COL2: String(a.tot), COL3: String(a.comp), COL4: String(a.err),
      COL5: keep(sfr,'COL5'), COL6: keep(sfr,'COL6'), COL7: keep(sfr,'COL7'),
      COL8: String(pctT(a.comp)) });
  });
  cells.forEach(function(x){
    var sfr = sf2b[x.pais + '|' + x.tipo];
    var paisC = porPais[x.pais] ? porPais[x.pais].comp : 0;
    new2b.push({ BLOQUE:'2b_pais_x_tipo', PERIODO: periodo,
      COL1: x.pais, COL2: x.tipo, COL3: String(x.tot), COL4: String(x.comp), COL5: String(x.err),
      COL6: keep(sfr,'COL6'), COL7: keep(sfr,'COL7'), COL8: keep(sfr,'COL8'),
      COL9: String(paisC > 0 ? Math.round(x.comp/paisC*1000)/10 : 0),
      COL10: String(pctT(x.comp)) });
  });
  Object.keys(porTipo).forEach(function(t){
    var a = porTipo[t], sfr = sf3[t];
    new3.push({ BLOQUE:'3_por_tipo', PERIODO: periodo,
      COL1: t, COL2: String(a.tot), COL3: String(a.comp),
      COL4: keep(sfr,'COL4'), COL5: keep(sfr,'COL5'),
      COL6: String(pctT(a.comp)) });
  });
  sfRows = sfRows.filter(function(r){ return ['2_por_pais','2b_pais_x_tipo','3_por_tipo'].indexOf(r.BLOQUE) === -1; });
  sfRows = sfRows.concat(new2, new2b, new3);
}

// Block 8 (bases premium) — del campo BASES_PREMIUM del Resumen (solo-CH, no existe en SF).
// Una fila por database_id; el frontend mapea el hash → nombre comercial + país.
var bp = chRes.BASES_PREMIUM;
if (typeof bp === 'string') { try { bp = JSON.parse(bp); } catch(e) { bp = []; } }
var nPremium = 0;
if (bp && bp.length) {
  for (var bpi = 0; bpi < bp.length; bpi++) {
    var pr = bp[bpi];
    var dbid = (pr && pr[0] !== undefined && pr[0] !== null) ? String(pr[0]) : '';
    var cons = (pr && pr[1] !== undefined && pr[1] !== null) ? ni(pr[1]) : 0;
    if (dbid && cons > 0) {
      sfRows.push({ BLOQUE: '8_bases_premium', PERIODO: periodo, COL1: dbid, COL2: String(cons) });
      nPremium++;
    }
  }
}

var salida = sfRows.map(function(r){ return { json: r }; });
salida.push({ json: {
  BLOQUE: '_reconciliacion', fuente_oficial: 'ClickHouse (facturable)',
  tiene_alertas: false, total_alertas: 0, alertas: '[]',
  fuentes: JSON.stringify({ clickhouse_resumen: chRes, ch_pais_tipo_filas: ch2.length, bases_premium: nPremium })
}});
return salida;
```

> ⚠️ Al aplicar en n8n: verificar que `Calcular Métricas` / `Formatear Para Canvas` **pasen `8_bases_premium` al canvas** (agrupar filas por `BLOQUE` genéricamente → `data['8_bases_premium']`). Si tienen whitelist explícita de bloques, agregar `8_bases_premium`. El frontend lee `data['8_bases_premium']`.

## Cambios frontend (`SlideCanvas.tsx`, slides BGC — LOCAL/MOCK, sin pushear)
- **Bgc1Slide (BGC-1):** donut legend "Checks con errores" → **"Checks con puntaje ≤ 6"** (son puntaje≤6, no errores de proceso); quitada la línea `<p>` duplicada ("X exitosos · Y con errores · Z totales") y el footer "Calculado con umbral..."; agregado parse `erroresProceso = parseInt(b?.col3)` + nota condicional `{erroresProceso > 0 && <p>...527 con error de proceso · no facturable (fuera del total)</p>}` bajo el donut.
- **Bgc2Slide (BGC-2 país):** la tabla muestra **todos** los países (`rows` sin `.slice(0,5)`); el gráfico usa `chartRows = rows.slice(0,8)` (legibilidad). Así la suma visible = front.
- **Bgc8Slide (BGC-8 bases premium) — NUEVO:** slide opcional. Const `BGC_PREMIUM_DB` (19 bases mx/co/br/pe/all, cada una con `enFront?`) + `PAIS_FLAG` + `resolvePremiumDb()` (fallback `Base premium (<id corto>)` para bases no mapeadas, `enFront:true`). Lee `data['8_bases_premium']`, mapea col1→nombre+país, **filtra `consultas>0 && enFront`**, ordena desc. Layout: barras horizontales (44%) + tabla (Base/País/Consultas/% total) + fila TOTAL PREMIUM. Empty state si no hay bases. Router BGC case `8_bases_premium → Bgc8Slide`. Módulo en `moduleDefinitions.ts` BGC.optional (`id:'8_bases_premium'`, toggle auto vía `modules.optional.map` en LeftPanel). Mock en `MockCanvas.tsx` (`BGC_MOCK_DATA.data['8_bases_premium']` + `BGC_SLIDES`).
  - **`enFront` (CLAVE para 1:1 vs front):** Poder Judicial (`DBI386…`, criminal_record) = `enFront:false` → es el **check base** MX, NO aparece en el panel "bases premium" del front (va incluido en el precio del check, no se cobra aparte). El front solo lista add-ons cobrados aparte (IMSS, PEP FIMPE, Datacrédito, Serasa, Equifax, etc.). Sin esta exclusión el slide mostraría PJ 21.661 (la barra más grande) y NO matchearía. Validado por JP: "Poder Judicial no está en el front de Truora". Las otras 18 bases default `enFront:true`. Revisar el flag por cliente a medida que se validen más BGC; el override n8n emite TODAS las bases (incluida PJ) y el frontend filtra — la decisión de qué-es-premium vive en el const-map (un solo lugar).

## Validación E2E
- PEXTO Colombia (cedula, TCI74cf...): BGC-1 = 353.323... → tras decisión headline 353.295 (= front); histórico abril = 353.295.
- Indrive (multi-país/tipo, ~16k not_started en solo_imss): headline 181.784 = front; país suma 181.784 (CL 86.477, CO 44.567, MX 32.876, PE 10.655, EC 5.656, CR 1.545, BR 8); tipos 181.784; histórico abril 181.784. 527 errores de proceso mostrados aparte.
- **Bases premium (BGC-8), Indrive abril — 1:1 vs front:** IMSS `DBIad83`=**9.114** (=front), PEP FIMPE `DBI41100407`=**14** (=front), Poder Judicial `DBI386`=21.661 (grano por database_id; falta nº front para cerrar al 100%). El crudo sin `dbs.3='completed'` daba IMSS 11.069 (inflado por skipped). db_status: completed 30.811 / skipped 2.099 / error 8 / expired 2.

## Pendiente
1. Levantar mock y verificar render BGC-1 + BGC-2 + **BGC-8**.
2. Guardar el SQL Resumen+`BASES_PREMIUM` en la query que respalda `7bea8ad7` + **Save** el endpoint.
3. Aplicar el override actualizado (con block 8) en `Reconciliar BGC` + verificar passthrough de `8_bases_premium` en `Calcular Métricas`/`Formatear Para Canvas`.
4. Confirmar nº front de Poder Judicial Indrive (esperado ~21.661).
5. Publicar CE + BGC juntos con OK.
6. Cleanup agente: `113d8964` whitelist/catálogo (repurposed), `ad039af3` descripción catálogo.
