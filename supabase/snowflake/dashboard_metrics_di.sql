-- Dashboard /dashboard — DI (Digital Identity)
--
-- Query per-cliente, rango arbitrario. Devuelve 6 bloques en formato
-- normalizado (bloque, periodo, col1..col_extra4) — mismo shape que el
-- Report Builder. El backend del dashboard parsea por `bloque` y arma el JSON
-- de respuesta del webhook /dashboard-metrics-detail.
--
-- Placeholders (los reemplaza n8n):
--   {{CLIENT_ID}}     → string TCI del cliente, ej '5aurr2fgj3q0abioshk661qekh'
--   {{FECHA_INICIO}}  → primer dia del rango, ej '2026-01-01'
--   {{FECHA_FIN}}     → ultimo dia del rango, ej '2026-03-31'
--
-- Periodo previo = mismo ancho hacia atras: [FECHA_INICIO - duracion .. FECHA_INICIO - 1].
-- Ej: rango actual 2026-01-01..2026-03-31 (90 dias) -> prev 2025-10-03..2025-12-31.
--
-- Bloques que retorna:
--   1_metricas_generales : totales del rango + comparativo prev
--   4_historico_mensual  : una fila por mes en [FECHA_INICIO..FECHA_FIN]
--   7_razones_doc        : top 5 motivos de rechazo en validacion documento
--   8_razones_rostro     : top 5 motivos de rechazo en validacion rostro
--   9_abandono           : top 6 motivos de expiracion (usuario abandono)
--   10_declinados        : top 6 motivos de rechazo (modelo declino)
--
-- Reglas criticas (heredadas del Report Builder, ver snowflake-queries.md):
--   * cancelados detectados con lista explicita CANCELED_REASON IN (...) o
--     LOWER(DECLINED_REASON) = 'canceled'. NUNCA usar IS NOT NULL.
--   * declinados excluyen explicitamente cancelados.
--   * DOCUMENT_VALIDATION_HISTORY deduplicado con ROW_NUMBER PARTITION BY
--     (identity_process_id, type) ORDER BY creation_date DESC.
--   * filtros base: STATUS IS NOT NULL, IS_USED no false, DECLINED_REASON
--     no 'not_used'.

WITH params AS (
  SELECT
    '{{CLIENT_ID}}'::VARCHAR                         AS client_id,
    '{{FECHA_INICIO}}'::DATE                         AS fecha_inicio,
    '{{FECHA_FIN}}'::DATE                            AS fecha_fin,
    DATEDIFF('day', '{{FECHA_INICIO}}'::DATE, '{{FECHA_FIN}}'::DATE) + 1 AS rango_dias
),
periodos AS (
  SELECT
    client_id,
    fecha_inicio,
    fecha_fin,
    DATEADD('day', -rango_dias, fecha_inicio) AS prev_inicio,
    DATEADD('day', -1,           fecha_inicio) AS prev_fin
  FROM params
),

-- Procesos del periodo actual con filtros base
ip_actual AS (
  SELECT
    p.process_id,
    p.account_id,
    p.status,
    p.failure_status,
    p.declined_reason,
    p.canceled_reason,
    p.creation_date,
    CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date)::DATE AS dia_local,
    DATE_TRUNC('month', CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date))::DATE AS mes_local
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p
  CROSS JOIN periodos pe
  WHERE p.client_id = pe.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date)::DATE
        BETWEEN pe.fecha_inicio AND pe.fecha_fin
    AND p.status IS NOT NULL
    AND (p.is_used IS NULL OR p.is_used = TRUE)
    AND (p.declined_reason IS NULL OR LOWER(p.declined_reason) != 'not_used')
),
ip_prev AS (
  SELECT
    p.process_id,
    p.status,
    p.failure_status,
    p.declined_reason,
    p.canceled_reason
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p
  CROSS JOIN periodos pe
  WHERE p.client_id = pe.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date)::DATE
        BETWEEN pe.prev_inicio AND pe.prev_fin
    AND p.status IS NOT NULL
    AND (p.is_used IS NULL OR p.is_used = TRUE)
    AND (p.declined_reason IS NULL OR LOWER(p.declined_reason) != 'not_used')
),

-- Cancelados / declinados — clasificacion semantica
clasif_actual AS (
  SELECT
    process_id,
    mes_local,
    status,
    failure_status,
    declined_reason,
    canceled_reason,
    -- ¿es cancelado? (lista explicita + DECLINED_REASON='canceled')
    CASE
      WHEN canceled_reason IN (
        'other_reason','dont_want_to_send_my_document','dont_want_to_continue',
        'dont_understand_what_to_do','other','camara_problems','dont_have_my_phone',
        'dont_want_to_send_my_video','dont_know_how_to_take_the_photo',
        'dont_have_my_document','dont_want_to_send_my_number',
        'my_document_type_is_not_there','doesnt_redirect_me'
      ) OR LOWER(declined_reason) = 'canceled' THEN 1
      ELSE 0
    END AS es_cancelado,
    -- ¿es declinado por el modelo? (excluye cancelados)
    CASE
      WHEN (LOWER(failure_status) LIKE '%rechazado%' OR LOWER(failure_status) = 'declined')
        AND declined_reason IS NOT NULL
        AND LOWER(declined_reason) NOT IN ('not_used','canceled')
        AND NOT (canceled_reason IN (
          'other_reason','dont_want_to_send_my_document','dont_want_to_continue',
          'dont_understand_what_to_do','other','camara_problems','dont_have_my_phone',
          'dont_want_to_send_my_video','dont_know_how_to_take_the_photo',
          'dont_have_my_document','dont_want_to_send_my_number',
          'my_document_type_is_not_there','doesnt_redirect_me'
        ))
      THEN 1
      ELSE 0
    END AS es_declinado,
    -- ¿es expirado? (failure_status = expired y NO cancelado)
    CASE
      WHEN LOWER(failure_status) = 'expired'
        AND NOT (canceled_reason IN (
          'other_reason','dont_want_to_send_my_document','dont_want_to_continue',
          'dont_understand_what_to_do','other','camara_problems','dont_have_my_phone',
          'dont_want_to_send_my_video','dont_know_how_to_take_the_photo',
          'dont_have_my_document','dont_want_to_send_my_number',
          'my_document_type_is_not_there','doesnt_redirect_me'
        ))
      THEN 1
      ELSE 0
    END AS es_expirado,
    -- ¿es error tecnico?
    CASE
      WHEN LOWER(failure_status) IN ('technical_error','error') THEN 1
      ELSE 0
    END AS es_error_tecnico
  FROM ip_actual
),
clasif_prev AS (
  SELECT
    process_id,
    status,
    failure_status,
    declined_reason,
    canceled_reason,
    CASE
      WHEN canceled_reason IN (
        'other_reason','dont_want_to_send_my_document','dont_want_to_continue',
        'dont_understand_what_to_do','other','camara_problems','dont_have_my_phone',
        'dont_want_to_send_my_video','dont_know_how_to_take_the_photo',
        'dont_have_my_document','dont_want_to_send_my_number',
        'my_document_type_is_not_there','doesnt_redirect_me'
      ) OR LOWER(declined_reason) = 'canceled' THEN 1
      ELSE 0
    END AS es_cancelado
  FROM ip_prev
),

-- DOCUMENT_VALIDATION_HISTORY deduplicado para razones doc/rostro del periodo actual
doc_dedup AS (
  SELECT
    dvh.identity_process_id,
    dvh.type,
    dvh.validation_status,
    dvh.failure_status,
    dvh.declined_reason,
    ROW_NUMBER() OVER (
      PARTITION BY dvh.identity_process_id, dvh.type
      ORDER BY dvh.creation_date DESC
    ) AS rn
  FROM TRUORA.TRUORA_SCHEMA.DOCUMENT_VALIDATION_HISTORY dvh
  JOIN ip_actual ia ON ia.process_id = dvh.identity_process_id
  WHERE dvh.type IN ('document-validation','face-recognition','face-search')
),

-- Bloque 1: metricas generales del rango
bloque1 AS (
  SELECT
    '1_metricas_generales'                                           AS bloque,
    pe.fecha_inicio                                                  AS periodo,
    -- Actual
    (SELECT COUNT(DISTINCT process_id) FROM clasif_actual)::VARCHAR  AS col1,  -- total_procesos
    (SELECT COUNT(DISTINCT process_id) FROM clasif_actual
       WHERE status = 'success')::VARCHAR                            AS col2,  -- procesos_exitosos
    (SELECT COUNT(DISTINCT process_id) FROM clasif_actual
       WHERE status = 'failure' AND es_cancelado = 0
       AND es_error_tecnico = 0)::VARCHAR                            AS col3,  -- procesos_fallidos (rechazo+expirado, sin tecnicos ni cancelados)
    (SELECT COUNT(DISTINCT process_id) FROM clasif_actual
       WHERE es_expirado = 1)::VARCHAR                               AS col4,  -- expirados
    (SELECT COUNT(DISTINCT process_id) FROM clasif_actual
       WHERE es_declinado = 1)::VARCHAR                              AS col5,  -- declinados
    (SELECT COUNT(DISTINCT process_id) FROM clasif_actual
       WHERE es_error_tecnico = 1)::VARCHAR                          AS col6,  -- errores_tecnicos
    (SELECT COUNT(DISTINCT process_id) FROM clasif_actual
       WHERE es_cancelado = 1)::VARCHAR                              AS col7,  -- cancelados
    -- conversion_pct
    ROUND(
      (SELECT COUNT(DISTINCT process_id) FROM clasif_actual WHERE status='success')::FLOAT
      / NULLIF((SELECT COUNT(DISTINCT process_id) FROM clasif_actual), 0) * 100, 1
    )::VARCHAR                                                       AS col8,  -- conversion_pct
    -- Prev
    (SELECT COUNT(DISTINCT process_id) FROM clasif_prev)::VARCHAR    AS col9,  -- total_procesos prev
    (SELECT COUNT(DISTINCT process_id) FROM clasif_prev
       WHERE status='success')::VARCHAR                              AS col10, -- exitosos prev
    ROUND(
      (SELECT COUNT(DISTINCT process_id) FROM clasif_prev WHERE status='success')::FLOAT
      / NULLIF((SELECT COUNT(DISTINCT process_id) FROM clasif_prev), 0) * 100, 1
    )::VARCHAR                                                       AS col11, -- conversion_pct prev
    -- variacion procesos pct
    ROUND(
      ((SELECT COUNT(DISTINCT process_id) FROM clasif_actual)
        - (SELECT COUNT(DISTINCT process_id) FROM clasif_prev))::FLOAT
      / NULLIF((SELECT COUNT(DISTINCT process_id) FROM clasif_prev), 0) * 100, 1
    )::VARCHAR                                                       AS col_extra1,
    NULL::VARCHAR                                                    AS col_extra2,
    NULL::VARCHAR                                                    AS col_extra3,
    NULL::VARCHAR                                                    AS col_extra4
  FROM periodos pe
),

-- Bloque 4: historico mensual del rango
hist_mensual AS (
  SELECT
    mes_local,
    COUNT(DISTINCT process_id)                                  AS total_procesos,
    COUNT(DISTINCT CASE WHEN status='success' THEN process_id END) AS exitosos
  FROM clasif_actual
  GROUP BY mes_local
),
bloque4 AS (
  SELECT
    '4_historico_mensual'                                       AS bloque,
    mes_local                                                   AS periodo,
    total_procesos::VARCHAR                                     AS col1,
    exitosos::VARCHAR                                           AS col2,
    ROUND(exitosos::FLOAT / NULLIF(total_procesos, 0) * 100, 1)::VARCHAR AS col3,  -- conversion_pct
    NULL::VARCHAR AS col4, NULL::VARCHAR AS col5, NULL::VARCHAR AS col6,
    NULL::VARCHAR AS col7, NULL::VARCHAR AS col8, NULL::VARCHAR AS col9,
    NULL::VARCHAR AS col10, NULL::VARCHAR AS col11,
    NULL::VARCHAR AS col_extra1, NULL::VARCHAR AS col_extra2,
    NULL::VARCHAR AS col_extra3, NULL::VARCHAR AS col_extra4
  FROM hist_mensual
),

-- Bloque 7: top 5 razones de rechazo en validacion documento
razones_doc AS (
  SELECT
    declined_reason,
    COUNT(*) AS total
  FROM doc_dedup
  WHERE rn = 1
    AND type = 'document-validation'
    AND validation_status != 'success'
    AND declined_reason IS NOT NULL
    AND LOWER(declined_reason) NOT IN ('not_used','canceled')
  GROUP BY declined_reason
  QUALIFY ROW_NUMBER() OVER (ORDER BY total DESC) <= 5
),
bloque7 AS (
  SELECT
    '7_razones_doc'                                             AS bloque,
    pe.fecha_inicio                                             AS periodo,
    declined_reason::VARCHAR                                    AS col1,
    total::VARCHAR                                              AS col2,
    NULL::VARCHAR AS col3, NULL::VARCHAR AS col4, NULL::VARCHAR AS col5,
    NULL::VARCHAR AS col6, NULL::VARCHAR AS col7, NULL::VARCHAR AS col8,
    NULL::VARCHAR AS col9, NULL::VARCHAR AS col10, NULL::VARCHAR AS col11,
    NULL::VARCHAR AS col_extra1, NULL::VARCHAR AS col_extra2,
    NULL::VARCHAR AS col_extra3, NULL::VARCHAR AS col_extra4
  FROM razones_doc CROSS JOIN periodos pe
),

-- Bloque 8: top 5 razones de rechazo en validacion rostro
razones_rostro AS (
  SELECT
    declined_reason,
    COUNT(*) AS total
  FROM doc_dedup
  WHERE rn = 1
    AND type IN ('face-recognition','face-search')
    AND validation_status != 'success'
    AND declined_reason IS NOT NULL
    AND LOWER(declined_reason) NOT IN ('not_used','canceled')
  GROUP BY declined_reason
  QUALIFY ROW_NUMBER() OVER (ORDER BY total DESC) <= 5
),
bloque8 AS (
  SELECT
    '8_razones_rostro'                                          AS bloque,
    pe.fecha_inicio                                             AS periodo,
    declined_reason::VARCHAR                                    AS col1,
    total::VARCHAR                                              AS col2,
    NULL::VARCHAR AS col3, NULL::VARCHAR AS col4, NULL::VARCHAR AS col5,
    NULL::VARCHAR AS col6, NULL::VARCHAR AS col7, NULL::VARCHAR AS col8,
    NULL::VARCHAR AS col9, NULL::VARCHAR AS col10, NULL::VARCHAR AS col11,
    NULL::VARCHAR AS col_extra1, NULL::VARCHAR AS col_extra2,
    NULL::VARCHAR AS col_extra3, NULL::VARCHAR AS col_extra4
  FROM razones_rostro CROSS JOIN periodos pe
),

-- Bloque 9: top 6 motivos de expiracion (abandono usuario)
-- NULLIF en ambos campos: en SF strings vacios '' coexisten con NULL, asi
-- que sin NULLIF al declined_reason, COALESCE lo retorna como '' en lugar
-- de caer al fallback 'sin_motivo'. Bug detectado 2026-05-04 con cliente
-- grande (15.4k procesos sin razon explicita aparecian con motivo en blanco).
abandono AS (
  SELECT
    COALESCE(
      NULLIF(TRIM(canceled_reason), ''),
      NULLIF(TRIM(declined_reason), ''),
      'sin_motivo_registrado'
    )                                                            AS motivo,
    COUNT(*) AS total
  FROM clasif_actual
  WHERE es_expirado = 1 OR es_cancelado = 1
  GROUP BY motivo
  QUALIFY ROW_NUMBER() OVER (ORDER BY total DESC) <= 6
),
bloque9 AS (
  SELECT
    '9_abandono'                                                AS bloque,
    pe.fecha_inicio                                             AS periodo,
    motivo::VARCHAR                                             AS col1,
    total::VARCHAR                                              AS col2,
    NULL::VARCHAR AS col3, NULL::VARCHAR AS col4, NULL::VARCHAR AS col5,
    NULL::VARCHAR AS col6, NULL::VARCHAR AS col7, NULL::VARCHAR AS col8,
    NULL::VARCHAR AS col9, NULL::VARCHAR AS col10, NULL::VARCHAR AS col11,
    NULL::VARCHAR AS col_extra1, NULL::VARCHAR AS col_extra2,
    NULL::VARCHAR AS col_extra3, NULL::VARCHAR AS col_extra4
  FROM abandono CROSS JOIN periodos pe
),

-- Bloque 10: top 6 motivos de declinacion (rechazo modelo)
declinados AS (
  SELECT
    declined_reason                                             AS motivo,
    COUNT(*) AS total
  FROM clasif_actual
  WHERE es_declinado = 1
    AND declined_reason IS NOT NULL
  GROUP BY declined_reason
  QUALIFY ROW_NUMBER() OVER (ORDER BY total DESC) <= 6
),
bloque10 AS (
  SELECT
    '10_declinados'                                             AS bloque,
    pe.fecha_inicio                                             AS periodo,
    motivo::VARCHAR                                             AS col1,
    total::VARCHAR                                              AS col2,
    NULL::VARCHAR AS col3, NULL::VARCHAR AS col4, NULL::VARCHAR AS col5,
    NULL::VARCHAR AS col6, NULL::VARCHAR AS col7, NULL::VARCHAR AS col8,
    NULL::VARCHAR AS col9, NULL::VARCHAR AS col10, NULL::VARCHAR AS col11,
    NULL::VARCHAR AS col_extra1, NULL::VARCHAR AS col_extra2,
    NULL::VARCHAR AS col_extra3, NULL::VARCHAR AS col_extra4
  FROM declinados CROSS JOIN periodos pe
)

SELECT * FROM bloque1
UNION ALL SELECT * FROM bloque4
UNION ALL SELECT * FROM bloque7
UNION ALL SELECT * FROM bloque8
UNION ALL SELECT * FROM bloque9
UNION ALL SELECT * FROM bloque10
ORDER BY bloque, periodo;
