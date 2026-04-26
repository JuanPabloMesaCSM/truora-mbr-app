-- BotiAlertas — CE (Customer Engagement) — version para flujo ORIGINAL (no v2)
-- Listo para copiar y pegar directo en el nodo Snowflake del flujo original.
--
-- FIX 1 (2026-04-24): parentesis en WHERE del CTE `base` para que el filtro
--   `trigger_channel_type IN (...)` aplique tambien al rango del mes anterior.
--   Antes: `A AND B OR C` parseaba como `(A AND B) OR C`, metiendo rows de
--   cualquier trigger_channel_type en prev_month y contaminando total_general.
--
-- FIX 2 (2026-04-25): client_list actualizado al estado reconciliado de Supabase
--   (39 TCIs distintos con client_id_ce activo, vs 56 hardcodeados antiguos
--   que incluian clientes archivados o mal etiquetados).
--
-- Para version dinamica (Supabase -> Code -> Snowflake) ver botialertas_ce.sql.

WITH client_list AS (
    SELECT COLUMN1 AS CLIENT_ID
    FROM VALUES
        ('TCI02aa3470a46fc4fc33f77247f2534a96'),('TCI04ff8764237105856df212574c49698d'),
        ('TCI05abad976e829d35d9b818b03c8b4edd'),('TCI0c318c020114778866eaaea009fab6a8'),
        ('TCI10d2b7a34ba43c4cd218527dd0276b99'),('TCI1539760bcf714e6aef169034c50aea0c'),
        ('TCI1692cbd49ebede50c7223ea650750dd9'),('TCI17097193bde4c5b673d1bc200dc34655'),
        ('TCI1b30dc44374d2f5034b8c3b43510e98f'),('TCI1e6cf6d9442fe8e1ceb5180a451192d8'),
        ('TCI28fa158b942388fe97860402da9b9114'),('TCI2e6d5145eb7817545ec896d32686bbb8'),
        ('TCI4524f5d971bbd3b73c543ce811507890'),('TCI53167124797fdd900d92059917f3c370'),
        ('TCI541017e18557d45cd88d7afb5ff962bd'),('TCI61eee74c8340cec8023271047325603f'),
        ('TCI628e729b9d28f9eda1302c4d6b719865'),('TCI658d1b2d797ee3b7c26fc275dca50a83'),
        ('TCI727fd2d9d603ab0f27a66a4b74c9cd7d'),('TCI778a84a9fc6ffa3f03575220daff76f7'),
        ('TCI7af974bf32740740f87b748fbca87f00'),('TCI7eb85b57c138c8161c706fff69f1e9c6'),
        ('TCI8dd8d8bad4a5239a5fd440b1eb222b2e'),('TCI8ebe25f99d357e0587b5e90921180884'),
        ('TCI9b0f026edb21b8581431f1784078c703'),('TCIb1afd2ba9d47d0aab336955d539a7713'),
        ('TCIc6b86729888653131195c4f193071a2c'),('TCId189c152b8f6d4a388b6de5846d21805'),
        ('TCId702145a43fd40652c5d0fbe6ef0f884'),('TCIdb1b7314c47c7d0b175640f4d1680a0c'),
        ('TCIdc1678b9c8bc60670ddbaa5443a529b7'),('TCIddb282df32a7aadb07e7dc4fa1572a05'),
        ('TCIddc781cc675f59a5ec603d6de5c49684'),('TCIe521279fda8520a9696e7f3998ab64e6'),
        ('TCIe728303b71f4a4193a535c66be6956fe'),('TCIf4f6ac4ba1ac5d9f6524b35d5cd5c5ee'),
        ('TCIf9395114178f272ca71ba5a4c04b373a'),('TCIf9fcbf699d64808cb9f89d8865928604'),
        ('TCIfda6aa3d74356df128c9971c11910a14')
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
    -- FIX 1: filtro de trigger_channel_type aplica a ambos meses
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
