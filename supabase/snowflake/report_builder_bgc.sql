-- ============================================================
-- REPORT BUILDER BGC — Query Snowflake productivo
-- Workflow n8n: "Report Builder BGC"
-- Tabla principal: TRUORA.TRUORA_SCHEMA.CHECKS_CHECKS
-- Snapshot guardado: 2026-05-19
-- ============================================================
-- Bloques que retorna:
--   1_resumen_general       → total/completados/error + score + pass_rate + rejection + prev + variaciones + direcciones (UP/DOWN/FLAT)
--   2_por_pais              → desglose por COUNTRY con metricas + % sobre total
--   2b_pais_x_tipo          → COUNTRY x TYPE con metricas + % sobre pais y sobre total
--   3_por_tipo              → desglose por TYPE de check
--   4_score_por_pais        → distribucion del score (0-10) por pais + es_rechazo (score<=6)
--   5_labels                → top 15 labels mas frecuentes por pais (red flags BGC)
--   6_labels_high_score     → labels con "High" en el nombre + es_anomalia (label High + score>6)
--   7_historico_3meses      → tendencia mensual: total, completados, score, pass_rate
--
-- Parametros n8n:
--   $("Preparar Params").json.CLIENT_ID
--   $("Preparar Params").json.fecha_inicio
--   $("Preparar Params").json.fecha_fin
--   $("Preparar Params").json.custom_types ("ALL" o JSON array, ej '["bg-check-driver","bg-check-courier"]')
--
-- Reglas criticas:
--   - SCORE puede venir 0-1 o 0-10 segun cliente: normalizar con CASE WHEN SCORE <= 1 THEN *10
--   - Umbral pass/reject por default = 6 (varia por cliente, confirmar antes de reportar)
--   - DELETED = TRUE excluye registros (filtro siempre activo)
--   - es_anomalia: label tiene "High" pero score > 6 = configuracion incorrecta del cliente
--   - LABELS viene como JSON array que se aplana con LATERAL FLATTEN
--
-- Mapeo COL1..COL_EXTRA4 por bloque: ver skill snowflake-queries.md
-- ============================================================

WITH

params AS (
  SELECT
    CAST('{{ $("Preparar Params").first().json.fecha_inicio }}' AS DATE) AS mes_actual_inicio,
    CAST('{{ $("Preparar Params").first().json.fecha_fin }}'   AS DATE) AS mes_actual_fin,
    DATE_TRUNC('month', DATEADD('month', -1,
      CAST('{{ $("Preparar Params").first().json.fecha_inicio }}' AS DATE)
    )) AS mes_prev_inicio,
    DATEADD('day', -1,
      CAST('{{ $("Preparar Params").first().json.fecha_inicio }}' AS DATE)
    ) AS mes_prev_fin,
    DATE_TRUNC('month', DATEADD('month', -3,
      CAST('{{ $("Preparar Params").first().json.fecha_inicio }}' AS DATE)
    )) AS historico_inicio
),

checks_actual AS (
  SELECT
    c.CHECK_ID,
    c.CLIENT_ID,
    c.COUNTRY,
    c.TYPE,
    c.STATUS,
    CASE
      WHEN c.SCORE <= 1 THEN c.SCORE * 10
      ELSE c.SCORE
    END AS SCORE,
    c.LABELS,
    CAST(c.CREATION_DATE AS DATE) AS fecha_check
  FROM TRUORA.TRUORA_SCHEMA.CHECKS_CHECKS c
  CROSS JOIN params p
  WHERE c.CLIENT_ID = '{{ $("Preparar Params").first().json.CLIENT_ID }}'
    AND CAST(c.CREATION_DATE AS DATE) >= p.mes_actual_inicio
    AND CAST(c.CREATION_DATE AS DATE) <= p.mes_actual_fin
    AND (c.DELETED IS NULL OR c.DELETED = FALSE)
    AND (
      '{{ $("Preparar Params").first().json.custom_types }}' = 'ALL'
      OR ARRAY_CONTAINS(
           c.TYPE::VARIANT,
           PARSE_JSON('{{ $("Preparar Params").first().json.custom_types }}')
         )
    )
),

checks_prev AS (
  SELECT
    c.CHECK_ID,
    c.STATUS,
    c.COUNTRY,
    c.TYPE,
    CASE
      WHEN c.SCORE <= 1 THEN c.SCORE * 10
      ELSE c.SCORE
    END AS SCORE
  FROM TRUORA.TRUORA_SCHEMA.CHECKS_CHECKS c
  CROSS JOIN params p
  WHERE c.CLIENT_ID = '{{ $("Preparar Params").first().json.CLIENT_ID }}'
    AND CAST(c.CREATION_DATE AS DATE) >= p.mes_prev_inicio
    AND CAST(c.CREATION_DATE AS DATE) <= p.mes_prev_fin
    AND (c.DELETED IS NULL OR c.DELETED = FALSE)
    AND (
      '{{ $("Preparar Params").first().json.custom_types }}' = 'ALL'
      OR ARRAY_CONTAINS(
           c.TYPE::VARIANT,
           PARSE_JSON('{{ $("Preparar Params").first().json.custom_types }}')
         )
    )
),

checks_historico AS (
  SELECT
    DATE_TRUNC('month', CAST(c.CREATION_DATE AS DATE)) AS mes,
    COUNT(c.CHECK_ID)                                        AS total_checks,
    COUNT(CASE WHEN c.STATUS = 'completed' THEN 1 END)       AS checks_completados,
    COUNT(CASE WHEN c.STATUS = 'error'     THEN 1 END)       AS checks_error,
    ROUND(AVG(
      CASE
        WHEN c.STATUS = 'completed' THEN
          CASE WHEN c.SCORE <= 1 THEN c.SCORE * 10 ELSE c.SCORE END
        ELSE NULL
      END
    ), 2) AS score_promedio,
    ROUND(
      COUNT(CASE
        WHEN c.STATUS = 'completed'
         AND (CASE WHEN c.SCORE <= 1 THEN c.SCORE * 10 ELSE c.SCORE END) > 6
        THEN 1 END) * 100.0
      / NULLIF(COUNT(CASE WHEN c.STATUS = 'completed' THEN 1 END), 0)
    , 1) AS pass_rate_pct
  FROM TRUORA.TRUORA_SCHEMA.CHECKS_CHECKS c
  CROSS JOIN params p
  WHERE c.CLIENT_ID = '{{ $("Preparar Params").first().json.CLIENT_ID }}'
    AND CAST(c.CREATION_DATE AS DATE) >= p.historico_inicio
    AND CAST(c.CREATION_DATE AS DATE) <= p.mes_actual_fin
    AND (c.DELETED IS NULL OR c.DELETED = FALSE)
    AND (
      '{{ $("Preparar Params").first().json.custom_types }}' = 'ALL'
      OR ARRAY_CONTAINS(
           c.TYPE::VARIANT,
           PARSE_JSON('{{ $("Preparar Params").first().json.custom_types }}')
         )
    )
  GROUP BY mes
),

labels_flat AS (
  SELECT
    ca.CHECK_ID,
    ca.COUNTRY,
    ca.SCORE,
    TRIM(TRIM(f.value::VARCHAR, '"')) AS label
  FROM checks_actual ca,
    LATERAL FLATTEN(input => TRY_PARSE_JSON(ca.LABELS)) f
  WHERE ca.LABELS IS NOT NULL
    AND ca.LABELS != ''
    AND ca.LABELS != '[]'
    AND ca.STATUS = 'completed'
),

metricas_actual AS (
  SELECT
    COUNT(ca.CHECK_ID)                                       AS total_checks,
    COUNT(CASE WHEN ca.STATUS = 'completed' THEN 1 END)      AS checks_completados,
    COUNT(CASE WHEN ca.STATUS = 'error'     THEN 1 END)      AS checks_error,
    ROUND(AVG(CASE WHEN ca.STATUS = 'completed' THEN ca.SCORE END), 2) AS score_promedio,
    ROUND(
      COUNT(CASE WHEN ca.STATUS = 'completed' AND ca.SCORE > 6 THEN 1 END) * 100.0
      / NULLIF(COUNT(CASE WHEN ca.STATUS = 'completed' THEN 1 END), 0)
    , 1) AS pass_rate_pct,
    ROUND(
      COUNT(CASE WHEN ca.STATUS = 'completed' AND ca.SCORE <= 6 THEN 1 END) * 100.0
      / NULLIF(COUNT(CASE WHEN ca.STATUS = 'completed' THEN 1 END), 0)
    , 1) AS rejection_rate_pct
  FROM checks_actual ca
),

metricas_prev AS (
  SELECT
    COUNT(cp.CHECK_ID)                                       AS total_checks,
    COUNT(CASE WHEN cp.STATUS = 'completed' THEN 1 END)      AS checks_completados,
    ROUND(AVG(CASE WHEN cp.STATUS = 'completed' THEN cp.SCORE END), 2) AS score_promedio,
    ROUND(
      COUNT(CASE WHEN cp.STATUS = 'completed' AND cp.SCORE > 6 THEN 1 END) * 100.0
      / NULLIF(COUNT(CASE WHEN cp.STATUS = 'completed' THEN 1 END), 0)
    , 1) AS pass_rate_pct
  FROM checks_prev cp
),

bloque1 AS (
  SELECT
    '1_resumen_general' AS bloque,
    p.mes_actual_inicio AS periodo,
    ma.total_checks,
    ma.checks_completados,
    ma.checks_error,
    ma.score_promedio,
    ma.pass_rate_pct,
    ma.rejection_rate_pct,
    mp.total_checks                 AS total_checks_prev,
    mp.checks_completados           AS checks_completados_prev,
    mp.score_promedio               AS score_promedio_prev,
    mp.pass_rate_pct                AS pass_rate_pct_prev,
    ROUND((ma.total_checks - mp.total_checks) * 100.0 / NULLIF(mp.total_checks, 0), 1) AS variacion_checks_pct,
    ROUND(ma.score_promedio - mp.score_promedio, 2)          AS variacion_score,
    ROUND(ma.pass_rate_pct - mp.pass_rate_pct, 1)            AS variacion_pass_rate_pp,
    CASE WHEN ma.total_checks > mp.total_checks THEN 'UP'
         WHEN ma.total_checks < mp.total_checks THEN 'DOWN' ELSE 'FLAT' END AS direccion_volumen,
    CASE WHEN ma.score_promedio > mp.score_promedio THEN 'UP'
         WHEN ma.score_promedio < mp.score_promedio THEN 'DOWN' ELSE 'FLAT' END AS direccion_score,
    CASE WHEN ma.pass_rate_pct > mp.pass_rate_pct THEN 'UP'
         WHEN ma.pass_rate_pct < mp.pass_rate_pct THEN 'DOWN' ELSE 'FLAT' END AS direccion_pass_rate
  FROM params p
  CROSS JOIN metricas_actual ma
  CROSS JOIN metricas_prev mp
),

bloque2 AS (
  SELECT
    '2_por_pais' AS bloque,
    p.mes_actual_inicio AS periodo,
    ca.COUNTRY,
    COUNT(ca.CHECK_ID)                                       AS total_checks,
    COUNT(CASE WHEN ca.STATUS = 'completed' THEN 1 END)      AS checks_completados,
    COUNT(CASE WHEN ca.STATUS = 'error'     THEN 1 END)      AS checks_error,
    ROUND(AVG(CASE WHEN ca.STATUS = 'completed' THEN ca.SCORE END), 2) AS score_promedio,
    ROUND(
      COUNT(CASE WHEN ca.STATUS = 'completed' AND ca.SCORE > 6 THEN 1 END) * 100.0
      / NULLIF(COUNT(CASE WHEN ca.STATUS = 'completed' THEN 1 END), 0)
    , 1) AS pass_rate_pct,
    ROUND(
      COUNT(CASE WHEN ca.STATUS = 'completed' AND ca.SCORE <= 6 THEN 1 END) * 100.0
      / NULLIF(COUNT(CASE WHEN ca.STATUS = 'completed' THEN 1 END), 0)
    , 1) AS rejection_rate_pct,
    ROUND(
      COUNT(ca.CHECK_ID) * 100.0
      / NULLIF(SUM(COUNT(ca.CHECK_ID)) OVER (PARTITION BY p.mes_actual_inicio), 0)
    , 1) AS pct_sobre_total
  FROM params p
  LEFT JOIN checks_actual ca ON 1=1
  WHERE ca.COUNTRY IS NOT NULL
  GROUP BY p.mes_actual_inicio, ca.COUNTRY
  ORDER BY total_checks DESC
),

bloque2b AS (
  SELECT
    '2b_pais_x_tipo' AS bloque,
    p.mes_actual_inicio AS periodo,
    ca.COUNTRY,
    ca.TYPE,
    COUNT(ca.CHECK_ID)                                       AS total_checks,
    COUNT(CASE WHEN ca.STATUS = 'completed' THEN 1 END)      AS checks_completados,
    COUNT(CASE WHEN ca.STATUS = 'error'     THEN 1 END)      AS checks_error,
    ROUND(AVG(CASE WHEN ca.STATUS = 'completed' THEN ca.SCORE END), 2) AS score_promedio,
    ROUND(
      COUNT(CASE WHEN ca.STATUS = 'completed' AND ca.SCORE > 6 THEN 1 END) * 100.0
      / NULLIF(COUNT(CASE WHEN ca.STATUS = 'completed' THEN 1 END), 0)
    , 1) AS pass_rate_pct,
    ROUND(
      COUNT(CASE WHEN ca.STATUS = 'completed' AND ca.SCORE <= 6 THEN 1 END) * 100.0
      / NULLIF(COUNT(CASE WHEN ca.STATUS = 'completed' THEN 1 END), 0)
    , 1) AS rejection_rate_pct,
    ROUND(
      COUNT(ca.CHECK_ID) * 100.0
      / NULLIF(SUM(COUNT(ca.CHECK_ID)) OVER (PARTITION BY ca.COUNTRY), 0)
    , 1) AS pct_sobre_pais,
    ROUND(
      COUNT(ca.CHECK_ID) * 100.0
      / NULLIF(SUM(COUNT(ca.CHECK_ID)) OVER (PARTITION BY p.mes_actual_inicio), 0)
    , 1) AS pct_sobre_total
  FROM params p
  LEFT JOIN checks_actual ca ON 1=1
  WHERE ca.COUNTRY IS NOT NULL AND ca.TYPE IS NOT NULL
  GROUP BY p.mes_actual_inicio, ca.COUNTRY, ca.TYPE
  ORDER BY ca.COUNTRY, total_checks DESC
),

bloque3 AS (
  SELECT
    '3_por_tipo' AS bloque,
    p.mes_actual_inicio AS periodo,
    ca.TYPE,
    COUNT(ca.CHECK_ID)                                       AS total_checks,
    COUNT(CASE WHEN ca.STATUS = 'completed' THEN 1 END)      AS checks_completados,
    ROUND(AVG(CASE WHEN ca.STATUS = 'completed' THEN ca.SCORE END), 2) AS score_promedio,
    ROUND(
      COUNT(CASE WHEN ca.STATUS = 'completed' AND ca.SCORE > 6 THEN 1 END) * 100.0
      / NULLIF(COUNT(CASE WHEN ca.STATUS = 'completed' THEN 1 END), 0)
    , 1) AS pass_rate_pct,
    ROUND(
      COUNT(ca.CHECK_ID) * 100.0
      / NULLIF(SUM(COUNT(ca.CHECK_ID)) OVER (PARTITION BY p.mes_actual_inicio), 0)
    , 1) AS pct_sobre_total
  FROM params p
  LEFT JOIN checks_actual ca ON 1=1
  WHERE ca.TYPE IS NOT NULL
  GROUP BY p.mes_actual_inicio, ca.TYPE
  ORDER BY total_checks DESC
),

bloque4 AS (
  SELECT
    '4_score_por_pais' AS bloque,
    p.mes_actual_inicio AS periodo,
    ca.COUNTRY,
    CAST(ca.SCORE AS INT)                                    AS score_value,
    COUNT(ca.CHECK_ID)                                       AS total_checks,
    ROUND(
      COUNT(ca.CHECK_ID) * 100.0
      / NULLIF(SUM(COUNT(ca.CHECK_ID)) OVER (PARTITION BY ca.COUNTRY), 0)
    , 2) AS pct_dentro_pais,
    ROUND(
      COUNT(ca.CHECK_ID) * 100.0
      / NULLIF(SUM(COUNT(ca.CHECK_ID)) OVER (PARTITION BY p.mes_actual_inicio), 0)
    , 2) AS pct_sobre_total,
    CASE WHEN CAST(ca.SCORE AS INT) <= 6 THEN 1 ELSE 0 END   AS es_rechazo
  FROM params p
  LEFT JOIN checks_actual ca ON 1=1
  WHERE ca.STATUS = 'completed'
    AND ca.COUNTRY IS NOT NULL
    AND ca.SCORE IS NOT NULL
  GROUP BY p.mes_actual_inicio, ca.COUNTRY, CAST(ca.SCORE AS INT)
  ORDER BY ca.COUNTRY, score_value
),

bloque5 AS (
  SELECT
    '5_labels' AS bloque,
    p.mes_actual_inicio AS periodo,
    lf.label,
    lf.COUNTRY,
    COUNT(DISTINCT lf.CHECK_ID)                              AS total_checks,
    ROUND(
      COUNT(DISTINCT lf.CHECK_ID) * 100.0
      / NULLIF(SUM(COUNT(DISTINCT lf.CHECK_ID)) OVER (PARTITION BY p.mes_actual_inicio), 0)
    , 2) AS pct_sobre_labeled,
    ROUND(
      COUNT(DISTINCT lf.CHECK_ID) * 100.0
      / NULLIF((SELECT COUNT(*) FROM checks_actual WHERE STATUS = 'completed'), 0)
    , 2) AS pct_sobre_total_checks
  FROM params p
  LEFT JOIN labels_flat lf ON 1=1
  WHERE lf.label IS NOT NULL AND lf.label != ''
  GROUP BY p.mes_actual_inicio, lf.label, lf.COUNTRY
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY p.mes_actual_inicio
    ORDER BY COUNT(DISTINCT lf.CHECK_ID) DESC
  ) <= 15
  ORDER BY total_checks DESC
),

bloque6 AS (
  SELECT
    '6_labels_high_score' AS bloque,
    p.mes_actual_inicio AS periodo,
    lf.label,
    lf.COUNTRY,
    CAST(lf.SCORE AS INT)                                    AS score_value,
    COUNT(DISTINCT lf.CHECK_ID)                              AS total_checks,
    CASE
      WHEN lf.label ILIKE '%High%' AND lf.SCORE > 6 THEN 1
      ELSE 0
    END AS es_anomalia
  FROM params p
  LEFT JOIN labels_flat lf ON 1=1
  WHERE lf.label ILIKE '%High%'
    AND lf.label IS NOT NULL AND lf.label != ''
  GROUP BY p.mes_actual_inicio, lf.label, lf.COUNTRY, CAST(lf.SCORE AS INT), lf.SCORE
  ORDER BY lf.COUNTRY, lf.label, score_value
),

-- 6b_label_rates → pass/rejection rate por LÓGICA DE LABEL (distinto del score).
-- Rejection = checks DISTINTOS con >= 1 label High / total completados; Pass = resto.
-- DISTINCT obligatorio: un check con High en varios países/categorías aparece N veces
-- en labels_flat (LATERAL FLATTEN) — sumar inflaría. Denominador billable (excluye
-- document-validation/validation) para auto-consistencia. Validado Indrive mayo:
-- 489 / 109.708 = 0,45% rejection / 99,55% pass.
bloque6b AS (
  SELECT
    '6b_label_rates'    AS bloque,
    p.mes_actual_inicio AS periodo,
    (
      SELECT COUNT(DISTINCT ca.CHECK_ID)
      FROM checks_actual ca,
        LATERAL FLATTEN(input => TRY_PARSE_JSON(ca.LABELS)) f
      WHERE ca.STATUS = 'completed'
        AND LOWER(ca.TYPE) NOT IN ('document-validation', 'validation')
        AND ca.LABELS IS NOT NULL AND ca.LABELS != '' AND ca.LABELS != '[]'
        AND f.value::STRING ILIKE '%High%'
    )                   AS checks_con_high,
    (
      SELECT COUNT(DISTINCT ca.CHECK_ID)
      FROM checks_actual ca
      WHERE ca.STATUS = 'completed'
        AND LOWER(ca.TYPE) NOT IN ('document-validation', 'validation')
    )                   AS total_completados
  FROM params p
),

bloque7 AS (
  SELECT
    '7_historico_3meses' AS bloque,
    ch.mes AS periodo,
    ch.total_checks,
    ch.checks_completados,
    ch.checks_error,
    ch.score_promedio,
    ch.pass_rate_pct,
    ROUND(ch.checks_completados * 100.0 / NULLIF(ch.total_checks, 0), 1) AS tasa_completado_pct
  FROM checks_historico ch
  ORDER BY ch.mes ASC
)

SELECT bloque, periodo,
  col1, col2, col3, col4, col5,
  col6, col7, col8, col9, col10, col11,
  col_extra1, col_extra2, col_extra3, col_extra4
FROM (

  SELECT bloque, periodo,
    CAST(total_checks AS VARCHAR)            AS col1,
    CAST(checks_completados AS VARCHAR)      AS col2,
    CAST(checks_error AS VARCHAR)            AS col3,
    CAST(score_promedio AS VARCHAR)          AS col4,
    CAST(pass_rate_pct AS VARCHAR)           AS col5,
    CAST(rejection_rate_pct AS VARCHAR)      AS col6,
    CAST(total_checks_prev AS VARCHAR)       AS col7,
    CAST(checks_completados_prev AS VARCHAR) AS col8,
    CAST(score_promedio_prev AS VARCHAR)     AS col9,
    CAST(pass_rate_pct_prev AS VARCHAR)      AS col10,
    CAST(variacion_checks_pct AS VARCHAR)    AS col11,
    CAST(variacion_score AS VARCHAR)         AS col_extra1,
    CAST(variacion_pass_rate_pp AS VARCHAR)  AS col_extra2,
    direccion_volumen                        AS col_extra3,
    direccion_score                          AS col_extra4
  FROM bloque1

  UNION ALL

  SELECT bloque, periodo,
    COUNTRY                               AS col1,
    CAST(total_checks AS VARCHAR)         AS col2,
    CAST(checks_completados AS VARCHAR)   AS col3,
    CAST(checks_error AS VARCHAR)         AS col4,
    CAST(score_promedio AS VARCHAR)       AS col5,
    CAST(pass_rate_pct AS VARCHAR)        AS col6,
    CAST(rejection_rate_pct AS VARCHAR)   AS col7,
    CAST(pct_sobre_total AS VARCHAR)      AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque2

  UNION ALL

  SELECT bloque, periodo,
    COUNTRY AS col1, TYPE AS col2,
    CAST(total_checks AS VARCHAR)         AS col3,
    CAST(checks_completados AS VARCHAR)   AS col4,
    CAST(checks_error AS VARCHAR)         AS col5,
    CAST(score_promedio AS VARCHAR)       AS col6,
    CAST(pass_rate_pct AS VARCHAR)        AS col7,
    CAST(rejection_rate_pct AS VARCHAR)   AS col8,
    CAST(pct_sobre_pais AS VARCHAR)       AS col9,
    CAST(pct_sobre_total AS VARCHAR)      AS col10,
    NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque2b

  UNION ALL

  SELECT bloque, periodo,
    TYPE                                  AS col1,
    CAST(total_checks AS VARCHAR)         AS col2,
    CAST(checks_completados AS VARCHAR)   AS col3,
    CAST(score_promedio AS VARCHAR)       AS col4,
    CAST(pass_rate_pct AS VARCHAR)        AS col5,
    CAST(pct_sobre_total AS VARCHAR)      AS col6,
    NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque3

  UNION ALL

  SELECT bloque, periodo,
    COUNTRY                               AS col1,
    CAST(score_value AS VARCHAR)          AS col2,
    CAST(total_checks AS VARCHAR)         AS col3,
    CAST(pct_dentro_pais AS VARCHAR)      AS col4,
    CAST(pct_sobre_total AS VARCHAR)      AS col5,
    CAST(es_rechazo AS VARCHAR)           AS col6,
    NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque4

  UNION ALL

  SELECT bloque, periodo,
    label AS col1, COUNTRY AS col2,
    CAST(total_checks AS VARCHAR)         AS col3,
    CAST(pct_sobre_labeled AS VARCHAR)    AS col4,
    CAST(pct_sobre_total_checks AS VARCHAR) AS col5,
    NULL AS col6, NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque5

  UNION ALL

  SELECT bloque, periodo,
    label AS col1, COUNTRY AS col2,
    CAST(score_value AS VARCHAR)          AS col3,
    CAST(total_checks AS VARCHAR)         AS col4,
    CAST(es_anomalia AS VARCHAR)          AS col5,
    NULL AS col6, NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque6

  UNION ALL

  SELECT bloque, periodo,
    CAST(checks_con_high AS VARCHAR)      AS col1,
    CAST(total_completados AS VARCHAR)    AS col2,
    CAST(ROUND(100.0 * checks_con_high / NULLIF(total_completados, 0), 2) AS VARCHAR)         AS col3,
    CAST(ROUND(100.0 - 100.0 * checks_con_high / NULLIF(total_completados, 0), 2) AS VARCHAR) AS col4,
    NULL AS col5, NULL AS col6, NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque6b

  UNION ALL

  SELECT bloque, periodo,
    CAST(total_checks AS VARCHAR)         AS col1,
    CAST(checks_completados AS VARCHAR)   AS col2,
    CAST(checks_error AS VARCHAR)         AS col3,
    CAST(score_promedio AS VARCHAR)       AS col4,
    CAST(pass_rate_pct AS VARCHAR)        AS col5,
    CAST(tasa_completado_pct AS VARCHAR)  AS col6,
    NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque7

)
ORDER BY bloque, periodo;
