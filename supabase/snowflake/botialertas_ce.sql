-- BotiAlertas — CE (Customer Engagement)
-- n8n v2 — lista de clientes viene del nodo Supabase previo (dinamica).
--
-- Como usarlo en n8n:
--   1. Nodo Supabase anterior: SELECT DISTINCT client_id_ce FROM clientes
--        WHERE client_id_ce IS NOT NULL AND activo = true
--   2. Nodo Code siguiente (JavaScript): arma el fragmento VALUES ('tci1'),('tci2'),...
--      desde $items('Supabase') y lo expone como $json.ce_client_list_values.
--      Ver botialertas_ce_prepare_list.js para el snippet exacto.
--   3. Este SQL en el nodo Snowflake: reemplazar {{CE_CLIENT_LIST_VALUES}} con la
--      expresion n8n ={{ $json.ce_client_list_values }}. Snowflake recibe el texto
--      literal ('a'),('b'),... ya formateado.
--
-- FIX 2026-04-24:
--   * Parentesis en WHERE del CTE `base` para que el filtro
--     `trigger_channel_type IN (...)` aplique tambien al rango del mes anterior.
--     Antes: `A AND B OR C` parseaba como `(A AND B) OR C`, metiendo rows de
--     cualquier trigger_channel_type en prev_month y contaminando total_general.
--   * client_list deja de estar hardcodeado; ahora se alimenta desde Supabase.

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
    -- FIX: filtro de trigger_channel_type aplica a ambos meses (parentesis alrededor del OR)
    WHERE cs.trigger_channel_type IN ('inbound','outbound','notification')
      AND CONVERT_TIMEZONE('UTC','America/Bogota', cs.creation_date)
          >= DATE_TRUNC('month', DATEADD('month', -1, CONVERT_TIMEZONE('UTC','America/Bogota', CURRENT_DATE)))
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

mtd AS (
    SELECT * FROM pivoted
    WHERE MONTH = DATE_TRUNC('month', CONVERT_TIMEZONE('UTC','America/Bogota', CURRENT_DATE))
),

pmtd AS (
    SELECT * FROM pivoted
    WHERE MONTH = DATE_TRUNC('month', DATEADD('month', -1, CONVERT_TIMEZONE('UTC','America/Bogota', CURRENT_DATE)))
),

final AS (
    SELECT
        m.company_name,
        m.client_id,
        m.inbound AS mtd_inbound,
        m.outbound AS mtd_outbound,
        m.notifications AS mtd_notifications,
        m.total_general AS mtd_total,

        p.inbound AS pmtd_inbound,
        p.outbound AS pmtd_outbound,
        p.notifications AS pmtd_notifications,
        p.total_general AS pmtd_total,

        CASE
            WHEN p.total_general > 0
            THEN ((m.total_general - p.total_general) / p.total_general) * 100
            ELSE NULL
        END AS variation_pct
    FROM mtd m
    LEFT JOIN pmtd p ON p.client_id = m.client_id
    WHERE
      (
        (p.total_general > 0 AND ((m.total_general - p.total_general)/p.total_general)*100 <= -30)
        OR
        (p.total_general > 0 AND ((m.total_general - p.total_general)/p.total_general)*100 >= 100)
      )
      AND (m.total_general > 500 OR p.total_general > 500)
    ORDER BY variation_pct ASC
    LIMIT 20
)

SELECT * FROM final;
