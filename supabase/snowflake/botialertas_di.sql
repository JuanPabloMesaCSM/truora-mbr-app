-- BotiAlertas — DI (Document Identity) — version para flujo ORIGINAL
-- Listo para copiar y pegar en el nodo Snowflake de DI.
--
-- FIX A (2026-04-25): AND -> OR en el filtro de volumen.
--   Antes: mtd > 500 AND pmtd > 500 -- excluia caidas a 0 (la alerta mas critica).
--   Ahora: mtd > 500 OR  pmtd > 500 -- alinea con BGC y CE.
--
-- FIX B (2026-04-25): se agrega filtro de variacion <= -30% o >= +100% para que
--   solo alerten cambios significativos (consistente con BGC y CE).
--   Antes: ORDER BY variacion ASC LIMIT 20 sin filtro -> top 20 con ruido.
--   Ahora: solo entran filas con variacion saliente; LIMIT 20 actua como tope.
--
-- Nota: este query usa CSM_CLIENTS (tabla Snowflake) para filtrar clientes con
-- owner asignado; no esta alineado a la tabla `clientes` de Supabase. Para alinear,
-- ver v2 (whitelist desde Supabase analoga al fix de CE).

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

daily AS (
  SELECT
    d.client_id AS client_id,
    c.company_name AS client_name,
    CAST(CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date) AS DATE) AS process_date,
    COUNT(DISTINCT p.process_id) AS daily_total_processes,
    COUNT(DISTINCT IFF(p.status = 'success', p.process_id, NULL)) AS daily_successes
  FROM TRUORA.TRUORA_SCHEMA.DOCUMENT_VALIDATION_HISTORY d
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
),

with_csm AS (
  SELECT
    s.client_id,
    s.client_name,
    csm.owner AS owner_csm,
    s.mtd_processes_current,
    s.mtd_successes_current,
    s.pmtd_processes_prev,
    s.pmtd_successes_prev
  FROM mtd s
  LEFT JOIN TRUORA.TRUORA_SCHEMA.CSM_CLIENTS csm
    ON s.client_id = csm.client_id
  WHERE csm.owner IS NOT NULL
)

SELECT
  client_id AS CLIENT_ID,
  client_name AS CLIENT_NAME,
  owner_csm AS OWNER_CSM,

  mtd_processes_current AS STD_PROCESSES_CURRENT,
  pmtd_processes_prev AS PSTD_PROCESSES_PREV,

  ROUND( (mtd_processes_current - pmtd_processes_prev)::FLOAT
         / NULLIF(pmtd_processes_prev, 0) * 100, 1) AS STD_PROCESSES_VARIATION,

  ROUND(mtd_successes_current::FLOAT / NULLIF(mtd_processes_current, 0) * 100, 1) AS STD_CONVERSION_CURRENT,
  ROUND(pmtd_successes_prev::FLOAT  / NULLIF(pmtd_processes_prev, 0) * 100, 1) AS PSTD_CONVERSION_PREV,

  ROUND((
    (mtd_successes_current::FLOAT / NULLIF(mtd_processes_current, 0)) -
    (pmtd_successes_prev::FLOAT  / NULLIF(pmtd_processes_prev, 0))
  ) / NULLIF((pmtd_successes_prev::FLOAT / NULLIF(pmtd_processes_prev, 0)), 0) * 100, 1) AS STD_CONVERSION_VARIATION

FROM with_csm
WHERE
  -- FIX A: OR en lugar de AND para no perder caidas a cero
  (mtd_processes_current > 500 OR pmtd_processes_prev > 500)
  -- FIX B: solo variaciones significativas (-30% o peor, o +100% o mas)
  AND (
    (pmtd_processes_prev > 0 AND ((mtd_processes_current - pmtd_processes_prev)::FLOAT / pmtd_processes_prev) * 100 <= -30)
    OR
    (pmtd_processes_prev > 0 AND ((mtd_processes_current - pmtd_processes_prev)::FLOAT / pmtd_processes_prev) * 100 >= 100)
  )
ORDER BY
  STD_PROCESSES_VARIATION ASC
LIMIT 20;
