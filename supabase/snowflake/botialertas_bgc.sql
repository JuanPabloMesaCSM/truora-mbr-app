-- BotiAlertas — BGC (Background Check)
-- FIX 2026-04-24: se agrega el mismo NOT IN de 9 TCIs al CTE pmtd para simetria con mtd.
-- Antes: asimetria causaba falsas alertas -100% para esos 9 clientes.

/* ============================================================
   1. FECHAS LOCALES
   ============================================================ */
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

/* ============================================================
   2. MTD Checks
   ============================================================ */
mtd AS (
  SELECT
    c.client_id,
    t.company_name AS client_name,
    COUNT(c.check_id) AS mtd_checks,
    AVG(c.score * 10) AS mtd_avg_score
  FROM TRUORA_SCHEMA.CHECKS_CHECKS c
  JOIN TRUORA_SCHEMA.TENANT t
    ON c.client_id = t.truora_client_id,
       q_final q
  WHERE c.creation_date >= q.cur_month_start
    AND c.creation_date <= q.today_local
    AND c.client_id NOT IN (
      'TCI8abd9a5daf7354d5b5ef5ca2822a2079',
      '4h4t6ct1mgmdje35qc1uff9vso',
      'TCIec02c4975de1d78e667310830033cb87',
      'TCI3ca341c4d9676046f26d1f8bd04200c7',
      'TCI86c5ce572d9a2efd04a0ff3b214d0c8a',
      'TCI1c787378d69397955d60d9b266e7d43d',
      'TCIdf8c524983866d798f6fee61274eb4bd',
      'TCI0b603d2fa388beebd2dda0d693141695',
      'TCI91eaa938a71955613274e160905e5d5d'
    )
  GROUP BY c.client_id, t.company_name
),

/* ============================================================
   3. PMTD Checks — FIX: mismo NOT IN que mtd
   ============================================================ */
pmtd AS (
  SELECT
    c.client_id,
    COUNT(c.check_id) AS pmtd_checks,
    AVG(c.score * 10) AS pmtd_avg_score
  FROM TRUORA_SCHEMA.CHECKS_CHECKS c,
       q_final q
  WHERE c.creation_date >= q.prev_month_start
    AND c.creation_date <= q.prev_mtd_end
    AND c.client_id NOT IN (
      'TCI8abd9a5daf7354d5b5ef5ca2822a2079',
      '4h4t6ct1mgmdje35qc1uff9vso',
      'TCIec02c4975de1d78e667310830033cb87',
      'TCI3ca341c4d9676046f26d1f8bd04200c7',
      'TCI86c5ce572d9a2efd04a0ff3b214d0c8a',
      'TCI1c787378d69397955d60d9b266e7d43d',
      'TCIdf8c524983866d798f6fee61274eb4bd',
      'TCI0b603d2fa388beebd2dda0d693141695',
      'TCI91eaa938a71955613274e160905e5d5d'
    )
  GROUP BY c.client_id
),

/* ============================================================
   4. Union con CSM
   ============================================================ */
with_csm AS (
  SELECT
    m.client_id,
    m.client_name,
    COALESCE(csm.owner, 'NO ASIGNADO') AS owner_csm,
    m.mtd_checks,
    COALESCE(p.pmtd_checks, 0) AS pmtd_checks,
    m.mtd_avg_score,
    p.pmtd_avg_score
  FROM mtd m
  LEFT JOIN pmtd p ON m.client_id = p.client_id
  LEFT JOIN TRUORA_SCHEMA.CSM_CLIENTS csm
    ON m.client_id = csm.client_id
)

/* ============================================================
   5. OUTPUT FINAL + FILTROS + LIMIT
   ============================================================ */
SELECT
  client_id,
  client_name,
  owner_csm,
  mtd_checks,
  pmtd_checks,
  CASE
    WHEN pmtd_checks = 0 THEN NULL
    ELSE ROUND(((mtd_checks - pmtd_checks) / pmtd_checks) * 100, 2)
  END AS pct_change_checks,
  mtd_avg_score,
  pmtd_avg_score
FROM with_csm
WHERE
  (mtd_checks > 500 OR pmtd_checks > 500)
  AND (
    (pmtd_checks > 0 AND ((mtd_checks - pmtd_checks) / pmtd_checks) * 100 <= -30)
    OR
    (pmtd_checks > 0 AND ((mtd_checks - pmtd_checks) / pmtd_checks) * 100 >= 100)
  )
ORDER BY pct_change_checks ASC
LIMIT 50;
