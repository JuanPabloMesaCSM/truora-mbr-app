-- ============================================================
-- REPORT BUILDER DI — Query Snowflake productivo
-- Workflow n8n: "Report Builder DI"
-- Snapshot guardado: 2026-05-19 (post-refactor 2026-05-07 razones a nivel proceso)
-- ============================================================
-- Bloques que retorna (output union-ed):
--   1_metricas_generales       → total, exitosos, fallidos, expirados, declinados, cancelados, conversion_pct + prev + variacion
--   2_usuarios_reintentos      → usuarios_unicos, conversion_usuario, distribucion por # intentos
--   3_validaciones_doc_rostro  → doc/rostro: total, exitosas, conversion + prev + expirados/declinados
--   4_historico_3meses         → por mes: total, exitosos, conversion, usuarios, conversion_usuario
--   5_flujos                   → top 10 flujos: total, exitosos, fallidos, conversion + variacion_mom
--   6_funnel                   → usuarios_inicio, usuarios_llegan_doc, usuarios_llegan_rostro + tasas
--   7_razones_doc              → TODOS los motivos declinacion documento (nivel proceso). Front: top-N + "Otros"
--   8_razones_rostro           → TODOS los motivos declinacion rostro (nivel proceso). Front: top-N + "Otros"
--   9_abandono                 → top 6 motivos de expiracion/abandono
--   10_declinados              → TODOS los motivos globales declinacion (= total DI-1). Front: top-N + "Otros (N)"
--   11_friccion_usuario        → top 8 motivos por usuarios_afectados unicos
--
-- Parametros n8n:
--   $("Webhook").body.CLIENT_ID
--   $("Webhook").body.fecha_inicio  (YYYY-MM-DD)
--   $("Webhook").body.fecha_fin     (YYYY-MM-DD)
--   $("Code").json.flow_filter      (string SQL, "1=1" si no hay filtro, o "FLOW_ID IN ('x','y')")
--
-- Mapeo COL1..COL_EXTRA4 por bloque: ver skill snowflake-queries.md
-- Listas de motivos doc/rostro sincronizadas con: src/utils/razonesDict.ts
-- ============================================================

WITH

params AS (
  SELECT
    CAST('{{ $("Webhook").first().json.body.fecha_inicio }}' AS DATE) AS mes_actual_inicio,
    CAST('{{ $("Webhook").first().json.body.fecha_fin }}'   AS DATE) AS mes_actual_fin,
    DATE_TRUNC('month', DATEADD('month', -1,
      CAST('{{ $("Webhook").first().json.body.fecha_inicio }}' AS DATE)
    )) AS mes_prev_inicio,
    DATEADD('day', -1,
      CAST('{{ $("Webhook").first().json.body.fecha_inicio }}' AS DATE)
    ) AS mes_prev_fin,
    DATE_TRUNC('month', DATEADD('month', -3,
      CAST('{{ $("Webhook").first().json.body.fecha_inicio }}' AS DATE)
    )) AS historico_inicio
),

procesos AS (
  SELECT
    ip.PROCESS_ID,
    ip.CLIENT_ID,
    ip.ACCOUNT_ID,
    ip.STATUS,
    ip.FAILURE_STATUS,
    ip.DECLINED_REASON,
    ip.EXPIRED_REASON,
    ip.CANCELED_REASON,
    ip.FLOW_ID,
    ip.COUNTRY,
    ip.CHANNEL_INFO,
    CAST(ip.CREATION_DATE AS DATE) AS fecha_proceso
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip
  CROSS JOIN params p
  WHERE ip.CLIENT_ID = '{{ $("Webhook").first().json.body.CLIENT_ID }}'
    AND CAST(ip.CREATION_DATE AS DATE) >= p.mes_prev_inicio
    AND CAST(ip.CREATION_DATE AS DATE) <= p.mes_actual_fin
    AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
    AND ip.STATUS IS NOT NULL
    AND (ip.IS_USED IS NULL OR ip.IS_USED = TRUE)
    AND {{ $("Code").first().json.flow_filter }}
),

procesos_historico AS (
  SELECT
    ip.PROCESS_ID,
    ip.STATUS,
    ip.ACCOUNT_ID,
    DATE_TRUNC('month', CAST(ip.CREATION_DATE AS DATE)) AS mes
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip
  CROSS JOIN params p
  WHERE ip.CLIENT_ID = '{{ $("Webhook").first().json.body.CLIENT_ID }}'
    AND CAST(ip.CREATION_DATE AS DATE) >= p.historico_inicio
    AND CAST(ip.CREATION_DATE AS DATE) <= p.mes_actual_fin
    AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
    AND ip.STATUS IS NOT NULL
    AND (ip.IS_USED IS NULL OR ip.IS_USED = TRUE)
    AND {{ $("Code").first().json.flow_filter }}
),

-- DEDUPLICACION DE VALIDACIONES
-- Cada proceso puede tener 2 filas en DOCUMENT_VALIDATION_HISTORY
-- Tomamos solo la mas reciente por IDENTITY_PROCESS_ID y TYPE
doc_dedup AS (
  SELECT
    d.IDENTITY_PROCESS_ID,
    d.TYPE,
    d.VALIDATION_STATUS,
    d.FAILURE_STATUS,
    d.DECLINED_REASON,
    ROW_NUMBER() OVER (
      PARTITION BY d.IDENTITY_PROCESS_ID, d.TYPE
      ORDER BY d.CREATION_DATE DESC
    ) AS rn
  FROM TRUORA.TRUORA_SCHEMA.DOCUMENT_VALIDATION_HISTORY d
  INNER JOIN procesos pr ON d.IDENTITY_PROCESS_ID = pr.PROCESS_ID
  WHERE d.TYPE IN ('document-validation','face-recognition','face-search')
),

-- VALIDACIONES DOC Y ROSTRO
validaciones_agg AS (
  SELECT
    COUNT(DISTINCT CASE
      WHEN d.TYPE = 'document-validation'
        AND pr.fecha_proceso >= p.mes_actual_inicio
        AND d.rn = 1
      THEN d.IDENTITY_PROCESS_ID END)                         AS doc_total,
    COUNT(DISTINCT CASE
      WHEN d.TYPE = 'document-validation'
        AND LOWER(d.VALIDATION_STATUS) = 'success'
        AND pr.fecha_proceso >= p.mes_actual_inicio
        AND d.rn = 1
      THEN d.IDENTITY_PROCESS_ID END)                         AS doc_exitosas,
    COUNT(DISTINCT CASE
      WHEN d.TYPE IN ('face-recognition','face-search')
        AND pr.fecha_proceso >= p.mes_actual_inicio
        AND d.rn = 1
      THEN d.IDENTITY_PROCESS_ID END)                         AS rostro_total,
    COUNT(DISTINCT CASE
      WHEN d.TYPE IN ('face-recognition','face-search')
        AND LOWER(d.VALIDATION_STATUS) = 'success'
        AND pr.fecha_proceso >= p.mes_actual_inicio
        AND d.rn = 1
      THEN d.IDENTITY_PROCESS_ID END)                         AS rostro_exitosas,
    COUNT(DISTINCT CASE
      WHEN d.TYPE = 'document-validation'
        AND pr.fecha_proceso < p.mes_actual_inicio
        AND d.rn = 1
      THEN d.IDENTITY_PROCESS_ID END)                         AS doc_total_prev,
    COUNT(DISTINCT CASE
      WHEN d.TYPE = 'document-validation'
        AND LOWER(d.VALIDATION_STATUS) = 'success'
        AND pr.fecha_proceso < p.mes_actual_inicio
        AND d.rn = 1
      THEN d.IDENTITY_PROCESS_ID END)                         AS doc_exitosas_prev,
    COUNT(DISTINCT CASE
      WHEN d.TYPE IN ('face-recognition','face-search')
        AND pr.fecha_proceso < p.mes_actual_inicio
        AND d.rn = 1
      THEN d.IDENTITY_PROCESS_ID END)                         AS rostro_total_prev,
    COUNT(DISTINCT CASE
      WHEN d.TYPE IN ('face-recognition','face-search')
        AND LOWER(d.VALIDATION_STATUS) = 'success'
        AND pr.fecha_proceso < p.mes_actual_inicio
        AND d.rn = 1
      THEN d.IDENTITY_PROCESS_ID END)                         AS rostro_exitosas_prev,
    COUNT(DISTINCT CASE
      WHEN d.TYPE = 'document-validation'
        AND d.FAILURE_STATUS = 'expired'
        AND pr.fecha_proceso >= p.mes_actual_inicio
        AND d.rn = 1
      THEN d.IDENTITY_PROCESS_ID END)                         AS doc_expirados,
    COUNT(DISTINCT CASE
      WHEN d.TYPE = 'document-validation'
        AND d.FAILURE_STATUS = 'declined'
        AND pr.fecha_proceso >= p.mes_actual_inicio
        AND d.rn = 1
      THEN d.IDENTITY_PROCESS_ID END)                         AS doc_declinados,
    COUNT(DISTINCT CASE
      WHEN d.TYPE IN ('face-recognition','face-search')
        AND d.FAILURE_STATUS = 'expired'
        AND pr.fecha_proceso >= p.mes_actual_inicio
        AND d.rn = 1
      THEN d.IDENTITY_PROCESS_ID END)                         AS rostro_expirados,
    COUNT(DISTINCT CASE
      WHEN d.TYPE IN ('face-recognition','face-search')
        AND d.FAILURE_STATUS = 'declined'
        AND pr.fecha_proceso >= p.mes_actual_inicio
        AND d.rn = 1
      THEN d.IDENTITY_PROCESS_ID END)                         AS rostro_declinados
  FROM doc_dedup d
  INNER JOIN procesos pr ON d.IDENTITY_PROCESS_ID = pr.PROCESS_ID
  CROSS JOIN params p
),

-- REFACTOR 2026-05-07: contamos a nivel PROCESO (DECLINED_REASON de IDENTITY_PROCESSES),
-- filtrando por la lista de motivos que pertenecen a doc / rostro.
-- Listas duplicadas en src/utils/razonesDict.ts - sincronizar al agregar motivos nuevos.
razones_doc_agg AS (
  SELECT
    pr.DECLINED_REASON AS razon,
    COUNT(DISTINCT pr.PROCESS_ID) AS total
  FROM procesos pr
  CROSS JOIN params p
  WHERE pr.fecha_proceso >= p.mes_actual_inicio
    AND LOWER(pr.STATUS) = 'failure'
    AND (LOWER(pr.FAILURE_STATUS) LIKE '%rechazado%'
      OR LOWER(pr.FAILURE_STATUS) = 'declined')
    AND pr.DECLINED_REASON IS NOT NULL
    AND LOWER(pr.DECLINED_REASON) NOT IN ('not_used', 'canceled')
    AND LOWER(pr.DECLINED_REASON) IN (
      'blurry_image',
      'expired_document',
      'document_has_expired',
      'document_is_a_photocopy',
      'document_is_a_photo_of_photo',
      'document_does_not_match_account_id',
      'document_validation_not_started',
      'damaged_document',
      'invalid_document_emission_date',
      'document_data_does_not_match_government_data',
      'document_image_no_text_detected',
      'document_front_not_identified',
      -- Códigos agregados 2026-06-08 (descubiertos en Crediplus + Efecty).
      -- data_not_match_with_government_database clasificado como DOC (es el dato
      -- del documento que no matchea la base de gobierno). government_database_unavailable
      -- queda FUERA (es infra, va a "otro" → visible solo en DI-10b).
      'invalid_document_status',
      'data_not_match_with_government_database',
      'document_unregistered',
      'missing_issue_number',
      'invalid_qr_content',
      'invalid_issue_date',
      'invalid_mrz',
      'missing_text',
      'document_not_recognized'
    )
  GROUP BY pr.DECLINED_REASON
  -- Sin cap: devolvemos TODOS los motivos doc; el frontend muestra top-N + "Otros"
  -- para que el panel sume exacto a la familia documento (sin truncado silencioso).
),

razones_rostro_agg AS (
  SELECT
    pr.DECLINED_REASON AS razon,
    COUNT(DISTINCT pr.PROCESS_ID) AS total
  FROM procesos pr
  CROSS JOIN params p
  WHERE pr.fecha_proceso >= p.mes_actual_inicio
    AND LOWER(pr.STATUS) = 'failure'
    AND (LOWER(pr.FAILURE_STATUS) LIKE '%rechazado%'
      OR LOWER(pr.FAILURE_STATUS) = 'declined')
    AND pr.DECLINED_REASON IS NOT NULL
    AND LOWER(pr.DECLINED_REASON) NOT IN ('not_used', 'canceled')
    AND LOWER(pr.DECLINED_REASON) IN (
      'no_face_detected',
      'similarity_threshold_not_passed',
      'risky_face_detected',
      'passive_liveness_verification_not_passed',
      'user_face_match_in_client_collection',
      'user_face_match_in_fraud_collection',
      'face_validation_not_started',
      'invalid_video_file',
      -- Códigos agregados 2026-06-08: face_not_detected es DISTINTO de
      -- no_face_detected (ambos rostro); image_face_validation_not_passed = rostro en doc.
      'face_not_detected',
      'image_face_validation_not_passed'
    )
  GROUP BY pr.DECLINED_REASON
  -- Sin cap: el frontend muestra top-N + "Otros" para que sume a la familia rostro.
),

motivos_expirados_agg AS (
  SELECT
    COALESCE(pr.EXPIRED_REASON, pr.DECLINED_REASON) AS motivo,
    COUNT(DISTINCT pr.PROCESS_ID) AS total
  FROM procesos pr
  CROSS JOIN params p
  WHERE pr.fecha_proceso >= p.mes_actual_inicio
    AND LOWER(pr.STATUS) = 'failure'
    AND (LOWER(pr.FAILURE_STATUS) LIKE '%expirado%'
      OR LOWER(pr.FAILURE_STATUS) LIKE '%abandonado%'
      OR LOWER(pr.FAILURE_STATUS) = 'expired')
    AND COALESCE(pr.EXPIRED_REASON, pr.DECLINED_REASON) IS NOT NULL
  GROUP BY motivo
  QUALIFY ROW_NUMBER() OVER (ORDER BY total DESC) <= 6
),

-- FIX: excluir canceled del bloque de declinados
motivos_declinados_agg AS (
  SELECT
    pr.DECLINED_REASON AS motivo,
    COUNT(DISTINCT pr.PROCESS_ID) AS total
  FROM procesos pr
  CROSS JOIN params p
  WHERE pr.fecha_proceso >= p.mes_actual_inicio
    AND LOWER(pr.STATUS) = 'failure'
    AND (LOWER(pr.FAILURE_STATUS) LIKE '%rechazado%'
      OR LOWER(pr.FAILURE_STATUS) = 'declined')
    AND pr.DECLINED_REASON IS NOT NULL
    AND LOWER(pr.DECLINED_REASON) != 'not_used'
    AND LOWER(pr.DECLINED_REASON) != 'canceled'
    AND (pr.CANCELED_REASON IS NULL
      OR pr.CANCELED_REASON NOT IN (
        'other_reason','dont_want_to_send_my_document',
        'dont_want_to_continue','dont_understand_what_to_do',
        'other','camara_problems','dont_have_my_phone',
        'dont_want_to_send_my_video','dont_know_how_to_take_the_photo',
        'dont_have_my_document','dont_want_to_send_my_number',
        'my_document_type_is_not_there','doesnt_redirect_me'
      ))
  GROUP BY pr.DECLINED_REASON
  -- Sin cap: devolvemos TODOS los motivos declinados (universo canónico = total
  -- declinados de DI-1). El frontend muestra top-N + "Otros (N)" para que la
  -- suma de las barras iguale el total exacto (Crediplus 325, sin esconder cola).
),

friccion_usuario_agg AS (
  SELECT
    pr.DECLINED_REASON AS motivo,
    COUNT(DISTINCT pr.ACCOUNT_ID) AS usuarios_afectados
  FROM procesos pr
  CROSS JOIN params p
  WHERE pr.fecha_proceso >= p.mes_actual_inicio
    AND LOWER(pr.STATUS) = 'failure'
    AND pr.DECLINED_REASON IS NOT NULL
    AND LOWER(pr.DECLINED_REASON) != 'not_used'
    AND LOWER(pr.DECLINED_REASON) != 'canceled'
    AND pr.ACCOUNT_ID IS NOT NULL
  GROUP BY pr.DECLINED_REASON
  QUALIFY ROW_NUMBER() OVER (ORDER BY usuarios_afectados DESC) <= 8
),

reintentos_agg AS (
  SELECT
    pr.ACCOUNT_ID,
    COUNT(pr.PROCESS_ID) AS intentos
  FROM procesos pr
  CROSS JOIN params p
  WHERE pr.fecha_proceso >= p.mes_actual_inicio
    AND pr.ACCOUNT_ID IS NOT NULL
  GROUP BY pr.ACCOUNT_ID
),

flujos_agg AS (
  SELECT
    pr.FLOW_ID,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      THEN pr.PROCESS_ID END)                                 AS total_actual,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND LOWER(pr.STATUS) = 'success' THEN pr.PROCESS_ID END) AS exitosos_actual,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso < p.mes_actual_inicio
      THEN pr.PROCESS_ID END)                                 AS total_prev,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso < p.mes_actual_inicio
      AND LOWER(pr.STATUS) = 'success' THEN pr.PROCESS_ID END) AS exitosos_prev
  FROM procesos pr
  CROSS JOIN params p
  WHERE pr.FLOW_ID IS NOT NULL
  GROUP BY pr.FLOW_ID
  QUALIFY ROW_NUMBER() OVER (
    ORDER BY COUNT(DISTINCT CASE
      WHEN pr.fecha_proceso >= p.mes_actual_inicio
      THEN pr.PROCESS_ID END) DESC
  ) <= 10
),

bloque1 AS (
  SELECT
    '1_metricas_generales' AS bloque,
    p.mes_actual_inicio AS periodo,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      THEN pr.PROCESS_ID END)                                 AS total_procesos,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND LOWER(pr.STATUS) = 'success' THEN pr.PROCESS_ID END) AS procesos_exitosos,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND LOWER(pr.STATUS) = 'failure'
      AND LOWER(COALESCE(pr.FAILURE_STATUS,'')) != 'error'
      THEN pr.PROCESS_ID END) AS procesos_fallidos,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND (LOWER(pr.FAILURE_STATUS) LIKE '%expirado%'
        OR LOWER(pr.FAILURE_STATUS) LIKE '%abandonado%'
        OR LOWER(pr.FAILURE_STATUS) = 'expired')
      THEN pr.PROCESS_ID END)                                 AS expirados,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND (LOWER(pr.FAILURE_STATUS) LIKE '%rechazado%'
        OR LOWER(pr.FAILURE_STATUS) = 'declined')
      AND LOWER(pr.DECLINED_REASON) != 'canceled'
      AND (pr.CANCELED_REASON IS NULL
        OR pr.CANCELED_REASON NOT IN (
          'other_reason','dont_want_to_send_my_document',
          'dont_want_to_continue','dont_understand_what_to_do',
          'other','camara_problems','dont_have_my_phone',
          'dont_want_to_send_my_video','dont_know_how_to_take_the_photo',
          'dont_have_my_document','dont_want_to_send_my_number',
          'my_document_type_is_not_there','doesnt_redirect_me'
        ))
      THEN pr.PROCESS_ID END)                                 AS declinados,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND LOWER(pr.FAILURE_STATUS) = 'error'
      THEN pr.PROCESS_ID END)                                 AS errores_tecnicos,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND (
        pr.CANCELED_REASON IN (
          'other_reason','dont_want_to_send_my_document',
          'dont_want_to_continue','dont_understand_what_to_do',
          'other','camara_problems','dont_have_my_phone',
          'dont_want_to_send_my_video','dont_know_how_to_take_the_photo',
          'dont_have_my_document','dont_want_to_send_my_number',
          'my_document_type_is_not_there','doesnt_redirect_me'
        )
        OR LOWER(pr.DECLINED_REASON) = 'canceled'
      ) THEN pr.PROCESS_ID END)                               AS total_cancelados,
    ROUND(COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND LOWER(pr.STATUS) = 'success' THEN pr.PROCESS_ID END) * 100.0
      / NULLIF(COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      THEN pr.PROCESS_ID END), 0), 1)                         AS conversion_pct,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso < p.mes_actual_inicio
      THEN pr.PROCESS_ID END)                                 AS total_procesos_prev,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso < p.mes_actual_inicio
      AND LOWER(pr.STATUS) = 'success' THEN pr.PROCESS_ID END) AS procesos_exitosos_prev,
    ROUND(COUNT(DISTINCT CASE WHEN pr.fecha_proceso < p.mes_actual_inicio
      AND LOWER(pr.STATUS) = 'success' THEN pr.PROCESS_ID END) * 100.0
      / NULLIF(COUNT(DISTINCT CASE WHEN pr.fecha_proceso < p.mes_actual_inicio
      THEN pr.PROCESS_ID END), 0), 1)                         AS conversion_pct_prev,
    ROUND((COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      THEN pr.PROCESS_ID END)
      - COUNT(DISTINCT CASE WHEN pr.fecha_proceso < p.mes_actual_inicio
      THEN pr.PROCESS_ID END)) * 100.0
      / NULLIF(COUNT(DISTINCT CASE WHEN pr.fecha_proceso < p.mes_actual_inicio
      THEN pr.PROCESS_ID END), 0), 1)                         AS variacion_procesos_pct
  FROM procesos pr
  CROSS JOIN params p
  GROUP BY p.mes_actual_inicio
),

bloque2 AS (
  SELECT
    '2_usuarios_reintentos' AS bloque,
    p.mes_actual_inicio AS periodo,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      THEN pr.ACCOUNT_ID END)                                 AS usuarios_unicos,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND LOWER(pr.STATUS) = 'success' THEN pr.ACCOUNT_ID END) AS usuarios_exitosos,
    ROUND(COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND LOWER(pr.STATUS) = 'success' THEN pr.ACCOUNT_ID END) * 100.0
      / NULLIF(COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      THEN pr.ACCOUNT_ID END), 0), 1)                         AS conversion_usuario_pct,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso < p.mes_actual_inicio
      THEN pr.ACCOUNT_ID END)                                 AS usuarios_unicos_prev,
    ROUND(COUNT(DISTINCT CASE WHEN pr.fecha_proceso < p.mes_actual_inicio
      AND LOWER(pr.STATUS) = 'success' THEN pr.ACCOUNT_ID END) * 100.0
      / NULLIF(COUNT(DISTINCT CASE WHEN pr.fecha_proceso < p.mes_actual_inicio
      THEN pr.ACCOUNT_ID END), 0), 1)                         AS conversion_usuario_pct_prev,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND ra.intentos = 1 THEN pr.ACCOUNT_ID END)             AS usuarios_1_intento,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND ra.intentos = 2 THEN pr.ACCOUNT_ID END)             AS usuarios_2_intentos,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND ra.intentos = 3 THEN pr.ACCOUNT_ID END)             AS usuarios_3_intentos,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      AND ra.intentos >= 4 THEN pr.ACCOUNT_ID END)            AS usuarios_4mas_intentos,
    ROUND(AVG(CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      THEN ra.intentos END), 1)                               AS promedio_intentos
  FROM procesos pr
  CROSS JOIN params p
  LEFT JOIN reintentos_agg ra ON pr.ACCOUNT_ID = ra.ACCOUNT_ID
  GROUP BY p.mes_actual_inicio
),

bloque3 AS (
  SELECT
    '3_validaciones_doc_rostro' AS bloque,
    p.mes_actual_inicio AS periodo,
    va.doc_total,
    va.doc_exitosas,
    ROUND(va.doc_exitosas * 100.0 / NULLIF(va.doc_total, 0), 1)           AS doc_conversion_pct,
    va.doc_total_prev,
    ROUND(va.doc_exitosas_prev * 100.0 / NULLIF(va.doc_total_prev, 0), 1) AS doc_conversion_pct_prev,
    va.rostro_total,
    va.rostro_exitosas,
    ROUND(va.rostro_exitosas * 100.0 / NULLIF(va.rostro_total, 0), 1)     AS rostro_conversion_pct,
    va.rostro_total_prev,
    ROUND(va.rostro_exitosas_prev * 100.0 / NULLIF(va.rostro_total_prev, 0), 1) AS rostro_conversion_pct_prev,
    va.doc_expirados,
    va.doc_declinados,
    va.rostro_expirados,
    va.rostro_declinados
  FROM params p
  CROSS JOIN validaciones_agg va
),

bloque4 AS (
  SELECT
    '4_historico_3meses' AS bloque,
    ph.mes AS periodo,
    COUNT(DISTINCT ph.PROCESS_ID)                             AS total_procesos,
    COUNT(DISTINCT CASE WHEN LOWER(ph.STATUS) = 'success'
      THEN ph.PROCESS_ID END)                                 AS procesos_exitosos,
    ROUND(COUNT(DISTINCT CASE WHEN LOWER(ph.STATUS) = 'success'
      THEN ph.PROCESS_ID END) * 100.0
      / NULLIF(COUNT(DISTINCT ph.PROCESS_ID), 0), 1)          AS conversion_pct,
    COUNT(DISTINCT ph.ACCOUNT_ID)                             AS usuarios_unicos,
    ROUND(COUNT(DISTINCT CASE WHEN LOWER(ph.STATUS) = 'success'
      THEN ph.ACCOUNT_ID END) * 100.0
      / NULLIF(COUNT(DISTINCT ph.ACCOUNT_ID), 0), 1)          AS conversion_usuario_pct
  FROM procesos_historico ph
  GROUP BY ph.mes
  ORDER BY ph.mes ASC
),

bloque5 AS (
  SELECT
    '5_flujos' AS bloque,
    p.mes_actual_inicio AS periodo,
    fa.FLOW_ID,
    fa.total_actual,
    fa.exitosos_actual,
    (fa.total_actual - fa.exitosos_actual)                    AS fallidos_actual,
    ROUND(fa.exitosos_actual * 100.0 / NULLIF(fa.total_actual, 0), 1)    AS conversion_actual,
    CASE
      WHEN fa.total_actual > 0 AND fa.total_prev > 0 THEN
        ROUND(
          (fa.exitosos_actual * 100.0 / fa.total_actual)
          - (fa.exitosos_prev * 100.0 / fa.total_prev)
        , 1)
      ELSE NULL
    END AS variacion_mom_pp,
    CASE
      WHEN fa.total_actual > 0 AND fa.total_prev > 0 THEN
        CASE
          WHEN (fa.exitosos_actual * 100.0 / fa.total_actual)
            > (fa.exitosos_prev * 100.0 / fa.total_prev)
            THEN '+' || ROUND((fa.exitosos_actual * 100.0 / fa.total_actual)
              - (fa.exitosos_prev * 100.0 / fa.total_prev), 1) || '% UP'
          WHEN (fa.exitosos_actual * 100.0 / fa.total_actual)
            < (fa.exitosos_prev * 100.0 / fa.total_prev)
            THEN ROUND((fa.exitosos_actual * 100.0 / fa.total_actual)
              - (fa.exitosos_prev * 100.0 / fa.total_prev), 1) || '% DOWN'
          ELSE '0.0% ='
        END
      ELSE 'N/A'
    END AS variacion_mom_label
  FROM flujos_agg fa
  CROSS JOIN params p
),

bloque6 AS (
  SELECT
    '6_funnel' AS bloque,
    p.mes_actual_inicio AS periodo,
    COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
      THEN pr.PROCESS_ID END)                                 AS usuarios_inicio,
    va.doc_total                                              AS usuarios_llegan_doc,
    va.rostro_total                                           AS usuarios_llegan_rostro,
    ROUND(va.doc_total * 100.0
      / NULLIF(COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
        THEN pr.PROCESS_ID END), 0), 1)                       AS tasa_llegan_doc,
    ROUND(va.rostro_total * 100.0
      / NULLIF(COUNT(DISTINCT CASE WHEN pr.fecha_proceso >= p.mes_actual_inicio
        THEN pr.PROCESS_ID END), 0), 1)                       AS tasa_llegan_rostro
  FROM procesos pr
  CROSS JOIN params p
  CROSS JOIN validaciones_agg va
  WHERE pr.fecha_proceso >= p.mes_actual_inicio
  GROUP BY p.mes_actual_inicio, va.doc_total, va.rostro_total
),

bloque7 AS (
  SELECT
    '7_razones_doc' AS bloque,
    p.mes_actual_inicio AS periodo,
    rd.razon,
    rd.total
  FROM razones_doc_agg rd
  CROSS JOIN params p
),

bloque8 AS (
  SELECT
    '8_razones_rostro' AS bloque,
    p.mes_actual_inicio AS periodo,
    rr.razon,
    rr.total
  FROM razones_rostro_agg rr
  CROSS JOIN params p
),

bloque9 AS (
  SELECT
    '9_abandono' AS bloque,
    p.mes_actual_inicio AS periodo,
    me.motivo,
    me.total
  FROM motivos_expirados_agg me
  CROSS JOIN params p
),

bloque10 AS (
  SELECT
    '10_declinados' AS bloque,
    p.mes_actual_inicio AS periodo,
    md.motivo,
    md.total
  FROM motivos_declinados_agg md
  CROSS JOIN params p
),

bloque11 AS (
  SELECT
    '11_friccion_usuario' AS bloque,
    p.mes_actual_inicio AS periodo,
    fu.motivo,
    fu.usuarios_afectados
  FROM friccion_usuario_agg fu
  CROSS JOIN params p
)

SELECT bloque, periodo,
  col1, col2, col3, col4, col5,
  col6, col7, col8, col9, col10, col11,
  col_extra1, col_extra2, col_extra3, col_extra4
FROM (

  SELECT bloque, periodo,
    CAST(total_procesos AS VARCHAR)          AS col1,
    CAST(procesos_exitosos AS VARCHAR)       AS col2,
    CAST(procesos_fallidos AS VARCHAR)       AS col3,
    CAST(expirados AS VARCHAR)               AS col4,
    CAST(declinados AS VARCHAR)              AS col5,
    CAST(errores_tecnicos AS VARCHAR)        AS col6,
    CAST(total_cancelados AS VARCHAR)        AS col7,
    CAST(conversion_pct AS VARCHAR)          AS col8,
    CAST(total_procesos_prev AS VARCHAR)     AS col9,
    CAST(procesos_exitosos_prev AS VARCHAR)  AS col10,
    CAST(conversion_pct_prev AS VARCHAR)     AS col11,
    CAST(variacion_procesos_pct AS VARCHAR)  AS col_extra1,
    NULL AS col_extra2, NULL AS col_extra3, NULL AS col_extra4
  FROM bloque1

  UNION ALL

  SELECT bloque, periodo,
    CAST(usuarios_unicos AS VARCHAR)             AS col1,
    CAST(usuarios_exitosos AS VARCHAR)           AS col2,
    CAST(conversion_usuario_pct AS VARCHAR)      AS col3,
    CAST(usuarios_unicos_prev AS VARCHAR)        AS col4,
    CAST(conversion_usuario_pct_prev AS VARCHAR) AS col5,
    CAST(usuarios_1_intento AS VARCHAR)          AS col6,
    CAST(usuarios_2_intentos AS VARCHAR)         AS col7,
    CAST(usuarios_3_intentos AS VARCHAR)         AS col8,
    CAST(usuarios_4mas_intentos AS VARCHAR)      AS col9,
    CAST(promedio_intentos AS VARCHAR)           AS col10,
    NULL AS col11, NULL AS col_extra1,
    NULL AS col_extra2, NULL AS col_extra3, NULL AS col_extra4
  FROM bloque2

  UNION ALL

  SELECT bloque, periodo,
    CAST(doc_total AS VARCHAR)                  AS col1,
    CAST(doc_exitosas AS VARCHAR)               AS col2,
    CAST(doc_conversion_pct AS VARCHAR)         AS col3,
    CAST(doc_total_prev AS VARCHAR)             AS col4,
    CAST(doc_conversion_pct_prev AS VARCHAR)    AS col5,
    CAST(rostro_total AS VARCHAR)               AS col6,
    CAST(rostro_exitosas AS VARCHAR)            AS col7,
    CAST(rostro_conversion_pct AS VARCHAR)      AS col8,
    CAST(rostro_total_prev AS VARCHAR)          AS col9,
    CAST(rostro_conversion_pct_prev AS VARCHAR) AS col10,
    CAST(doc_expirados AS VARCHAR)              AS col11,
    CAST(doc_declinados AS VARCHAR)             AS col_extra1,
    CAST(rostro_expirados AS VARCHAR)           AS col_extra2,
    CAST(rostro_declinados AS VARCHAR)          AS col_extra3,
    NULL                                        AS col_extra4
  FROM bloque3

  UNION ALL

  SELECT bloque, periodo,
    CAST(total_procesos AS VARCHAR)         AS col1,
    CAST(procesos_exitosos AS VARCHAR)      AS col2,
    CAST(conversion_pct AS VARCHAR)         AS col3,
    CAST(usuarios_unicos AS VARCHAR)        AS col4,
    CAST(conversion_usuario_pct AS VARCHAR) AS col5,
    NULL AS col6, NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque4

  UNION ALL

  SELECT bloque, periodo,
    FLOW_ID                                     AS col1,
    CAST(total_actual AS VARCHAR)               AS col2,
    CAST(exitosos_actual AS VARCHAR)            AS col3,
    CAST(fallidos_actual AS VARCHAR)            AS col4,
    CAST(conversion_actual AS VARCHAR)          AS col5,
    NULL AS col6, NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    variacion_mom_label                         AS col_extra1,
    NULL AS col_extra2, NULL AS col_extra3, NULL AS col_extra4
  FROM bloque5

  UNION ALL

  SELECT bloque, periodo,
    CAST(usuarios_inicio AS VARCHAR)        AS col1,
    CAST(usuarios_llegan_doc AS VARCHAR)    AS col2,
    CAST(usuarios_llegan_rostro AS VARCHAR) AS col3,
    CAST(tasa_llegan_doc AS VARCHAR)        AS col4,
    CAST(tasa_llegan_rostro AS VARCHAR)     AS col5,
    NULL AS col6, NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque6

  UNION ALL

  SELECT bloque, periodo,
    razon AS col1, CAST(total AS VARCHAR) AS col2,
    NULL AS col3, NULL AS col4, NULL AS col5,
    NULL AS col6, NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque7

  UNION ALL

  SELECT bloque, periodo,
    razon AS col1, CAST(total AS VARCHAR) AS col2,
    NULL AS col3, NULL AS col4, NULL AS col5,
    NULL AS col6, NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque8

  UNION ALL

  SELECT bloque, periodo,
    motivo AS col1, CAST(total AS VARCHAR) AS col2,
    NULL AS col3, NULL AS col4, NULL AS col5,
    NULL AS col6, NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque9

  UNION ALL

  SELECT bloque, periodo,
    motivo AS col1, CAST(total AS VARCHAR) AS col2,
    NULL AS col3, NULL AS col4, NULL AS col5,
    NULL AS col6, NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque10

  UNION ALL

  SELECT bloque, periodo,
    motivo AS col1, CAST(usuarios_afectados AS VARCHAR) AS col2,
    NULL AS col3, NULL AS col4, NULL AS col5,
    NULL AS col6, NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque11

)
ORDER BY bloque, periodo;
