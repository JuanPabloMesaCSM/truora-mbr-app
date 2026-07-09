-- ============================================================
-- CLICKHOUSE QUERY ENDPOINTS — Agente IA y Dashboard
-- ============================================================
-- Snapshot guardado: 2026-05-19 PM
-- Estos son los 7 Query Endpoints publicados en ClickHouse Cloud que el
-- agente CSM Center usa via el webhook /ch-agent-query con endpoint_id.
--
-- Mapping endpoint_id -> UUID vive en n8n/agent_ch_query_build.js
-- Tabla principal: production.client_usage_records (CH)
--
-- Parametros: notacion ClickHouse {param_name:Type} - reemplazar al ejecutar
-- en consola CH. El endpoint los recibe via queryVariables del API.
--
-- Reglas criticas (mismas que usa BotiAlertas v2 + Dashboard):
--   - Excluir checks_check con is_validation_retry=true (reintentos no facturan)
--   - validations DI: is_validation_retry=false + validation_failure_status != 'system_error'
--     + validation_declined_reason NOT IN ('no_face_detected','front_document_not_found','document_not_recognized')
--   - check_type NOT IN ('document-validation','validation') excluye sub-pasos DI que corren como BGC
--   - WABA '+17547045206' es la linea de pruebas de Truora (excluir de CE)
--   - CE total_enviados = status IN ('delivered','read') alinea con SF STATUS='success'
--     (NO usar COUNT(*) que infla ~27% por failed/in-transit)
--
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- ENDPOINT 1 — Resumen cliente cross-producto
-- endpoint_id:  client_summary_by_product
-- UUID:         7bea8ad7-0b1a-4b0f-aed1-e3017947de28
-- Uso:          que consumio un cliente en un rango por DI/BGC/CE y status
-- ════════════════════════════════════════════════════════════
SELECT
    CASE
        WHEN product = 'checks_check' THEN 'BGC'
        WHEN product = 'digital_identity_process' THEN 'DI'
        WHEN product IN ('truconnect_outbound','truconnect_notification') THEN 'CE'
        WHEN product LIKE 'validations_%' THEN 'DI_validaciones'
        ELSE product
    END AS producto_csm,
    product,
    status,
    COUNT(*) AS total
FROM client_usage_records
WHERE client_id = {client_id:String}
  AND date_counted >= {from:Date}
  AND date_counted <= {to:Date}
  AND (
    product != 'checks_check'
    OR is_validation_retry = false
  )
GROUP BY producto_csm, product, status
ORDER BY producto_csm, total DESC;


-- ════════════════════════════════════════════════════════════
-- ENDPOINT 2 — DI breakdown por flujo
-- endpoint_id:  client_di_by_flow
-- UUID:         e0425fdf-0dc6-4302-ac99-c54bd8547cbd
-- Uso:          detectar que flujo DI esta convirtiendo mal
-- ════════════════════════════════════════════════════════════
SELECT
    validation_flow_id AS flow_id,
    status,
    validation_failure_status,
    COUNT(*) AS total,
    countIf(status = 'success') AS exitosos,
    countIf(status = 'failure') AS fallidos,
    countIf(status = 'pending') AS pendientes,
    countIf(is_validation_retry = true) AS reintentos,
    ROUND(countIf(status = 'success') * 100.0
        / NULLIF(COUNT(*), 0), 1) AS tasa_exito_pct
FROM client_usage_records
WHERE client_id = {client_id:String}
  AND date_counted >= {from:Date}
  AND date_counted <= {to:Date}
  AND product = 'digital_identity_process'
GROUP BY flow_id, status, validation_failure_status
ORDER BY total DESC;


-- ════════════════════════════════════════════════════════════
-- ENDPOINT 3 — BGC por pais + check_type
-- endpoint_id:  client_bgc_by_country
-- UUID:         ad039af3-4dbb-4c88-97bf-48753b554499
-- Uso:          desglose checks BGC por pais y tipo (clientes multi-pais)
-- ════════════════════════════════════════════════════════════
SELECT
    country,
    check_type,
    status,
    COUNT(*) AS total_checks,
    countIf(status = 'completed') AS completados,
    countIf(status = 'error') AS errores,
    ROUND(countIf(status = 'completed') * 100.0 / NULLIF(COUNT(*), 0), 1) AS tasa_completado_pct
FROM client_usage_records
WHERE client_id = {client_id:String}
  AND date_counted >= {from:Date}
  AND date_counted <= {to:Date}
  AND check_type = {custom_type:String}
  AND is_validation_retry = false
GROUP BY country, check_type, status
ORDER BY total_checks DESC;


-- ════════════════════════════════════════════════════════════
-- ENDPOINT 4 — CE delivery rates por producto y flujo
-- endpoint_id:  client_ce_by_flow
-- UUID:         113d8964-6ac8-4e8f-a87c-bf91963915a3
-- Uso:          tasas entrega/lectura/fallo por flujo y tipo (outbound/notif)
-- BUG FIX 2026-04-29: total_enviados = countIf(status IN ('delivered','read'))
--   para alinear con SF STATUS='success' (antes COUNT(*) inflaba ~27%)
-- ════════════════════════════════════════════════════════════
SELECT
    product,
    CASE
        WHEN product = 'truconnect_outbound' THEN 'Outbound'
        WHEN product = 'truconnect_notification' THEN 'Notificación'
    END AS tipo_mensaje,
    validation_flow_id AS flow_id,
    countIf(status IN ('delivered','read')) AS total_enviados,
    countIf(status IN ('delivered','read')) AS entregados,
    countIf(status = 'read') AS leidos,
    countIf(status = 'failed') AS fallidos,
    countIf(status = 'sent') AS en_transito,
    ROUND(countIf(status IN ('delivered','read')) * 100.0
        / NULLIF(COUNT(*), 0), 1) AS tasa_entrega_pct,
    ROUND(countIf(status = 'read') * 100.0
        / NULLIF(countIf(status IN ('delivered','read')), 0), 1) AS tasa_lectura_pct,
    ROUND(countIf(status = 'failed') * 100.0
        / NULLIF(COUNT(*), 0), 1) AS tasa_fallo_pct
FROM client_usage_records
WHERE client_id = {client_id:String}
  AND date_counted >= {from:Date}
  AND date_counted <= {to:Date}
  AND product IN ('truconnect_outbound','truconnect_notification')
GROUP BY product, tipo_mensaje, flow_id
ORDER BY product, total_enviados DESC;


-- ════════════════════════════════════════════════════════════
-- ENDPOINT 5 — Tendencia mensual cross-producto
-- endpoint_id:  client_monthly_trend
-- UUID:         fa833763-db08-400c-b4ef-219f2c52fd4a
-- Uso:          ver como viene el consumo del cliente mes a mes
-- ════════════════════════════════════════════════════════════
SELECT
    CASE
        WHEN product = 'checks_check' THEN 'BGC'
        WHEN product = 'digital_identity_process' THEN 'DI'
        WHEN product IN ('truconnect_outbound','truconnect_notification') THEN 'CE'
        ELSE 'OTRO'
    END AS producto_csm,
    toStartOfMonth(date_counted) AS mes,
    COUNT(*) AS total,
    countIf(status IN ('success','completed')) AS exitosos,
    countIf(status = 'failure') AS fallidos,
    ROUND(countIf(status IN ('success','completed')) * 100.0
        / NULLIF(COUNT(*), 0), 1) AS tasa_exito_pct
FROM client_usage_records
WHERE client_id = {client_id:String}
  AND date_counted >= {from:Date}
  AND date_counted <= {to:Date}
  AND product IN (
    'checks_check',
    'digital_identity_process',
    'truconnect_outbound',
    'truconnect_notification'
  )
GROUP BY producto_csm, mes
ORDER BY producto_csm, mes ASC;


-- ════════════════════════════════════════════════════════════
-- ENDPOINT 6 — Desglose granular DI / BGC / CE
-- endpoint_id:  client_granular_breakdown
-- UUID:         9a600a78-309e-4531-9ecc-f53d83490299
-- Uso:          maxima granularidad por sub-producto facturable
--   - DI validations: separa document_validation, face_search, passive_liveness,
--     face_recognition, facematch_or_active_liveness, government_validation,
--     speech_match, electronic_signature, phone_verification, email_verification
--   - DI manual_review: document_manual_review, face_manual_review
--   - BGC: checks (excluye document-validation que corre como sub-paso DI)
--   - CE: outbound, notification, inbound (este ultimo desde digital_identity_process)
--
-- Requiere los 3 TCIs (DI, BGC, CE) porque los clientes multi-producto tienen
-- IDs distintos por producto en Truora.
-- ════════════════════════════════════════════════════════════
WITH base AS (
  SELECT
    toStartOfMonth(date_counted)::Date    AS periodo_mes,
    client_id,
    product,
    status,
    check_type,
    is_validation_retry,
    validation_failure_status,
    validation_declined_reason,
    manual_review_status,
    channel_type,
    waba_phone_number,
    record_id
  FROM production.client_usage_records FINAL
  WHERE date_counted >= toDateTime({fecha_inicio: Date})
    AND date_counted <  toDateTime({fecha_fin: Date}) + INTERVAL 1 DAY
    AND client_id IN (
      {client_id_di: String},
      {client_id_bgc: String},
      {client_id_ce: String}
    )
),
mapped AS (
  SELECT
    periodo_mes,
    client_id,
    'validations' AS producto_root,
    multiIf(
      product = 'validations_document_validation',                              'document_validation',
      product = 'validations_face_recognition_passive_liveness',                'passive_liveness',
      product = 'validations_face_search',                                      'face_search',
      product = 'validations_face_recognition',                                 'face_recognition',
      product = 'validations_face_recognition_facematch_or_active_liveness',    'facematch_or_active_liveness',
      product = 'validations_face_recognition_government_validation',           'government_validation',
      product = 'validations_face_recognition_speech_match',                    'speech_match',
      product = 'validations_electronic_signature',                             'electronic_signature',
      product = 'validations_phone_verification',                               'phone_verification',
      product = 'validations_email_verification',                               'email_verification',
      NULL
    ) AS product_identifier,
    record_id
  FROM base
  WHERE client_id = {client_id_di: String}
    AND startsWith(product, 'validations_')
    AND status IN ('success', 'failure')
    AND is_validation_retry = false
    AND validation_failure_status != 'system_error'
    AND validation_declined_reason NOT IN (
      'no_face_detected',
      'front_document_not_found',
      'document_not_recognized'
    )

  UNION ALL

  SELECT
    periodo_mes,
    client_id,
    'validations' AS producto_root,
    multiIf(
      product = 'validations_document_validation',                              'document_manual_review',
      startsWith(product, 'validations_face_recognition'),                      'face_manual_review',
      product = 'validations_face_search',                                      'face_manual_review',
      NULL
    ) AS product_identifier,
    concat(record_id, '_mr') AS record_id
  FROM base
  WHERE client_id = {client_id_di: String}
    AND startsWith(product, 'validations_')
    AND manual_review_status = 'performed'

  UNION ALL

  SELECT
    periodo_mes,
    client_id,
    'checks' AS producto_root,
    'checks' AS product_identifier,
    record_id
  FROM base
  WHERE client_id = {client_id_bgc: String}
    AND startsWith(product, 'checks_')
    AND status = 'completed'
    AND check_type NOT IN ('document-validation', 'validation')

  UNION ALL

  SELECT
    periodo_mes,
    client_id,
    'truconnect' AS producto_root,
    multiIf(
      product = 'truconnect_outbound',     'outbound',
      product = 'truconnect_notification', 'notification',
      NULL
    ) AS product_identifier,
    record_id
  FROM base
  WHERE client_id = {client_id_ce: String}
    AND product IN ('truconnect_outbound', 'truconnect_notification')
    AND status IN ('success', 'delivered', 'read')
    AND waba_phone_number != '+17547045206'

  UNION ALL

  SELECT
    periodo_mes,
    client_id,
    'truconnect' AS producto_root,
    'inbound' AS product_identifier,
    record_id
  FROM base
  WHERE client_id = {client_id_ce: String}
    AND product = 'digital_identity_process'
    AND channel_type = 'inbound'
    AND waba_phone_number != '+17547045206'
)
SELECT
  periodo_mes,
  client_id,
  producto_root,
  product_identifier,
  count(DISTINCT record_id) AS usage
FROM mapped
WHERE product_identifier IS NOT NULL
GROUP BY periodo_mes, client_id, producto_root, product_identifier
ORDER BY periodo_mes DESC, producto_root, product_identifier;


-- ════════════════════════════════════════════════════════════
-- ENDPOINT 7 — Portfolio consumption multi-cliente (3 meses)
-- endpoint_id:  portfolio_consumption
-- UUID:         81ef4b77-ef25-49bb-9610-66ba7ef01e16
-- Uso:          alimenta la tabla cacheada portfolio_consumption en Supabase
--               (cron L/M/V 6 AM BOG) para que /dashboard sea instantaneo.
--
-- ⚠️ STALE (2026-06-11): este endpoint fue REESCRITO in-place a grano SUB-PRODUCTO
--    (query maestra de counters de Truora, param {client_id:String} CSV, 8 productos).
--    La fuente VIVA es `clickhouse/portfolio_subproduct_migration.sql`. El SQL de abajo
--    es el histórico de 3 buckets (validations/checks/truconnect) — ya no es el productivo.
-- ════════════════════════════════════════════════════════════
WITH base AS (
  SELECT
    toStartOfMonth(date_counted)::Date    AS periodo_mes,
    client_id,
    product,
    status,
    check_type,
    is_validation_retry,
    validation_failure_status,
    validation_declined_reason,
    manual_review_status,
    channel_type,
    waba_phone_number,
    record_id
  FROM production.client_usage_records FINAL
  WHERE date_counted >= toStartOfMonth(date_sub(MONTH, 3, today()))
    AND client_id IN ({tci_list: Array(String)})
),
bucket_rows AS (
  SELECT
    periodo_mes,
    client_id,
    multiIf(
      startsWith(product, 'validations_')
        AND status IN ('success','failure')
        AND is_validation_retry = false
        AND validation_failure_status != 'system_error'
        AND validation_declined_reason NOT IN ('no_face_detected','front_document_not_found','document_not_recognized'),
        'validations',
      startsWith(product, 'checks_')
        AND status = 'completed'
        AND check_type NOT IN ('document-validation','validation'),
        'checks',
      product IN ('truconnect_outbound','truconnect_notification')
        AND status IN ('success','delivered','read')
        AND waba_phone_number != '+17547045206',
        'truconnect',
      product = 'digital_identity_process'
        AND channel_type = 'inbound'
        AND waba_phone_number != '+17547045206',
        'truconnect',
      NULL
    ) AS product_bucket,
    record_id
  FROM base

  UNION ALL

  SELECT
    periodo_mes,
    client_id,
    'validations' AS product_bucket,
    concat(record_id, '_mr') AS record_id
  FROM base
  WHERE startsWith(product, 'validations_')
    AND manual_review_status = 'performed'
)
SELECT
  periodo_mes,
  client_id,
  product_bucket AS product,
  count(DISTINCT record_id) AS usage
FROM bucket_rows
WHERE product_bucket IS NOT NULL
GROUP BY periodo_mes, client_id, product_bucket
ORDER BY periodo_mes DESC, client_id;
