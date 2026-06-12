-- ============================================================
-- MIGRACIÓN DI → ClickHouse — "Consumo FACTURABLE" (1 endpoint, repurposing e0425fdf)
-- ============================================================
-- Estado 2026-06-02. Capa de datos validada (Cueros 1.571 ✓). NO publicado.
-- Reglas billable validations: skill clickhouse-counters-metabase.md (sección Validations).
-- Memoria: project_di_report_builder_ch_migration + feedback_di_procesos_vs_usuarios_vs_validaciones.
--
-- ⚠️ DI NO es como CE/BGC. El query SF del Report Builder DI mide PROCESOS/USUARIOS
--    (embudo: IDENTITY_PROCESSES, ACCOUNT_ID); el front factura VALIDACIONES. Unidades
--    distintas (1 proceso → 0..N validaciones; 1 rostro = passive_liveness + face_search).
--    Esto NO migra el embudo (queda en SF). AGREGA validaciones facturables desde CH.
--
-- DECISIÓN 2026-06-02 (JP): REPURPOSE del endpoint e0425fdf-0dc6-4302-ac99-c54bd8547cbd
--   (`client_di_by_flow`). Hoy tiene una query rota (product='digital_identity_process',
--   COUNT(*), sin FINAL, group by flow_id/status) y es FANTASMA: el `Reconciliar DI`
--   construye el objeto `ch` pero pasa null en TODAS las alertas DI → nadie usa sus números.
--   Es un endpoint DI → darle el query DI correcto es el mismo "fix in place" que hicimos
--   con BGC ad039af3. Beneficia al agente (catálogo client_di_by_flow queda correcto),
--   no rompe nada. MANTENEMOS params {client_id:String}, {from:Date}, {to:Date} para no
--   tocar el HTTP node del Report Builder DI ni el wrapper del agente.
--
-- UN SOLO ENDPOINT CH sirve a los dos casos (igual que BGC plegó arrays en el Resumen):
--   devuelve 1 fila con CUR_TOTAL, PREV_TOTAL, POR_TIPO[], HISTORICO[].
--   · Report Builder DI (scope A) consume CUR_TOTAL + PREV_TOTAL + POR_TIPO.
--   · Clientes por Validador (scope B) consume además HISTORICO.
--   · RAZONES de rechazo NO salen de CH (validation_declined_reason ~97% vacío) →
--     vienen de Snowflake DOCUMENT_VALIDATION_HISTORY (ver query al final). Solo scope B.
--
-- Regla billable validations (ACTUALIZADA 2026-06-12 — ver feedback_validations_declined_reason_now_billable):
--   product LIKE 'validations_%' AND status IN ('success','failure')
--   AND is_validation_retry = false AND validation_failure_status != 'system_error'
--   + FINAL + count(DISTINCT record_id) (uniqExact) + TZ UTC (toDate(date_counted)).
--   ⚠️ CAMBIO 2026-06-06: YA NO se excluye validation_declined_reason. Las validaciones declinadas
--      por no_face_detected / front_document_not_found / document_not_recognized AHORA SE COBRAN
--      (confirmado JP 2026-06-11; la query maestra de counters de Truora ya las cuenta). Antes se
--      excluían — por eso este endpoint sube para clientes con muchas declinadas de ese tipo.
--
-- VALIDADO Cueros abril: CUR_TOTAL=1.571 (=consola), PREV_TOTAL=1.385, POR_TIPO=
--   [(document_validation,911,316,595),(face_recognition_passive_liveness,337,242,95),(face_search,323,323,0)].
--   Nota: face_search siempre exitosas=total (búsqueda que se cobra al ejecutarse, no pass/fail).
-- ESPERADO Confiamos abril: CUR_TOTAL=5.357 (doc 3.184 + passive 1.091 + face_search 1.082); SF Report Builder DI = 0.
-- ⚠️ Las 3 cifras de arriba se VALIDARON PRE-2026-06-12 (con el filtro declined_reason). Tras quitarlo
--    pueden subir levemente si el cliente tiene declinadas no_face/front_not_found/doc_not_recognized.
--    Re-validar contra el front al publicar (en cartera Oppy Ene-May el impacto global es ~0,12%).
--
-- RAZONES: para análisis de rechazo (scope B) NO se aplican exclusiones billable
--   (el cliente quiere ver TODAS las razones, incluido no_face_detected) — solo se
--   excluye system_error y se mantiene is_validation_retry=false. `product` separa doc/rostro.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- ENDPOINT ÚNICO — repurpose e0425fdf-0dc6-4302-ac99-c54bd8547cbd ("DI Consumo facturable")
-- Reemplaza la query rota actual. Params {client_id:String}, {from:Date}, {to:Date}.
-- GET + param_client_id / param_from / param_to, Basic Auth. (Save la query que respalda
-- el endpoint en CH console — correr en el editor NO actualiza el endpoint.)
-- ════════════════════════════════════════════════════════════
-- Estructura PLANA (sin CTE rng / CROSS JOIN / scalar-subquery-on-CTE): CH 26.2 se
-- trababa con ese anidamiento ("Unmatched parentheses"). Rangos de fecha inline.
SELECT
  uniqExactIf(record_id, d >= toDate({from:Date}) AND d <= toDate({to:Date}))                                           AS CUR_TOTAL,
  uniqExactIf(record_id, d >= toStartOfMonth(toDate({from:Date}) - INTERVAL 1 MONTH) AND d <= addDays(toDate({from:Date}), -1)) AS PREV_TOTAL,

  -- POR_TIPO (periodo actual) → scope A + B. [(product, total, exitosas, fallidas)]
  (
    SELECT groupArray((product, total, exitosas, fallidas))
    FROM (
      SELECT product,
        uniqExact(record_id)                     AS total,
        uniqExactIf(record_id, status='success') AS exitosas,
        uniqExactIf(record_id, status='failure') AS fallidas
      FROM production.client_usage_records FINAL
      WHERE client_id = {client_id:String}
        AND product LIKE 'validations_%'
        AND status IN ('success','failure')
        AND is_validation_retry = false
        AND validation_failure_status != 'system_error'
        -- 2026-06-12: declined_reason ya NO se excluye (no_face/front_not_found/doc_not_recognized se cobran)
        AND toDate(date_counted) >= toDate({from:Date})
        AND toDate(date_counted) <= toDate({to:Date})
      GROUP BY product
      HAVING total > 0
    )
  ) AS POR_TIPO,

  -- (RAZONES NO sale de CH: validation_declined_reason está ~97% vacío incluso en
  --  declinadas — Confiamos abril 23/835. Las razones vienen de Snowflake, ver abajo.)

  -- HISTORICO (4 meses, billable) → scope B. [(mes, total, exitosas)]
  (
    SELECT groupArray((mes, total, exitosas))
    FROM (
      SELECT toStartOfMonth(date_counted) AS mes,
        uniqExact(record_id)                     AS total,
        uniqExactIf(record_id, status='success') AS exitosas
      FROM production.client_usage_records FINAL
      WHERE client_id = {client_id:String}
        AND product LIKE 'validations_%'
        AND status IN ('success','failure')
        AND is_validation_retry = false
        AND validation_failure_status != 'system_error'
        -- 2026-06-12: declined_reason ya NO se excluye (no_face/front_not_found/doc_not_recognized se cobran)
        AND toStartOfMonth(date_counted) >= toStartOfMonth(toDate({from:Date}) - INTERVAL 3 MONTH)
        AND toStartOfMonth(date_counted) <= toStartOfMonth(toDate({from:Date}))
      GROUP BY mes
      ORDER BY mes ASC
    )
  ) AS HISTORICO

FROM (
  SELECT record_id, toDate(date_counted) AS d
  FROM production.client_usage_records FINAL
  WHERE client_id = {client_id:String}
    AND product LIKE 'validations_%'
    AND status IN ('success','failure')
    AND is_validation_retry = false
    AND validation_failure_status != 'system_error'
    -- 2026-06-12: declined_reason ya NO se excluye (no_face/front_not_found/doc_not_recognized se cobran)
    AND toDate(date_counted) >= toStartOfMonth(toDate({from:Date}) - INTERVAL 1 MONTH)
    AND toDate(date_counted) <= toDate({to:Date})
);
-- Serialización JSONEachRow (como BGC BASES_PREMIUM): los arrays salen como
--   POR_TIPO=[["validations_document_validation","911","316","595"],...] (números como string),
--   HISTORICO=[["2026-04-01","5357","4516"],...]. El parser n8n los castea.


-- ════════════════════════════════════════════════════════════
-- ⚠️ PENDIENTE DE VALIDAR — Manual Review (MR) — sin cambios vs versión anterior.
-- Los 3 perfiles validados no usan MR. La regla base excluye is_validation_retry=true →
-- para clientes MR-heavy podría sub-contar revisiones-reintento (manual_review_status='performed').
-- Probe (detectar si MR aporta a un cliente dado):
--   SELECT product, count(DISTINCT record_id) AS mr
--   FROM production.client_usage_records FINAL
--   WHERE client_id={client_id:String} AND product LIKE 'validations_%'
--     AND manual_review_status='performed' AND is_validation_retry=true
--     AND toDate(date_counted) >= toDate({from:Date}) AND toDate(date_counted) <= toDate({to:Date})
--   GROUP BY product;
-- Si mr=0 → la regla base es exacta. Si mr>0 → validar vs consola antes de confiar.
-- ============================================================


-- ============================================================
-- RAZONES DE RECHAZO — SNOWFLAKE (NO ClickHouse), solo scope B (Validador)
-- ============================================================
-- CH no carga validation_declined_reason de forma fiable (Confiamos abril: 23 de 835
-- declinadas con motivo). Las razones REALES — standalone incluidas — viven en
-- TRUORA.TRUORA_SCHEMA.DOCUMENT_VALIDATION_HISTORY (1 fila por validación, doc + rostro,
-- IDENTITY_PROCESS_ID nullable). Esta tabla es el "10_declinados" global del MBR manual.
-- VALIDADO Confiamos abril 1:1 vs MBR manual: rostro similarity 165 + passive 74;
--   doc missing_text 132 + image_face 95 + production_data 74 + photo_of_photo 64 + photocopy 31 + ...
-- TYPE separa documento ('document-validation') vs rostro ('face-recognition').
-- Dedup con COUNT(DISTINCT VALIDATION_ID) (la tabla tiene varias filas por validación).
-- Rol ANALYSTS. El flujo n8n del Validador usa una credencial SF con permisos baked-in.
-- Params n8n: {{ CLIENT_ID }}, {{ from }}, {{ to }}.
--
-- ⚠️ El Validador NO es CH puro: CH (consumo + histórico = factura) + esta query SF (razones).
--    Sigue siendo liviano (1 tabla, group-by simple, NADA del embudo de IDENTITY_PROCESSES).
-- ============================================================
SELECT
  TYPE                              AS tipo,            -- 'document-validation' | 'face-recognition'
  DECLINED_REASON                   AS reason,
  COUNT(DISTINCT VALIDATION_ID)     AS cantidad
FROM TRUORA.TRUORA_SCHEMA.DOCUMENT_VALIDATION_HISTORY
WHERE CLIENT_ID = '{{ CLIENT_ID }}'
  AND CREATION_DATE >= '{{ from }}'::TIMESTAMP_NTZ
  AND CREATION_DATE <  DATEADD('day', 1, '{{ to }}'::TIMESTAMP_NTZ)
  AND VALIDATION_STATUS = 'failure'
  AND DECLINED_REASON IS NOT NULL AND DECLINED_REASON != ''
GROUP BY TYPE, DECLINED_REASON
ORDER BY TYPE, cantidad DESC;
-- VALIDADO Confiamos abril (ad-hoc, CREATION_DATE entre 2026-04-01 y 2026-04-30):
--   face-recognition: similarity_threshold_not_passed 165, passive_liveness_verification_not_passed 74, no_face_detected 18
--   document-validation: missing_text 132, image_face_validation_not_passed 95, production_data_inconsistency 74,
--     document_is_a_photo_of_photo 64, document_is_a_photocopy 31, invalid_issue_date 25, ... (= MBR manual).

