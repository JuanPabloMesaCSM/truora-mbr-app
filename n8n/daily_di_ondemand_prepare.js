// n8n Code node — "Preparar Query" (webhook on-demand: reporte-di-diario)
// Mode: Run Once for All Items
// =========================================================================
// Recibe del Webhook: { cid, flujos (array o "a,b"), fecha (YYYY-MM-DD opcional) }
// Devuelve 1 item con { sql_conversion, sql_razones, meta } para que los nodos
// Snowflake corran cada query vía expresión:
//   SF Conversión.query = {{ $('Preparar Query').first().json.sql_conversion }}
//   SF Razones.query     = {{ $('Preparar Query').first().json.sql_razones }}
//
// Reglas n8n: sin optional chaining (?.). Template literals y arrows OK en Code.
// hoy = fecha (o CURRENT_DATE) ; ayer = hoy - 1 día. Compara HOY (parcial) vs AYER.
// =========================================================================

const json = $json || {};
const body = json.body ? json.body : json;

const cidRaw = body.cid || body.CLIENT_ID || '';
let flujos = body.flujos || body.flow_ids || [];
if (typeof flujos === 'string') flujos = flujos.split(',');
if (!Array.isArray(flujos)) flujos = [];
const fechaRaw = String(body.fecha || '').trim();

// Sanitización: TCIs y FLOW_IDs son alfanuméricos (+ _ -). Quita cualquier otra cosa
// para evitar inyección en el SQL armado por string.
const clean = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '');
const cid = clean(cidRaw);
if (!cid) throw new Error('Falta cid (CLIENT_ID).');

const flujosSafe = flujos.map(clean).filter(Boolean);
const flowFilter = flujosSafe.length
  ? `FLOW_ID IN (${flujosSafe.map((f) => `'${f}'`).join(',')})`
  : '1=1';

const hoyExpr = /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)
  ? `CAST('${fechaRaw}' AS DATE)`
  : 'CURRENT_DATE';

// CTE base de procesos (compartida, varía la proyección por query)
const procesosCTE = (cols) => `
procesos AS (
  SELECT ${cols},
         CAST(ip.CREATION_DATE AS DATE) AS fecha
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip
  CROSS JOIN params p
  WHERE ip.CLIENT_ID = '${cid}'
    AND ${flowFilter}
    AND CAST(ip.CREATION_DATE AS DATE) IN (p.hoy, p.ayer)
    AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
    AND ip.STATUS IS NOT NULL
    AND (ip.IS_USED IS NULL OR ip.IS_USED = TRUE)
)`;

const paramsCTE = `params AS (SELECT ${hoyExpr} AS hoy, DATEADD('day', -1, ${hoyExpr}) AS ayer)`;

// ---- Query 1: conversión (proceso + usuario único) por flujo + TOTAL ----
const sql_conversion = `
WITH ${paramsCTE},
${procesosCTE('ip.PROCESS_ID, ip.ACCOUNT_ID, ip.STATUS, ip.FLOW_ID')},
agg AS (
  SELECT
    COALESCE(pr.FLOW_ID,'TOTAL (ambos)') AS flujo,
    COUNT(DISTINCT CASE WHEN pr.fecha=p.hoy  THEN pr.PROCESS_ID END)                                AS proc_hoy,
    COUNT(DISTINCT CASE WHEN pr.fecha=p.hoy  AND LOWER(pr.STATUS)='success' THEN pr.PROCESS_ID END) AS proc_ok_hoy,
    COUNT(DISTINCT CASE WHEN pr.fecha=p.ayer THEN pr.PROCESS_ID END)                                AS proc_ayer,
    COUNT(DISTINCT CASE WHEN pr.fecha=p.ayer AND LOWER(pr.STATUS)='success' THEN pr.PROCESS_ID END) AS proc_ok_ayer,
    COUNT(DISTINCT CASE WHEN pr.fecha=p.hoy  THEN pr.ACCOUNT_ID END)                                AS u_hoy,
    COUNT(DISTINCT CASE WHEN pr.fecha=p.hoy  AND LOWER(pr.STATUS)='success' THEN pr.ACCOUNT_ID END) AS u_ok_hoy,
    COUNT(DISTINCT CASE WHEN pr.fecha=p.ayer THEN pr.ACCOUNT_ID END)                                AS u_ayer,
    COUNT(DISTINCT CASE WHEN pr.fecha=p.ayer AND LOWER(pr.STATUS)='success' THEN pr.ACCOUNT_ID END) AS u_ok_ayer
  FROM procesos pr CROSS JOIN params p
  GROUP BY GROUPING SETS ((pr.FLOW_ID), ())
)
SELECT
  flujo,
  proc_hoy AS procesos_iniciados_hoy, proc_ayer AS procesos_iniciados_ayer,
  proc_ok_hoy AS procesos_exitosos_hoy, proc_ok_ayer AS procesos_exitosos_ayer,
  ROUND(proc_ok_hoy *100.0/NULLIF(proc_hoy ,0),1) AS conversion_proc_hoy_pct,
  ROUND(proc_ok_ayer*100.0/NULLIF(proc_ayer,0),1) AS conversion_proc_ayer_pct,
  ROUND(proc_ok_hoy *100.0/NULLIF(proc_hoy ,0),1) - ROUND(proc_ok_ayer*100.0/NULLIF(proc_ayer,0),1) AS conv_proc_delta_pp,
  u_hoy AS usuarios_unicos_hoy, u_ayer AS usuarios_unicos_ayer,
  u_ok_hoy AS usuarios_exitosos_hoy, u_ok_ayer AS usuarios_exitosos_ayer,
  ROUND(u_ok_hoy *100.0/NULLIF(u_hoy ,0),1) AS conversion_usuario_hoy_pct,
  ROUND(u_ok_ayer*100.0/NULLIF(u_ayer,0),1) AS conversion_usuario_ayer_pct,
  ROUND(u_ok_hoy *100.0/NULLIF(u_hoy ,0),1) - ROUND(u_ok_ayer*100.0/NULLIF(u_ayer,0),1) AS conv_usuario_delta_pp
FROM agg
ORDER BY (flujo = 'TOTAL (ambos)'), flujo;`;

// ---- Query 2: razones de rechazo (doc/rostro) por flujo + TOTAL ----
const sql_razones = `
WITH ${paramsCTE},
${procesosCTE('ip.PROCESS_ID, ip.STATUS, ip.FAILURE_STATUS, ip.DECLINED_REASON, ip.FLOW_ID')},
r AS (
  SELECT
    COALESCE(pr.FLOW_ID,'TOTAL (ambos)') AS flujo,
    pr.DECLINED_REASON AS razon,
    COUNT(DISTINCT CASE WHEN pr.fecha=p.hoy  THEN pr.PROCESS_ID END) AS rechazos_hoy,
    COUNT(DISTINCT CASE WHEN pr.fecha=p.ayer THEN pr.PROCESS_ID END) AS rechazos_ayer
  FROM procesos pr CROSS JOIN params p
  WHERE LOWER(pr.STATUS)='failure'
    AND (LOWER(pr.FAILURE_STATUS) LIKE '%rechazado%' OR LOWER(pr.FAILURE_STATUS)='declined')
    AND pr.DECLINED_REASON IS NOT NULL
    AND LOWER(pr.DECLINED_REASON) IN (
      'blurry_image','expired_document','document_has_expired','document_is_a_photocopy',
      'document_is_a_photo_of_photo','document_does_not_match_account_id','document_validation_not_started',
      'damaged_document','invalid_document_emission_date','document_data_does_not_match_government_data',
      'document_image_no_text_detected','document_front_not_identified',
      'no_face_detected','similarity_threshold_not_passed','risky_face_detected',
      'passive_liveness_verification_not_passed','user_face_match_in_client_collection',
      'user_face_match_in_fraud_collection','face_validation_not_started','invalid_video_file'
    )
  GROUP BY GROUPING SETS ((pr.FLOW_ID, pr.DECLINED_REASON), (pr.DECLINED_REASON))
)
SELECT
  CASE WHEN LOWER(razon) IN (
      'no_face_detected','similarity_threshold_not_passed','risky_face_detected',
      'passive_liveness_verification_not_passed','user_face_match_in_client_collection',
      'user_face_match_in_fraud_collection','face_validation_not_started','invalid_video_file'
    ) THEN 'Rostro' ELSE 'Documento' END AS tipo,
  flujo, razon, rechazos_hoy, rechazos_ayer, (rechazos_hoy - rechazos_ayer) AS delta
FROM r
ORDER BY tipo, (flujo='TOTAL (ambos)'), flujo, rechazos_hoy DESC;`;

return [{
  json: {
    sql_conversion: sql_conversion,
    sql_razones: sql_razones,
    meta: { cid: cid, flujos: flujosSafe, hoy_expr: hoyExpr },
  },
}];
