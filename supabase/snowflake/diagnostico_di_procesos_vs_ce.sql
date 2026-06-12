-- ============================================================================
-- DIAGNÓSTICO: ¿cuánto del COUNT de "Procesos únicos iniciados" (dashboard DI)
-- es realmente una validación DI facturable vs una conversación CE u otra cosa?
--
-- Motivo: para TCIbf21dd25f648a3300907e646ae0807b6 (cliente DI+BGC+CE de altísimo
-- volumen, 1.5M truconnect) el dashboard mostró:
--     Procesos únicos iniciados   136.385   (SF, COUNT DISTINCT process_id)
--     Consumo facturable           32.641   (CH, validaciones billable)
-- y de jun-2025 a feb-2026 hay ~166k "procesos" con CERO facturable. Hipótesis:
-- en Truora una conversación inbound de CE (truconnect) se modela como
-- digital_identity_process y cae en la MISMA tabla IDENTITY_PROCESSES que cuenta
-- la query DI (que hace COUNT(DISTINCT process_id) sin filtrar tipo de flujo).
--
-- Estas 3 queries son READ-ONLY. Si TRUORA_BASIC_USER no alcanza, correr antes:
--     USE ROLE ANALYSTS;
--
-- El rango por defecto es 12 meses (jun-2025 → 11-jun-2026); cambialo en `params`
-- al mismo rango que usaste en el dashboard si querés reproducir el 136.385 exacto.
-- El primer número de la Query 1 (total_procesos_dashboard) DEBE coincidir con el
-- "Procesos únicos iniciados" del dashboard para ese rango → confirma que miramos
-- el mismo universo.
-- ============================================================================


-- ============================================================================
-- QUERY 1 — Resumen: total + desglose en 4 baldes
-- ============================================================================
WITH params AS (
  SELECT
    'TCIbf21dd25f648a3300907e646ae0807b6'::VARCHAR AS client_id,
    '2025-06-01'::DATE                             AS fecha_inicio,
    '2026-06-11'::DATE                             AS fecha_fin
),
-- Réplica EXACTA del set de procesos del dashboard DI (bloque 1, col1)
ip AS (
  SELECT
    p.process_id,
    p.flow_id,
    p.status,
    DATE_TRUNC('month', CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date))::DATE AS mes
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p
  CROSS JOIN params pa
  WHERE p.client_id = pa.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date)::DATE
        BETWEEN pa.fecha_inicio AND pa.fecha_fin
    AND LOWER(p.status) IN ('success','failure')          -- mismo filtro que el dashboard
    AND (p.is_used IS NULL OR p.is_used = TRUE)
    AND (p.declined_reason IS NULL OR LOWER(p.declined_reason) != 'not_used')
),
clasif AS (
  SELECT
    ip.process_id,
    -- ¿el proceso hizo una validación DI real (doc / rostro)?
    CASE WHEN EXISTS (
      SELECT 1 FROM TRUORA.TRUORA_SCHEMA.DOCUMENT_VALIDATION_HISTORY d
      WHERE d.identity_process_id = ip.process_id
        AND d.type IN ('document-validation','face-recognition','face-search')
    ) THEN 1 ELSE 0 END AS es_di_real,
    -- ¿el proceso es (también) una conversación CE (truconnect)?
    CASE WHEN EXISTS (
      SELECT 1 FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS c
      WHERE c.process_id = ip.process_id
    ) THEN 1 ELSE 0 END AS es_conversacion
  FROM ip
)
SELECT
  COUNT(DISTINCT process_id)                                                            AS total_procesos_dashboard,
  COUNT(DISTINCT CASE WHEN es_di_real = 1 THEN process_id END)                          AS con_validacion_DI_real,
  COUNT(DISTINCT CASE WHEN es_di_real = 0 AND es_conversacion = 1 THEN process_id END)  AS solo_CE_sin_DI,
  COUNT(DISTINCT CASE WHEN es_di_real = 0 AND es_conversacion = 0 THEN process_id END)  AS ni_DI_ni_CE,
  COUNT(DISTINCT CASE WHEN es_di_real = 1 AND es_conversacion = 1 THEN process_id END)  AS DI_dentro_de_conversacion
FROM clasif;
-- Lectura:
--   con_validacion_DI_real  = procesos que SÍ son DI (tocan doc/rostro). Deberían
--                             tracker el facturable.
--   solo_CE_sin_DI          = LA CONTAMINACIÓN: conversaciones CE contadas como
--                             "procesos DI" que nunca hicieron una validación.
--   ni_DI_ni_CE             = ni validación ni conversación (¿phone-only?
--                             ¿abandono antes de cualquier validación?).
--   DI_dentro_de_conversacion = DI real disparado dentro de una conversación
--                             (sigue siendo DI; informativo).


-- ============================================================================
-- QUERY 2 — Mismo desglose POR MES (para ver el patrón 2025 vs 2026)
-- ============================================================================
WITH params AS (
  SELECT
    'TCIbf21dd25f648a3300907e646ae0807b6'::VARCHAR AS client_id,
    '2025-06-01'::DATE                             AS fecha_inicio,
    '2026-06-11'::DATE                             AS fecha_fin
),
ip AS (
  SELECT
    p.process_id,
    DATE_TRUNC('month', CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date))::DATE AS mes
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p
  CROSS JOIN params pa
  WHERE p.client_id = pa.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date)::DATE
        BETWEEN pa.fecha_inicio AND pa.fecha_fin
    AND LOWER(p.status) IN ('success','failure')
    AND (p.is_used IS NULL OR p.is_used = TRUE)
    AND (p.declined_reason IS NULL OR LOWER(p.declined_reason) != 'not_used')
),
clasif AS (
  SELECT
    ip.process_id,
    ip.mes,
    CASE WHEN EXISTS (
      SELECT 1 FROM TRUORA.TRUORA_SCHEMA.DOCUMENT_VALIDATION_HISTORY d
      WHERE d.identity_process_id = ip.process_id
        AND d.type IN ('document-validation','face-recognition','face-search')
    ) THEN 1 ELSE 0 END AS es_di_real,
    CASE WHEN EXISTS (
      SELECT 1 FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS c
      WHERE c.process_id = ip.process_id
    ) THEN 1 ELSE 0 END AS es_conversacion
  FROM ip
)
SELECT
  mes,
  COUNT(DISTINCT process_id)                                                            AS total,
  COUNT(DISTINCT CASE WHEN es_di_real = 1 THEN process_id END)                          AS di_real,
  COUNT(DISTINCT CASE WHEN es_di_real = 0 AND es_conversacion = 1 THEN process_id END)  AS solo_ce,
  COUNT(DISTINCT CASE WHEN es_di_real = 0 AND es_conversacion = 0 THEN process_id END)  AS ni_uno_ni_otro
FROM clasif
GROUP BY mes
ORDER BY mes;


-- ============================================================================
-- QUERY 3 — Top FLOW_ID del cliente, clasificado DI vs CE
-- (para ver si hay un flow_id "conversación" que domine el conteo)
-- ============================================================================
WITH params AS (
  SELECT
    'TCIbf21dd25f648a3300907e646ae0807b6'::VARCHAR AS client_id,
    '2025-06-01'::DATE                             AS fecha_inicio,
    '2026-06-11'::DATE                             AS fecha_fin
),
ip AS (
  SELECT
    p.process_id,
    COALESCE(p.flow_id, '(sin flow_id)') AS flow_id
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p
  CROSS JOIN params pa
  WHERE p.client_id = pa.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date)::DATE
        BETWEEN pa.fecha_inicio AND pa.fecha_fin
    AND LOWER(p.status) IN ('success','failure')
    AND (p.is_used IS NULL OR p.is_used = TRUE)
    AND (p.declined_reason IS NULL OR LOWER(p.declined_reason) != 'not_used')
),
clasif AS (
  SELECT
    ip.flow_id,
    ip.process_id,
    CASE WHEN EXISTS (
      SELECT 1 FROM TRUORA.TRUORA_SCHEMA.DOCUMENT_VALIDATION_HISTORY d
      WHERE d.identity_process_id = ip.process_id
        AND d.type IN ('document-validation','face-recognition','face-search')
    ) THEN 1 ELSE 0 END AS es_di_real,
    CASE WHEN EXISTS (
      SELECT 1 FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS c
      WHERE c.process_id = ip.process_id
    ) THEN 1 ELSE 0 END AS es_conversacion
  FROM ip
)
SELECT
  flow_id,
  COUNT(DISTINCT process_id)                                          AS procesos,
  COUNT(DISTINCT CASE WHEN es_di_real = 1 THEN process_id END)        AS di_real,
  COUNT(DISTINCT CASE WHEN es_conversacion = 1 THEN process_id END)   AS en_conversaciones
FROM clasif
GROUP BY flow_id
ORDER BY procesos DESC
LIMIT 25;


-- ============================================================================
-- QUERY 4 — Tamaño del problema en TODA la base: top clientes por volumen de
-- "procesos DI" (dashboard) con su % de contaminación CE + el conteo ya filtrado.
--
-- ⚠ Escanea IDENTITY_PROCESSES de TODOS los clientes en el rango + EXISTS contra
-- DOCUMENT_VALIDATION_HISTORY y CONVERSATIONS_STEPS. Puede tardar 1-3 min. Rango
-- acotado a 3 meses (marzo→junio) para limitar costo; ampliá si querés.
--
-- `procesos_DI_filtrado` = el conteo que daría el fix propuesto
--   (es_di_real OR NOT es_conversacion). Comparar contra `procesos_dashboard`.
-- ============================================================================
WITH params AS (
  SELECT '2026-03-01'::DATE AS fecha_inicio, '2026-06-11'::DATE AS fecha_fin
),
ip AS (
  SELECT p.client_id, p.process_id
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p
  CROSS JOIN params pa
  WHERE CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date)::DATE
        BETWEEN pa.fecha_inicio AND pa.fecha_fin
    AND LOWER(p.status) IN ('success','failure')
    AND (p.is_used IS NULL OR p.is_used = TRUE)
    AND (p.declined_reason IS NULL OR LOWER(p.declined_reason) != 'not_used')
),
clasif AS (
  SELECT
    ip.client_id,
    ip.process_id,
    CASE WHEN EXISTS (
      SELECT 1 FROM TRUORA.TRUORA_SCHEMA.DOCUMENT_VALIDATION_HISTORY d
      WHERE d.identity_process_id = ip.process_id
        AND d.type IN ('document-validation','face-recognition','face-search')
    ) THEN 1 ELSE 0 END AS es_di_real,
    CASE WHEN EXISTS (
      SELECT 1 FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS c
      WHERE c.process_id = ip.process_id
    ) THEN 1 ELSE 0 END AS es_conversacion
  FROM ip
)
SELECT
  client_id,
  COUNT(DISTINCT process_id)                                                            AS procesos_dashboard,
  COUNT(DISTINCT CASE WHEN es_di_real = 1 OR es_conversacion = 0 THEN process_id END)   AS procesos_DI_filtrado,
  COUNT(DISTINCT CASE WHEN es_di_real = 0 AND es_conversacion = 1 THEN process_id END)  AS solo_CE,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN es_di_real = 0 AND es_conversacion = 1 THEN process_id END)
        / NULLIF(COUNT(DISTINCT process_id), 0), 1)                                      AS pct_contaminacion_CE
FROM clasif
GROUP BY client_id
HAVING COUNT(DISTINCT process_id) >= 1000
ORDER BY procesos_dashboard DESC
LIMIT 40;
