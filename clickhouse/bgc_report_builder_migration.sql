-- ============================================================
-- MIGRACIÓN BGC Report Builder → ClickHouse (consumo facturable)
-- ============================================================
-- Estado 2026-06-01. NO publicado (validando capa de datos).
-- Mismo método que CE (ver ce_report_builder_migration.sql).
-- Reglas billable checks: skill clickhouse-counters-metabase.md.
--
-- Arquitectura BGC: el Report Builder BGC MUESTRA Snowflake; los endpoints
-- CH solo alimentan `Reconciliar BGC` (alertas de divergencia), NO se muestran
-- (igual que DI). Migrar = override de los bloques SF de volumen con CH billable.
--
-- Reglas billable BGC (validadas):
--   product IN ('checks_check','checks_continuous_check','checks_premium_collector')
--   status = 'completed'  (lo que se cobra; el front dice "solo completado")
--   check_type NOT IN ('document-validation','validation')
--   + FINAL + count(DISTINCT record_id) (uniqExact)
--   + TZ = UTC  → toDate(date_counted)   ← CLAVE: BGC factura en UTC, NO Bogotá
--                                            (CE = Bogotá). Validado vs front.
--   ⚠️ doc-verification ≠ document-validation: doc-verification SÍ se cobra
--      (valida identidad con solo el nº de doc, sin foto). NUNCA excluirlo.
--
-- Validación TZ (cliente cedula TCI74cf7e31da0662c51385166e50b199c8, abril):
--   UTC = 353.295 = front EXACTO ; Bogotá = 359.248 (+1,68% de borde). → UTC.
--
-- Mapa de migrabilidad BGC:
--   1_resumen_general   → CH PARCIAL (total/completados/errores → CH; score + pass_rate → SF)
--   2_por_pais          → CH  (country)
--   2b_pais_x_tipo      → CH  (country + check_type)        [BGC-6]
--   3_por_tipo          → CH  (check_type, filtrado custom_types) [BGC-7]
--   4_score_por_pais    → SF  (CH no tiene score)
--   5_labels / 6_labels_high_score → SF (labels de resultado)
--   7_historico_3meses  → CH  (completados billable mensual)
--   8_bases_premium     → CH  (ARRAY JOIN database_statuses, plegado en 7bea8ad7)  [BGC-8, solo-CH]
--
-- Params: {client_id:String}, {fecha_inicio:String}, {fecha_fin:String}
-- (GET + param_client_id / param_fecha_inicio / param_fecha_fin, Basic Auth).
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- ENDPOINT 7bea8ad7 — "BGC Resumen" (block 1, cur+prev MoM)  ✅ VALIDADO + GUARDADO
-- Reemplazó el SQL viejo (sin FINAL, COUNT(*), is_validation_retry, sin exclusión,
-- date<= bug). Devuelve total/completados/errores actual + previo.
-- ════════════════════════════════════════════════════════════
WITH rng AS (
  SELECT
    toDate({fecha_inicio:String})                                    AS cur_start,
    toDate({fecha_fin:String})                                       AS cur_end,
    toStartOfMonth(toDate({fecha_inicio:String}) - INTERVAL 1 MONTH) AS prev_start,
    addDays(toDate({fecha_inicio:String}), -1)                       AS prev_end
),
checks AS (
  SELECT record_id, status, toDate(date_counted) AS d
  FROM production.client_usage_records FINAL
  WHERE client_id = {client_id:String}
    AND product IN ('checks_check','checks_continuous_check','checks_premium_collector')
    AND check_type NOT IN ('document-validation','validation')
    AND toDate(date_counted) >= (SELECT prev_start FROM rng)
    AND toDate(date_counted) <= (SELECT cur_end   FROM rng)
)
SELECT
  uniqExactIf(record_id, d BETWEEN r.cur_start AND r.cur_end)                          AS CUR_TOTAL,
  uniqExactIf(record_id, status='completed' AND d BETWEEN r.cur_start AND r.cur_end)   AS CUR_COMPLETADOS,
  uniqExactIf(record_id, status='error'     AND d BETWEEN r.cur_start AND r.cur_end)   AS CUR_ERRORES,
  uniqExactIf(record_id, d BETWEEN r.prev_start AND r.prev_end)                        AS PREV_TOTAL,
  uniqExactIf(record_id, status='completed' AND d BETWEEN r.prev_start AND r.prev_end) AS PREV_COMPLETADOS,
  uniqExactIf(record_id, status='error'     AND d BETWEEN r.prev_start AND r.prev_end) AS PREV_ERRORES,
  -- Block 8 (bases premium) plegado acá: breakdown billable por base en una columna
  -- array, solo periodo actual. Grano por database_id (NO por dataset → evita doble-conteo
  -- de checks que consultan la misma base en 2 datasets). dbs.3='completed' = base
  -- efectivamente consultada (los 'skipped' no se cobran). El frontend mapea el hash.
  (
    SELECT groupArray((database_id, consultas))
    FROM (
      SELECT dbs.1 AS database_id, count(DISTINCT record_id) AS consultas
      FROM production.client_usage_records FINAL
      ARRAY JOIN database_statuses AS dbs
      WHERE client_id = {client_id:String}
        AND product IN ('checks_check','checks_continuous_check','checks_premium_collector')
        AND check_type NOT IN ('document-validation','validation')
        AND status = 'completed' AND dbs.3 = 'completed'
        AND toDate(date_counted) >= toDate({fecha_inicio:String})
        AND toDate(date_counted) <= toDate({fecha_fin:String})
      GROUP BY database_id
      HAVING consultas > 0
    )
  ) AS BASES_PREMIUM
FROM checks c CROSS JOIN rng r;
-- VALIDADO cedula TCI74cf abril: CUR_COMPLETADOS=353.295 (=front), CUR_TOTAL=353.323,
--   CUR_ERRORES=28; PREV_COMPLETADOS=385.717, PREV_TOTAL=389.842, PREV_ERRORES=4.125.
-- VALIDADO Indrive abril BASES_PREMIUM: [[DBI386…,21661],[DBIad83…(IMSS),9114],[DBI41100407…(PEP FIMPE),14]]
--   IMSS 9.114 = front EXACTO, PEP FIMPE 14 = front EXACTO. (crudo sin dbs.3='completed' daba IMSS 11.069).


-- ════════════════════════════════════════════════════════════
-- ENDPOINT ad039af3 — "BGC País×Tipo" (blocks 2, 2b, 3)  ✅ FIX IN-PLACE VALIDADO + GUARDADO
-- DECISIÓN (2026-06-01): REUSAR ad039af3, NO crear nuevo. Es client_bgc_by_country
--   (= país×tipo de BGC), misma semántica — solo está mal hecho. Arreglarlo = ponerlo
--   correcto para su propósito original; el agente se beneficia, no se rompe.
--   (Distinto de CE: ahí e0425fdf es client_di_by_flow = producto DI, por eso ahí sí
--   creamos endpoint nuevo para no darle semántica CE a un endpoint DI.)
-- Mantiene params {from:Date}/{to:Date} + nombres de columna → el nodo del RB y el
--   wrapper del agente lo siguen llamando igual, solo reciben datos correctos.
--   "Update del agente" = refrescar la descripción en queries_repository (no breaking).
-- Bonus: el viejo exigía {custom_type:String} obligatorio que el nodo del RB no manda
--   (probablemente erroreaba). Al quitarlo, se arregla el nodo del RB también.
-- ⚠️ Verificar que el wrapper ch-agent-query NO mande param_custom_type obligatorio.
-- Sirve para por_pais (agg sobre tipo), por_tipo (agg sobre país) y pais_x_tipo.
-- ════════════════════════════════════════════════════════════
SELECT
  country,
  check_type,
  uniqExact(record_id)                        AS total_checks,
  uniqExactIf(record_id, status='completed')  AS completados,
  uniqExactIf(record_id, status='error')      AS errores,
  ROUND(uniqExactIf(record_id, status='completed') * 100.0
        / NULLIF(uniqExact(record_id), 0), 1) AS tasa_completado_pct
FROM production.client_usage_records FINAL
WHERE client_id = {client_id:String}
  AND product IN ('checks_check','checks_continuous_check','checks_premium_collector')
  AND check_type NOT IN ('document-validation','validation')
  AND toDate(date_counted) >= toDate({from:Date})
  AND toDate(date_counted) <= toDate({to:Date})
GROUP BY country, check_type
ORDER BY completados DESC;
-- Mantiene params {from:Date}/{to:Date} + columnas (total_checks/completados/errores/tasa)
-- que ya lee el parser 'Output parseado Pais Tipo BGC' y el wrapper del agente.
-- VALIDADO Indrive abril (15 filas, completados por celda):
--   CL doc-verification 81.114, CO bg-check-driver 44.566, MX bg-check-driver 21.785,
--   MX solo_imss 11.069 (tasa 41,3% por not_started), PE bg-check-driver 10.651,
--   EC 5.654, CL bg-check-driver 5.361, CR 1.545, ... Σ completados = 181.784 ✓ EXACTO.


-- ════════════════════════════════════════════════════════════
-- ENDPOINT (NUEVO, UUID 55b9c609-4a7e-4f27-855f-378e5378ec46) — "BGC Histórico" (block 7)  ✅ VALIDADO + GUARDADO
-- Ventana 4 meses (actual + 3 atrás) para matchear el SF (historico_inicio =
-- DATE_TRUNC month, fecha_inicio - 3 month), zero-fill. SF block 7 ya usa UTC.
-- OVERRIDE PARCIAL en n8n: col1=total, col2=completados, col3=errores → CH (por mes);
--   col4=score, col5=pass_rate → SF (CH no tiene score). Match por periodo (mes).
-- ════════════════════════════════════════════════════════════
SELECT
  toStartOfMonth(date_counted)                AS MES,
  uniqExact(record_id)                        AS TOTAL,
  uniqExactIf(record_id, status='completed')  AS COMPLETADOS,
  uniqExactIf(record_id, status='error')      AS ERRORES
FROM production.client_usage_records FINAL
WHERE client_id = {client_id:String}
  AND product IN ('checks_check','checks_continuous_check','checks_premium_collector')
  AND check_type NOT IN ('document-validation','validation')
  AND toStartOfMonth(date_counted) >= toStartOfMonth(toDate({fecha_inicio:String}) - INTERVAL 3 MONTH)
  AND toStartOfMonth(date_counted) <= toStartOfMonth(toDate({fecha_inicio:String}))
GROUP BY MES
ORDER BY MES ASC
WITH FILL
  FROM toStartOfMonth(toDate({fecha_inicio:String}) - INTERVAL 3 MONTH)
  TO   toStartOfMonth(toDate({fecha_inicio:String})) + INTERVAL 1 MONTH
  STEP toIntervalMonth(1);
-- VALIDADO cedula abril (4 filas ene→abr): 2026-04 TOTAL 353.323 / COMPLETADOS 353.295
--   / ERRORES 28 (= Resumen CUR); 2026-03 389.842/385.717/4.125 (= Resumen PREV);
--   2026-02 286.796/286.297/499; 2026-01 936/936/0. Consistente con Resumen ✓.
