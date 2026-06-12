-- ============================================================================
-- COMPARACIÓN LADO A LADO — por qué el dashboard DI mide bien a Mi Banco
-- (DI-en-WhatsApp, números sensatos) pero NO a TCIbf21 (procesos >> validaciones)
--
-- NO es un bug del localhost / Feature 1: ambos pasan por la MISMA query de
-- producción (dashboard_metrics_di.sql, bloque1 col1 = COUNT(DISTINCT process_id)
-- sobre el set ip_actual). La diferencia está en los DATOS del cliente.
--
-- Filtro ip_actual replicado EXACTO de producción:
--   client_id + rango + LOWER(status) IN ('success','failure')
--   + (is_used IS NULL OR is_used=TRUE)
--   + (declined_reason IS NULL OR LOWER(declined_reason)!='not_used')
--
-- Marcador DI = IDENTITY_PROCESSES.VALIDATIONS (lógica VRF del Report Builder CE):
--   un proceso es DI si su array VALIDATIONS tiene >=1 validación de tipo DI
--   (todo menos electronic-signature).
--
-- Read-only. Si TRUORA_BASIC_USER no alcanza:  USE ROLE ANALYSTS;
--
-- Clientes:
--   Mi Banco COL  TCIe521279fda8520a9696e7f3998ab64e6  (dashboard CORRECTO)
--   Test client   TCIbf21dd25f648a3300907e646ae0807b6  (procesos inflados)
-- Rango Ene–May 2026 (reconcilia con el dashboard mostrado de Mi Banco).
-- ============================================================================


-- ============================================================================
-- QUERY 1 — RESUMEN lado a lado: total procesos (filtro prod) vs con validación
-- DI vs en conversaciones. Si la teoría es correcta:
--   Mi Banco  -> total ≈ con_validacion_DI  (limpio, ~11.458, ratio val/proc ~2)
--   TCIbf21   -> total >> con_validacion_DI  (inflado por conversaciones puras)
-- ============================================================================
WITH params AS (
  SELECT '2026-01-01'::DATE AS fi, '2026-05-31'::DATE AS ff
),
clientes AS (
  SELECT 'TCIe521279fda8520a9696e7f3998ab64e6'::VARCHAR AS client_id, 'Mi Banco COL' AS nombre
  UNION ALL
  SELECT 'TCIbf21dd25f648a3300907e646ae0807b6'::VARCHAR, 'Test client (TCIbf21)'
),
-- réplica EXACTA del set ip_actual de producción
ip AS (
  SELECT p.client_id, p.process_id, p.validations
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p
  JOIN clientes c ON c.client_id = p.client_id
  CROSS JOIN params pa
  WHERE CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date)::DATE BETWEEN pa.fi AND pa.ff
    AND LOWER(p.status) IN ('success','failure')
    AND (p.is_used IS NULL OR p.is_used = TRUE)
    AND (p.declined_reason IS NULL OR LOWER(p.declined_reason) != 'not_used')
),
val AS (
  SELECT ip.process_id,
    MAX(CASE WHEN f.value:type::STRING != 'electronic-signature' THEN 1 ELSE 0 END) AS tiene_di
  FROM ip, LATERAL FLATTEN(input => TRY_PARSE_JSON(ip.validations)) f
  GROUP BY ip.process_id
),
conv AS (
  SELECT DISTINCT cs.process_id
  FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS cs
  JOIN clientes c ON c.client_id = cs.client_id
)
SELECT
  ip.client_id,
  MAX(c.nombre)                                                                       AS cliente,
  COUNT(DISTINCT ip.process_id)                                                       AS total_procesos_prod,   -- = col1 del dashboard
  COUNT(DISTINCT CASE WHEN v.tiene_di = 1 THEN ip.process_id END)                     AS con_validacion_DI,
  COUNT(DISTINCT CASE WHEN cv.process_id IS NOT NULL THEN ip.process_id END)          AS en_conversaciones,
  COUNT(DISTINCT CASE WHEN v.tiene_di = 1 AND cv.process_id IS NOT NULL
                      THEN ip.process_id END)                                         AS DI_dentro_de_CE,       -- VRF real
  COUNT(DISTINCT CASE WHEN COALESCE(v.tiene_di,0) = 0 AND cv.process_id IS NOT NULL
                      THEN ip.process_id END)                                         AS conversacion_sin_DI,   -- contaminación pura
  COUNT(DISTINCT CASE WHEN COALESCE(v.tiene_di,0) = 0 AND cv.process_id IS NULL
                      THEN ip.process_id END)                                         AS ni_DI_ni_conv,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN COALESCE(v.tiene_di,0)=0 THEN ip.process_id END)
        / NULLIF(COUNT(DISTINCT ip.process_id),0), 1)                                 AS pct_sin_validacion
FROM ip
JOIN clientes c        ON c.client_id = ip.client_id
LEFT JOIN val  v       ON v.process_id  = ip.process_id
LEFT JOIN conv cv      ON cv.process_id = ip.process_id
GROUP BY ip.client_id
ORDER BY total_procesos_prod DESC;


-- ============================================================================
-- QUERY 2 — POR FLOW_ID (la pistola humeante): qué flujo aporta los procesos
-- y cuántos de ese flujo hacen validación DI vs son conversación.
--   Mi Banco  -> esperamos que TODO flujo con procesos tenga validaciones DI
--   TCIbf21   -> esperamos un flujo gordo con ~0 DI y ~100% conversaciones
-- (correr cambiando el client_id, o ver ambos juntos con el GROUP BY client_id)
-- ============================================================================
WITH params AS (
  SELECT '2026-01-01'::DATE AS fi, '2026-05-31'::DATE AS ff
),
clientes AS (
  SELECT 'TCIe521279fda8520a9696e7f3998ab64e6'::VARCHAR AS client_id, 'Mi Banco COL' AS nombre
  UNION ALL
  SELECT 'TCIbf21dd25f648a3300907e646ae0807b6'::VARCHAR, 'Test client (TCIbf21)'
),
ip AS (
  SELECT p.client_id, p.process_id, p.flow_id, p.validations
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p
  JOIN clientes c ON c.client_id = p.client_id
  CROSS JOIN params pa
  WHERE CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date)::DATE BETWEEN pa.fi AND pa.ff
    AND LOWER(p.status) IN ('success','failure')
    AND (p.is_used IS NULL OR p.is_used = TRUE)
    AND (p.declined_reason IS NULL OR LOWER(p.declined_reason) != 'not_used')
),
val AS (
  SELECT ip.process_id,
    MAX(CASE WHEN f.value:type::STRING != 'electronic-signature' THEN 1 ELSE 0 END) AS tiene_di
  FROM ip, LATERAL FLATTEN(input => TRY_PARSE_JSON(ip.validations)) f
  GROUP BY ip.process_id
),
conv AS (
  SELECT DISTINCT cs.process_id
  FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS cs
  JOIN clientes c ON c.client_id = cs.client_id
)
SELECT
  c.nombre                                                                            AS cliente,
  ip.flow_id,
  COUNT(DISTINCT ip.process_id)                                                       AS procesos,
  COUNT(DISTINCT CASE WHEN v.tiene_di = 1 THEN ip.process_id END)                     AS con_validacion_DI,
  COUNT(DISTINCT CASE WHEN cv.process_id IS NOT NULL THEN ip.process_id END)          AS en_conversaciones
FROM ip
JOIN clientes c   ON c.client_id  = ip.client_id
LEFT JOIN val  v  ON v.process_id  = ip.process_id
LEFT JOIN conv cv ON cv.process_id = ip.process_id
GROUP BY c.nombre, ip.flow_id
HAVING COUNT(DISTINCT ip.process_id) >= 50
ORDER BY cliente, procesos DESC;


-- ============================================================================
-- QUERY 3 — DISTRIBUCIÓN DE STATUS por cliente: ¿el status/flow de las
-- conversaciones de Mi Banco las deja FUERA del filtro success/failure?
-- (sin el filtro de status, para ver qué quedó afuera). Esto explica el "por qué"
-- a nivel mecanismo: si Mi Banco tiene un gran volumen de procesos con status
-- distinto de success/failure, el filtro de producción ya los descarta solo.
-- ============================================================================
WITH params AS (
  SELECT '2026-01-01'::DATE AS fi, '2026-05-31'::DATE AS ff
),
clientes AS (
  SELECT 'TCIe521279fda8520a9696e7f3998ab64e6'::VARCHAR AS client_id, 'Mi Banco COL' AS nombre
  UNION ALL
  SELECT 'TCIbf21dd25f648a3300907e646ae0807b6'::VARCHAR, 'Test client (TCIbf21)'
)
SELECT
  c.nombre                              AS cliente,
  LOWER(p.status)                       AS status,
  COUNT(DISTINCT p.process_id)          AS procesos
FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p
JOIN clientes c ON c.client_id = p.client_id
CROSS JOIN params pa
WHERE CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date)::DATE BETWEEN pa.fi AND pa.ff
GROUP BY c.nombre, LOWER(p.status)
ORDER BY cliente, procesos DESC;
