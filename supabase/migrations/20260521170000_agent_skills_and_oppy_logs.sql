-- ============================================================================
-- Oppy Agent — base de conocimiento + audit log
-- ============================================================================
--
-- Tabla agent_skills:
--   Es el espejo en Supabase de los archivos .claude/skills/*.md del filesystem
--   local de JP. El sync se hace via hook PostToolUse de Claude Code + Edge
--   Function oppy-skills-mcp.
--
--   El agente Oppy en n8n consume estas filas como conocimiento contextual
--   on-demand (read_skill / search_skills). Las 2 skills criticas
--   (query-repository, truora-domain) siempre se pre-cargan en el system
--   prompt del AI Agent.
--
-- Tabla oppy_chat_logs:
--   Audit log de TODA conversacion con Oppy. Cada turn (user message +
--   assistant reply) genera 1 fila. Permite revisar intentos de injection,
--   alucinaciones detectadas, y patterns de uso del agente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. agent_skills
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_skills (
  name             text         PRIMARY KEY,
  description      text         NOT NULL,
  content_md       text         NOT NULL,
  size_bytes       int          NOT NULL,
  sha256_hash      text         NOT NULL,
  tags             text[]       DEFAULT '{}'::text[],
  ts_vector        tsvector     GENERATED ALWAYS AS (
    to_tsvector(
      'spanish',
      coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(content_md, '')
    )
  ) STORED,
  is_critical      boolean      NOT NULL DEFAULT false,
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.agent_skills IS 'Espejo de .claude/skills/*.md para consumo del agente Oppy';
COMMENT ON COLUMN public.agent_skills.is_critical IS 'true para skills pre-cargadas en system prompt (query-repository, truora-domain)';
COMMENT ON COLUMN public.agent_skills.sha256_hash IS 'Hash del content_md para drift detection y sync incremental';

CREATE INDEX IF NOT EXISTS agent_skills_ts_idx       ON public.agent_skills USING gin(ts_vector);
CREATE INDEX IF NOT EXISTS agent_skills_updated_idx  ON public.agent_skills (updated_at DESC);
CREATE INDEX IF NOT EXISTS agent_skills_critical_idx ON public.agent_skills (is_critical) WHERE is_critical;

-- ---------------------------------------------------------------------------
-- 2. oppy_chat_logs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.oppy_chat_logs (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        text         NOT NULL,
  user_email        text         NOT NULL,
  current_route     text,
  user_message      text         NOT NULL,
  assistant_reply   text,
  tool_calls        jsonb        DEFAULT '[]'::jsonb,
  validations       jsonb        DEFAULT '[]'::jsonb,
  flagged           boolean      NOT NULL DEFAULT false,
  flag_reason       text,
  latency_ms        int,
  model_used        text,
  prompt_tokens     int,
  completion_tokens int,
  created_at        timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.oppy_chat_logs IS 'Audit log de cada turn de conversacion con Oppy';
COMMENT ON COLUMN public.oppy_chat_logs.tool_calls   IS 'Array de {tool, input, output} - intermediate_steps del AI Agent';
COMMENT ON COLUMN public.oppy_chat_logs.validations  IS 'Array de {severity, reason, samples?} de la Capa 4 post-LLM validation';
COMMENT ON COLUMN public.oppy_chat_logs.flagged      IS 'true si la Capa 2 (sanitize input) o Capa 4 (post-LLM) detecto algo sospechoso';

CREATE INDEX IF NOT EXISTS oppy_logs_user_time_idx     ON public.oppy_chat_logs (user_email, created_at DESC);
CREATE INDEX IF NOT EXISTS oppy_logs_session_idx       ON public.oppy_chat_logs (session_id, created_at);
CREATE INDEX IF NOT EXISTS oppy_logs_flagged_idx       ON public.oppy_chat_logs (flagged, created_at DESC) WHERE flagged;
CREATE INDEX IF NOT EXISTS oppy_logs_validations_idx   ON public.oppy_chat_logs USING gin(validations);

-- ---------------------------------------------------------------------------
-- 3. RLS — agent_skills (team-wide read, admin-only write)
-- ---------------------------------------------------------------------------

ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier email en csm
CREATE POLICY "agent_skills_team_read"
  ON public.agent_skills
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'email') IN (SELECT email FROM public.csm)
  );

-- Insert / update / delete: solo admins (Ana, JD, JP)
CREATE POLICY "agent_skills_admin_write"
  ON public.agent_skills
  FOR ALL
  TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') = ANY (
      ARRAY['amarquez@truora.com', 'jdiaz@truora.com', 'jpmesa@truora.com']
    )
  )
  WITH CHECK (
    lower(auth.jwt() ->> 'email') = ANY (
      ARRAY['amarquez@truora.com', 'jdiaz@truora.com', 'jpmesa@truora.com']
    )
  );

-- ---------------------------------------------------------------------------
-- 4. RLS — oppy_chat_logs (cada CSM ve sus propios logs + admins ven todo)
-- ---------------------------------------------------------------------------

ALTER TABLE public.oppy_chat_logs ENABLE ROW LEVEL SECURITY;

-- Lectura: dueno del email O admin
CREATE POLICY "oppy_logs_owner_or_admin_read"
  ON public.oppy_chat_logs
  FOR SELECT
  TO authenticated
  USING (
    lower(user_email) = lower(auth.jwt() ->> 'email')
    OR
    lower(auth.jwt() ->> 'email') = ANY (
      ARRAY['amarquez@truora.com', 'jdiaz@truora.com', 'jpmesa@truora.com']
    )
  );

-- Insert: solo el service_role o el propio Edge Function lo inserta.
-- Los CSMs NO insertan directo (lo hace n8n con service_role key).
-- Por seguridad explicita: nadie autenticado puede INSERT directo.
CREATE POLICY "oppy_logs_no_direct_insert"
  ON public.oppy_chat_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Update / Delete: nadie. Audit log es append-only.
CREATE POLICY "oppy_logs_no_update"
  ON public.oppy_chat_logs
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "oppy_logs_no_delete"
  ON public.oppy_chat_logs
  FOR DELETE
  TO authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- 5. RPC: search_agent_skills — full-text search para el tool search_skills
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_agent_skills(
  q   text,
  lim int DEFAULT 5
)
RETURNS TABLE (
  name        text,
  description text,
  size_bytes  int,
  tags        text[],
  is_critical boolean,
  rank        real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    s.name,
    s.description,
    s.size_bytes,
    s.tags,
    s.is_critical,
    ts_rank(s.ts_vector, websearch_to_tsquery('spanish', q)) AS rank
  FROM public.agent_skills s
  WHERE s.ts_vector @@ websearch_to_tsquery('spanish', q)
  ORDER BY rank DESC, s.name
  LIMIT GREATEST(lim, 1);
$$;

COMMENT ON FUNCTION public.search_agent_skills IS 'Full-text search en spanish sobre name+description+content_md. Devuelve top N por relevancia.';

GRANT EXECUTE ON FUNCTION public.search_agent_skills(text, int) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Helper view para admin: stats de uso del agente
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.oppy_usage_stats AS
SELECT
  date_trunc('day', created_at AT TIME ZONE 'America/Bogota') AS dia,
  user_email,
  count(*)                                                    AS turns,
  count(*) FILTER (WHERE flagged)                             AS flagged_turns,
  avg(latency_ms)::int                                        AS avg_latency_ms,
  sum(prompt_tokens + completion_tokens)                      AS total_tokens
FROM public.oppy_chat_logs
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;

COMMENT ON VIEW public.oppy_usage_stats IS 'Resumen diario por CSM de uso de Oppy';

GRANT SELECT ON public.oppy_usage_stats TO authenticated;
