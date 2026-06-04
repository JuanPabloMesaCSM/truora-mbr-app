-- ============================================================
-- REPORTE DIARIO DI — Cliente TCId5981cce1073baf2a0bc311dc90220bc | 2 flujos
-- Workflow n8n: "Reporte Diario DI 2 Flujos" (cron 2pm BOG → Telegram a Sebas Durán)
-- ============================================================
-- Métricas (las 3 que pide el cliente):
--   A) Conversión del proceso        → Query 1
--   B) Conversión por usuario único  → Query 1
--   C) Razones de rechazo doc/rostro → Query 2
--
-- Compara HOY (parcial, hasta la hora de corrida 2pm) vs AYER (D-1, día completo).
-- Una fila por flujo + fila "TOTAL (ambos)" (GROUPING SETS).
--
-- ⚠️ Fuente = SNOWFLAKE (no ClickHouse): CH no tiene contenedor de proceso ni
-- ACCOUNT_ID, y validation_flow_id ~0% poblado → imposible filtrar por flujo.
--
-- Convenciones tomadas de report_builder_di.sql (filtros not_used / STATUS NOT NULL /
-- IS_USED, COUNT(DISTINCT PROCESS_ID), listas de motivos doc/rostro de razonesDict.ts).
--
-- En n8n: Query 1 va en el nodo Snowflake "SF Conversión";
--         Query 2 va en el nodo Snowflake "SF Razones".
-- Las columnas vuelven en MAYÚSCULAS (FLUJO, PROCESOS_INICIADOS_HOY, ...).
--
-- Para usar día operativo Bogotá en vez de UTC, reemplazar en params:
--   CONVERT_TIMEZONE('UTC','America/Bogota', CURRENT_TIMESTAMP())::DATE
-- y la fecha del proceso por el mismo CONVERT_TIMEZONE(...,'... ip.CREATION_DATE')::DATE
-- ============================================================


-- ============================================================
-- QUERY 1 — Conversión (proceso + usuario único)  → nodo "SF Conversión"
-- ============================================================
WITH params AS (
  SELECT CURRENT_DATE AS hoy, DATEADD('day', -1, CURRENT_DATE) AS ayer
),
procesos AS (
  SELECT ip.PROCESS_ID, ip.ACCOUNT_ID, ip.STATUS, ip.FLOW_ID,
         CAST(ip.CREATION_DATE AS DATE) AS fecha
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip
  CROSS JOIN params p
  WHERE ip.CLIENT_ID = 'TCId5981cce1073baf2a0bc311dc90220bc'
    AND ip.FLOW_ID IN ('IPFd2ce1706f9d0a34ac4699ee9cb5deae2','IPFdbb5de09c089403c0e20b86313abc47b')
    AND CAST(ip.CREATION_DATE AS DATE) IN (p.hoy, p.ayer)
    AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
    AND ip.STATUS IS NOT NULL
    AND (ip.IS_USED IS NULL OR ip.IS_USED = TRUE)
),
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
  proc_hoy      AS procesos_iniciados_hoy,
  proc_ayer     AS procesos_iniciados_ayer,
  proc_ok_hoy   AS procesos_exitosos_hoy,
  proc_ok_ayer  AS procesos_exitosos_ayer,
  ROUND(proc_ok_hoy *100.0/NULLIF(proc_hoy ,0),1) AS conversion_proc_hoy_pct,
  ROUND(proc_ok_ayer*100.0/NULLIF(proc_ayer,0),1) AS conversion_proc_ayer_pct,
  ROUND(proc_ok_hoy *100.0/NULLIF(proc_hoy ,0),1)
    - ROUND(proc_ok_ayer*100.0/NULLIF(proc_ayer,0),1) AS conv_proc_delta_pp,
  u_hoy         AS usuarios_unicos_hoy,
  u_ayer        AS usuarios_unicos_ayer,
  u_ok_hoy      AS usuarios_exitosos_hoy,
  u_ok_ayer     AS usuarios_exitosos_ayer,
  ROUND(u_ok_hoy *100.0/NULLIF(u_hoy ,0),1) AS conversion_usuario_hoy_pct,
  ROUND(u_ok_ayer*100.0/NULLIF(u_ayer,0),1) AS conversion_usuario_ayer_pct,
  ROUND(u_ok_hoy *100.0/NULLIF(u_hoy ,0),1)
    - ROUND(u_ok_ayer*100.0/NULLIF(u_ayer,0),1) AS conv_usuario_delta_pp
FROM agg
ORDER BY (flujo = 'TOTAL (ambos)'), flujo;


-- ============================================================
-- QUERY 2 — Razones de rechazo (documento / rostro)  → nodo "SF Razones"
-- ============================================================
WITH params AS (
  SELECT CURRENT_DATE AS hoy, DATEADD('day', -1, CURRENT_DATE) AS ayer
),
procesos AS (
  SELECT ip.PROCESS_ID, ip.STATUS, ip.FAILURE_STATUS, ip.DECLINED_REASON, ip.FLOW_ID,
         CAST(ip.CREATION_DATE AS DATE) AS fecha
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip
  CROSS JOIN params p
  WHERE ip.CLIENT_ID = 'TCId5981cce1073baf2a0bc311dc90220bc'
    AND ip.FLOW_ID IN ('IPFd2ce1706f9d0a34ac4699ee9cb5deae2','IPFdbb5de09c089403c0e20b86313abc47b')
    AND CAST(ip.CREATION_DATE AS DATE) IN (p.hoy, p.ayer)
    AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
    AND ip.STATUS IS NOT NULL
    AND (ip.IS_USED IS NULL OR ip.IS_USED = TRUE)
),
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
      -- documento
      'blurry_image','expired_document','document_has_expired','document_is_a_photocopy',
      'document_is_a_photo_of_photo','document_does_not_match_account_id','document_validation_not_started',
      'damaged_document','invalid_document_emission_date','document_data_does_not_match_government_data',
      'document_image_no_text_detected','document_front_not_identified',
      -- rostro
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
ORDER BY tipo, (flujo='TOTAL (ambos)'), flujo, rechazos_hoy DESC;
