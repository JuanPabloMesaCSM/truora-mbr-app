-- Dashboard /dashboard — BGC (Background Check)
--
-- Query per-cliente, rango arbitrario. Devuelve 4 bloques en formato
-- normalizado (bloque, periodo, col1..col_extra4).
--
-- Placeholders:
--   {{CLIENT_ID}}     → string TCI
--   {{FECHA_INICIO}}  → '2026-01-01'
--   {{FECHA_FIN}}     → '2026-03-31'
--
-- Periodo previo = mismo ancho hacia atras.
--
-- Bloques que retorna:
--   1_resumen_general              : totales del rango + comparativo prev
--   2_por_pais                     : agregado por pais en el rango (1 fila por pais)
--   6_labels_high_score            : labels High con score > 6 (anomalia, es_anomalia=1)
--   7_historico_mensual            : una fila por mes en [FECHA_INICIO..FECHA_FIN]
--   8_rejection_tendencia_mensual  : tendencia mensual de % rejection por pais
--                                    (top 5 paises por volumen del rango)
--   consumo_mensual                : SHARED_COUNTERS_DYNAMO desglose por sub-producto
--                                    (PRODUCT='checks'). Hoy 1 sola serie 'checks'
--                                    pero el shape es identico al de DI/CE.
--
-- Reglas criticas:
--   * Filtro DELETED IS NULL OR DELETED = FALSE.
--   * Score normalizado: si score <= 1, multiplicar por 10 (algunos clientes en escala 0-1).
--   * Pass rate: score > 6 entre status='completed'. Umbral default — confirmar
--     con CSM si el cliente usa otro corte.
--   * TENANT puede tener 2 filas por truora_client_id — usar tenant_one
--     dedup con ANY_VALUE (memoria feedback_n8n_supabase_node y bug TENANT
--     en botialertas-v2.md).

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

-- TENANT dedup (memoria: TENANT puede tener 2 filas por truora_client_id)
tenant_one AS (
  SELECT
    truora_client_id,
    ANY_VALUE(company_name) AS company_name
  FROM TRUORA.TRUORA_SCHEMA.TENANT
  WHERE truora_client_id IS NOT NULL
  GROUP BY truora_client_id
),

-- Checks del periodo actual con score normalizado
checks_actual AS (
  SELECT
    c.check_id,
    c.country,
    c.type,
    c.status,
    c.labels,
    CASE WHEN c.score <= 1 THEN c.score * 10 ELSE c.score END AS score_norm,
    c.creation_date,
    DATE_TRUNC('month', CONVERT_TIMEZONE('UTC','America/Bogota', c.creation_date))::DATE AS mes_local
  FROM TRUORA.TRUORA_SCHEMA.CHECKS_CHECKS c
  CROSS JOIN periodos pe
  WHERE c.client_id = pe.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', c.creation_date)::DATE
        BETWEEN pe.fecha_inicio AND pe.fecha_fin
    AND (c.deleted IS NULL OR c.deleted = FALSE)
),
checks_prev AS (
  SELECT
    c.check_id,
    c.status,
    CASE WHEN c.score <= 1 THEN c.score * 10 ELSE c.score END AS score_norm
  FROM TRUORA.TRUORA_SCHEMA.CHECKS_CHECKS c
  CROSS JOIN periodos pe
  WHERE c.client_id = pe.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', c.creation_date)::DATE
        BETWEEN pe.prev_inicio AND pe.prev_fin
    AND (c.deleted IS NULL OR c.deleted = FALSE)
),

-- Bloque 1: resumen general del rango
bloque1 AS (
  SELECT
    '1_resumen_general'                                                  AS bloque,
    pe.fecha_inicio                                                      AS periodo,
    -- Actual
    (SELECT COUNT(*) FROM checks_actual)::VARCHAR                        AS col1,  -- total_checks
    (SELECT COUNT(*) FROM checks_actual WHERE status = 'completed')::VARCHAR AS col2, -- completados
    (SELECT COUNT(*) FROM checks_actual WHERE status = 'error')::VARCHAR AS col3,  -- errores
    ROUND((SELECT AVG(score_norm) FROM checks_actual WHERE status = 'completed'), 2)::VARCHAR AS col4, -- score promedio
    -- pass rate (score > 6 sobre completados)
    ROUND(
      (SELECT COUNT(*) FROM checks_actual WHERE status = 'completed' AND score_norm > 6)::FLOAT
      / NULLIF((SELECT COUNT(*) FROM checks_actual WHERE status = 'completed'), 0) * 100, 1
    )::VARCHAR                                                           AS col5,  -- pass_rate_pct
    ROUND(
      (SELECT COUNT(*) FROM checks_actual WHERE status = 'completed' AND score_norm <= 6)::FLOAT
      / NULLIF((SELECT COUNT(*) FROM checks_actual WHERE status = 'completed'), 0) * 100, 1
    )::VARCHAR                                                           AS col6,  -- rejection_rate_pct
    -- Prev
    (SELECT COUNT(*) FROM checks_prev)::VARCHAR                          AS col7,  -- total_checks prev
    (SELECT COUNT(*) FROM checks_prev WHERE status = 'completed')::VARCHAR AS col8, -- completados prev
    ROUND((SELECT AVG(score_norm) FROM checks_prev WHERE status='completed'), 2)::VARCHAR AS col9, -- score promedio prev
    ROUND(
      (SELECT COUNT(*) FROM checks_prev WHERE status='completed' AND score_norm > 6)::FLOAT
      / NULLIF((SELECT COUNT(*) FROM checks_prev WHERE status='completed'), 0) * 100, 1
    )::VARCHAR                                                           AS col10, -- pass_rate_pct prev
    -- Variacion
    ROUND(
      ((SELECT COUNT(*) FROM checks_actual) - (SELECT COUNT(*) FROM checks_prev))::FLOAT
      / NULLIF((SELECT COUNT(*) FROM checks_prev), 0) * 100, 1
    )::VARCHAR                                                           AS col11, -- variacion_checks_pct
    NULL::VARCHAR                                                        AS col_extra1,
    NULL::VARCHAR                                                        AS col_extra2,
    NULL::VARCHAR                                                        AS col_extra3,
    NULL::VARCHAR                                                        AS col_extra4
  FROM periodos pe
),

-- Bloque 2: por pais en el rango
agg_pais AS (
  SELECT
    country,
    COUNT(*)                                          AS total_checks,
    COUNT(CASE WHEN status='completed' THEN 1 END)    AS completados,
    COUNT(CASE WHEN status='error' THEN 1 END)        AS errores,
    AVG(CASE WHEN status='completed' THEN score_norm END) AS score_promedio,
    COUNT(CASE WHEN status='completed' AND score_norm > 6 THEN 1 END) AS pasados,
    COUNT(CASE WHEN status='completed' AND score_norm <= 6 THEN 1 END) AS rechazados
  FROM checks_actual
  WHERE country IS NOT NULL
  GROUP BY country
),
bloque2 AS (
  SELECT
    '2_por_pais'                                                AS bloque,
    pe.fecha_inicio                                             AS periodo,
    country::VARCHAR                                            AS col1,
    total_checks::VARCHAR                                       AS col2,
    completados::VARCHAR                                        AS col3,
    errores::VARCHAR                                            AS col4,
    ROUND(score_promedio, 2)::VARCHAR                           AS col5,
    ROUND(pasados::FLOAT / NULLIF(completados, 0) * 100, 1)::VARCHAR     AS col6, -- pass_rate
    ROUND(rechazados::FLOAT / NULLIF(completados, 0) * 100, 1)::VARCHAR  AS col7, -- rejection_rate
    ROUND(total_checks::FLOAT / NULLIF((SELECT COUNT(*) FROM checks_actual), 0) * 100, 1)::VARCHAR AS col8, -- pct_sobre_total
    NULL::VARCHAR AS col9, NULL::VARCHAR AS col10, NULL::VARCHAR AS col11,
    NULL::VARCHAR AS col_extra1, NULL::VARCHAR AS col_extra2,
    NULL::VARCHAR AS col_extra3, NULL::VARCHAR AS col_extra4
  FROM agg_pais CROSS JOIN periodos pe
),

-- Bloque 6: labels High con anomalia (label High pero score > 6)
labels_flat AS (
  SELECT
    ca.country,
    TRIM(TRIM(f.value::VARCHAR, '"')) AS label_clean,
    ca.score_norm
  FROM checks_actual ca,
    LATERAL FLATTEN(input => TRY_PARSE_JSON(ca.labels)) f
  WHERE ca.labels IS NOT NULL
    AND ca.labels != ''
    AND ca.labels != '[]'
    AND ca.status = 'completed'
),
labels_high AS (
  SELECT
    label_clean,
    country,
    AVG(score_norm)                                            AS score_promedio,
    COUNT(*)                                                   AS total_checks,
    -- es_anomalia=1 si el label dice "High" pero score > 6 (no deberia pasar)
    CASE WHEN AVG(score_norm) > 6 THEN 1 ELSE 0 END            AS es_anomalia
  FROM labels_flat
  WHERE label_clean ILIKE '%High%'
  GROUP BY label_clean, country
  QUALIFY ROW_NUMBER() OVER (ORDER BY total_checks DESC) <= 10
),
bloque6 AS (
  SELECT
    '6_labels_high_score'                                       AS bloque,
    pe.fecha_inicio                                             AS periodo,
    label_clean::VARCHAR                                        AS col1,
    country::VARCHAR                                            AS col2,
    ROUND(score_promedio, 2)::VARCHAR                           AS col3,
    total_checks::VARCHAR                                       AS col4,
    es_anomalia::VARCHAR                                        AS col5,
    NULL::VARCHAR AS col6, NULL::VARCHAR AS col7, NULL::VARCHAR AS col8,
    NULL::VARCHAR AS col9, NULL::VARCHAR AS col10, NULL::VARCHAR AS col11,
    NULL::VARCHAR AS col_extra1, NULL::VARCHAR AS col_extra2,
    NULL::VARCHAR AS col_extra3, NULL::VARCHAR AS col_extra4
  FROM labels_high CROSS JOIN periodos pe
),

-- Bloque 7: historico mensual
hist_mensual AS (
  SELECT
    mes_local,
    COUNT(*)                                                   AS total_checks,
    COUNT(CASE WHEN status='completed' THEN 1 END)             AS completados,
    COUNT(CASE WHEN status='error' THEN 1 END)                 AS errores,
    AVG(CASE WHEN status='completed' THEN score_norm END)      AS score_promedio,
    COUNT(CASE WHEN status='completed' AND score_norm > 6 THEN 1 END) AS pasados
  FROM checks_actual
  GROUP BY mes_local
),
bloque7 AS (
  SELECT
    '7_historico_mensual'                                       AS bloque,
    mes_local                                                   AS periodo,
    total_checks::VARCHAR                                       AS col1,
    completados::VARCHAR                                        AS col2,
    errores::VARCHAR                                            AS col3,
    ROUND(score_promedio, 2)::VARCHAR                           AS col4,
    ROUND(pasados::FLOAT / NULLIF(completados, 0) * 100, 1)::VARCHAR AS col5, -- pass_rate
    ROUND(completados::FLOAT / NULLIF(total_checks, 0) * 100, 1)::VARCHAR AS col6, -- tasa_completado
    NULL::VARCHAR AS col7, NULL::VARCHAR AS col8, NULL::VARCHAR AS col9,
    NULL::VARCHAR AS col10, NULL::VARCHAR AS col11,
    NULL::VARCHAR AS col_extra1, NULL::VARCHAR AS col_extra2,
    NULL::VARCHAR AS col_extra3, NULL::VARCHAR AS col_extra4
  FROM hist_mensual
),

-- ═══════════════════════════════════════════════════════════════════
-- Bloque 8: tendencia mensual % rejection por pais (top 5 paises)
-- ═══════════════════════════════════════════════════════════════════
-- BGC no tiene `declined_reason` como DI; el equivalente conceptual es
-- "% de checks completados con score <= 6" (rejection rate). Lo segmentamos
-- por pais para identificar drift territorial (ej: Mexico subiendo rejection
-- mes a mes mientras Colombia se mantiene).
top5_paises_bgc AS (
  SELECT
    country,
    COUNT(*) AS total_completados
  FROM checks_actual
  WHERE country IS NOT NULL
    AND status = 'completed'
  GROUP BY country
  QUALIFY ROW_NUMBER() OVER (ORDER BY total_completados DESC) <= 5
),

checks_pais_mes AS (
  SELECT
    ca.mes_local,
    ca.country,
    COUNT(*) AS total_completados,
    COUNT(CASE WHEN ca.score_norm > 6 THEN 1 END) AS pasados,
    COUNT(CASE WHEN ca.score_norm <= 6 THEN 1 END) AS rechazados
  FROM checks_actual ca
  JOIN top5_paises_bgc tp ON tp.country = ca.country
  WHERE ca.status = 'completed'
  GROUP BY ca.mes_local, ca.country
),

bloque8 AS (
  SELECT
    '8_rejection_tendencia_mensual'                             AS bloque,
    cpm.mes_local                                               AS periodo,
    cpm.country::VARCHAR                                        AS col1,  -- pais
    cpm.total_completados::VARCHAR                              AS col2,  -- volumen completados
    cpm.pasados::VARCHAR                                        AS col3,
    cpm.rechazados::VARCHAR                                     AS col4,
    ROUND(cpm.rechazados::FLOAT / NULLIF(cpm.total_completados, 0) * 100, 2)::VARCHAR AS col5, -- % rejection
    ROUND(cpm.pasados::FLOAT    / NULLIF(cpm.total_completados, 0) * 100, 2)::VARCHAR AS col6, -- % pass
    NULL::VARCHAR AS col7, NULL::VARCHAR AS col8, NULL::VARCHAR AS col9,
    NULL::VARCHAR AS col10, NULL::VARCHAR AS col11,
    NULL::VARCHAR AS col_extra1, NULL::VARCHAR AS col_extra2,
    NULL::VARCHAR AS col_extra3, NULL::VARCHAR AS col_extra4
  FROM checks_pais_mes cpm
),

-- ═══════════════════════════════════════════════════════════════════
-- Bloque consumo_mensual: SHARED_COUNTERS_DYNAMO (PRODUCT='checks')
-- ═══════════════════════════════════════════════════════════════════
consumo_dynamo_bgc AS (
  SELECT
    s.PERIOD,
    s.PRODUCT_IDENTIFIER,
    s.USAGE
  FROM TRUORA.TRUORA_SCHEMA.SHARED_COUNTERS_DYNAMO s
  CROSS JOIN periodos pe
  WHERE s.CLIENT_ID = pe.client_id
    AND s.PERIOD BETWEEN pe.fecha_inicio AND pe.fecha_fin
    AND LOWER(s.PRODUCT) = 'checks'
),
bloque_consumo AS (
  SELECT
    'consumo_mensual'                                           AS bloque,
    PERIOD                                                      AS periodo,
    PRODUCT_IDENTIFIER::VARCHAR                                 AS col1,
    USAGE::VARCHAR                                              AS col2,
    NULL::VARCHAR AS col3, NULL::VARCHAR AS col4, NULL::VARCHAR AS col5,
    NULL::VARCHAR AS col6, NULL::VARCHAR AS col7, NULL::VARCHAR AS col8,
    NULL::VARCHAR AS col9, NULL::VARCHAR AS col10, NULL::VARCHAR AS col11,
    NULL::VARCHAR AS col_extra1, NULL::VARCHAR AS col_extra2,
    NULL::VARCHAR AS col_extra3, NULL::VARCHAR AS col_extra4
  FROM consumo_dynamo_bgc
)

SELECT * FROM bloque1
UNION ALL SELECT * FROM bloque2
UNION ALL SELECT * FROM bloque6
UNION ALL SELECT * FROM bloque7
UNION ALL SELECT * FROM bloque8
UNION ALL SELECT * FROM bloque_consumo
ORDER BY bloque, periodo;
