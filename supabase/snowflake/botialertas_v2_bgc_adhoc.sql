-- BotiAlertas Ad-hoc — BGC (Background Check)
-- Mismo query que botialertas_v2_bgc.sql pero parametrizado por fecha de corte.
--
-- Placeholders:
--   {{BGC_CLIENT_LIST_VALUES}} — del Code "Prepare Whitelists" → $json.bgc_values
--   {{FECHA_CORTE}}            — del Set "Set Params" → $json.fecha_corte_sql
--
-- IMPORTANTE: si arreglás algo acá, replicálo en botialertas_v2_bgc.sql.

WITH p AS (
  SELECT
    CAST(CONVERT_TIMEZONE('UTC','America/Bogota', {{FECHA_CORTE}}) AS DATE) AS today_local,
    DATE_TRUNC('month', CAST(CONVERT_TIMEZONE('UTC','America/Bogota', {{FECHA_CORTE}}) AS DATE)) AS cur_month_start
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
    {{BGC_CLIENT_LIST_VALUES}}
),

mtd AS (
  SELECT
    c.client_id,
    COUNT(c.check_id) AS mtd_checks,
    AVG(c.score * 10) AS mtd_avg_score
  FROM TRUORA_SCHEMA.CHECKS_CHECKS c
  JOIN client_list cl ON cl.client_id = c.client_id,
       q_final q
  WHERE c.creation_date >= q.cur_month_start
    AND c.creation_date <= q.today_local
  GROUP BY c.client_id
),

tenant_one AS (
  SELECT truora_client_id, ANY_VALUE(company_name) AS company_name
  FROM TRUORA_SCHEMA.TENANT
  WHERE truora_client_id IS NOT NULL
  GROUP BY truora_client_id
),

pmtd AS (
  SELECT
    c.client_id,
    COUNT(c.check_id) AS pmtd_checks,
    AVG(c.score * 10) AS pmtd_avg_score
  FROM TRUORA_SCHEMA.CHECKS_CHECKS c
  JOIN client_list cl ON cl.client_id = c.client_id,
       q_final q
  WHERE c.creation_date >= q.prev_month_start
    AND c.creation_date <= q.prev_mtd_end
  GROUP BY c.client_id
)

SELECT
  cl.client_id                                   AS CLIENT_ID,
  COALESCE(t.company_name, '')                   AS CLIENT_NAME,
  q.today_local                                  AS PERIODO_ACTUAL_FIN,
  q.cur_month_start                              AS PERIODO_ACTUAL_INICIO,
  q.prev_month_start                             AS PERIODO_ANTERIOR_INICIO,
  q.prev_mtd_end                                 AS PERIODO_ANTERIOR_FIN,

  COALESCE(m.mtd_checks, 0)                      AS MTD_CHECKS,
  COALESCE(p.pmtd_checks, 0)                     AS PMTD_CHECKS,
  m.mtd_avg_score                                AS MTD_AVG_SCORE,
  p.pmtd_avg_score                               AS PMTD_AVG_SCORE
FROM client_list cl
CROSS JOIN q_final q
LEFT JOIN mtd  m ON m.client_id  = cl.client_id
LEFT JOIN pmtd p ON p.client_id  = cl.client_id
LEFT JOIN tenant_one t ON t.truora_client_id = cl.client_id
ORDER BY cl.client_id;
