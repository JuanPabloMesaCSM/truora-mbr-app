-- BotiAlertas Ad-hoc — CE (Customer Engagement)
-- Mismo query que botialertas_v2_ce.sql pero parametrizado por fecha de corte.
--
-- Placeholders:
--   {{CE_CLIENT_LIST_VALUES}} — del Code "Prepare Whitelists" → $json.ce_values
--   {{FECHA_CORTE}}           — del Set "Set Params" → $json.fecha_corte_sql
--
-- IMPORTANTE: si arreglás algo acá, replicálo en botialertas_v2_ce.sql.

WITH client_list AS (
    SELECT COLUMN1 AS CLIENT_ID
    FROM VALUES
        {{CE_CLIENT_LIST_VALUES}}
),

base AS (
    SELECT
        DATE_TRUNC('month', CONVERT_TIMEZONE('UTC','America/Bogota', cs.creation_date)) AS MONTH,
        c.company_name,
        cs.client_id,
        CASE
            WHEN cs.trigger_channel_type = 'inbound' THEN 'INBOUND'
            WHEN cs.trigger_channel_type = 'outbound' THEN 'OUTBOUND'
            WHEN cs.trigger_channel_type = 'notification' THEN 'NOTIFICATIONS'
        END AS TYPE,
        COUNT(DISTINCT cs.process_id)::FLOAT AS TOTAL
    FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS cs
    JOIN client_list cl ON cl.client_id = cs.client_id
    LEFT JOIN TRUORA.TRUORA_SCHEMA.TENANT c ON c.truora_client_id = cs.client_id
    WHERE cs.trigger_channel_type IN ('inbound','outbound','notification')
      AND CONVERT_TIMEZONE('UTC','America/Bogota', cs.creation_date)
          >= DATE_TRUNC('month', DATEADD('month', -1, CAST(CONVERT_TIMEZONE('UTC','America/Bogota', {{FECHA_CORTE}}) AS DATE)))
    GROUP BY 1,2,3,4
),

pivoted AS (
    SELECT
        MONTH,
        company_name,
        client_id,
        COALESCE(SUM(CASE WHEN TYPE = 'INBOUND' THEN TOTAL END),0) AS inbound,
        COALESCE(SUM(CASE WHEN TYPE = 'OUTBOUND' THEN TOTAL END),0) AS outbound,
        COALESCE(SUM(CASE WHEN TYPE = 'NOTIFICATIONS' THEN TOTAL END),0) AS notifications,
        COALESCE(SUM(TOTAL),0) AS total_general
    FROM base
    GROUP BY 1,2,3
),

dates AS (
    SELECT
        CAST(CONVERT_TIMEZONE('UTC','America/Bogota', {{FECHA_CORTE}}) AS DATE) AS today_local,
        DATE_TRUNC('month', CAST(CONVERT_TIMEZONE('UTC','America/Bogota', {{FECHA_CORTE}}) AS DATE)) AS cur_month_start,
        DATE_TRUNC('month', DATEADD('month', -1, CAST(CONVERT_TIMEZONE('UTC','America/Bogota', {{FECHA_CORTE}}) AS DATE))) AS prev_month_start,
        DATEADD('day', -1, DATE_TRUNC('month', CAST(CONVERT_TIMEZONE('UTC','America/Bogota', {{FECHA_CORTE}}) AS DATE))) AS last_day_prev_month,
        DATE_PART('day', CAST(CONVERT_TIMEZONE('UTC','America/Bogota', {{FECHA_CORTE}}) AS DATE)) AS dom
),

-- mtd y pmtd ahora se filtran por (month, today_local restringido al período MTD/PMTD)
mtd AS (
    SELECT pv.*
    FROM pivoted pv
    CROSS JOIN dates d
    WHERE pv.MONTH = d.cur_month_start
),

pmtd AS (
    SELECT pv.*
    FROM pivoted pv
    CROSS JOIN dates d
    WHERE pv.MONTH = d.prev_month_start
)

SELECT
    cl.client_id                                          AS CLIENT_ID,
    COALESCE(m.company_name, p.company_name, t.company_name, '') AS CLIENT_NAME,

    d.today_local                                         AS PERIODO_ACTUAL_FIN,
    d.cur_month_start                                     AS PERIODO_ACTUAL_INICIO,
    d.prev_month_start                                    AS PERIODO_ANTERIOR_INICIO,
    DATEADD('day',
        LEAST(d.dom - 1, DATEDIFF('day', d.prev_month_start, d.last_day_prev_month)),
        d.prev_month_start)                               AS PERIODO_ANTERIOR_FIN,

    COALESCE(m.inbound, 0)                                AS MTD_INBOUND,
    COALESCE(m.outbound, 0)                               AS MTD_OUTBOUND,
    COALESCE(m.notifications, 0)                          AS MTD_NOTIFICATIONS,
    COALESCE(m.total_general, 0)                          AS MTD_TOTAL,

    COALESCE(p.inbound, 0)                                AS PMTD_INBOUND,
    COALESCE(p.outbound, 0)                               AS PMTD_OUTBOUND,
    COALESCE(p.notifications, 0)                          AS PMTD_NOTIFICATIONS,
    COALESCE(p.total_general, 0)                          AS PMTD_TOTAL
FROM client_list cl
CROSS JOIN dates d
LEFT JOIN mtd  m ON m.client_id = cl.client_id
LEFT JOIN pmtd p ON p.client_id = cl.client_id
LEFT JOIN TRUORA.TRUORA_SCHEMA.TENANT t ON t.truora_client_id = cl.client_id
ORDER BY cl.client_id;
