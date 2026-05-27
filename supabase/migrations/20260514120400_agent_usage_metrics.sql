-- Telemetria de uso del Query Repository Agent.
-- 1 fila por request al backend (cada turno user→assistant).
-- Permite a admins ver: costos, latencias, tool calls, errores, uso por CSM.
--
-- Volumen esperado: ~250 filas/mes (50 conv/sem * 5 turnos avg).
-- Crece muy lento, retencion 12 meses, despues archivar.

CREATE TABLE IF NOT EXISTS public.agent_usage_metrics (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  conversation_id       uuid NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,
  message_id            uuid REFERENCES public.agent_messages(id) ON DELETE SET NULL,

  csm_email             text NOT NULL,

  -- Modelo usado
  modelo                text NOT NULL,  -- 'claude-sonnet-4-6', 'claude-haiku-4-5'

  -- Token usage detallado (CRITICO para entender costos y eficacia del caching)
  input_tokens          integer NOT NULL DEFAULT 0,
  input_cached_tokens   integer NOT NULL DEFAULT 0,  -- tokens leidos desde cache (90% off)
  cache_creation_tokens integer NOT NULL DEFAULT 0,  -- tokens que ESCRIBIERON al cache (25% extra)
  output_tokens         integer NOT NULL DEFAULT 0,

  -- Costo estimado en USD (calculado en backend, no en DB)
  cost_usd              numeric(10, 6) NOT NULL DEFAULT 0,

  -- Performance
  latencia_total_ms     integer NOT NULL,
  ttft_ms               integer,  -- time to first token (streaming SSE)

  -- Tools llamados en este turno
  -- Shape: [{ tool, took_ms, ok: boolean }, ...]
  tools_called          jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Skills leidos via read_skill tool
  skills_leidos         text[] DEFAULT '{}',

  -- Error si lo hubo (timeout, API rate limit, tool failure)
  error_tipo            text,
  error_mensaje         text,

  creado_en             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_csm_fecha
  ON public.agent_usage_metrics (csm_email, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_fecha
  ON public.agent_usage_metrics (creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_modelo
  ON public.agent_usage_metrics (modelo, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_errores
  ON public.agent_usage_metrics (error_tipo, creado_en DESC)
  WHERE error_tipo IS NOT NULL;

ALTER TABLE public.agent_usage_metrics ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICIES — solo admins (datos sensibles: costos, tokens, errores)
-- ============================================================================

-- 1) SELECT: solo admins.
CREATE POLICY "Solo admins leen metrics" ON public.agent_usage_metrics
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- 2) INSERT/UPDATE/DELETE: ningun user authenticated. Solo service_role
--    del backend escribe (pasa por encima de RLS).
--    No definimos policies INSERT/UPDATE/DELETE = nadie via JWT puede tocar.

-- ============================================================================
-- VIEWS utiles para admin dashboard
-- ============================================================================

-- Resumen por CSM ultimos 30 dias
CREATE OR REPLACE VIEW public.agent_metrics_resumen_30d AS
SELECT
  csm_email,
  COUNT(*) AS total_calls,
  SUM(input_tokens + output_tokens) AS total_tokens,
  SUM(input_cached_tokens) AS total_cached_tokens,
  ROUND(SUM(cost_usd), 4) AS total_cost_usd,
  ROUND(AVG(latencia_total_ms)::numeric, 0) AS latencia_avg_ms,
  ROUND(AVG(ttft_ms)::numeric, 0) AS ttft_avg_ms,
  COUNT(*) FILTER (WHERE error_tipo IS NOT NULL) AS errores
FROM public.agent_usage_metrics
WHERE creado_en >= now() - interval '30 days'
GROUP BY csm_email
ORDER BY total_cost_usd DESC;

-- Cache hit rate global ultimos 7 dias (KPI critico de optimizacion)
CREATE OR REPLACE VIEW public.agent_metrics_cache_7d AS
SELECT
  date_trunc('day', creado_en) AS dia,
  COUNT(*) AS calls,
  SUM(input_tokens) AS input_uncached,
  SUM(input_cached_tokens) AS input_cached,
  ROUND(
    100.0 * SUM(input_cached_tokens) / NULLIF(SUM(input_tokens + input_cached_tokens), 0),
    1
  ) AS cache_hit_pct,
  ROUND(SUM(cost_usd), 4) AS cost_usd
FROM public.agent_usage_metrics
WHERE creado_en >= now() - interval '7 days'
GROUP BY 1
ORDER BY 1 DESC;

-- ============================================================================
-- Verificacion:
--   SELECT * FROM agent_metrics_resumen_30d;
--   SELECT * FROM agent_metrics_cache_7d;
-- ============================================================================
