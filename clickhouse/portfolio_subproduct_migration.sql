-- ════════════════════════════════════════════════════════════════════════
-- PORTFOLIO CONSUMPTION — desglose por SUB-PRODUCTO (product identifier)
-- ════════════════════════════════════════════════════════════════════════
--
-- Origen: "Query counters" — query maestra OFICIAL de counters de Truora
--   (la que alimenta el Excel "Solo counter CE, DI y BGC" de toda la compañía).
--   Adoptada tal cual + 3 adaptaciones para el Portfolio del CSM Center:
--
--   1) SCOPE A CARTERA: param {client_id:String} en CSV (splitByChar). El cron
--      Portfolio Sync le pasa el tci_list de la cartera. Vacío = toda la base.
--   2) VENTANA RODANTE baked (últimos 3 meses) en lugar de fecha_ini/fecha_fin,
--      para que el cron no tenga que calcular fechas (igual que el endpoint 7 viejo).
--   3) MANUAL REVIEW contado como sub-producto propio de `validations`
--      ('document manual review' / 'face manual review', bloque VALIDATIONS_MR).
--      El front cobra la revisión humana como línea APARTE de la validación
--      automática (Mi Banco mayo: doc 2.548 + doc revisión manual 173). NO es
--      doble conteo: son 2 cargos distintos. Validado vs front Mi Banco →
--      validations = 8.289 exacto. La maestra original solo lo anotaba en NOTA y
--      subfacturaba la revisión humana. Decisión JP 2026-06-13.
--   4) FIRMA ELECTRÓNICA dentro de `validations` (sub_product 'electronic
--      signature'), NO como producto 'zapsign' aparte. El front agrupa la firma
--      bajo "Validaciones". Decisión JP 2026-06-13 (opción A). El bloque ZAPSIGN
--      sigue existiendo pero ahora emite product='validations'.
--
-- NOTA declined_reason (2026-06-06): la maestra YA cuenta las validaciones
--   declinadas por no_face_detected/front_document_not_found/document_not_recognized
--   (el filtro NOT IN está comentado: "se definió que al final sí se va a cobrar").
--   Lo dejamos así — es la regla de cobro vigente. Ver memoria
--   feedback_validations_declined_reason_now_billable. (El resto de superficies —
--   DI Report Builder, BotiAlertas — se actualizan en su propio chat: follow-up.)
--
-- Salida (1 fila por period × client × product × sub_product):
--   periodo_mes (Date), client_id, product, sub_product, usage (counters), nota
--   → COMPANY_NAME y CSM NO salen de acá: el frontend los resuelve canónicos
--     desde Supabase (clientes.nombre + tabla csm). En CH vienen vacíos/stale.
--
-- Endpoint CH a crear (Query Endpoint nuevo, NO pisar el 69e67323 hasta validar):
--   Param: {client_id: String}  (CSV de TCIs, '' = todos)
--   Auth Basic + header x-clickhouse-endpoint-version: 2 (POST JSONEachRow)
--   ⚠️ Recordá GUARDAR la query del endpoint (correr en editor no actualiza el endpoint).
-- ════════════════════════════════════════════════════════════════════════

WITH base_data AS (
    SELECT
        record_id,
        formatDateTime(date_counted, '%Y-%m') AS period,
        client_id,
        product,
        country,
        status,
        check_type,
        channel_type,
        message_category,
        database_statuses,
        document_type,
        manual_review_status,
        validation_failure_status,
        is_validation_retry,
        validation_declined_reason
    FROM client_usage_records FINAL
    PREWHERE ( {client_id:String} = '' OR client_id IN splitByChar(',', {client_id:String}) )
    -- Ventana = ULTIMO AÑO (12 meses). Subido de 3 a 12 el 2026-06-11: el cron de
    -- cartera (L/M/V) ahora calcula y guarda el año completo, y el lookup de
    -- clientes fuera de cartera (webhook portfolio-client-lookup, comparte ESTE
    -- mismo endpoint 69e67323) hereda los 12 meses sin endpoint aparte.
    WHERE date_counted >= toStartOfMonth(date_sub(MONTH, 12, today()))
        AND waba_phone_number != '+17547045206'
),

-- ==========================================
-- 1. FORM
-- ==========================================
FORM AS (
    SELECT
        period, client_id,
        'forms' AS product,
        'forms' AS sub_product,
        count(DISTINCT record_id) AS counters,
        '' AS NOTA
    FROM base_data
    WHERE base_data.product = 'forms_response'
        AND status = 'finished'
        AND is_validation_retry = 0
    GROUP BY period, client_id
),

-- ==========================================
-- 2. TRUCONNECT
-- ==========================================
TRUCONNECT_BASE AS (
    SELECT
        period, client_id,
        CASE
            WHEN product = 'digital_identity_process' THEN 'inbound'
            ELSE extract(product, '_(.*)')
        END AS sub_product,
        if(message_category = '' OR message_category IS NULL, 'sin categoria', message_category) AS msg_category_clean,
        country,
        count(DISTINCT record_id) AS counters
    FROM base_data
    WHERE (
            (product IN ('truconnect_notification', 'truconnect_outbound') AND status IN ('read', 'delivered'))
            OR
            (product = 'digital_identity_process' AND channel_type = 'inbound')
        )
        AND is_validation_retry = 0
    GROUP BY period, client_id, sub_product, msg_category_clean, country
),
TRUCONNECT_CATEGORY AS (
    SELECT
        period, client_id, sub_product, msg_category_clean,
        sum(counters) AS category_total,
        groupArray(country) AS country_keys,
        groupArray(counters) AS country_vals
    FROM TRUCONNECT_BASE
    GROUP BY period, client_id, sub_product, msg_category_clean
),
TRUCONNECT AS (
    SELECT
        period, client_id,
        'truconnect' AS product,
        sub_product,
        sum(category_total) AS counters,
        arrayStringConcat(
            groupArray(
                concat(
                    msg_category_clean, ': ', toString(category_total), '\n',
                    arrayStringConcat(
                        arrayMap((k, v) -> concat('  - ', k, ': ', toString(v)), country_keys, country_vals),
                        '\n'
                    )
                )
            ),
            '\n'
        ) AS NOTA
    FROM TRUCONNECT_CATEGORY
    GROUP BY period, client_id, sub_product

    UNION ALL

    SELECT
        period, client_id,
        'truconnect' AS product,
        'interacciones' AS sub_product,
        sum(category_total) AS counters,
        arrayStringConcat(
            groupArray(
                concat(
                    msg_category_clean, ': ', toString(category_total), '\n',
                    arrayStringConcat(
                        arrayMap((k, v) -> concat('  - ', k, ': ', toString(v)), country_keys, country_vals),
                        '\n'
                    )
                )
            ),
            '\n'
        ) AS NOTA
    FROM (
        SELECT
            period, client_id, msg_category_clean,
            sum(counters) AS category_total,
            groupArray(country) AS country_keys,
            groupArray(counters) AS country_vals
        FROM (
            SELECT period, client_id, msg_category_clean, country, sum(counters) AS counters
            FROM TRUCONNECT_BASE
            GROUP BY period, client_id, msg_category_clean, country
        )
        GROUP BY period, client_id, msg_category_clean
    )
    GROUP BY period, client_id
),

-- ==========================================
-- 3. CHECKS PREMIUM  (database_statuses, grano por base premium)
-- ==========================================
CHECKS_PREMIUM_BASE AS (
    SELECT
        period, client_id,
        country AS sub_product,
        CASE db_status.1
            WHEN 'DBIb9a46283e19220b33fbb984b2f222343ce146171' THEN 'Poder Judicial'
            WHEN 'DBIad8319e1d77fa8eb87f66bff029841f12617a272' THEN 'IMSS'
            WHEN 'DBI412dc5c41f16bc217539b321ddfd6eebb64700aa' THEN 'Comply Advantage'
            WHEN 'DBIb2ecd883c70c976e013f15b0f4f3acdba9d040f4' THEN 'DataCredito Credit History'
            WHEN 'DBI14efd094ec1c4715155be9fd527a5c3fae496f8c' THEN 'DataCredito Contact'
            WHEN 'DBI8eba2314b930c3f6c4d9344dfbe8b6a3e2b20d2c' THEN 'Serasa'
            WHEN 'DBI555b90cf23278eb1e1e050d91c0a0ef40e359945' THEN 'Phone Checker'
            WHEN 'DBI90974593ff1f7c455eaf808932f453d9d36e94a9' THEN 'Serasa Company'
            WHEN 'DBI41100407bc220a5d32d553886be2dc1ec5052807' THEN 'PEP FIMPE'
            WHEN 'DBIa708c91cf66a9cbceeb7b3cc7552469c0f0b81e2' THEN 'PEP por Nombre'
            WHEN 'DBIaa7a3505bf3fcbc742ee5decae58f70d12386355' THEN 'PJV Compliance'
            WHEN 'DBIba885b9e8901bf1e7506b1592c2aadfd372f369b' THEN 'PEP'
            WHEN 'DBId0aa7d620383665fdbced76473913a3cc0d9d61e' THEN 'PJV Comp. Nombre'
            WHEN 'DBIa3ad957b5beb3181f6a760ee50d0f963330815aa' THEN 'Phone Checker'
            WHEN 'DBIedab03f9758e0776b0de8445adde4f1d15899cb9' THEN 'Equifax'
            WHEN 'DBI75c80148c518ca8922d3b8e17da2b9a2f483f77e' THEN 'Circulo Credito'
            WHEN 'DBIc470038d32fc6e867a0fff8e23f2f7a4b5eeb68c' THEN 'Buro Credito'
            WHEN 'DBIfcf003d6e91a65c61af216e755031f997728be60' THEN 'Datacredito Qualities'
            WHEN 'DBI77b0c73c8a0931454e038aef34b69bd3b7d45a62' THEN 'email-phone-validation'
            ELSE 'Unknown Premium'
        END AS premium_name,
        if(check_type = '', 'general', check_type) AS clean_check_type,
        count(DISTINCT record_id) AS check_counters
    FROM base_data
    LEFT ARRAY JOIN database_statuses AS db_status
    WHERE product = 'checks_check'
        AND db_status.3 = 'completed'
        AND check_type != 'document-validation'
        AND db_status.1 != ''
        -- Excluir bases bundled (enFront:false): van en el precio del check, NO se cobran
        -- como premium aparte. Validado Indrive abr-2026 (DBI386340b = bg-check-driver 21.639
        -- NO está en el front; con la exclusión premium = IMSS 9.114 + PEP FIMPE 14 = front).
        -- Mismo hash que el caso HABI (feedback_bgc_premium_collector_gap). Mantener esta lista.
        AND db_status.1 != 'DBI386340b3ef9b714192cb0d8816769044b14926cc'
        AND is_validation_retry = 0
    GROUP BY period, client_id, sub_product, premium_name, clean_check_type
),
CHECKS_PREMIUM AS (
    SELECT
        period, client_id,
        'premium checks' AS product,
        lower(sub_product) AS sub_product,
        sum(check_counters) AS counters,
        concat(
            premium_name, '\n',
            arrayStringConcat(groupArray(concat('  - ', clean_check_type, ': ', toString(check_counters))), '\n')
        ) AS NOTA
    FROM CHECKS_PREMIUM_BASE
    GROUP BY period, client_id, sub_product, premium_name
),

-- ==========================================
-- 4. CHECKS CONTINUOUS
-- ==========================================
CHECKS_CONTINUOUS_BASE AS (
    SELECT
        period, client_id,
        country AS sub_product,
        if(check_type = '', 'general', check_type) AS clean_check_type,
        count(DISTINCT record_id) AS check_counters
    FROM base_data
    WHERE product = 'checks_continuous_check'
        AND status = 'completed'
        AND is_validation_retry = 0
    GROUP BY period, client_id, sub_product, clean_check_type
),
CHECKS_CONTINUOUS AS (
    SELECT
        period, client_id,
        'continuous Checks' AS product,
        lower(sub_product) AS sub_product,
        sum(check_counters) AS counters,
        arrayStringConcat(groupArray(concat(clean_check_type, ': ', toString(check_counters))), '\n') AS NOTA
    FROM CHECKS_CONTINUOUS_BASE
    GROUP BY period, client_id, sub_product
),

-- ==========================================
-- 5. CHECKS NORMALES
-- ==========================================
CHECKS_NORMALES_BASE AS (
    SELECT
        period, client_id,
        country AS sub_product,
        if(check_type = '', 'general', check_type) AS clean_check_type,
        count(DISTINCT record_id) AS check_counters
    FROM base_data
    WHERE product = 'checks_check'
        AND status = 'completed'
        AND check_type != 'document-validation'
        AND is_validation_retry = 0
    GROUP BY period, client_id, sub_product, clean_check_type
),
CHECKS AS (
    SELECT
        period, client_id,
        'checks' AS product,
        lower(sub_product) AS sub_product,
        sum(check_counters) AS counters,
        arrayStringConcat(groupArray(concat(clean_check_type, ': ', toString(check_counters))), '\n') AS NOTA
    FROM CHECKS_NORMALES_BASE
    GROUP BY period, client_id, sub_product

    UNION ALL

    SELECT
        period, client_id,
        'checks' AS product,
        'checks completos' AS sub_product,
        sum(check_type_total) AS counters,
        arrayStringConcat(groupArray(concat(clean_check_type, ': ', toString(check_type_total))), '\n') AS NOTA
    FROM (
        SELECT period, client_id, clean_check_type, sum(check_counters) AS check_type_total
        FROM CHECKS_NORMALES_BASE
        GROUP BY period, client_id, clean_check_type
    )
    GROUP BY period, client_id
),

-- ==========================================
-- 6. VALIDATIONS  (declined_reason YA contado — regla 2026-06-06)
-- ==========================================
VALIDATIONS_BASE AS (
    SELECT
        period, client_id,
        CASE
            WHEN product = 'validations_document_validation' AND document_type = 'invoice' THEN 'comprobante domicilio'
            WHEN product = 'validations_document_validation'                               THEN 'document validation'
            WHEN product = 'validations_face_recognition_passive_liveness'                 THEN 'passive liveness'
            WHEN product = 'validations_face_recognition_facematch_or_active_liveness'     THEN 'active liveness'
            WHEN product = 'validations_face_recognition_speech_match'                     THEN 'speech_match'
            WHEN product = 'validations_face_search'                                       THEN 'truface'
            WHEN product = 'validations_email_verification'                                THEN 'email verification'
            WHEN product = 'validations_phone_verification'                                THEN 'phone verification'
        END AS sub_product,
        CASE
            WHEN product = 'validations_document_validation' THEN 'doc - manual review: '
            WHEN product LIKE '%face%' THEN 'face - manual review: '
            ELSE 'manual review: '
        END AS nota_prefix,
        country,
        countIf(DISTINCT record_id, is_validation_retry = 0) AS total_counters,
        countIf(DISTINCT record_id, manual_review_status = 'performed') AS manual_review_counters
    FROM base_data
    WHERE product IN (
        'validations_document_validation',
        'validations_face_recognition_passive_liveness',
        'validations_face_recognition_facematch_or_active_liveness',
        'validations_face_recognition_speech_match',
        'validations_face_search',
        'validations_email_verification',
        'validations_phone_verification'
    )
    AND validation_failure_status != 'system_error'
    -- declined_reason NO se excluye (se cobra desde 2026-06-06)
    GROUP BY period, client_id, sub_product, nota_prefix, country
),
VALIDATIONS AS (
    SELECT
        period, client_id,
        'validations' AS product,
        sub_product,
        sum(total_counters) AS counters,
        if(
            sum(manual_review_counters) > 0,
            concat(
                nota_prefix, toString(sum(manual_review_counters)),
                if(
                    sumIf(manual_review_counters, country != '') > 0,
                    concat('\n', arrayStringConcat(
                        groupArrayIf(concat('  - ', country, ': ', toString(manual_review_counters)),
                                     manual_review_counters > 0 AND country != ''), '\n')),
                    ''
                )
            ),
            ''
        ) AS NOTA
    FROM VALIDATIONS_BASE
    GROUP BY period, client_id, sub_product, nota_prefix
),

-- ==========================================
-- 6b. VALIDATIONS — REVISIÓN MANUAL (counter aparte, decisión JP 2026-06-13)
--   El front cobra la revisión manual como línea separada de la validación
--   automática (Mi Banco mayo: "Validación de Documento" 2.548 + "...Revisión
--   Manual" 173, "Rostro - Revisión Manual" 142). NO es doble conteo. Con este
--   bloque, validations de Mi Banco mayo = 8.289 = front exacto.
--   doc → 'document manual review' · face → 'face manual review'.
--   Misma semántica que el manual_review_counters que ya alimentaba la NOTA
--   (product list de validations + system_error excluido), sin filtro de retry.
-- ==========================================
VALIDATIONS_MR_BASE AS (
    SELECT
        period, client_id,
        CASE
            WHEN product = 'validations_document_validation' THEN 'document manual review'
            WHEN product LIKE '%face%'                       THEN 'face manual review'
            ELSE 'manual review'
        END AS sub_product,
        country,
        count(DISTINCT record_id) AS mr_counters
    FROM base_data
    WHERE product IN (
        'validations_document_validation',
        'validations_face_recognition_passive_liveness',
        'validations_face_recognition_facematch_or_active_liveness',
        'validations_face_recognition_speech_match',
        'validations_face_search',
        'validations_email_verification',
        'validations_phone_verification'
    )
    AND validation_failure_status != 'system_error'
    AND manual_review_status = 'performed'
    GROUP BY period, client_id, sub_product, country
),
VALIDATIONS_MR AS (
    SELECT
        period, client_id,
        'validations' AS product,
        sub_product,
        sum(mr_counters) AS counters,
        if(
            sumIf(mr_counters, country != '') > 0,
            arrayStringConcat(groupArrayIf(concat('  - ', country, ': ', toString(mr_counters)), country != ''), '\n'),
            ''
        ) AS NOTA
    FROM VALIDATIONS_MR_BASE
    GROUP BY period, client_id, sub_product
),

-- ==========================================
-- 7. FIRMA ELECTRÓNICA  (electronic signature)
--   Decisión JP 2026-06-13 (opción A): la firma va DENTRO de `validations`
--   como sub_product 'electronic signature' (el front la agrupa bajo
--   "Validaciones"), NO como producto 'zapsign' aparte. Solo cambia el product
--   de salida; la lógica de conteo (retry + system_error excluidos) se mantiene.
-- ==========================================
ZAPSIGN_BASE AS (
    SELECT
        period, client_id, country,
        count(DISTINCT record_id) AS country_counters
    FROM base_data
    WHERE product = 'validations_electronic_signature'
        AND is_validation_retry = 0
        AND validation_failure_status != 'system_error'
    GROUP BY period, client_id, country
),
ZAPSIGN AS (
    SELECT
        period, client_id,
        'validations' AS product,
        'electronic signature' AS sub_product,
        sum(country_counters) AS counters,
        if(
            sumIf(country_counters, country != '') > 0,
            arrayStringConcat(groupArrayIf(concat('  - ', country, ': ', toString(country_counters)), country != ''), '\n'),
            ''
        ) AS NOTA
    FROM ZAPSIGN_BASE
    GROUP BY period, client_id
),

-- ==========================================
-- 8. OCR (Document Recognition)
-- ==========================================
DOC_RECOGNITION_BASE AS (
    SELECT
        period, client_id, country,
        count(DISTINCT record_id) AS country_counters
    FROM base_data
    WHERE product = 'document_recognition_ocr'
        AND is_validation_retry = 0
    GROUP BY period, client_id, country
),
DOC_RECOGNITION AS (
    SELECT
        period, client_id,
        'document recognition' AS product,
        'ocr' AS sub_product,
        sum(country_counters) AS counters,
        if(
            sumIf(country_counters, country != '') > 0,
            arrayStringConcat(groupArrayIf(concat('  - ', country, ': ', toString(country_counters)), country != ''), '\n'),
            ''
        ) AS NOTA
    FROM DOC_RECOGNITION_BASE
    GROUP BY period, client_id
)

SELECT
    toDate(concat(period, '-01')) AS periodo_mes,
    client_id,
    product,
    sub_product,
    counters AS usage,
    NOTA      AS nota
FROM (
    SELECT * FROM FORM
    UNION ALL SELECT * FROM TRUCONNECT
    UNION ALL SELECT * FROM CHECKS_PREMIUM
    UNION ALL SELECT * FROM CHECKS_CONTINUOUS
    UNION ALL SELECT * FROM CHECKS
    UNION ALL SELECT * FROM VALIDATIONS
    UNION ALL SELECT * FROM VALIDATIONS_MR
    UNION ALL SELECT * FROM ZAPSIGN
    -- ⚠️ OCR (DOC_RECOGNITION) EXCLUIDO 2026-06-12: el counter
    -- document_recognition_ocr YA ESTÁ contado dentro de
    -- validations_document_validation (es un sub-paso de la validación de
    -- documento) → emitirlo como producto aparte = doble conteo. Verificado:
    -- 0 clientes con OCR standalone (OCR>0 sin document validation) en toda la
    -- tabla. Las CTEs DOC_RECOGNITION_BASE / DOC_RECOGNITION quedan definidas
    -- pero SIN usar (inertes) — NO re-agregar este UNION.
    -- UNION ALL SELECT * FROM DOC_RECOGNITION
) AS reporte_maestro
WHERE sub_product IS NOT NULL
  AND usage > 0
ORDER BY periodo_mes ASC, client_id ASC, product ASC, sub_product ASC;
