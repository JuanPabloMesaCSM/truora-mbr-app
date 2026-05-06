-- Portfolio Consumption Sync: snapshot agregado de consumo por
-- (mes x cliente x producto) sobre SHARED_COUNTERS_DYNAMO.
--
-- Lo escribe el flujo n8n "Portfolio Consumption Sync" (cron Lunes/Miercoles/Viernes
-- 06:00 America/Bogota). El frontend del Dashboard de Cartera (/dashboard) lo lee
-- como vista panoramica antes de entrar al drill-down de un cliente.
--
-- Granularidad sin product_identifier (decision 2026-05-06): el sub-producto se ve
-- en el drill-down via los charts existentes (consumo_mensual del webhook detail).
-- ~100 clientes x 3 productos x 3 meses ~= 900 filas. Tabla chica e idempotente.

CREATE TABLE IF NOT EXISTS public.portfolio_consumption (
  periodo_mes        date    NOT NULL,
  client_id          text    NOT NULL,
  client_name        text,
  csm_owner          text,
  product            text    NOT NULL,
  usage              bigint  NOT NULL,
  fecha_actualizado  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (periodo_mes, client_id, product)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_consumption_periodo
  ON public.portfolio_consumption (periodo_mes DESC);

CREATE INDEX IF NOT EXISTS idx_portfolio_consumption_csm
  ON public.portfolio_consumption (csm_owner, periodo_mes DESC);

ALTER TABLE public.portfolio_consumption ENABLE ROW LEVEL SECURITY;

-- Lectura team-wide consistente con boti_alertas / clientes (decision 2026-04-29).
CREATE POLICY "Equipo CSM lee portfolio_consumption"
  ON public.portfolio_consumption
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.csm
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- INSERT/UPDATE/DELETE solo via service_role_key (n8n). No se necesita policy.

-- Verificacion post-migration:
--   SELECT polname, cmd FROM pg_policies WHERE tablename = 'portfolio_consumption';
-- Esperado: 1 policy SELECT "Equipo CSM lee portfolio_consumption".
