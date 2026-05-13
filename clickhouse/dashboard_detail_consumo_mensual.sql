-- Endpoint CH "Dashboard Detail Consumo Mensual"
-- =============================================================================
-- Reemplaza los 3 bloques `consumo_mensual` que vivian en
-- supabase/snowflake/dashboard_metrics_{di,bgc,ce}.sql leyendo SHARED_COUNTERS_DYNAMO.
--
-- Motivo de migracion: el bloque `consumo_mensual` sufria el lag del pipeline
-- DynamoDB -> Snowflake. Caso real Enlace CSC abril 2026: SF mostraba 12.143
-- document_validation cuando lo real eran 24.061 (CH ya cargaba ~50% mas).
-- Ahora ese bloque viene de CH = fuente oficial de cobro desde diciembre 2025
-- segun doc Truora "Reglas de Calculo de Contadores de Cobro".
--
-- Reglas billable aplicadas (replicando motor de facturacion Truora):
--   * FINAL para dedupe version=1 + version=2 del mismo record_id.
--   * Validations: status IN ('success','failure'), is_validation_retry=false,
--     validation_failure_status != 'system_error',
--     validation_declined_reason NOT IN ('no_face_detected','front_document_not_found','document_not_recognized').
--   * Checks: status='completed' AND check_type NOT IN ('document-validation','validation').
--   * TruConnect (outbound + notification): status IN ('success','delivered','read'),
--     waba_phone_number != '+17547045206' (linea demo).
--   * TruConnect inbound DERIVADO: digital_identity_process + channel_type='inbound'.
--   * Manual Review (Opcion A): emitir como counter aparte (face_manual_review /
--     document_manual_review). Cuenta retries (regla MR explicita).
--
-- Variables del Query API Endpoint (CH Cloud):
--   {client_id_di:  String}    -- TCI DI  del cliente, "" si no aplica
--   {client_id_bgc: String}    -- TCI BGC del cliente, "" si no aplica
--   {client_id_ce:  String}    -- TCI CE  del cliente, "" si no aplica
--   {fecha_inicio:  Date}      -- 'YYYY-MM-DD'
--   {fecha_fin:     Date}      -- 'YYYY-MM-DD' (inclusivo, sumamos 1 dia abajo)
--
-- Shape de salida (1 fila por mes x sub-producto):
--   periodo_mes        Date     -- primer dia del mes
--   producto_root      String   -- 'validations' | 'checks' | 'truconnect'
--   product_identifier String   -- igual a SHARED_COUNTERS_DYNAMO.PRODUCT_IDENTIFIER
--   usage              UInt64   -- count(DISTINCT record_id)
--
-- El Code Stitch n8n mapea producto_root -> bucket DI/BGC/CE.

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
  ---------------------------------------------------------------------------
  -- DI: sub-validations billable (sin manual_review como counter doble)
  ---------------------------------------------------------------------------
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

  ---------------------------------------------------------------------------
  -- DI: Manual Review como counter facturable adicional (Opcion A)
  --   Mapeo: filas validations_document_validation con MR -> document_manual_review
  --          filas validations_face_*                  con MR -> face_manual_review
  ---------------------------------------------------------------------------
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

  ---------------------------------------------------------------------------
  -- BGC: checks billable (excluye sub-pasos DI document-validation y validation)
  --   En SF este bloque emite 1 sola fila por mes con PRODUCT_IDENTIFIER='checks'.
  --   Mantenemos esa convencion: agrupamos todos los checks_* billables bajo 'checks'.
  ---------------------------------------------------------------------------
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

  ---------------------------------------------------------------------------
  -- CE: outbound + notification billable
  ---------------------------------------------------------------------------
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

  ---------------------------------------------------------------------------
  -- CE: inbound derivado de digital_identity_process
  --   En SF aparece como PRODUCT='truconnect' / PRODUCT_IDENTIFIER='inbound'.
  --   En CH no existe truconnect_inbound como product; se derivan de procesos DI
  --   iniciados por el usuario via WhatsApp (channel_type='inbound').
  ---------------------------------------------------------------------------
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
