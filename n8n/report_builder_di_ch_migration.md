# DI → ClickHouse — "Consumo facturable" (1 endpoint repurposed) + Clientes por Validador

Estado **2026-06-02**. Capa de datos validada (Cueros 1.571 ✓). Frontend en mock aprobado (scope A slide + scope B página `/validador`). **NO publicado.**
SQL: `truora-mbr-app/clickhouse/di_report_builder_migration.sql` (1 endpoint). Memoria: `project_di_report_builder_ch_migration`.

## Arquitectura decidida (2026-06-02, JP)
- **1 solo endpoint CH**: REPURPOSE de `e0425fdf-0dc6-4302-ac99-c54bd8547cbd` (`client_di_by_flow`).
  Hoy tiene query rota (product='digital_identity_process', COUNT(*), sin FINAL) y es **fantasma**
  (`Reconciliar DI` pasa `null` en todas las alertas DI → nadie usa sus números). Es un endpoint DI →
  darle el query DI correcto = "fix in place" (igual que BGC `ad039af3`). Beneficia al agente, no rompe nada.
  Mantiene params `{client_id:String}, {from:Date}, {to:Date}`. Devuelve 1 fila:
  `CUR_TOTAL, PREV_TOTAL, POR_TIPO[], RAZONES[], HISTORICO[]`.
- **Scope A — Report Builder DI** (flujo existente `report-builder`): bloque ADITIVO `consumo_facturable`.
  Reusa el HTTP node que YA llama a `e0425fdf`; solo se reescribe el parser + un append en `Reconciliar DI`.
  Consume `CUR_TOTAL + PREV_TOTAL + POR_TIPO`. El embudo SF queda intacto.
- **Scope B — Clientes por Validador** (flujo NUEVO y liviano): NO usa Snowflake (los clientes por
  validador no tienen embudo). `Webhook → HTTP (e0425fdf) → parse → Respond`. Consume los 3 arrays.

## 0) Repurpose del endpoint CH (CH console)
- Pegar la query de `clickhouse/di_report_builder_migration.sql` en la query que respalda `e0425fdf`,
  **Save** (correr en el editor NO actualiza el endpoint → síntoma: "Substitution X is not set").
- Params siguen siendo `param_client_id` / `param_from` / `param_to`. GET, Basic Auth, sin body.
- ✅ VALIDADO Cueros abril (from=2026-04-01, to=2026-04-30): CUR_TOTAL=1571, PREV_TOTAL=1385,
  POR_TIPO=[["validations_document_validation","911","316","595"],["validations_face_recognition_passive_liveness","337","242","95"],["validations_face_search","323","323","0"]].
- ⏳ Validar Confiamos abril (esperado CUR_TOTAL=5357 + RAZONES + HISTORICO) antes de cablear.

## Parser compartido — reescribir `Output parseado Flujos DI` (Report Builder DI) y el del flujo Validador
El endpoint devuelve 1 fila con arrays. **Parser ROBUSTO** (busca recursivamente el row con
`CUR_TOTAL` sin importar cómo n8n envuelva la respuesta-array — el HTTP node viejo del DI deja
`items[0].json` como el objeto interno, pero el HTTP node nuevo del Validador lo deja como el
array completo `[{meta,data:[...]}]`; este parser maneja ambos + `{data:[...]}` + string):
```js
var input = items.length ? items[0].json : {};
function findRow(x, depth){
  if (x === null || x === undefined || depth > 5) return null;
  if (typeof x === 'string'){ try { x = JSON.parse(x); } catch(e){ return null; } }
  if (Array.isArray(x)){ for (var i=0;i<x.length;i++){ var r=findRow(x[i],depth+1); if (r) return r; } return null; }
  if (typeof x === 'object'){
    if (x.CUR_TOTAL !== undefined) return x;
    if (x.data !== undefined){ var r=findRow(x.data,depth+1); if (r) return r; }
    return null;
  }
  return null;
}
var row = findRow(input, 0) || {};
function arr(v){ if (typeof v === 'string'){ try { return JSON.parse(v); } catch(e){ return []; } } return v || []; }
return [{ json: {
  CUR_TOTAL:  parseInt(row.CUR_TOTAL  || 0) || 0,
  PREV_TOTAL: parseInt(row.PREV_TOTAL || 0) || 0,
  POR_TIPO:   arr(row.POR_TIPO),
  HISTORICO:  arr(row.HISTORICO)
}}];
```
> Nota: el endpoint ya NO devuelve RAZONES (salen de SF). Si tu parser del DI viejo todavía
> tiene la línea `RAZONES: arr(row.RAZONES)`, es inofensiva — el append de `Reconciliar DI` no la usa.

## SCOPE A — Report Builder DI (append `consumo_facturable` en `Reconciliar DI`)
El HTTP node existente ya llama `e0425fdf` con from/to/client_id. Tras reescribir su parser
(`Output parseado Flujos DI`) al de arriba, agregar al final de `Reconciliar DI`, **antes de `return salida;`**:
```js
// ── DI Consumo facturable (CH billable validations) — bloque ADITIVO ──
var cf = {};
try { var cfr = $('Output parseado Flujos DI').all().map(function(i){ return i.json; }); if (cfr.length) cf = cfr[0]; } catch(e) { cf = {}; }
var porTipo = cf.POR_TIPO; if (typeof porTipo === 'string') { try { porTipo = JSON.parse(porTipo); } catch(e){ porTipo = []; } }
var prevTotalCF = parseInt(cf.PREV_TOTAL || 0); if (isNaN(prevTotalCF)) prevTotalCF = 0;
if (porTipo && porTipo.length) {
  for (var cfi = 0; cfi < porTipo.length; cfi++) {
    var pr = porTipo[cfi];
    var prod = (pr && pr[0] != null) ? String(pr[0]) : '';
    var tot  = (pr && pr[1] != null) ? parseInt(pr[1]) : 0;
    var exi  = (pr && pr[2] != null) ? parseInt(pr[2]) : 0;
    var fal  = (pr && pr[3] != null) ? parseInt(pr[3]) : 0;
    if (prod && tot > 0) {
      salida.push({ json: { BLOQUE: 'consumo_facturable', COL1: prod, COL2: String(tot),
        COL3: String(exi), COL4: String(fal), COL5: (cfi === 0 ? String(prevTotalCF) : '') } });
    }
  }
}
```
> Nota: el viejo loop que construía el objeto `ch` (`chRows`/`ch.total`…) leía la forma vieja del endpoint
> y solo alimentaba alertas que pasan `null` → se puede dejar (será {0…}, inofensivo) o limpiar. El append
> de arriba es lo único necesario.
> ⚠️ Passthrough: el nodo que agrupa por `BLOQUE` debe pasar `consumo_facturable` al `data` del canvas
> (igual que el warning de BGC-8). Si hay whitelist de bloques, agregar `consumo_facturable`.

## SCOPE B — Flujo NUEVO `Report Builder Validador` (CH consumo/histórico + SF razones)
Webhook nuevo (p. ej. `report-builder-validador`). Input `{ CLIENT_ID, from, to, cliente, periodo_reporte }`.
**NO es CH puro**: consumo + histórico salen de CH (= factura), pero las RAZONES salen de Snowflake
(`DOCUMENT_VALIDATION_HISTORY`) porque CH tiene `validation_declined_reason` ~97% vacío. La query SF es
liviana (1 tabla, group-by por TYPE+DECLINED_REASON, NADA del embudo de IDENTITY_PROCESSES).
Topología:
`Webhook → [ HTTP (e0425fdf, params client_id/from/to) + Snowflake (razones) ] → Output parseado CH + Output razones SF → Armar Bloques → Respond`.
- **HTTP CH** → parser de arriba (`Output parseado`) → `{CUR_TOTAL, PREV_TOTAL, POR_TIPO, HISTORICO}`.
- **Snowflake razones** → query "RAZONES — SNOWFLAKE" de `clickhouse/di_report_builder_migration.sql`
  (devuelve filas `{TIPO, REASON, CANTIDAD}`; `TIPO` = document-validation / face-recognition).

Code "Armar Bloques" → devuelve el shape que consume `/validador` (`data` keyed por bloque, col* minúscula):
```js
var cf = $('Output parseado').first().json;          // CH
var porTipo = cf.POR_TIPO || [], hist = cf.HISTORICO || [];
var prev = parseInt(cf.PREV_TOTAL || 0) || 0;
var sfRaz = $('Snowflake').all().map(function(i){ return i.json; });  // SF razones (rehidratar por nodo)
var data = { consumo_facturable: [], razones_validacion: [], historico_facturable: [] };
for (var i=0;i<porTipo.length;i++){ var p=porTipo[i];
  data.consumo_facturable.push({ bloque:'consumo_facturable', col1:String(p[0]), col2:String(p[1]),
    col3:String(p[2]), col4:String(p[3]), col5:(i===0?String(prev):'') }); }
// razones: col1=reason, col2=TYPE (document-validation/face-recognition), col3=cantidad
for (var j=0;j<sfRaz.length;j++){ var r=sfRaz[j];
  data.razones_validacion.push({ bloque:'razones_validacion',
    col1:String(r.REASON||r.reason||''), col2:String(r.TIPO||r.tipo||''), col3:String(r.CANTIDAD||r.cantidad||0) }); }
for (var k=0;k<hist.length;k++){ var h=hist[k];
  data.historico_facturable.push({ bloque:'historico_facturable', periodo:String(h[0]), col1:String(h[1]), col2:String(h[2]) }); }
return [{ json: { status:'success', data: data } }];
```
> El frontend `DiRazonesValidacionSlide` bucketea doc/rostro con `validationCategory(col2)` — acepta tanto
> el TYPE de SF (`document-validation`/`face-recognition`) como el product de CH. Traduce con `RAZONES_DI`.
> ⚠️ `Snowflake` pisa `$json` tras correr → rehidratar con `$('Snowflake').all()` (ver `feedback_n8n_http_overwrites_json`).
Respond to Webhook: "First Incoming Item" (expression objeto → ver `feedback_n8n_http_body_json_bug`).
Frontend: `Validador.tsx` cambia el mock por fetch a este webhook (igual patrón que `PRODUCT_WEBHOOKS`),
muestra el `GeneratingOverlay` durante el fetch (ya está) y pasa `data` a `SlideCanvas`.

## Frontend (LOCAL/MOCK, hecho — sin pushear)
- `SlideCanvas.tsx`: `DiConsumoFacturableSlide` (scope A) + `DiRazonesValidacionSlide` + `DiHistoricoFacturableSlide` (scope B) + const `DI_VALIDATION_TYPE`. Router DI: `consumo_facturable`/`razones_validacion`/`historico_facturable`.
- Relabels DI-1 (`Procesos iniciados` + chip facturable) + DI-3 (gauge `Total procesos`).
- `moduleDefinitions.ts`: módulo opcional `consumo_facturable`.
- `WelcomeStep.tsx`: 4to card "Clientes por Validador" → `/validador` (4 cards en hilera).
- `Validador.tsx` (ruta `/validador` en `App.tsx`): lista clientes reales + period + `GeneratingOverlay` + assets (portada/agenda/separadores/updates/cierre) + 3 slides CH. Mock data por ahora.
- Typecheck ✓.

## Pendiente
1. Repurpose `e0425fdf` (Save query nueva en CH console).
2. Validar Confiamos (CUR_TOTAL 5357 + RAZONES + HISTORICO).
3. Scope A: reescribir parser `Output parseado Flujos DI` + append en `Reconciliar DI` + passthrough.
4. Scope B: crear flujo `Report Builder Validador` + conectar `Validador.tsx` al webhook (quitar mock).
5. Actualizar descripción del catálogo del agente para `client_di_by_flow` (e0425fdf) → ahora billable correcto.
6. Publicar con OK de JP.
