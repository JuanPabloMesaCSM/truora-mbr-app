-- ============================================================
-- REPORT BUILDER CE GLOBAL — Query Snowflake productivo
-- Workflow n8n: "Report Builder CE"
-- Snapshot guardado: 2026-05-19 PM (incluye Pauta Meta + distincion global/filtered)
-- ============================================================
-- Bloques que retorna:
--   1_consumo_total          → outbound + notif + inbound + conversaciones + prev + variaciones + direcciones (UP/DOWN/FLAT)
--   2_eficiencia_campanas    → 2 variantes UNION-ed: tipo='GLOBAL' (1 fila agregada) + tipo='TOP5' (5 filas top campanias por interaction_rate)
--   3_fallos_outbound        → top 5 categorias de fallo + tasa de exito general
--   5_flujo_inbound          → Ce4: conversaciones_recibidas, conv_con_agente, conv_exitosas, pct_pauta_meta + comparativo
--   6_agentes_general        → Ce5: total_conversaciones, agentes_activos, conv_atendidas/cerradas/sin_asignar, medianas + comparativo
--   7_agentes_top5           → Ce6: top 5 agentes por volumen, pct_cerradas vs ATENDIDAS (definicion CSM)
--   5b_consumo_por_linea     → Ce12: consumo por WABA_PHONE_NUMBER (outbound + notif + total + %)
--   5c_tendencia_mensual     → Ce13: 6 meses de outbound + notif + inbound (alineado con Ce1, status='success')
--   5d_heatmap_lineas        → Ce14: heatmap WABA x mes_actual/prev/anteprev con flag NEW/STOPPED/ACTIVE
--
-- Parametros n8n:
--   $('Preparar Contexto').json.CLIENT_ID
--   $('Preparar Contexto').json.fecha_inicio
--   $('Preparar Contexto').json.fecha_fin
--   $('Preparar Contexto').json.INBOUND_FLOW_FILTER     (string SQL, '' o "AND FLOW_ID IN ('x','y')")
--   $('Preparar Contexto').json.INBOUND_WABA_FILTER     (string SQL, '' o "AND WABA_PHONE_NUMBER IN (...)")
--   $('Preparar Contexto').json.AGENTES_WABA_FILTER     (string SQL para agentes_actual / prev)
--
-- Reglas criticas:
--   - Outbounds: filtrar (TRUORA_FLOW_ID != 'empty' OR IS_NOTIFICATION=true) para no excluir notifs
--   - OUTBOUND_IS_NOTIFICATION castear a VARCHAR + LOWER (Snowflake retorna 'true'/'false')
--   - Ce1 outbound/notif filtran STATUS='success' (fix 2026-04-29 alinear con manual CSM)
--   - Inbound viene de CONVERSATIONS_STEPS con TRIGGER_CHANNEL_TYPE='inbound' (no de VW_INTERNAL_AGENT_TICKET_SUMMARY)
--   - WS_REFERRAL_SOURCE_URL (CONVERSATIONS_STEPS) identifica pauta Meta (campo nuevo 2026-05)
--   - Distincion global vs filtered en inbound: Ce1 usa global (sin filtros), Ce4 usa filtered (con flow + WABA del CSM)
--   - conv_a_agente = COUNT DISTINCT CONVERSATION_ID (no PROCESS_ID): puede ser > processes si hubo reasignaciones
--   - first_status del primer step define exitoso/fallido (alineado con CSM, no por estados intermedios)
--   - cerrada = CLOSING_ACTOR = OWNER (definicion CSM, no STATUS='closed')
--   - sin_asignar = OWNER IN (NULL, 'unassigned', '__UNASSIGNED__', '-')
--   - Top5 campanias: ORDER BY interaction_rate DESC NULLS LAST (Snowflake ordena NULL DESC por default)
--   - Ce6 top5 pct_cerradas: cerradas/ATENDIDAS (NO total) — definicion CSM en MBR manual
--   - Tendencia mensual (Ce13): mismas reglas que Ce1 (status='success', CONVERSATIONS_STEPS)
--
-- Mapeo COL1..COL_EXTRA4 por bloque: ver skill snowflake-queries.md
-- ============================================================

WITH

params AS (
  SELECT
    CAST('{{ $('Preparar Contexto').first().json.fecha_inicio }}' AS DATE) AS mes_actual_inicio,
    CAST('{{ $('Preparar Contexto').first().json.fecha_fin }}'   AS DATE) AS mes_actual_fin,
    DATE_TRUNC('month', DATEADD('month', -1,
      CAST('{{ $('Preparar Contexto').first().json.fecha_inicio }}' AS DATE)
    )) AS mes_prev_inicio,
    DATEADD('day', -1,
      CAST('{{ $('Preparar Contexto').first().json.fecha_inicio }}' AS DATE)
    ) AS mes_prev_fin,
    DATE_TRUNC('month', DATEADD('month', -3,
      CAST('{{ $('Preparar Contexto').first().json.fecha_inicio }}' AS DATE)
    )) AS historico_inicio
),

outbounds_actual AS (
  SELECT
    s.MESSAGE_ID,
    s.STATUS,
    s.FAILURE_REASON,
    CAST(s.OUTBOUND_IS_NOTIFICATION AS VARCHAR) AS es_notificacion,
    s.OUTBOUND_RESPONSE,
    s.TRUORA_FLOW_ID,
    CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE) AS fecha
  FROM TRUORA.TRUORA_SCHEMA.SENT_OUTBOUND_MESSAGES s
  CROSS JOIN params p
  WHERE s.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE) >= p.mes_actual_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE) <= p.mes_actual_fin
    AND (s.TRUORA_FLOW_ID != 'empty' OR LOWER(CAST(s.OUTBOUND_IS_NOTIFICATION AS VARCHAR)) = 'true')
),

outbounds_prev AS (
  SELECT
    s.MESSAGE_ID,
    s.STATUS,
    s.FAILURE_REASON,
    CAST(s.OUTBOUND_IS_NOTIFICATION AS VARCHAR) AS es_notificacion
  FROM TRUORA.TRUORA_SCHEMA.SENT_OUTBOUND_MESSAGES s
  CROSS JOIN params p
  WHERE s.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE) >= p.mes_prev_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE) <= p.mes_prev_fin
    AND (s.TRUORA_FLOW_ID != 'empty' OR LOWER(CAST(s.OUTBOUND_IS_NOTIFICATION AS VARCHAR)) = 'true')
),

ip_expired AS (
  SELECT
    ip.PROCESS_ID,
    ip.EXPIRED_REASON
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip
  WHERE ip.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND ip.EXPIRED_REASON IN ('user_stopped_responding','agent_stopped_responding')
),

agentes_actual AS (
  SELECT
    a.CONVERSATION_ID,
    a.PROCESS_ID,
    a.FLOW_ID,
    a.WABA_PHONE_NUMBER,
    a.OWNER,
    a.CLOSING_ACTOR,
    a.CONVERSATION_STATUS,
    a.CONVERSATION_DURATION_SEC,
    a.FIRST_AGENT_MESSAGE_DATE,
    a.CONVERSATION_CREATION_DATE,
    CASE
      WHEN a.FIRST_AGENT_MESSAGE_DATE IS NOT NULL
        AND a.CONVERSATION_CREATION_DATE IS NOT NULL
      THEN DATEDIFF('second',
             a.CONVERSATION_CREATION_DATE,
             a.FIRST_AGENT_MESSAGE_DATE) / 60.0
      ELSE NULL
    END AS minutos_primera_respuesta,
    CASE
      WHEN a.OWNER IS NOT NULL
        AND a.OWNER != '__UNASSIGNED__'
        AND a.OWNER != 'unassigned'
        AND a.OWNER != '-'
      THEN 1 ELSE 0
    END AS fue_a_agente,
    CASE
      WHEN a.CLOSING_ACTOR = a.OWNER AND a.OWNER IS NOT NULL
      THEN 1 ELSE 0
    END AS cerrada_por_owner,
    CASE
      WHEN a.OWNER IS NULL OR a.OWNER IN ('unassigned', '__UNASSIGNED__', '-')
      THEN 1 ELSE 0
    END AS sin_asignar,
    ipe.EXPIRED_REASON,
    CASE
      WHEN a.FIRST_AGENT_MESSAGE_DATE IS NOT NULL
        AND ipe.EXPIRED_REASON = 'user_stopped_responding'
      THEN 1 ELSE 0
    END AS expirada_por_usuario,
    CASE
      WHEN a.FIRST_AGENT_MESSAGE_DATE IS NOT NULL
        AND ipe.EXPIRED_REASON = 'agent_stopped_responding'
      THEN 1 ELSE 0
    END AS expirada_por_agente
  FROM TRUORA.TRUORA_SCHEMA.VW_INTERNAL_AGENT_TICKET_SUMMARY a
  LEFT JOIN ip_expired ipe ON ipe.PROCESS_ID = a.PROCESS_ID
  CROSS JOIN params p
  WHERE a.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota',
        COALESCE(a.CONVERSATION_CREATION_DATE, a.CREATION_DATE)) AS DATE) >= p.mes_actual_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota',
        COALESCE(a.CONVERSATION_CREATION_DATE, a.CREATION_DATE)) AS DATE) <= p.mes_actual_fin
    {{ $('Preparar Contexto').first().json.AGENTES_WABA_FILTER }}
),

agentes_prev AS (
  SELECT
    a.CONVERSATION_ID,
    a.PROCESS_ID,
    a.FLOW_ID,
    a.WABA_PHONE_NUMBER,
    a.OWNER,
    a.CLOSING_ACTOR,
    a.CONVERSATION_STATUS,
    a.FIRST_AGENT_MESSAGE_DATE,
    a.CONVERSATION_CREATION_DATE,
    CASE
      WHEN a.FIRST_AGENT_MESSAGE_DATE IS NOT NULL
        AND a.CONVERSATION_CREATION_DATE IS NOT NULL
      THEN DATEDIFF('second',
             a.CONVERSATION_CREATION_DATE,
             a.FIRST_AGENT_MESSAGE_DATE) / 60.0
      ELSE NULL
    END AS minutos_primera_respuesta,
    CASE
      WHEN a.OWNER IS NOT NULL
        AND a.OWNER != '__UNASSIGNED__'
        AND a.OWNER != 'unassigned'
        AND a.OWNER != '-'
      THEN 1 ELSE 0
    END AS fue_a_agente,
    CASE
      WHEN a.CLOSING_ACTOR = a.OWNER AND a.OWNER IS NOT NULL
      THEN 1 ELSE 0
    END AS cerrada_por_owner,
    CASE
      WHEN a.OWNER IS NULL OR a.OWNER IN ('unassigned', '__UNASSIGNED__', '-')
      THEN 1 ELSE 0
    END AS sin_asignar,
    ipe.EXPIRED_REASON
  FROM TRUORA.TRUORA_SCHEMA.VW_INTERNAL_AGENT_TICKET_SUMMARY a
  LEFT JOIN ip_expired ipe ON ipe.PROCESS_ID = a.PROCESS_ID
  CROSS JOIN params p
  WHERE a.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota',
        COALESCE(a.CONVERSATION_CREATION_DATE, a.CREATION_DATE)) AS DATE) >= p.mes_prev_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota',
        COALESCE(a.CONVERSATION_CREATION_DATE, a.CREATION_DATE)) AS DATE) <= p.mes_prev_fin
    {{ $('Preparar Contexto').first().json.AGENTES_WABA_FILTER }}
),

campanas_actual AS (
  SELECT
    c.CAMPAIGN_ID,
    c.CAMPAIGN_NAME,
    c.FLOW_ID,
    c.RECIPIENTS,
    c.DELIVERED_USERS,
    c.SEEN_MESSAGES,
    c.ENGAGED_USERS,
    c.FAILED_DELIVERIES,
    CASE
      WHEN c.FLOW_ID IS NOT NULL THEN 'outbound'
      ELSE 'notificacion'
    END AS tipo_campana
  FROM TRUORA.TRUORA_SCHEMA.CAMPAIGNS c
  CROSS JOIN params p
  WHERE c.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', c.SENDING_DATE) AS DATE) >= p.mes_actual_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', c.SENDING_DATE) AS DATE) <= p.mes_actual_fin
    AND c.CAMPAIGN_STATUS IN ('sent','in_progress')
    AND (c.__HEVO__MARKED_DELETED IS NULL OR c.__HEVO__MARKED_DELETED = FALSE)
),

campanas_prev AS (
  SELECT
    c.CAMPAIGN_ID,
    c.FLOW_ID,
    c.RECIPIENTS,
    c.DELIVERED_USERS,
    c.SEEN_MESSAGES,
    c.ENGAGED_USERS,
    c.FAILED_DELIVERIES,
    CASE
      WHEN c.FLOW_ID IS NOT NULL THEN 'outbound'
      ELSE 'notificacion'
    END AS tipo_campana
  FROM TRUORA.TRUORA_SCHEMA.CAMPAIGNS c
  CROSS JOIN params p
  WHERE c.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', c.SENDING_DATE) AS DATE) >= p.mes_prev_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', c.SENDING_DATE) AS DATE) <= p.mes_prev_fin
    AND c.CAMPAIGN_STATUS IN ('sent','in_progress')
    AND (c.__HEVO__MARKED_DELETED IS NULL OR c.__HEVO__MARKED_DELETED = FALSE)
),

agg_outbounds_actual AS (
  -- BUG FIX 2026-04-29: filtrar STATUS='success' para alinear con manual CSM
  SELECT
    COUNT(DISTINCT CASE WHEN LOWER(es_notificacion) = 'false' AND STATUS = 'success' THEN MESSAGE_ID END) AS recipients_outbound,
    COUNT(DISTINCT CASE WHEN LOWER(es_notificacion) = 'true'  AND STATUS = 'success' THEN MESSAGE_ID END) AS recipients_notificacion
  FROM outbounds_actual
),

agg_outbounds_prev AS (
  SELECT
    COUNT(DISTINCT CASE WHEN LOWER(es_notificacion) = 'false' AND STATUS = 'success' THEN MESSAGE_ID END) AS recipients_outbound_prev,
    COUNT(DISTINCT CASE WHEN LOWER(es_notificacion) = 'true'  AND STATUS = 'success' THEN MESSAGE_ID END) AS recipients_notificacion_prev
  FROM outbounds_prev
),

-- NUEVO 2026-05: CONVERSATIONS_STEPS con TRIGGER_CHANNEL_TYPE='inbound'
-- + WS_REFERRAL_SOURCE_URL para tracking de pauta Meta
inbound_steps_actual AS (
  SELECT
    cs.PROCESS_ID,
    cs.FLOW_ID,
    cs.WABA_PHONE_NUMBER,
    cs.WS_REFERRAL_SOURCE_URL,
    cs.STATUS,
    cs.CREATION_DATE
  FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS cs
  CROSS JOIN params p
  WHERE cs.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND cs.TRIGGER_CHANNEL_TYPE = 'inbound'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', cs.CREATION_DATE) AS DATE) >= p.mes_actual_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', cs.CREATION_DATE) AS DATE) <= p.mes_actual_fin
),

inbound_steps_prev AS (
  SELECT
    cs.PROCESS_ID,
    cs.FLOW_ID,
    cs.WABA_PHONE_NUMBER,
    cs.WS_REFERRAL_SOURCE_URL,
    cs.STATUS,
    cs.CREATION_DATE
  FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS cs
  CROSS JOIN params p
  WHERE cs.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND cs.TRIGGER_CHANNEL_TYPE = 'inbound'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', cs.CREATION_DATE) AS DATE) >= p.mes_prev_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', cs.CREATION_DATE) AS DATE) <= p.mes_prev_fin
),

-- Para bloque1 (Ce1): GLOBAL, sin filtros
inbound_processes_actual_global AS (
  SELECT
    PROCESS_ID,
    MAX(CASE WHEN COALESCE(TRIM(WS_REFERRAL_SOURCE_URL), '') <> '' THEN 1 ELSE 0 END) AS es_pauta
  FROM inbound_steps_actual
  GROUP BY PROCESS_ID
),

inbound_processes_prev_global AS (
  SELECT
    PROCESS_ID,
    MAX(CASE WHEN COALESCE(TRIM(WS_REFERRAL_SOURCE_URL), '') <> '' THEN 1 ELSE 0 END) AS es_pauta
  FROM inbound_steps_prev
  GROUP BY PROCESS_ID
),

-- Para bloque5 (Ce4): filtrado por flujo + WABA
inbound_processes_actual_filtered AS (
  SELECT
    PROCESS_ID,
    MAX(CASE WHEN COALESCE(TRIM(WS_REFERRAL_SOURCE_URL), '') <> '' THEN 1 ELSE 0 END) AS es_pauta
  FROM inbound_steps_actual
  WHERE 1=1
    {{ $('Preparar Contexto').first().json.INBOUND_FLOW_FILTER }}
    {{ $('Preparar Contexto').first().json.INBOUND_WABA_FILTER }}
  GROUP BY PROCESS_ID
),

inbound_processes_prev_filtered AS (
  SELECT
    PROCESS_ID,
    MAX(CASE WHEN COALESCE(TRIM(WS_REFERRAL_SOURCE_URL), '') <> '' THEN 1 ELSE 0 END) AS es_pauta
  FROM inbound_steps_prev
  WHERE 1=1
    {{ $('Preparar Contexto').first().json.INBOUND_FLOW_FILTER }}
    {{ $('Preparar Contexto').first().json.INBOUND_WABA_FILTER }}
  GROUP BY PROCESS_ID
),

-- Primer step de cada proceso: define exitoso/fallido
inbound_first_step_actual AS (
  SELECT PROCESS_ID, STATUS AS first_status
  FROM inbound_steps_actual
  WHERE 1=1
    {{ $('Preparar Contexto').first().json.INBOUND_FLOW_FILTER }}
    {{ $('Preparar Contexto').first().json.INBOUND_WABA_FILTER }}
  QUALIFY ROW_NUMBER() OVER (PARTITION BY PROCESS_ID ORDER BY CREATION_DATE ASC) = 1
),

-- Procesos inbound que escalaron a agente
inbound_to_agent_actual AS (
  SELECT
    ag.PROCESS_ID,
    ag.CONVERSATION_ID
  FROM TRUORA.TRUORA_SCHEMA.VW_INTERNAL_AGENT_TICKET_SUMMARY ag
  CROSS JOIN params p
  WHERE ag.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota',
        COALESCE(ag.CONVERSATION_CREATION_DATE, ag.CREATION_DATE)) AS DATE) >= p.mes_actual_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota',
        COALESCE(ag.CONVERSATION_CREATION_DATE, ag.CREATION_DATE)) AS DATE) <= p.mes_actual_fin
    AND ag.PROCESS_ID IN (SELECT PROCESS_ID FROM inbound_processes_actual_filtered)
    {{ $('Preparar Contexto').first().json.INBOUND_FLOW_FILTER }}
    {{ $('Preparar Contexto').first().json.INBOUND_WABA_FILTER }}
),

inbound_to_agent_prev AS (
  SELECT
    ag.PROCESS_ID,
    ag.CONVERSATION_ID
  FROM TRUORA.TRUORA_SCHEMA.VW_INTERNAL_AGENT_TICKET_SUMMARY ag
  CROSS JOIN params p
  WHERE ag.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota',
        COALESCE(ag.CONVERSATION_CREATION_DATE, ag.CREATION_DATE)) AS DATE) >= p.mes_prev_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota',
        COALESCE(ag.CONVERSATION_CREATION_DATE, ag.CREATION_DATE)) AS DATE) <= p.mes_prev_fin
    AND ag.PROCESS_ID IN (SELECT PROCESS_ID FROM inbound_processes_prev_filtered)
    {{ $('Preparar Contexto').first().json.INBOUND_FLOW_FILTER }}
    {{ $('Preparar Contexto').first().json.INBOUND_WABA_FILTER }}
),

agg_inbound_actual_global AS (
  SELECT COUNT(*) AS total_inbounds
  FROM inbound_processes_actual_global
),

agg_inbound_prev_global AS (
  SELECT COUNT(*) AS total_inbounds
  FROM inbound_processes_prev_global
),

-- Mezcla unidades como el CSM:
--   conversaciones_recibidas / conv_exitosas / conv_fallidas / conv_pauta = COUNT process_ids
--   conv_a_agente = COUNT DISTINCT CONVERSATION_ID (puede ser > processes si hay reasignaciones)
agg_inbound_actual_filtered AS (
  SELECT
    (SELECT COUNT(DISTINCT PROCESS_ID) FROM inbound_processes_actual_filtered)                AS conversaciones_recibidas,
    (SELECT COALESCE(SUM(es_pauta), 0) FROM inbound_processes_actual_filtered)                AS conv_pauta,
    (SELECT COUNT(DISTINCT PROCESS_ID) FROM inbound_first_step_actual WHERE first_status = 'success') AS conv_exitosas,
    (SELECT COUNT(DISTINCT PROCESS_ID) FROM inbound_first_step_actual WHERE first_status = 'failure') AS conv_fallidas,
    (SELECT COUNT(DISTINCT CONVERSATION_ID) FROM inbound_to_agent_actual)                     AS conv_a_agente
),

agg_inbound_prev_filtered AS (
  SELECT
    (SELECT COUNT(DISTINCT PROCESS_ID) FROM inbound_processes_prev_filtered)                  AS conversaciones_recibidas,
    (SELECT COALESCE(SUM(es_pauta), 0) FROM inbound_processes_prev_filtered)                  AS conv_pauta,
    (SELECT COUNT(DISTINCT CONVERSATION_ID) FROM inbound_to_agent_prev)                       AS conv_a_agente
),

agg_agentes_actual AS (
  SELECT
    COUNT(*)                                                                  AS total_conversaciones,
    COUNT(DISTINCT OWNER)                                                     AS agentes_activos,
    SUM(fue_a_agente)                                                         AS conv_con_agente,
    SUM(cerrada_por_owner)                                                    AS conv_cerradas,
    SUM(IFF(FIRST_AGENT_MESSAGE_DATE IS NOT NULL, 1, 0))                      AS conv_atendidas,
    SUM(sin_asignar)                                                          AS conv_sin_asignar,
    SUM(expirada_por_agente)                                                  AS total_exp_agente,
    SUM(expirada_por_usuario)                                                 AS total_exp_usuario,
    MEDIAN(CASE WHEN minutos_primera_respuesta >= 0
      THEN minutos_primera_respuesta END)                                     AS mediana_primera_respuesta_min,
    MEDIAN(CASE WHEN CONVERSATION_DURATION_SEC > 0
      THEN CONVERSATION_DURATION_SEC / 60.0 END)                              AS mediana_duracion_min
  FROM agentes_actual
),

agg_agentes_prev AS (
  SELECT
    COUNT(*)                                                                  AS total_conversaciones,
    SUM(cerrada_por_owner)                                                    AS conv_cerradas,
    SUM(IFF(FIRST_AGENT_MESSAGE_DATE IS NOT NULL, 1, 0))                      AS conv_atendidas,
    MEDIAN(CASE WHEN minutos_primera_respuesta >= 0
      THEN minutos_primera_respuesta END)                                     AS mediana_primera_respuesta_min
  FROM agentes_prev
),

agg_campanas_actual AS (
  SELECT
    COUNT(DISTINCT CAMPAIGN_ID)                                               AS total_campanas,
    SUM(RECIPIENTS)                                                           AS total_recipients,
    SUM(DELIVERED_USERS)                                                      AS total_delivered,
    SUM(SEEN_MESSAGES)                                                        AS total_seen,
    SUM(ENGAGED_USERS)                                                        AS total_engaged,
    SUM(FAILED_DELIVERIES)                                                    AS total_failed,
    ROUND(SUM(DELIVERED_USERS) * 100.0 / NULLIF(SUM(RECIPIENTS), 0), 1)       AS tasa_entrega_pct,
    ROUND(SUM(SEEN_MESSAGES) * 100.0 / NULLIF(SUM(DELIVERED_USERS), 0), 1)    AS tasa_lectura_pct,
    ROUND(SUM(ENGAGED_USERS) * 100.0 / NULLIF(SUM(DELIVERED_USERS), 0), 1)    AS tasa_interaccion_pct
  FROM campanas_actual
),

agg_campanas_prev AS (
  SELECT
    COUNT(DISTINCT CAMPAIGN_ID)                                               AS total_campanas,
    SUM(RECIPIENTS)                                                           AS total_recipients,
    SUM(DELIVERED_USERS)                                                      AS total_delivered,
    SUM(SEEN_MESSAGES)                                                        AS total_seen,
    SUM(ENGAGED_USERS)                                                        AS total_engaged,
    ROUND(SUM(DELIVERED_USERS) * 100.0 / NULLIF(SUM(RECIPIENTS), 0), 1)       AS tasa_entrega_pct,
    ROUND(SUM(SEEN_MESSAGES) * 100.0 / NULLIF(SUM(DELIVERED_USERS), 0), 1)    AS tasa_lectura_pct,
    ROUND(SUM(ENGAGED_USERS) * 100.0 / NULLIF(SUM(DELIVERED_USERS), 0), 1)    AS tasa_interaccion_pct
  FROM campanas_prev
),

bloque1 AS (
  SELECT
    '1_consumo_total'                                                         AS bloque,
    p.mes_actual_inicio                                                       AS periodo,
    iag.total_inbounds                                                        AS total_inbounds,
    oa.recipients_outbound,
    oa.recipients_notificacion,
    (iag.total_inbounds + oa.recipients_outbound
      + oa.recipients_notificacion)                                           AS total_conversaciones,
    ipg.total_inbounds                                                        AS total_inbounds_prev,
    op.recipients_outbound_prev,
    op.recipients_notificacion_prev,
    (ipg.total_inbounds + op.recipients_outbound_prev
      + op.recipients_notificacion_prev)                                      AS total_prev,
    ROUND(
      ((iag.total_inbounds + oa.recipients_outbound + oa.recipients_notificacion)
       - (ipg.total_inbounds + op.recipients_outbound_prev + op.recipients_notificacion_prev))
      * 100.0
      / NULLIF(ipg.total_inbounds + op.recipients_outbound_prev
        + op.recipients_notificacion_prev, 0)
    , 1)                                                                      AS variacion_total_pct,
    ROUND((oa.recipients_outbound - op.recipients_outbound_prev) * 100.0
      / NULLIF(op.recipients_outbound_prev, 0), 1)                            AS variacion_outbound_pct,
    ROUND((iag.total_inbounds - ipg.total_inbounds) * 100.0
      / NULLIF(ipg.total_inbounds, 0), 1)                                     AS variacion_inbound_pct,
    CASE
      WHEN (iag.total_inbounds + oa.recipients_outbound + oa.recipients_notificacion)
         > (ipg.total_inbounds + op.recipients_outbound_prev + op.recipients_notificacion_prev)
      THEN 'UP'
      WHEN (iag.total_inbounds + oa.recipients_outbound + oa.recipients_notificacion)
         < (ipg.total_inbounds + op.recipients_outbound_prev + op.recipients_notificacion_prev)
      THEN 'DOWN' ELSE 'FLAT'
    END                                                                       AS direccion_total,
    CASE
      WHEN oa.recipients_outbound > op.recipients_outbound_prev THEN 'UP'
      WHEN oa.recipients_outbound < op.recipients_outbound_prev THEN 'DOWN'
      ELSE 'FLAT'
    END                                                                       AS direccion_outbound,
    CASE
      WHEN iag.total_inbounds > ipg.total_inbounds THEN 'UP'
      WHEN iag.total_inbounds < ipg.total_inbounds THEN 'DOWN'
      ELSE 'FLAT'
    END                                                                       AS direccion_inbound
  FROM params p
  CROSS JOIN agg_outbounds_actual oa
  CROSS JOIN agg_outbounds_prev op
  CROSS JOIN agg_inbound_actual_global iag
  CROSS JOIN agg_inbound_prev_global ipg
),

bloque2_global AS (
  SELECT
    '2_eficiencia_campanas'                                                   AS bloque,
    p.mes_actual_inicio                                                       AS periodo,
    'GLOBAL'                                                                  AS tipo,
    CAST(ca.total_campanas AS VARCHAR)                                        AS nombre_o_campanas,
    ca.total_recipients,
    ca.total_delivered,
    ca.total_seen,
    ca.total_engaged,
    ca.tasa_entrega_pct,
    ca.tasa_lectura_pct,
    ca.tasa_interaccion_pct,
    cp.tasa_entrega_pct                                                       AS tasa_entrega_prev,
    cp.tasa_lectura_pct                                                       AS tasa_lectura_prev,
    cp.tasa_interaccion_pct                                                   AS tasa_interaccion_prev,
    ROUND(ca.tasa_entrega_pct - cp.tasa_entrega_pct, 1)                       AS var_entrega_pp,
    ROUND(ca.tasa_lectura_pct - cp.tasa_lectura_pct, 1)                       AS var_lectura_pp,
    ROUND(ca.tasa_interaccion_pct - cp.tasa_interaccion_pct, 1)               AS var_interaccion_pp
  FROM params p
  CROSS JOIN agg_campanas_actual ca
  CROSS JOIN agg_campanas_prev cp
),

bloque2_top5 AS (
  SELECT
    '2_eficiencia_campanas'                                                   AS bloque,
    p.mes_actual_inicio                                                       AS periodo,
    'TOP5'                                                                    AS tipo,
    ca.CAMPAIGN_NAME                                                          AS nombre_o_campanas,
    ca.RECIPIENTS                                                             AS total_recipients,
    ca.DELIVERED_USERS                                                        AS total_delivered,
    ca.SEEN_MESSAGES                                                          AS total_seen,
    ca.ENGAGED_USERS                                                          AS total_engaged,
    ROUND(ca.DELIVERED_USERS * 100.0 / NULLIF(ca.RECIPIENTS, 0), 1)           AS tasa_entrega_pct,
    ROUND(ca.SEEN_MESSAGES * 100.0 / NULLIF(ca.DELIVERED_USERS, 0), 1)        AS tasa_lectura_pct,
    ROUND(ca.ENGAGED_USERS * 100.0 / NULLIF(ca.DELIVERED_USERS, 0), 1)        AS tasa_interaccion_pct,
    NULL::FLOAT AS tasa_entrega_prev,
    NULL::FLOAT AS tasa_lectura_prev,
    NULL::FLOAT AS tasa_interaccion_prev,
    NULL::FLOAT AS var_entrega_pp,
    NULL::FLOAT AS var_lectura_pp,
    NULL::FLOAT AS var_interaccion_pp
  FROM campanas_actual ca
  CROSS JOIN params p
  WHERE ca.tipo_campana = 'outbound' AND ca.RECIPIENTS > 0
  QUALIFY ROW_NUMBER() OVER (
    ORDER BY ROUND(ca.ENGAGED_USERS * 100.0 / NULLIF(ca.DELIVERED_USERS, 0), 1) DESC NULLS LAST
  ) <= 5
),

fallos_actual AS (
  SELECT
    CASE
      WHEN FAILURE_REASON ILIKE '%undeliverable%'            THEN 'Message Undeliverable'
      WHEN FAILURE_REASON ILIKE '%healthy ecosystem%'        THEN 'Healthy ecosystem engagement'
      WHEN FAILURE_REASON ILIKE '%experiment%'               THEN 'User is part of an experiment'
      WHEN FAILURE_REASON ILIKE '%stop receiving marketing%' THEN 'Usuario bloqueó marketing'
      WHEN FAILURE_REASON ILIKE '%spam%'                     THEN 'Límite spam'
      WHEN FAILURE_REASON ILIKE '%locked%'                   THEN 'Cuenta bloqueada'
      WHEN FAILURE_REASON ILIKE '%does not exist%'           THEN 'Template/objeto inválido'
      WHEN FAILURE_REASON ILIKE '%invalid%'                  THEN 'Número inválido'
      WHEN FAILURE_REASON IS NULL                            THEN 'Sin razón registrada'
      ELSE 'Other'
    END AS categoria_fallo,
    COUNT(MESSAGE_ID) AS total
  FROM outbounds_actual
  WHERE STATUS = 'failure'
  GROUP BY categoria_fallo
),

fallos_prev AS (
  SELECT
    CASE
      WHEN FAILURE_REASON ILIKE '%undeliverable%'            THEN 'Message Undeliverable'
      WHEN FAILURE_REASON ILIKE '%healthy ecosystem%'        THEN 'Healthy ecosystem engagement'
      WHEN FAILURE_REASON ILIKE '%experiment%'               THEN 'User is part of an experiment'
      WHEN FAILURE_REASON ILIKE '%stop receiving marketing%' THEN 'Usuario bloqueó marketing'
      WHEN FAILURE_REASON ILIKE '%spam%'                     THEN 'Límite spam'
      WHEN FAILURE_REASON ILIKE '%locked%'                   THEN 'Cuenta bloqueada'
      WHEN FAILURE_REASON ILIKE '%does not exist%'           THEN 'Template/objeto inválido'
      WHEN FAILURE_REASON ILIKE '%invalid%'                  THEN 'Número inválido'
      WHEN FAILURE_REASON IS NULL                            THEN 'Sin razón registrada'
      ELSE 'Other'
    END AS categoria_fallo,
    COUNT(MESSAGE_ID) AS total
  FROM outbounds_prev
  WHERE STATUS = 'failure'
  GROUP BY categoria_fallo
),

totales_mensajes AS (
  SELECT
    COUNT(CASE WHEN STATUS != 'failure' THEN 1 END) AS exitosos_actual,
    COUNT(CASE WHEN STATUS = 'failure'  THEN 1 END) AS fallidos_actual,
    COUNT(*)                                         AS total_actual
  FROM outbounds_actual
),

totales_prev AS (
  SELECT
    COUNT(CASE WHEN STATUS != 'failure' THEN 1 END) AS exitosos_prev,
    COUNT(*)                                         AS total_prev
  FROM outbounds_prev
),

bloque3 AS (
  SELECT
    '3_fallos_outbound'                                                       AS bloque,
    p.mes_actual_inicio                                                       AS periodo,
    fa.categoria_fallo,
    fa.total                                                                  AS total_actual,
    ROUND(fa.total * 100.0 / NULLIF(SUM(fa.total) OVER (), 0), 1)             AS pct_actual,
    COALESCE(fp.total, 0)                                                     AS total_prev,
    ROUND(COALESCE(fp.total, 0) * 100.0
      / NULLIF(SUM(COALESCE(fp.total, 0)) OVER (), 0), 1)                     AS pct_prev,
    ROUND(
      (fa.total * 100.0 / NULLIF(SUM(fa.total) OVER (), 0))
      - (COALESCE(fp.total, 0) * 100.0
         / NULLIF(SUM(COALESCE(fp.total, 0)) OVER (), 0))
    , 1)                                                                      AS variacion_pp,
    tm.exitosos_actual,
    tm.fallidos_actual,
    ROUND(tm.exitosos_actual * 100.0 / NULLIF(tm.total_actual, 0), 2)         AS pct_exito_actual,
    tp.exitosos_prev,
    ROUND(tp.exitosos_prev * 100.0 / NULLIF(tp.total_prev, 0), 2)             AS pct_exito_prev
  FROM fallos_actual fa
  LEFT JOIN fallos_prev fp ON fa.categoria_fallo = fp.categoria_fallo
  CROSS JOIN params p
  CROSS JOIN totales_mensajes tm
  CROSS JOIN totales_prev tp
  QUALIFY ROW_NUMBER() OVER (ORDER BY fa.total DESC) <= 5
),

bloque5 AS (
  SELECT
    '5_flujo_inbound'                                                         AS bloque,
    p.mes_actual_inicio                                                       AS periodo,
    iaf.conversaciones_recibidas                                              AS conversaciones_recibidas,
    ROUND(iaf.conv_pauta * 100.0
      / NULLIF(iaf.conversaciones_recibidas, 0), 2)                           AS pct_pauta_meta,
    iaf.conv_a_agente                                                         AS conv_con_agente,
    ROUND(iaf.conv_a_agente * 100.0
      / NULLIF(iaf.conversaciones_recibidas, 0), 2)                           AS pct_conv_a_agente,
    iaf.conv_exitosas,
    ROUND(iaf.conv_exitosas * 100.0
      / NULLIF(iaf.conversaciones_recibidas, 0), 2)                           AS pct_exitosos,
    ROUND(iaf.conv_fallidas * 100.0
      / NULLIF(iaf.conversaciones_recibidas, 0), 2)                           AS pct_fallidos,
    ipf.conversaciones_recibidas                                              AS conv_recibidas_prev,
    ROUND(ipf.conv_a_agente * 100.0
      / NULLIF(ipf.conversaciones_recibidas, 0), 2)                           AS pct_a_agente_prev,
    ROUND((iaf.conversaciones_recibidas - ipf.conversaciones_recibidas) * 100.0
      / NULLIF(ipf.conversaciones_recibidas, 0), 1)                           AS variacion_conv_pct,
    ROUND(
      (iaf.conv_a_agente * 100.0 / NULLIF(iaf.conversaciones_recibidas, 0))
      - (ipf.conv_a_agente * 100.0 / NULLIF(ipf.conversaciones_recibidas, 0))
    , 1)                                                                      AS variacion_a_agente_pp
  FROM params p
  CROSS JOIN agg_inbound_actual_filtered iaf
  CROSS JOIN agg_inbound_prev_filtered ipf
),

bloque6 AS (
  SELECT
    '6_agentes_general'                                                       AS bloque,
    p.mes_actual_inicio                                                       AS periodo,
    aa.total_conversaciones,
    aa.agentes_activos,
    aa.conv_atendidas,
    ROUND(aa.conv_atendidas * 100.0
      / NULLIF(aa.total_conversaciones, 0), 1)                                AS pct_atendidas,
    aa.conv_cerradas,
    ROUND(aa.conv_cerradas * 100.0
      / NULLIF(aa.total_conversaciones, 0), 1)                                AS pct_cerradas,
    ROUND(aa.mediana_primera_respuesta_min, 1)                                AS mediana_primera_respuesta_min,
    ROUND(aa.mediana_duracion_min, 1)                                         AS mediana_duracion_min,
    ap.total_conversaciones                                                   AS total_conv_prev,
    ap.conv_cerradas                                                          AS conv_cerradas_prev,
    ROUND(ap.conv_cerradas * 100.0
      / NULLIF(ap.total_conversaciones, 0), 1)                                AS pct_cerradas_prev,
    ROUND(ap.mediana_primera_respuesta_min, 1)                                AS mediana_rta_prev,
    ROUND(
      (aa.conv_cerradas * 100.0 / NULLIF(aa.total_conversaciones, 0))
      - (ap.conv_cerradas * 100.0 / NULLIF(ap.total_conversaciones, 0))
    , 1)                                                                      AS var_cerradas_pp,
    ROUND(aa.mediana_primera_respuesta_min
      - ap.mediana_primera_respuesta_min, 1)                                  AS var_mediana_rta_min,
    aa.conv_sin_asignar                                                       AS conv_sin_asignar
  FROM params p
  CROSS JOIN agg_agentes_actual aa
  CROSS JOIN agg_agentes_prev ap
),

bloque7 AS (
  SELECT
    '7_agentes_top5'                                                          AS bloque,
    p.mes_actual_inicio                                                       AS periodo,
    a.OWNER                                                                   AS agente,
    COUNT(*)                                                                  AS total_conv,
    ROUND(SUM(IFF(a.FIRST_AGENT_MESSAGE_DATE IS NOT NULL, 1, 0)) * 100.0
      / NULLIF(COUNT(*), 0), 2)                                               AS pct_atendidas,
    -- Ce6 top5: cerradas / ATENDIDAS (definicion CSM, distinto de Ce5 global)
    ROUND(SUM(a.cerrada_por_owner) * 100.0
      / NULLIF(SUM(IFF(a.FIRST_AGENT_MESSAGE_DATE IS NOT NULL, 1, 0)), 0), 2) AS pct_cerradas,
    ROUND(SUM(a.expirada_por_agente) * 100.0
      / NULLIF(SUM(IFF(a.FIRST_AGENT_MESSAGE_DATE IS NOT NULL, 1, 0)), 0), 2) AS pct_expiradas_agente,
    ROUND(SUM(a.expirada_por_usuario) * 100.0
      / NULLIF(SUM(IFF(a.FIRST_AGENT_MESSAGE_DATE IS NOT NULL, 1, 0)), 0), 2) AS pct_expiradas_usuario,
    ROUND(MEDIAN(CASE WHEN a.minutos_primera_respuesta >= 0
      THEN a.minutos_primera_respuesta END), 1)                               AS mediana_primera_rta_min,
    ROUND(MEDIAN(CASE WHEN a.CONVERSATION_DURATION_SEC > 0
      THEN a.CONVERSATION_DURATION_SEC / 60.0 END), 1)                        AS mediana_duracion_min
  FROM agentes_actual a
  CROSS JOIN params p
  WHERE a.OWNER IS NOT NULL
    AND a.OWNER != '__UNASSIGNED__'
    AND a.OWNER != 'unassigned'
    AND a.OWNER != '-'
  GROUP BY a.OWNER, p.mes_actual_inicio
  QUALIFY ROW_NUMBER() OVER (
    ORDER BY COUNT(*) DESC
  ) <= 10
),

lineas_actual AS (
  SELECT
    s.WABA_PHONE_NUMBER,
    COUNT(CASE WHEN LOWER(CAST(s.OUTBOUND_IS_NOTIFICATION AS VARCHAR)) = 'false' THEN s.MESSAGE_ID END) AS outbounds,
    COUNT(CASE WHEN LOWER(CAST(s.OUTBOUND_IS_NOTIFICATION AS VARCHAR)) = 'true'  THEN s.MESSAGE_ID END) AS notificaciones,
    COUNT(s.MESSAGE_ID)                                                                                  AS total
  FROM TRUORA.TRUORA_SCHEMA.SENT_OUTBOUND_MESSAGES s
  CROSS JOIN params p
  WHERE s.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE) >= p.mes_actual_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE) <= p.mes_actual_fin
    AND (s.TRUORA_FLOW_ID != 'empty' OR LOWER(CAST(s.OUTBOUND_IS_NOTIFICATION AS VARCHAR)) = 'true')
  GROUP BY s.WABA_PHONE_NUMBER
),

bloque5b AS (
  SELECT
    '5b_consumo_por_linea'                                                    AS bloque,
    p.mes_actual_inicio                                                       AS periodo,
    l.WABA_PHONE_NUMBER                                                       AS linea,
    l.outbounds,
    l.notificaciones,
    l.total,
    ROUND(l.total * 100.0 / NULLIF(SUM(l.total) OVER (), 0), 1)              AS pct_total
  FROM lineas_actual l
  CROSS JOIN params p
),

historico_meses AS (
  SELECT DATEADD('month', -(ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1),
                 p.mes_actual_inicio) AS mes_inicio
  FROM TABLE(GENERATOR(ROWCOUNT => 6))
  CROSS JOIN params p
),

historico_otb AS (
  -- BUG FIX 2026-04-29 PM: filtrar STATUS='success' para alinear con Ce1
  SELECT
    DATE_TRUNC('month', CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE)) AS mes,
    COUNT(CASE WHEN LOWER(CAST(s.OUTBOUND_IS_NOTIFICATION AS VARCHAR)) = 'false' THEN s.MESSAGE_ID END) AS outbounds,
    COUNT(CASE WHEN LOWER(CAST(s.OUTBOUND_IS_NOTIFICATION AS VARCHAR)) = 'true'  THEN s.MESSAGE_ID END) AS notificaciones
  FROM TRUORA.TRUORA_SCHEMA.SENT_OUTBOUND_MESSAGES s
  CROSS JOIN params p
  WHERE s.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND LOWER(s.STATUS) = 'success'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE) >= DATEADD('month', -5, p.mes_actual_inicio)
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE) <= p.mes_actual_fin
    AND (s.TRUORA_FLOW_ID != 'empty' OR LOWER(CAST(s.OUTBOUND_IS_NOTIFICATION AS VARCHAR)) = 'true')
  GROUP BY 1
),

historico_inb AS (
  -- BUG FIX 2026-04-29 PM: misma fuente que Ce1 (CONVERSATIONS_STEPS con TRIGGER_CHANNEL_TYPE='inbound')
  SELECT
    DATE_TRUNC('month', CAST(CONVERT_TIMEZONE('UTC','America/Bogota', cs.CREATION_DATE) AS DATE)) AS mes,
    COUNT(DISTINCT cs.PROCESS_ID) AS inbounds
  FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS cs
  CROSS JOIN params p
  WHERE cs.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND cs.TRIGGER_CHANNEL_TYPE = 'inbound'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', cs.CREATION_DATE) AS DATE) >= DATEADD('month', -5, p.mes_actual_inicio)
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', cs.CREATION_DATE) AS DATE) <= p.mes_actual_fin
  GROUP BY 1
),

bloque5c AS (
  SELECT
    '5c_tendencia_mensual'                                                                              AS bloque,
    m.mes_inicio                                                                                        AS periodo,
    COALESCE(o.outbounds, 0)                                                                           AS outbounds,
    COALESCE(o.notificaciones, 0)                                                                      AS notificaciones,
    COALESCE(i.inbounds, 0)                                                                            AS inbounds,
    COALESCE(o.outbounds, 0) + COALESCE(o.notificaciones, 0) + COALESCE(i.inbounds, 0)                AS total
  FROM historico_meses m
  LEFT JOIN historico_otb o ON m.mes_inicio = o.mes
  LEFT JOIN historico_inb i ON m.mes_inicio = i.mes
),

heatmap_raw AS (
  SELECT
    s.WABA_PHONE_NUMBER,
    DATE_TRUNC('month', CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE)) AS mes,
    COUNT(s.MESSAGE_ID) AS vol
  FROM TRUORA.TRUORA_SCHEMA.SENT_OUTBOUND_MESSAGES s
  CROSS JOIN params p
  WHERE s.CLIENT_ID = '{{ $('Preparar Contexto').first().json.CLIENT_ID }}'
    AND LOWER(s.STATUS) = 'success'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE)
        >= DATEADD('month', -2, p.mes_actual_inicio)
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE)
        <= p.mes_actual_fin
  GROUP BY 1, 2
),

bloque5d AS (
  SELECT
    '5d_heatmap_lineas'                                                       AS bloque,
    p.mes_actual_inicio                                                       AS periodo,
    h.WABA_PHONE_NUMBER                                                       AS linea,
    COALESCE(SUM(CASE WHEN h.mes = p.mes_actual_inicio THEN h.vol END), 0)   AS vol_m0,
    COALESCE(SUM(CASE WHEN h.mes = p.mes_prev_inicio   THEN h.vol END), 0)   AS vol_m1,
    COALESCE(SUM(CASE WHEN h.mes = DATE_TRUNC('month',
      DATEADD('month', -2, p.mes_actual_inicio)) THEN h.vol END), 0)         AS vol_m2
  FROM heatmap_raw h
  CROSS JOIN params p
  GROUP BY h.WABA_PHONE_NUMBER, p.mes_actual_inicio, p.mes_prev_inicio
  HAVING vol_m0 > 0 OR vol_m1 > 0 OR vol_m2 > 0
)

SELECT bloque, periodo,
  col1, col2, col3, col4, col5,
  col6, col7, col8, col9, col10, col11,
  col_extra1, col_extra2, col_extra3, col_extra4
FROM (

  SELECT bloque, periodo,
    CAST(total_inbounds AS VARCHAR)               AS col1,
    CAST(recipients_outbound AS VARCHAR)          AS col2,
    CAST(recipients_notificacion AS VARCHAR)      AS col3,
    CAST(total_conversaciones AS VARCHAR)         AS col4,
    CAST(total_inbounds_prev AS VARCHAR)          AS col5,
    CAST(recipients_outbound_prev AS VARCHAR)     AS col6,
    CAST(recipients_notificacion_prev AS VARCHAR) AS col7,
    CAST(total_prev AS VARCHAR)                   AS col8,
    CAST(variacion_total_pct AS VARCHAR)          AS col9,
    CAST(variacion_outbound_pct AS VARCHAR)       AS col10,
    CAST(variacion_inbound_pct AS VARCHAR)        AS col11,
    direccion_total                               AS col_extra1,
    direccion_outbound                            AS col_extra2,
    direccion_inbound                             AS col_extra3,
    NULL                                          AS col_extra4
  FROM bloque1

  UNION ALL

  SELECT bloque, periodo,
    tipo                                          AS col1,
    nombre_o_campanas                             AS col2,
    CAST(total_recipients AS VARCHAR)             AS col3,
    CAST(total_delivered AS VARCHAR)              AS col4,
    CAST(tasa_entrega_pct AS VARCHAR)             AS col5,
    CAST(tasa_lectura_pct AS VARCHAR)             AS col6,
    CAST(tasa_interaccion_pct AS VARCHAR)         AS col7,
    CAST(tasa_entrega_prev AS VARCHAR)            AS col8,
    CAST(tasa_lectura_prev AS VARCHAR)            AS col9,
    CAST(tasa_interaccion_prev AS VARCHAR)        AS col10,
    CAST(var_entrega_pp AS VARCHAR)               AS col11,
    CAST(var_lectura_pp AS VARCHAR)               AS col_extra1,
    CAST(var_interaccion_pp AS VARCHAR)           AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque2_global

  UNION ALL

  SELECT bloque, periodo,
    tipo                                          AS col1,
    nombre_o_campanas                             AS col2,
    CAST(total_recipients AS VARCHAR)             AS col3,
    CAST(total_delivered AS VARCHAR)              AS col4,
    CAST(tasa_entrega_pct AS VARCHAR)             AS col5,
    CAST(tasa_lectura_pct AS VARCHAR)             AS col6,
    CAST(tasa_interaccion_pct AS VARCHAR)         AS col7,
    CAST(tasa_entrega_prev AS VARCHAR)            AS col8,
    CAST(tasa_lectura_prev AS VARCHAR)            AS col9,
    CAST(tasa_interaccion_prev AS VARCHAR)        AS col10,
    CAST(var_entrega_pp AS VARCHAR)               AS col11,
    CAST(var_lectura_pp AS VARCHAR)               AS col_extra1,
    CAST(var_interaccion_pp AS VARCHAR)           AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque2_top5

  UNION ALL

  SELECT bloque, periodo,
    categoria_fallo                               AS col1,
    CAST(total_actual AS VARCHAR)                 AS col2,
    CAST(pct_actual AS VARCHAR)                   AS col3,
    CAST(total_prev AS VARCHAR)                   AS col4,
    CAST(pct_prev AS VARCHAR)                     AS col5,
    CAST(variacion_pp AS VARCHAR)                 AS col6,
    CAST(exitosos_actual AS VARCHAR)              AS col7,
    CAST(fallidos_actual AS VARCHAR)              AS col8,
    CAST(pct_exito_actual AS VARCHAR)             AS col9,
    CAST(exitosos_prev AS VARCHAR)                AS col10,
    CAST(pct_exito_prev AS VARCHAR)               AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque3

  UNION ALL

  SELECT bloque, periodo,
    CAST(conversaciones_recibidas AS VARCHAR)     AS col1,
    CAST(pct_pauta_meta AS VARCHAR)               AS col2,
    CAST(conv_con_agente AS VARCHAR)              AS col3,
    CAST(pct_conv_a_agente AS VARCHAR)            AS col4,
    CAST(conv_exitosas AS VARCHAR)                AS col5,
    CAST(pct_exitosos AS VARCHAR)                 AS col6,
    CAST(pct_fallidos AS VARCHAR)                 AS col7,
    CAST(conv_recibidas_prev AS VARCHAR)          AS col8,
    CAST(pct_a_agente_prev AS VARCHAR)            AS col9,
    CAST(variacion_conv_pct AS VARCHAR)           AS col10,
    CAST(variacion_a_agente_pp AS VARCHAR)        AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque5

  UNION ALL

  SELECT bloque, periodo,
    CAST(total_conversaciones AS VARCHAR)          AS col1,
    CAST(agentes_activos AS VARCHAR)               AS col2,
    CAST(conv_atendidas AS VARCHAR)                AS col3,
    CAST(pct_atendidas AS VARCHAR)                 AS col4,
    CAST(conv_cerradas AS VARCHAR)                 AS col5,
    CAST(pct_cerradas AS VARCHAR)                  AS col6,
    CAST(mediana_primera_respuesta_min AS VARCHAR)  AS col7,
    CAST(mediana_duracion_min AS VARCHAR)           AS col8,
    CAST(total_conv_prev AS VARCHAR)               AS col9,
    CAST(pct_cerradas_prev AS VARCHAR)             AS col10,
    CAST(mediana_rta_prev AS VARCHAR)              AS col11,
    CAST(var_cerradas_pp AS VARCHAR)               AS col_extra1,
    CAST(var_mediana_rta_min AS VARCHAR)           AS col_extra2,
    CAST(conv_sin_asignar AS VARCHAR)              AS col_extra3,
    NULL                                           AS col_extra4
  FROM bloque6

  UNION ALL

  SELECT bloque, periodo,
    agente                                        AS col1,
    CAST(total_conv AS VARCHAR)                   AS col2,
    CAST(pct_atendidas AS VARCHAR)                AS col3,
    CAST(pct_cerradas AS VARCHAR)                 AS col4,
    CAST(pct_expiradas_agente AS VARCHAR)         AS col5,
    CAST(pct_expiradas_usuario AS VARCHAR)        AS col6,
    CAST(mediana_primera_rta_min AS VARCHAR)      AS col7,
    CAST(mediana_duracion_min AS VARCHAR)         AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque7

  UNION ALL

  SELECT bloque, periodo,
    linea                                         AS col1,
    CAST(outbounds AS VARCHAR)                    AS col2,
    CAST(notificaciones AS VARCHAR)               AS col3,
    CAST(total AS VARCHAR)                        AS col4,
    CAST(pct_total AS VARCHAR)                    AS col5,
    NULL AS col6, NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque5b

  UNION ALL

  SELECT bloque, periodo,
    CAST(outbounds AS VARCHAR)                    AS col1,
    CAST(notificaciones AS VARCHAR)               AS col2,
    CAST(inbounds AS VARCHAR)                     AS col3,
    CAST(total AS VARCHAR)                        AS col4,
    NULL AS col5, NULL AS col6, NULL AS col7,
    NULL AS col8, NULL AS col9, NULL AS col10,
    NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque5c

  UNION ALL

  SELECT bloque, periodo,
    linea                                         AS col1,
    CAST(vol_m0 AS VARCHAR)                       AS col2,
    CAST(vol_m1 AS VARCHAR)                       AS col3,
    CAST(vol_m2 AS VARCHAR)                       AS col4,
    CASE
      WHEN vol_m1 = 0 AND vol_m2 = 0 AND vol_m0 > 0 THEN 'NEW'
      WHEN vol_m0 = 0 AND (vol_m1 > 0 OR vol_m2 > 0) THEN 'STOPPED'
      ELSE 'ACTIVE'
    END                                           AS col5,
    NULL AS col6, NULL AS col7, NULL AS col8,
    NULL AS col9, NULL AS col10, NULL AS col11,
    NULL AS col_extra1, NULL AS col_extra2,
    NULL AS col_extra3, NULL AS col_extra4
  FROM bloque5d

)
ORDER BY bloque, periodo;
