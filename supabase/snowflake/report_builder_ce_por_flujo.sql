-- ============================================================
-- REPORT BUILDER CE POR FLUJO — Query Snowflake productivo
-- Workflow n8n: "CE por Flujos y VRF" (`96t8Xl3WGpIaKCLb`)
-- Snapshot guardado: 2026-05-19 PM (incluye vrf_doc_expira)
-- ============================================================
-- Bloques que retorna (UNION-ed, 3 filas o mas por flujo):
--   funnel_otb        → embudo del flujo: enviados, fallan_meta, recepcion, no_respondidos, iniciados_otb/inb, total_procesos
--   funnel_steps      → drop-off por step CONVERSATIONS_STEPS (filtra eligeopcion/confir/VRF tecnicos)
--   vrf               → validaciones embebidas: doc/rostro/identidad/firma con tasas + expirados de documento
--
-- Parametros n8n (modo per-flujo, $json.* es el flow_id iterado):
--   $json.CLIENT_ID
--   $json.flow_id
--   $json.flow_name
--   $json.fecha_inicio
--   $json.fecha_fin
--
-- Reglas criticas:
--   - VRF usa LATERAL FLATTEN sobre IDENTITY_PROCESSES.VALIDATIONS (JSON array)
--   - Tipos VRF: 'document-validation', 'face-recognition', 'electronic-signature'
--   - vrf_doc_expira NUEVO 2026-05: cuenta procesos con expira sin fallo real ni exito previo
--     (CASE WHEN tiene_expira=1 AND tiene_fallo_real=0 AND tiene_exito=0)
--   - identidad_exitosa: HAVING COUNT(DISTINCT type)=2 (ambas success: doc + rostro)
--   - Steps tecnicos excluidos: eligeopcion*, confir_*, VRF*, length<=2
--   - Step exitoso: STEP_STATUS IN ('success','exitoso','successful')
--
-- Si firma_iniciada = 0: el flujo no tiene firma electronica (no reportar firma).
-- Si todos los VRF = 0: el flujo es puramente conversacional (bot + agente). Normal.
--
-- Mapeo COL1..COL_EXTRA4 por bloque: ver skill snowflake-queries.md
-- ============================================================

WITH

params AS (
  SELECT
    CAST('{{ $json.fecha_inicio }}' AS DATE) AS mes_actual_inicio,
    CAST('{{ $json.fecha_fin }}'   AS DATE) AS mes_actual_fin,
    DATE_TRUNC('month', DATEADD('month', -1,
      CAST('{{ $json.fecha_inicio }}' AS DATE)
    )) AS mes_prev_inicio,
    DATEADD('day', -1,
      CAST('{{ $json.fecha_inicio }}' AS DATE)
    ) AS mes_prev_fin
),

-- OUTBOUNDS DEL FLUJO MES ACTUAL
otb_actual AS (
  SELECT
    s.MESSAGE_ID,
    s.STATUS,
    s.FAILURE_REASON,
    s.OUTBOUND_RESPONSE
  FROM TRUORA.TRUORA_SCHEMA.SENT_OUTBOUND_MESSAGES s
  CROSS JOIN params p
  WHERE s.CLIENT_ID = '{{ $json.CLIENT_ID }}'
    AND s.TRUORA_FLOW_ID = '{{ $json.flow_id }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE) >= p.mes_actual_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE) <= p.mes_actual_fin
),

otb_prev AS (
  SELECT
    s.MESSAGE_ID,
    s.STATUS
  FROM TRUORA.TRUORA_SCHEMA.SENT_OUTBOUND_MESSAGES s
  CROSS JOIN params p
  WHERE s.CLIENT_ID = '{{ $json.CLIENT_ID }}'
    AND s.TRUORA_FLOW_ID = '{{ $json.flow_id }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE) >= p.mes_prev_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', s.CREATION_DATE) AS DATE) <= p.mes_prev_fin
),

-- PROCESOS DEL FLUJO
procesos_actual AS (
  SELECT
    ip.PROCESS_ID,
    ip.STATUS,
    ip.DECLINED_REASON
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip
  CROSS JOIN params p
  WHERE ip.CLIENT_ID = '{{ $json.CLIENT_ID }}'
    AND ip.FLOW_ID = '{{ $json.flow_id }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE) >= p.mes_actual_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE) <= p.mes_actual_fin
    AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
    AND ip.STATUS IS NOT NULL
    AND (ip.IS_USED IS NULL OR ip.IS_USED = TRUE)
),

-- STEPS DEL FLUJO
steps_actual AS (
  SELECT
    cs.PROCESS_ID,
    cs.STEP_NAME,
    cs.STEP_STATUS,
    cs.STEP_VALUE
  FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS cs
  CROSS JOIN params p
  WHERE cs.CLIENT_ID = '{{ $json.CLIENT_ID }}'
    AND cs.FLOW_ID = '{{ $json.flow_id }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', cs.CREATION_DATE) AS DATE) >= p.mes_actual_inicio
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', cs.CREATION_DATE) AS DATE) <= p.mes_actual_fin
    AND cs.STEP_NAME NOT ILIKE 'eligeopcion%'
    AND cs.STEP_NAME NOT ILIKE 'confir_%'
    AND LENGTH(cs.STEP_NAME) > 2
    AND cs.STEP_NAME NOT ILIKE 'VRF%'
),

-- VRF: VALIDACIONES EMBEBIDAS EN EL FLUJO
vrf_doc AS (
  SELECT COUNT(DISTINCT ip.PROCESS_ID) AS total
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip,
    LATERAL FLATTEN(input => PARSE_JSON(ip.VALIDATIONS)) AS f
  WHERE ip.CLIENT_ID = '{{ $json.CLIENT_ID }}'
    AND ip.FLOW_ID = '{{ $json.flow_id }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
        >= (SELECT mes_actual_inicio FROM params)
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
        <= (SELECT mes_actual_fin FROM params)
    AND f.value:type::STRING = 'document-validation'
    AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
),

vrf_doc_exitoso AS (
  SELECT COUNT(DISTINCT ip.PROCESS_ID) AS total
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip,
    LATERAL FLATTEN(input => PARSE_JSON(ip.VALIDATIONS)) AS f
  WHERE ip.CLIENT_ID = '{{ $json.CLIENT_ID }}'
    AND ip.FLOW_ID = '{{ $json.flow_id }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
        >= (SELECT mes_actual_inicio FROM params)
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
        <= (SELECT mes_actual_fin FROM params)
    AND f.value:type::STRING = 'document-validation'
    AND f.value:validation_status::STRING = 'success'
    AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
),

-- NUEVO 2026-05: procesos con validacion doc expirada (sin fallo real ni exito previo)
vrf_doc_expira AS (
  SELECT COUNT(DISTINCT process_id) AS total
  FROM (
    SELECT
      ip.PROCESS_ID,
      MAX(CASE
        WHEN f.value:type::STRING = 'document-validation'
          AND (
            f.value:validation_status::STRING = 'expired'
            OR (
              f.value:validation_status::STRING = 'failure'
              AND (f.value:failure_reason::STRING IS NULL
                   OR f.value:failure_reason::STRING = '')
            )
          )
        THEN 1 ELSE 0 END)                               AS tiene_expira,
      MAX(CASE
        WHEN f.value:type::STRING = 'document-validation'
          AND f.value:validation_status::STRING = 'failure'
          AND f.value:failure_reason::STRING IS NOT NULL
          AND f.value:failure_reason::STRING != ''
        THEN 1 ELSE 0 END)                               AS tiene_fallo_real,
      MAX(CASE
        WHEN f.value:type::STRING = 'document-validation'
          AND f.value:validation_status::STRING = 'success'
        THEN 1 ELSE 0 END)                               AS tiene_exito
    FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip,
      LATERAL FLATTEN(input => PARSE_JSON(ip.VALIDATIONS)) AS f
    WHERE ip.CLIENT_ID = '{{ $json.CLIENT_ID }}'
      AND ip.FLOW_ID = '{{ $json.flow_id }}'
      AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
          >= (SELECT mes_actual_inicio FROM params)
      AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
          <= (SELECT mes_actual_fin FROM params)
      AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
    GROUP BY ip.PROCESS_ID
  )
  WHERE tiene_expira = 1
    AND tiene_fallo_real = 0
    AND tiene_exito = 0
),

vrf_rostro AS (
  SELECT COUNT(DISTINCT ip.PROCESS_ID) AS total
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip,
    LATERAL FLATTEN(input => PARSE_JSON(ip.VALIDATIONS)) AS f
  WHERE ip.CLIENT_ID = '{{ $json.CLIENT_ID }}'
    AND ip.FLOW_ID = '{{ $json.flow_id }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
        >= (SELECT mes_actual_inicio FROM params)
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
        <= (SELECT mes_actual_fin FROM params)
    AND f.value:type::STRING = 'face-recognition'
    AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
),

vrf_rostro_exitoso AS (
  SELECT COUNT(DISTINCT ip.PROCESS_ID) AS total
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip,
    LATERAL FLATTEN(input => PARSE_JSON(ip.VALIDATIONS)) AS f
  WHERE ip.CLIENT_ID = '{{ $json.CLIENT_ID }}'
    AND ip.FLOW_ID = '{{ $json.flow_id }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
        >= (SELECT mes_actual_inicio FROM params)
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
        <= (SELECT mes_actual_fin FROM params)
    AND f.value:type::STRING = 'face-recognition'
    AND f.value:validation_status::STRING = 'success'
    AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
),

vrf_identidad_exitosa AS (
  SELECT COUNT(DISTINCT PROCESS_ID) AS total
  FROM (
    SELECT ip.PROCESS_ID
    FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip,
      LATERAL FLATTEN(input => PARSE_JSON(ip.VALIDATIONS)) AS f
    WHERE ip.CLIENT_ID = '{{ $json.CLIENT_ID }}'
      AND ip.FLOW_ID = '{{ $json.flow_id }}'
      AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
          >= (SELECT mes_actual_inicio FROM params)
      AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
          <= (SELECT mes_actual_fin FROM params)
      AND f.value:type::STRING IN ('document-validation','face-recognition')
      AND f.value:validation_status::STRING = 'success'
      AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
    GROUP BY ip.PROCESS_ID
    HAVING COUNT(DISTINCT f.value:type::STRING) = 2
  )
),

vrf_firma_iniciada AS (
  SELECT COUNT(DISTINCT ip.PROCESS_ID) AS total
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip,
    LATERAL FLATTEN(input => PARSE_JSON(ip.VALIDATIONS)) AS f
  WHERE ip.CLIENT_ID = '{{ $json.CLIENT_ID }}'
    AND ip.FLOW_ID = '{{ $json.flow_id }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
        >= (SELECT mes_actual_inicio FROM params)
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
        <= (SELECT mes_actual_fin FROM params)
    AND f.value:type::STRING = 'electronic-signature'
    AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
),

vrf_firma_exitosa AS (
  SELECT COUNT(DISTINCT ip.PROCESS_ID) AS total
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip,
    LATERAL FLATTEN(input => PARSE_JSON(ip.VALIDATIONS)) AS f
  WHERE ip.CLIENT_ID = '{{ $json.CLIENT_ID }}'
    AND ip.FLOW_ID = '{{ $json.flow_id }}'
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
        >= (SELECT mes_actual_inicio FROM params)
    AND CAST(CONVERT_TIMEZONE('UTC','America/Bogota', ip.CREATION_DATE) AS DATE)
        <= (SELECT mes_actual_fin FROM params)
    AND f.value:type::STRING = 'electronic-signature'
    AND f.value:validation_status::STRING = 'success'
    AND (ip.DECLINED_REASON IS NULL OR LOWER(ip.DECLINED_REASON) != 'not_used')
),

-- BLOQUE FUNNEL OTB
bloque_funnel_otb AS (
  SELECT
    'funnel_otb'                                         AS bloque,
    '{{ $json.flow_id }}'                                AS flow_id,
    '{{ $json.flow_name }}'                              AS flow_name,
    (SELECT COUNT(MESSAGE_ID) FROM otb_actual)           AS enviados,
    (SELECT COUNT(CASE WHEN STATUS = 'failure'
      THEN MESSAGE_ID END) FROM otb_actual)              AS fallan_meta,
    (SELECT COUNT(CASE WHEN STATUS = 'success'
      THEN MESSAGE_ID END) FROM otb_actual)              AS recepcion,
    (SELECT COUNT(CASE WHEN STATUS = 'success'
      AND (OUTBOUND_RESPONSE IS NULL
        OR OUTBOUND_RESPONSE != 'continue_process')
      THEN MESSAGE_ID END) FROM otb_actual)              AS no_respondidos,
    (SELECT COUNT(CASE WHEN OUTBOUND_RESPONSE = 'continue_process'
      THEN MESSAGE_ID END) FROM otb_actual)              AS iniciados_otb,
    (SELECT COUNT(DISTINCT PROCESS_ID)
      FROM procesos_actual)                              AS total_procesos,
    GREATEST(
      (SELECT COUNT(DISTINCT PROCESS_ID) FROM procesos_actual)
      - (SELECT COUNT(CASE WHEN OUTBOUND_RESPONSE = 'continue_process'
          THEN MESSAGE_ID END) FROM otb_actual),
      0
    )                                                    AS iniciados_inb,
    (SELECT COUNT(MESSAGE_ID) FROM otb_prev)             AS enviados_prev,
    (SELECT COUNT(CASE WHEN STATUS = 'failure'
      THEN MESSAGE_ID END) FROM otb_prev)                AS fallan_meta_prev,
    (SELECT COUNT(CASE WHEN STATUS = 'success'
      THEN MESSAGE_ID END) FROM otb_prev)                AS recepcion_prev
),

-- BLOQUE FUNNEL STEPS
bloque_steps AS (
  SELECT
    'funnel_steps'                                      AS bloque,
    '{{ $json.flow_id }}'                               AS flow_id,
    '{{ $json.flow_name }}'                             AS flow_name,
    cs.STEP_NAME                                        AS step_nombre,
    COUNT(DISTINCT cs.PROCESS_ID)                       AS procesos_iniciados,
    COUNT(DISTINCT CASE
      WHEN LOWER(cs.STEP_STATUS) IN ('success','exitoso','successful')
      THEN cs.PROCESS_ID END)                           AS procesos_exitosos,
    COUNT(DISTINCT cs.PROCESS_ID)
      - COUNT(DISTINCT CASE
          WHEN LOWER(cs.STEP_STATUS) IN ('success','exitoso','successful')
          THEN cs.PROCESS_ID END)                       AS drop_off_abs,
    ROUND(
      (COUNT(DISTINCT cs.PROCESS_ID)
       - COUNT(DISTINCT CASE
           WHEN LOWER(cs.STEP_STATUS) IN ('success','exitoso','successful')
           THEN cs.PROCESS_ID END)) * 100.0
      / NULLIF(COUNT(DISTINCT cs.PROCESS_ID), 0)
    , 2)                                                AS drop_off_pct,
    ROW_NUMBER() OVER (
      ORDER BY COUNT(DISTINCT cs.PROCESS_ID) DESC
    )                                                   AS orden
  FROM steps_actual cs
  WHERE cs.STEP_NAME IS NOT NULL
  GROUP BY cs.STEP_NAME
),

-- BLOQUE VRF (incluye doc_expira nuevo 2026-05)
bloque_vrf AS (
  SELECT
    'vrf'                                               AS bloque,
    '{{ $json.flow_id }}'                               AS flow_id,
    '{{ $json.flow_name }}'                             AS flow_name,
    vd.total                                            AS doc_iniciados,
    vde.total                                           AS doc_exitosos,
    vdx.total                                           AS doc_expira,
    ROUND(vde.total * 100.0 / NULLIF(vd.total, 0), 2)  AS doc_tasa_exito,
    ROUND(vdx.total * 100.0 / NULLIF(vd.total, 0), 2)  AS doc_tasa_expira,
    vr.total                                            AS rostro_iniciados,
    vre.total                                           AS rostro_exitosos,
    ROUND(vre.total * 100.0 / NULLIF(vr.total, 0), 2)  AS rostro_tasa_exito,
    vi.total                                            AS identidad_exitosa,
    ROUND(vi.total * 100.0 / NULLIF(vd.total, 0), 2)   AS identidad_tasa_exito,
    vfi.total                                           AS firma_iniciada,
    vfe.total                                           AS firma_exitosa,
    ROUND(vfe.total * 100.0 / NULLIF(vfi.total, 0), 2) AS firma_tasa_exito
  FROM vrf_doc vd
  CROSS JOIN vrf_doc_exitoso vde
  CROSS JOIN vrf_doc_expira vdx
  CROSS JOIN vrf_rostro vr
  CROSS JOIN vrf_rostro_exitoso vre
  CROSS JOIN vrf_identidad_exitosa vi
  CROSS JOIN vrf_firma_iniciada vfi
  CROSS JOIN vrf_firma_exitosa vfe
)

-- OUTPUT FINAL
SELECT 'funnel_otb' AS bloque, flow_id, flow_name,
  CAST(enviados AS VARCHAR)         AS col1,
  CAST(fallan_meta AS VARCHAR)      AS col2,
  CAST(recepcion AS VARCHAR)        AS col3,
  CAST(no_respondidos AS VARCHAR)   AS col4,
  CAST(iniciados_otb AS VARCHAR)    AS col5,
  CAST(iniciados_inb AS VARCHAR)    AS col6,
  CAST(total_procesos AS VARCHAR)   AS col7,
  CAST(enviados_prev AS VARCHAR)    AS col8,
  CAST(fallan_meta_prev AS VARCHAR) AS col9,
  CAST(recepcion_prev AS VARCHAR)   AS col10,
  NULL AS col11,
  NULL AS col_extra1, NULL AS col_extra2,
  NULL AS col_extra3, NULL AS col_extra4
FROM bloque_funnel_otb

UNION ALL

SELECT 'funnel_steps' AS bloque, flow_id, flow_name,
  step_nombre                               AS col1,
  CAST(procesos_iniciados AS VARCHAR)       AS col2,
  CAST(procesos_exitosos AS VARCHAR)        AS col3,
  CAST(drop_off_abs AS VARCHAR)             AS col4,
  CAST(drop_off_pct AS VARCHAR)             AS col5,
  CAST(orden AS VARCHAR)                    AS col6,
  NULL AS col7, NULL AS col8, NULL AS col9,
  NULL AS col10, NULL AS col11,
  NULL AS col_extra1, NULL AS col_extra2,
  NULL AS col_extra3, NULL AS col_extra4
FROM bloque_steps

UNION ALL

SELECT 'vrf' AS bloque, flow_id, flow_name,
  CAST(doc_iniciados AS VARCHAR)        AS col1,
  CAST(doc_exitosos AS VARCHAR)         AS col2,
  CAST(doc_expira AS VARCHAR)           AS col3,
  CAST(doc_tasa_exito AS VARCHAR)       AS col4,
  CAST(doc_tasa_expira AS VARCHAR)      AS col5,
  CAST(rostro_iniciados AS VARCHAR)     AS col6,
  CAST(rostro_exitosos AS VARCHAR)      AS col7,
  CAST(rostro_tasa_exito AS VARCHAR)    AS col8,
  CAST(identidad_exitosa AS VARCHAR)    AS col9,
  CAST(identidad_tasa_exito AS VARCHAR) AS col10,
  CAST(firma_iniciada AS VARCHAR)       AS col11,
  CAST(firma_exitosa AS VARCHAR)        AS col_extra1,
  CAST(firma_tasa_exito AS VARCHAR)     AS col_extra2,
  NULL AS col_extra3, NULL AS col_extra4
FROM bloque_vrf

ORDER BY bloque;
