-- ============================================================
-- MIGRACIÓN CE Report Builder → ClickHouse (consumo facturable)
-- ============================================================
-- Estado 2026-05-29. NO publicado todavía (probado en copia del flujo).
-- Decisión y validación: memorias feedback_ce_consumo_ch_es_factura +
-- project_ce_report_builder_ch_migration. Reglas billable: skill
-- clickhouse-counters-metabase.md.
--
-- Por qué: el Report Builder CE mostraba SF (STATUS='success'), que infla
-- 2-5% porque cuenta enviados-no-entregados (sent en tránsito). CH limpio
-- (FINAL + delivered/read) = la factura. Validado vs front abril 2026 en
-- Financiera (TCIe728303b71f4a4193a535c66be6956fe) y GDC
-- (TCId189c152b8f6d4a388b6de5846d21805): outbound/notif <0,5%, inbound ~1%.
--
-- Mecanismo del gap SF→CH (cuantificado):
--   SF success = delivered + read + sent(en tránsito)  ;  CH billable = delivered + read
--   Fin outbound 768 = 750 + 18 en_transito ; GDC 84.081 ≈ 81.130 + 2.941
--
-- Mapa de migrabilidad CE:
--   Ce1 consumo total          → CH  (7d75098b)   ✅ migrado (Fase 1, probado)
--   Ce2 eficiencia campañas    → SF  (CAMPAIGNS — CH no tiene campañas)
--   Ce3 fallos outbound        → SF  (FAILURE_REASON no está en CH)
--   Ce4 flujo inbound          → SF  (% a agente = tickets, no en CH)
--   Ce5/Ce6 agentes            → SF  (VW_INTERNAL_AGENT_TICKET_SUMMARY)
--   Ce12 consumo por línea     → CH  (Endpoint B)  ✅ validado (GDC abril)
--   Ce13 tendencia mensual     → CH  (Endpoint A)  ✅ validado (GDC abril)
--   Ce14 heatmap por línea     → CH  (Endpoint B)  ✅ validado (GDC abril)
--   Ce8-11 funnel/steps/VRF    → SF  (sin jerarquía de pasos en CH)
--
-- Params de todos: {client_id:String}, {fecha_inicio:String}, {fecha_fin:String}
-- (escalares → llamar por GET con param_client_id/param_fecha_inicio/param_fecha_fin,
--  format=JSON, Basic Auth; SIN body ni header x-clickhouse-endpoint-version).
-- TZ: Bogotá (toTimeZone) para matchear el SF de CE y el front.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- ENDPOINT 7d75098b — "CE Consumo" (Ce1)  ✅ VALIDADO + GUARDADO
-- Devuelve outbound/notif/inbound del período actual + previo (MoM).
-- ════════════════════════════════════════════════════════════
WITH
  rng AS (
    SELECT
      toDate({fecha_inicio: String})                                    AS cur_start,
      toDate({fecha_fin: String})                                       AS cur_end,
      toStartOfMonth(toDate({fecha_inicio: String}) - INTERVAL 1 MONTH) AS prev_start,
      addDays(toDate({fecha_inicio: String}), -1)                       AS prev_end
  ),
  outbound_notif AS (
    SELECT
      toDate(toTimeZone(date_counted,'America/Bogota'))            AS event_date,
      if(product = 'truconnect_outbound','outbound','notification') AS kind
    FROM production.client_usage_records FINAL
    WHERE client_id = {client_id: String}
      AND product IN ('truconnect_outbound','truconnect_notification')
      AND status IN ('success','delivered','read')
      AND waba_phone_number != '+17547045206'
      AND toDate(toTimeZone(date_counted,'America/Bogota')) >= (SELECT prev_start FROM rng)
      AND toDate(toTimeZone(date_counted,'America/Bogota')) <= (SELECT cur_end   FROM rng)
  ),
  inbound AS (
    SELECT
      toDate(toTimeZone(date_counted,'America/Bogota')) AS event_date,
      'inbound'                                         AS kind
    FROM production.client_usage_records FINAL
    WHERE client_id = {client_id: String}
      AND product = 'digital_identity_process'
      AND channel_type = 'inbound'
      AND waba_phone_number != '+17547045206'
      AND toDate(toTimeZone(date_counted,'America/Bogota')) >= (SELECT prev_start FROM rng)
      AND toDate(toTimeZone(date_counted,'America/Bogota')) <= (SELECT cur_end   FROM rng)
  ),
  unified AS (
    SELECT event_date, kind FROM outbound_notif
    UNION ALL
    SELECT event_date, kind FROM inbound
  )
SELECT
  countIf(kind='outbound'     AND event_date BETWEEN r.cur_start  AND r.cur_end)  AS CUR_OUTBOUND,
  countIf(kind='notification' AND event_date BETWEEN r.cur_start  AND r.cur_end)  AS CUR_NOTIFICATION,
  countIf(kind='inbound'      AND event_date BETWEEN r.cur_start  AND r.cur_end)  AS CUR_INBOUND,
  countIf(kind='outbound'     AND event_date BETWEEN r.prev_start AND r.prev_end) AS PREV_OUTBOUND,
  countIf(kind='notification' AND event_date BETWEEN r.prev_start AND r.prev_end) AS PREV_NOTIFICATION,
  countIf(kind='inbound'      AND event_date BETWEEN r.prev_start AND r.prev_end) AS PREV_INBOUND
FROM unified u
CROSS JOIN rng r;
-- Validación Fin abril: 750 / 11835 / 480 (+ prev marzo 817 / 12376 / 180). GDC: 81130 / 3 / 6000.


-- ════════════════════════════════════════════════════════════
-- ENDPOINT 113d8964 — "Tasas CE" (Ce2 parte CH + reconciliación)  ✅ VALIDADO + GUARDADO
-- Por producto: total/entregados/leidos/fallidos/en_transito, actual + previo.
-- NOTA: reemplazó al viejo "CE by-flow" (que NO tenía FINAL → inflaba +27-32%
-- por doble-contar los 'read'). El monitor de Preparar Datos compara entregados
-- vs el counter 7d7; si divergen >2% loguea (no se muestra).
-- ════════════════════════════════════════════════════════════
WITH
  rng AS (
    SELECT
      toDate({fecha_inicio: String})                                    AS cur_start,
      toDate({fecha_fin: String})                                       AS cur_end,
      toStartOfMonth(toDate({fecha_inicio: String}) - INTERVAL 1 MONTH) AS prev_start,
      addDays(toDate({fecha_inicio: String}), -1)                       AS prev_end
  ),
  msgs AS (
    SELECT
      product,
      status,
      toDate(toTimeZone(date_counted,'America/Bogota')) AS event_date
    FROM production.client_usage_records FINAL
    WHERE client_id = {client_id: String}
      AND product IN ('truconnect_outbound','truconnect_notification')
      AND waba_phone_number != '+17547045206'
      AND toDate(toTimeZone(date_counted,'America/Bogota')) >= (SELECT prev_start FROM rng)
      AND toDate(toTimeZone(date_counted,'America/Bogota')) <= (SELECT cur_end   FROM rng)
  )
SELECT
  m.product,
  countIf(m.event_date BETWEEN r.cur_start AND r.cur_end)                                                  AS CUR_TOTAL,
  countIf(m.status IN ('success','delivered','read') AND m.event_date BETWEEN r.cur_start AND r.cur_end)   AS CUR_ENTREGADOS,
  countIf(m.status='read'   AND m.event_date BETWEEN r.cur_start AND r.cur_end)                            AS CUR_LEIDOS,
  countIf(m.status='failed' AND m.event_date BETWEEN r.cur_start AND r.cur_end)                            AS CUR_FALLIDOS,
  countIf(m.status='sent'   AND m.event_date BETWEEN r.cur_start AND r.cur_end)                            AS CUR_EN_TRANSITO,
  countIf(m.event_date BETWEEN r.prev_start AND r.prev_end)                                                AS PREV_TOTAL,
  countIf(m.status IN ('success','delivered','read') AND m.event_date BETWEEN r.prev_start AND r.prev_end) AS PREV_ENTREGADOS,
  countIf(m.status='read'   AND m.event_date BETWEEN r.prev_start AND r.prev_end)                          AS PREV_LEIDOS,
  countIf(m.status='failed' AND m.event_date BETWEEN r.prev_start AND r.prev_end)                          AS PREV_FALLIDOS
FROM msgs m
CROSS JOIN rng r
GROUP BY m.product;
-- Validación Fin abril: outbound CUR_ENTREGADOS=750, notif=11835. GDC: 81130 / 3.


-- ════════════════════════════════════════════════════════════
-- ENDPOINT A — "ce_tendencia_mensual" (Ce13)  ✅ VALIDADO (GDC abril) — falta cablear
-- UUID: 0832340b-d9e9-4299-a9a0-4c93fc2ec89d (ex "BGC Counter" Ola 3a; ya NO reservado para BGC)
-- 6 meses, billable, con zero-fill para meses sin actividad.
-- Mapeo a Ce13: col1=OUTBOUND, col2=NOTIFICATION, col3=INBOUND, col4=TOTAL, periodo=MES
-- ════════════════════════════════════════════════════════════
SELECT
  toStartOfMonth(toTimeZone(date_counted,'America/Bogota')) AS MES,
  countIf(product='truconnect_outbound')      AS OUTBOUND,
  countIf(product='truconnect_notification')  AS NOTIFICATION,
  countIf(product='digital_identity_process') AS INBOUND,
  count()                                     AS TOTAL
FROM production.client_usage_records FINAL
WHERE client_id = {client_id: String}
  AND (
    (product IN ('truconnect_outbound','truconnect_notification')
       AND status IN ('success','delivered','read') AND waba_phone_number != '+17547045206')
    OR (product = 'digital_identity_process' AND channel_type = 'inbound' AND waba_phone_number != '+17547045206')
  )
  AND toStartOfMonth(toTimeZone(date_counted,'America/Bogota')) >= toStartOfMonth(toDate({fecha_inicio: String}) - INTERVAL 5 MONTH)
  AND toStartOfMonth(toTimeZone(date_counted,'America/Bogota')) <= toStartOfMonth(toDate({fecha_inicio: String}))
GROUP BY MES
ORDER BY MES ASC
WITH FILL
  FROM toStartOfMonth(toDate({fecha_inicio: String}) - INTERVAL 5 MONTH)
  TO   toStartOfMonth(toDate({fecha_inicio: String})) + INTERVAL 1 MONTH
  STEP toIntervalMonth(1);
-- Validación esperada Fin abril: fila 2026-04 = 750/11835/480/13065 (= Ce1); 2026-03 = 817/12376/180/13373.
-- VALIDADO GDC abril: 2026-04 = 81130/3/6000/87133 (= Ce1 ✓); 2026-03 = 76424/3368/7358/87150;
--   2026-02 = 76330/2123/6418/84871; 6 meses con zero-fill (dic/ene notif=0). Todas las sumas cuadran.


-- ════════════════════════════════════════════════════════════
-- ENDPOINT B — "ce_consumo_por_linea" (Ce12 + Ce14)  ✅ VALIDADO (GDC abril) — falta cablear
-- UUID: 5113cd40-c938-415e-93f9-1d8303f07ae7 (endpoint NUEVO 2026-05-29; no se reusó e0425fdf/client_di_by_flow)
-- Por línea (waba): mes actual desglosado (Ce12) + 3 meses de volumen (Ce14).
-- Ce12: col1=LINEA, col2=OUT_M0, col3=NOTIF_M0, col4=VOL_M0, col5=% (calc en override)
-- Ce14: col1=LINEA, col2=VOL_M0, col3=VOL_M1, col4=VOL_M2, col5=estado (NEW/STOPPED/ACTIVE, calc en override)
-- (outbound+notif only, sin inbound; demo excluida)
-- ════════════════════════════════════════════════════════════
WITH rng AS (
  SELECT
    toStartOfMonth(toDate({fecha_inicio: String}))                    AS m0,
    toStartOfMonth(toDate({fecha_inicio: String}) - INTERVAL 1 MONTH) AS m1,
    toStartOfMonth(toDate({fecha_inicio: String}) - INTERVAL 2 MONTH) AS m2
),
msgs AS (
  SELECT
    waba_phone_number AS linea,
    toStartOfMonth(toTimeZone(date_counted,'America/Bogota')) AS mes,
    product
  FROM production.client_usage_records FINAL
  WHERE client_id = {client_id: String}
    AND product IN ('truconnect_outbound','truconnect_notification')
    AND status IN ('success','delivered','read')
    AND waba_phone_number != '+17547045206'
    AND toStartOfMonth(toTimeZone(date_counted,'America/Bogota')) >= (SELECT m2 FROM rng)
    AND toStartOfMonth(toTimeZone(date_counted,'America/Bogota')) <= (SELECT m0 FROM rng)
)
SELECT
  m.linea AS LINEA,
  countIf(m.product='truconnect_outbound'     AND m.mes = r.m0) AS OUT_M0,
  countIf(m.product='truconnect_notification' AND m.mes = r.m0) AS NOTIF_M0,
  countIf(m.mes = r.m0) AS VOL_M0,
  countIf(m.mes = r.m1) AS VOL_M1,
  countIf(m.mes = r.m2) AS VOL_M2
FROM msgs m
CROSS JOIN rng r
GROUP BY m.linea
ORDER BY VOL_M0 DESC;
-- Validación esperada Fin abril: sum(OUT_M0)=750, sum(NOTIF_M0)=11835, sin línea demo.
-- VALIDADO GDC abril: 1 línea +573102997615 → OUT_M0=81130, NOTIF_M0=3, VOL_M0=81133,
--   VOL_M1=79792 (=marzo out+notif), VOL_M2=78453 (=feb out+notif). Σ OUT_M0/NOTIF_M0 = Ce1 ✓.
-- VALIDADO Financiera abril (multi-línea): 2 wabas → Σ OUT_M0=750, Σ NOTIF_M0=11835 (=Ce1);
--   Σ VOL_M1=13193 (=marzo out+notif), Σ VOL_M2=12105 (=feb out+notif); ambas ACTIVE. % suma 100.
