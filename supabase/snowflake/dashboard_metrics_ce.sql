-- Dashboard /dashboard — CE (Customer Engagement)
--
-- Query per-cliente, rango arbitrario. Devuelve 3 bloques en formato
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
--   1_consumo_total      : totales del rango (inbound, outbound, notif, total) + comparativo prev
--   3_fallos_outbound    : top 5 categorias de fallo outbound (categorias normalizadas)
--   5c_tendencia_mensual : una fila por mes en [FECHA_INICIO..FECHA_FIN]
--                          (inbound + outbound + notif por mes)
--
-- Reglas criticas (ver memoria data_reconciliation_findings + skill snowflake-queries):
--   * SENT_OUTBOUND_MESSAGES.STATUS solo toma 'success' / 'failure' (NO los
--     valores de CH como 'sent','delivered','read','failed'). Para counters
--     de consumo total: WHERE STATUS='success'. Para fallos: WHERE STATUS='failure'.
--     Sin filtro = mezcla y se infla ~22-27%.
--   * OUTBOUND_IS_NOTIFICATION castea a VARCHAR; usar
--     LOWER(CAST(... AS VARCHAR)) = 'true'/'false'. NUNCA 'TRUE'/'FALSE'.
--   * Filtro base outbound: TRUORA_FLOW_ID != 'empty' OR notification=true.
--     (Las notificaciones tienen flow_id='empty' por construccion.)
--   * Inbounds desde CONVERSATIONS_STEPS WHERE TRIGGER_CHANNEL_TYPE='inbound'
--     con COUNT(DISTINCT PROCESS_ID). NO usar VW_INTERNAL_AGENT_TICKET_SUMMARY
--     (solo tiene conversaciones que escalaron a agente — sub-cuenta inbound).
--   * Tendencia mensual: replica el mismo patron — STATUS='success' en outbound,
--     CONVERSATIONS_STEPS para inbound.

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

-- Outbound + notificaciones del periodo actual con STATUS='success'
outbound_success_actual AS (
  SELECT
    s.message_id,
    s.outbound_is_notification,
    s.failure_reason,
    s.creation_date,
    DATE_TRUNC('month', CONVERT_TIMEZONE('UTC','America/Bogota', s.creation_date))::DATE AS mes_local,
    LOWER(CAST(s.outbound_is_notification AS VARCHAR)) = 'true' AS is_notif
  FROM TRUORA.TRUORA_SCHEMA.SENT_OUTBOUND_MESSAGES s
  CROSS JOIN periodos pe
  WHERE s.client_id = pe.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', s.creation_date)::DATE
        BETWEEN pe.fecha_inicio AND pe.fecha_fin
    AND s.status = 'success'
    AND (s.truora_flow_id != 'empty'
         OR LOWER(CAST(s.outbound_is_notification AS VARCHAR)) = 'true')
),
outbound_success_prev AS (
  SELECT
    s.message_id,
    LOWER(CAST(s.outbound_is_notification AS VARCHAR)) = 'true' AS is_notif
  FROM TRUORA.TRUORA_SCHEMA.SENT_OUTBOUND_MESSAGES s
  CROSS JOIN periodos pe
  WHERE s.client_id = pe.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', s.creation_date)::DATE
        BETWEEN pe.prev_inicio AND pe.prev_fin
    AND s.status = 'success'
    AND (s.truora_flow_id != 'empty'
         OR LOWER(CAST(s.outbound_is_notification AS VARCHAR)) = 'true')
),
-- Outbound TODOS (success + failure) para Bloque 3 (categorias de fallo)
outbound_all_actual AS (
  SELECT
    s.message_id,
    s.status,
    s.failure_reason
  FROM TRUORA.TRUORA_SCHEMA.SENT_OUTBOUND_MESSAGES s
  CROSS JOIN periodos pe
  WHERE s.client_id = pe.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', s.creation_date)::DATE
        BETWEEN pe.fecha_inicio AND pe.fecha_fin
    AND LOWER(CAST(s.outbound_is_notification AS VARCHAR)) = 'false'
    AND s.truora_flow_id != 'empty'
),

-- Inbounds desde CONVERSATIONS_STEPS (no de la vista de agente)
inbound_actual AS (
  SELECT
    cs.process_id,
    DATE_TRUNC('month', CONVERT_TIMEZONE('UTC','America/Bogota', cs.creation_date))::DATE AS mes_local
  FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS cs
  CROSS JOIN periodos pe
  WHERE cs.client_id = pe.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', cs.creation_date)::DATE
        BETWEEN pe.fecha_inicio AND pe.fecha_fin
    AND cs.trigger_channel_type = 'inbound'
),
inbound_prev AS (
  SELECT
    cs.process_id
  FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS cs
  CROSS JOIN periodos pe
  WHERE cs.client_id = pe.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', cs.creation_date)::DATE
        BETWEEN pe.prev_inicio AND pe.prev_fin
    AND cs.trigger_channel_type = 'inbound'
),

-- Bloque 1: consumo total del rango
bloque1 AS (
  SELECT
    '1_consumo_total'                                                    AS bloque,
    pe.fecha_inicio                                                      AS periodo,
    -- Actual
    (SELECT COUNT(DISTINCT process_id) FROM inbound_actual)::VARCHAR     AS col1,  -- total_inbounds
    (SELECT COUNT(DISTINCT message_id) FROM outbound_success_actual
       WHERE is_notif = FALSE)::VARCHAR                                  AS col2,  -- recipients_outbound
    (SELECT COUNT(DISTINCT message_id) FROM outbound_success_actual
       WHERE is_notif = TRUE)::VARCHAR                                   AS col3,  -- recipients_notificacion
    (
      (SELECT COUNT(DISTINCT process_id) FROM inbound_actual) +
      (SELECT COUNT(DISTINCT message_id) FROM outbound_success_actual)
    )::VARCHAR                                                           AS col4,  -- total_conversaciones (inb + outb + notif)
    -- Prev
    (SELECT COUNT(DISTINCT process_id) FROM inbound_prev)::VARCHAR       AS col5,  -- total_inbounds prev
    (SELECT COUNT(DISTINCT message_id) FROM outbound_success_prev
       WHERE is_notif = FALSE)::VARCHAR                                  AS col6,  -- outbound prev
    (SELECT COUNT(DISTINCT message_id) FROM outbound_success_prev
       WHERE is_notif = TRUE)::VARCHAR                                   AS col7,  -- notif prev
    (
      (SELECT COUNT(DISTINCT process_id) FROM inbound_prev) +
      (SELECT COUNT(DISTINCT message_id) FROM outbound_success_prev)
    )::VARCHAR                                                           AS col8,  -- total prev
    -- Variaciones %
    ROUND(
      (
        ((SELECT COUNT(DISTINCT process_id) FROM inbound_actual) +
         (SELECT COUNT(DISTINCT message_id) FROM outbound_success_actual))
        -
        ((SELECT COUNT(DISTINCT process_id) FROM inbound_prev) +
         (SELECT COUNT(DISTINCT message_id) FROM outbound_success_prev))
      )::FLOAT
      / NULLIF(
        (SELECT COUNT(DISTINCT process_id) FROM inbound_prev) +
        (SELECT COUNT(DISTINCT message_id) FROM outbound_success_prev), 0
      ) * 100, 1
    )::VARCHAR                                                           AS col9,  -- variacion_total_pct
    ROUND(
      ((SELECT COUNT(DISTINCT message_id) FROM outbound_success_actual WHERE is_notif=FALSE)
       - (SELECT COUNT(DISTINCT message_id) FROM outbound_success_prev WHERE is_notif=FALSE))::FLOAT
      / NULLIF((SELECT COUNT(DISTINCT message_id) FROM outbound_success_prev WHERE is_notif=FALSE), 0) * 100, 1
    )::VARCHAR                                                           AS col10, -- variacion_outbound_pct
    ROUND(
      ((SELECT COUNT(DISTINCT process_id) FROM inbound_actual)
       - (SELECT COUNT(DISTINCT process_id) FROM inbound_prev))::FLOAT
      / NULLIF((SELECT COUNT(DISTINCT process_id) FROM inbound_prev), 0) * 100, 1
    )::VARCHAR                                                           AS col11, -- variacion_inbound_pct
    NULL::VARCHAR AS col_extra1, NULL::VARCHAR AS col_extra2,
    NULL::VARCHAR AS col_extra3, NULL::VARCHAR AS col_extra4
  FROM periodos pe
),

-- Bloque 3: top 5 categorias de fallo outbound
fallos AS (
  SELECT
    CASE
      WHEN failure_reason ILIKE '%undeliverable%'            THEN 'Message Undeliverable'
      WHEN failure_reason ILIKE '%healthy ecosystem%'        THEN 'Healthy ecosystem engagement'
      WHEN failure_reason ILIKE '%experiment%'               THEN 'User is part of an experiment'
      WHEN failure_reason ILIKE '%stop receiving marketing%' THEN 'Usuario bloqueo marketing'
      WHEN failure_reason ILIKE '%spam%'                     THEN 'Limite spam'
      WHEN failure_reason ILIKE '%locked%'                   THEN 'Cuenta bloqueada'
      WHEN failure_reason ILIKE '%does not exist%'           THEN 'Template/objeto invalido'
      WHEN failure_reason ILIKE '%invalid%'                  THEN 'Numero invalido'
      WHEN failure_reason IS NULL                            THEN 'Sin razon registrada'
      ELSE 'Other'
    END                                                AS categoria_fallo,
    COUNT(*) AS total_fallos
  FROM outbound_all_actual
  WHERE status = 'failure'
  GROUP BY categoria_fallo
  QUALIFY ROW_NUMBER() OVER (ORDER BY total_fallos DESC) <= 5
),
-- Totales para porcentajes del bloque 3
totales_outbound AS (
  SELECT
    COUNT(*)                                                 AS total_outbound,
    COUNT(CASE WHEN status='failure' THEN 1 END)             AS total_fallidos,
    COUNT(CASE WHEN status='success' THEN 1 END)             AS total_exitosos
  FROM outbound_all_actual
),
bloque3 AS (
  SELECT
    '3_fallos_outbound'                                                  AS bloque,
    pe.fecha_inicio                                                      AS periodo,
    f.categoria_fallo::VARCHAR                                           AS col1,
    f.total_fallos::VARCHAR                                              AS col2,
    ROUND(f.total_fallos::FLOAT / NULLIF(t.total_fallidos, 0) * 100, 1)::VARCHAR AS col3, -- pct_dentro_de_fallos
    t.total_outbound::VARCHAR                                            AS col4,
    t.total_exitosos::VARCHAR                                            AS col5,
    t.total_fallidos::VARCHAR                                            AS col6,
    ROUND(t.total_exitosos::FLOAT / NULLIF(t.total_outbound, 0) * 100, 1)::VARCHAR AS col7, -- pct_exito
    NULL::VARCHAR AS col8, NULL::VARCHAR AS col9, NULL::VARCHAR AS col10,
    NULL::VARCHAR AS col11,
    NULL::VARCHAR AS col_extra1, NULL::VARCHAR AS col_extra2,
    NULL::VARCHAR AS col_extra3, NULL::VARCHAR AS col_extra4
  FROM fallos f
  CROSS JOIN totales_outbound t
  CROSS JOIN periodos pe
),

-- Bloque 5c: tendencia mensual (inbound + outbound + notif por mes)
hist_outb AS (
  SELECT
    mes_local,
    COUNT(DISTINCT CASE WHEN is_notif = FALSE THEN message_id END) AS outbound,
    COUNT(DISTINCT CASE WHEN is_notif = TRUE  THEN message_id END) AS notif
  FROM outbound_success_actual
  GROUP BY mes_local
),
hist_inb AS (
  SELECT
    mes_local,
    COUNT(DISTINCT process_id) AS inbound
  FROM inbound_actual
  GROUP BY mes_local
),
-- meses presentes en cualquiera de los dos (full outer join)
hist_meses AS (
  SELECT mes_local FROM hist_outb
  UNION
  SELECT mes_local FROM hist_inb
),
hist_mensual AS (
  SELECT
    m.mes_local,
    COALESCE(i.inbound, 0)  AS inbound,
    COALESCE(o.outbound, 0) AS outbound,
    COALESCE(o.notif, 0)    AS notif,
    COALESCE(i.inbound, 0) + COALESCE(o.outbound, 0) + COALESCE(o.notif, 0) AS total_mes
  FROM hist_meses m
  LEFT JOIN hist_outb o ON o.mes_local = m.mes_local
  LEFT JOIN hist_inb  i ON i.mes_local = m.mes_local
),
bloque5c AS (
  SELECT
    '5c_tendencia_mensual'                                      AS bloque,
    mes_local                                                   AS periodo,
    inbound::VARCHAR                                            AS col1,
    outbound::VARCHAR                                           AS col2,
    notif::VARCHAR                                              AS col3,
    total_mes::VARCHAR                                          AS col4,
    NULL::VARCHAR AS col5, NULL::VARCHAR AS col6, NULL::VARCHAR AS col7,
    NULL::VARCHAR AS col8, NULL::VARCHAR AS col9, NULL::VARCHAR AS col10,
    NULL::VARCHAR AS col11,
    NULL::VARCHAR AS col_extra1, NULL::VARCHAR AS col_extra2,
    NULL::VARCHAR AS col_extra3, NULL::VARCHAR AS col_extra4
  FROM hist_mensual
)

SELECT * FROM bloque1
UNION ALL SELECT * FROM bloque3
UNION ALL SELECT * FROM bloque5c
ORDER BY bloque, periodo;
