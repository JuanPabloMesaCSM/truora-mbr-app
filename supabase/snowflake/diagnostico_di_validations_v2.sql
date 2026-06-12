-- ============================================================================
-- DIAGNÓSTICO v2 — marcador CORRECTO: IDENTITY_PROCESSES.VALIDATIONS (lógica VRF)
--
-- El v1 (diagnostico_di_procesos_vs_ce.sql) usaba DOCUMENT_VALIDATION_HISTORY
-- (solo doc/rostro) y eso me llevó a la conclusión equivocada de "filtrar por
-- estar en CONVERSATIONS_STEPS". MAL: cuando hay DI integrado en un flujo CE
-- (VRF) se cobra mensaje + validación y eso ES DI. El marcador canónico de
-- Truora es la columna JSON IDENTITY_PROCESSES.VALIDATIONS (lo que usa el VRF
-- del Report Builder CE con LATERAL FLATTEN).
--
-- Definición correcta: "proceso DI" = su array VALIDATIONS tiene >=1 validación
-- (de cualquier tipo DI; electronic-signature = zapsign, NO es DI).
--
-- Read-only. Si TRUORA_BASIC_USER no alcanza:  USE ROLE ANALYSTS;
--
-- Correr QUERY 2 para 3 clientes (cambiar client_id en `params`):
--   TCIbf21dd25f648a3300907e646ae0807b6  (cliente de prueba, alto truconnect)
--   TCI1e6cf6d9442fe8e1ceb5180a451192d8  (PayJoy — VRF; el viejo marcador dio 99.9% "CE")
--   TCIddc781cc675f59a5ec603d6de5c49684  (WOM CL — VRF)
-- ============================================================================


-- ============================================================================
-- QUERY 1 — DISCOVERY: qué TIPOS de validación existen en VALIDATIONS
-- (para confirmar los strings reales y no asumirlos). Cliente de prueba, 12m.
-- ============================================================================
WITH params AS (
  SELECT 'TCIbf21dd25f648a3300907e646ae0807b6'::VARCHAR AS client_id,
         '2025-06-01'::DATE AS fi, '2026-06-11'::DATE AS ff
)
SELECT
  f.value:type::STRING                                                            AS validation_type,
  COUNT(DISTINCT ip.process_id)                                                   AS procesos,
  COUNT(*)                                                                        AS validaciones,
  COUNT(DISTINCT CASE WHEN f.value:validation_status::STRING = 'success'
                      THEN ip.process_id END)                                     AS proc_exitosos
FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip,
     params p,
     LATERAL FLATTEN(input => TRY_PARSE_JSON(ip.validations)) f
WHERE ip.client_id = p.client_id
  AND CONVERT_TIMEZONE('UTC','America/Bogota', ip.creation_date)::DATE BETWEEN p.fi AND p.ff
  AND (ip.declined_reason IS NULL OR LOWER(ip.declined_reason) != 'not_used')
GROUP BY 1
ORDER BY validaciones DESC;


-- ============================================================================
-- QUERY 2 — RECLASIFICACIÓN del set EXACTO del dashboard con el marcador VALIDATIONS
-- (cambiá client_id arriba y corré para los 3 TCIs de la cabecera)
-- ============================================================================
WITH params AS (
  SELECT 'TCIbf21dd25f648a3300907e646ae0807b6'::VARCHAR AS client_id,
         '2025-06-01'::DATE AS fi, '2026-06-11'::DATE AS ff
),
-- réplica EXACTA del set de procesos del dashboard DI (bloque 1, col1)
ip AS (
  SELECT p.process_id, p.validations
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p, params pa
  WHERE p.client_id = pa.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date)::DATE BETWEEN pa.fi AND pa.ff
    AND LOWER(p.status) IN ('success','failure')
    AND (p.is_used IS NULL OR p.is_used = TRUE)
    AND (p.declined_reason IS NULL OR LOWER(p.declined_reason) != 'not_used')
),
-- por proceso: ¿tiene alguna validación? ¿alguna DI (todo menos firma)?
val AS (
  SELECT
    ip.process_id,
    COUNT(*)                                                                       AS n_val,
    MAX(CASE WHEN f.value:type::STRING != 'electronic-signature' THEN 1 ELSE 0 END) AS tiene_di,
    MAX(CASE WHEN f.value:type::STRING  = 'electronic-signature' THEN 1 ELSE 0 END) AS tiene_firma
  FROM ip, LATERAL FLATTEN(input => TRY_PARSE_JSON(ip.validations)) f
  GROUP BY ip.process_id
),
conv AS (
  SELECT DISTINCT cs.process_id
  FROM TRUORA.TRUORA_SCHEMA.CONVERSATIONS_STEPS cs, params pa
  WHERE cs.client_id = pa.client_id
),
clasif AS (
  SELECT
    ip.process_id,
    COALESCE(v.tiene_di, 0)                              AS tiene_di,
    CASE WHEN v.process_id IS NOT NULL THEN 1 ELSE 0 END AS tiene_alguna_val,
    CASE WHEN c.process_id IS NOT NULL THEN 1 ELSE 0 END AS es_conv
  FROM ip
  LEFT JOIN val  v ON v.process_id = ip.process_id
  LEFT JOIN conv c ON c.process_id = ip.process_id
)
SELECT
  COUNT(DISTINCT process_id)                                                            AS total_dashboard,
  COUNT(DISTINCT CASE WHEN tiene_di = 1 THEN process_id END)                            AS con_validacion_DI,        -- <- el conteo DI correcto
  COUNT(DISTINCT CASE WHEN tiene_di = 1 AND es_conv = 1 THEN process_id END)            AS DI_dentro_de_CE,          -- <- VRF (si > 0, mi v1 lo borraba mal)
  COUNT(DISTINCT CASE WHEN tiene_di = 1 AND es_conv = 0 THEN process_id END)            AS DI_standalone,
  COUNT(DISTINCT CASE WHEN tiene_alguna_val = 1 AND tiene_di = 0 THEN process_id END)   AS solo_firma,               -- e-signature only (zapsign)
  COUNT(DISTINCT CASE WHEN tiene_alguna_val = 0 THEN process_id END)                    AS sin_ninguna_validacion    -- conversación pura / abandono pre-validación
FROM clasif;
-- Reconciliá `con_validacion_DI` contra el facturable CH del mismo rango:
--   debería dar ~ (facturable / validaciones-por-proceso). Si DI_dentro_de_CE es
--   alto en PayJoy/WOM → confirma que NO se puede filtrar por "es conversación".


-- ============================================================================
-- QUERY 3 — Mensual: con_validacion_DI vs total (ver patrón temporal vs facturable)
-- ============================================================================
WITH params AS (
  SELECT 'TCIbf21dd25f648a3300907e646ae0807b6'::VARCHAR AS client_id,
         '2025-06-01'::DATE AS fi, '2026-06-11'::DATE AS ff
),
ip AS (
  SELECT
    p.process_id, p.validations,
    DATE_TRUNC('month', CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date))::DATE AS mes
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p, params pa
  WHERE p.client_id = pa.client_id
    AND CONVERT_TIMEZONE('UTC','America/Bogota', p.creation_date)::DATE BETWEEN pa.fi AND pa.ff
    AND LOWER(p.status) IN ('success','failure')
    AND (p.is_used IS NULL OR p.is_used = TRUE)
    AND (p.declined_reason IS NULL OR LOWER(p.declined_reason) != 'not_used')
),
val AS (
  SELECT ip.process_id,
    MAX(CASE WHEN f.value:type::STRING != 'electronic-signature' THEN 1 ELSE 0 END) AS tiene_di
  FROM ip, LATERAL FLATTEN(input => TRY_PARSE_JSON(ip.validations)) f
  GROUP BY ip.process_id
)
SELECT
  ip.mes,
  COUNT(DISTINCT ip.process_id)                                            AS total,
  COUNT(DISTINCT CASE WHEN v.tiene_di = 1 THEN ip.process_id END)          AS con_validacion_DI
FROM ip
LEFT JOIN val v ON v.process_id = ip.process_id
GROUP BY ip.mes
ORDER BY ip.mes;


-- ============================================================================
-- QUERY 4 (opcional, MÁS PESADA) — cartera-wide top clientes con el marcador
-- VALIDATIONS. Reemplaza la Query 4 del v1. Ventana 3 meses para acotar costo.
-- ⚠ FLATTEN de VALIDATIONS sobre todos los clientes → puede tardar varios min.
-- ============================================================================
WITH params AS (
  SELECT '2026-03-01'::DATE AS fi, '2026-06-11'::DATE AS ff
),
ip AS (
  SELECT p.client_id, p.process_id, p.validations
  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES p, params pa
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
)
SELECT
  ip.client_id,
  COUNT(DISTINCT ip.process_id)                                            AS total_dashboard,
  COUNT(DISTINCT CASE WHEN v.tiene_di = 1 THEN ip.process_id END)          AS con_validacion_DI,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN COALESCE(v.tiene_di,0) = 0 THEN ip.process_id END)
        / NULLIF(COUNT(DISTINCT ip.process_id), 0), 1)                     AS pct_sin_validacion_DI
FROM ip
LEFT JOIN val v ON v.process_id = ip.process_id
GROUP BY ip.client_id
HAVING COUNT(DISTINCT ip.process_id) >= 1000
ORDER BY total_dashboard DESC
LIMIT 40;
