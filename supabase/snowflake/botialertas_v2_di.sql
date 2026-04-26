-- BotiAlertas v2 — DI (Document Identity)
-- Diferencias vs el query del flujo original:
--   * Whitelist dinamica desde Supabase (placeholder {{DI_CLIENT_LIST_VALUES}})
--   * Sin LIMIT, sin filtro de variacion ni de volumen: devuelve TODOS los
--     clientes del whitelist con sus metricas crudas. La clasificacion en
--     severidad y los recortes de volumen para Telegram se hacen en el
--     Code node "classify" del flujo n8n.
--   * No depende de TRUORA_SCHEMA.CSM_CLIENTS (estaba desactualizado y dejaba
--     entrar a clientes de ex-CSMs). El csm_email viene desde Supabase.
--
-- Como usarlo en n8n:
--   1. Code "Prepare Whitelists" expone $json.di_values con el texto literal
--      ('TCIxxx'),('TCIyyy'),...
--   2. Aqui reemplazar {{DI_CLIENT_LIST_VALUES}} por la expresion n8n
--      ={{ $json.di_values }}.

WITH p AS (
  SELECT
    CAST(CONVERT_TIMEZONE('UTC','America/Bogota', CURRENT_TIMESTAMP()) AS DATE) AS today_local,
    DATE_TRUNC('month', CAST(CONVERT_TIMEZONE('UTC','America/Bogota', CURRENT_TIMESTAMP()) AS DATE)) AS cur_month_start
),
b AS (
  SELECT
    today_local,
    cur_month_start,
    DATEADD('month', -1, cur_month_start) AS prev_month_start,
    DATEADD('day', -1, cur_month_start) AS last_day_prev_month,
    DATE_PART('day', today_local) AS dom
  FROM p
),
q_final AS (
  SELECT
    today_local,
    cur_month_start,
    prev_month_start,
    DATEADD(
      'day',
      LEAST(dom - 1, DATEDIFF('day', prev_month_start, last_day_prev_month)),
      prev_month_start
    ) AS prev_mtd_end
  FROM b
),

client_list AS (
  SELECT COLUMN1 AS client_id
  FROM VALUES
    {{DI_CLIENT_LIST_VALUES}}
),

daily AS (
  SELECT
    d.client_id AS client_id,
    c.company_name AS client_name,
    CAST(CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date) AS DATE) AS process_date,
    COUNT(DISTINCT p.process_id) AS daily_total_processes,
    COUNT(DISTINCT IFF(p.status = 'success', p.process_id, NULL)) AS daily_successes
  FROM TRUORA.TRUORA_SCHEMA.DOCUMENT_VALIDATION_HISTORY d
  JOIN client_list cl ON cl.client_id = d.client_id
  LEFT JOIN TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p
    ON d.identity_process_id = p.process_id
  LEFT JOIN TRUORA.TRUORA_SCHEMA.TENANT c
    ON c.truora_client_id = d.client_id
  WHERE
    p.creation_date IS NOT NULL
    AND CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date) >= DATEADD('day', -62, CURRENT_TIMESTAMP())
  GROUP BY 1,2,3
),

mtd AS (
  SELECT
    dl.client_id,
    MAX(dl.client_name) AS client_name,
    MIN(qf.today_local) AS today_local,
    MIN(qf.cur_month_start) AS cur_month_start,
    MIN(qf.prev_month_start) AS prev_month_start,
    MIN(qf.prev_mtd_end) AS prev_mtd_end,

    SUM(CASE WHEN dl.process_date BETWEEN qf.cur_month_start AND qf.today_local
             THEN dl.daily_total_processes ELSE 0 END) AS mtd_processes_current,

    SUM(CASE WHEN dl.process_date BETWEEN qf.cur_month_start AND qf.today_local
             THEN dl.daily_successes ELSE 0 END) AS mtd_successes_current,

    SUM(CASE WHEN dl.process_date BETWEEN qf.prev_month_start AND qf.prev_mtd_end
             THEN dl.daily_total_processes ELSE 0 END) AS pmtd_processes_prev,

    SUM(CASE WHEN dl.process_date BETWEEN qf.prev_month_start AND qf.prev_mtd_end
             THEN dl.daily_successes ELSE 0 END) AS pmtd_successes_prev
  FROM daily dl
  CROSS JOIN q_final qf
  GROUP BY dl.client_id
)

SELECT
  client_id                         AS CLIENT_ID,
  client_name                       AS CLIENT_NAME,
  today_local                       AS PERIODO_ACTUAL_FIN,
  cur_month_start                   AS PERIODO_ACTUAL_INICIO,
  prev_month_start                  AS PERIODO_ANTERIOR_INICIO,
  prev_mtd_end                      AS PERIODO_ANTERIOR_FIN,

  mtd_processes_current             AS MTD_PROCESSES,
  pmtd_processes_prev               AS PMTD_PROCESSES,
  mtd_successes_current             AS MTD_SUCCESSES,
  pmtd_successes_prev               AS PMTD_SUCCESSES,

  ROUND(mtd_successes_current::FLOAT / NULLIF(mtd_processes_current, 0) * 100, 1)
                                    AS MTD_CONVERSION_PCT,
  ROUND(pmtd_successes_prev::FLOAT  / NULLIF(pmtd_processes_prev, 0) * 100, 1)
                                    AS PMTD_CONVERSION_PCT
FROM mtd
ORDER BY client_id;
