-- Catalogo curado de queries para el Query Repository Agent.
-- Combina (a) biblioteca buscable por CSMs en /queries y (b) catalogo
-- que el agente AI consulta antes de generar SQL nuevo.
--
-- Workflow de poblacion:
--   1. seed inicial via tmp/agent_seed_catalog/seed_catalog.py
--      (parsea skills + .sql files + valida con LLM).
--   2. crecimiento organico: agent_messages con feedback positivo
--      pueden promoverse a queries_repository (status='draft').
--   3. admins (JP/Ana/JD) revisan drafts y los aprueban (status='approved').
--
-- Visibilidad: TODO el equipo CSM lee, solo admins editan.

-- Habilitar pgvector para busqueda semantica (usado tambien en agent_messages,
-- agent_global_memory). Idempotente, no rompe si ya esta habilitado.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.queries_repository (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificacion humana
  nombre                text NOT NULL CHECK (length(nombre) BETWEEN 3 AND 200),
  slug                  text UNIQUE CHECK (slug ~ '^[a-z0-9_-]+$'),  -- url-safe

  -- Clasificacion
  producto              text NOT NULL CHECK (producto IN ('DI','BGC','CE','SUPABASE','GLOBAL')),
  fuente                text NOT NULL CHECK (fuente IN ('snowflake','clickhouse','supabase')),
  -- Tags libres para filtrado en la UI (ej: 'consumo', 'declinados', 'agentes')
  tags                  text[] DEFAULT '{}',

  -- SQL con placeholders tipo {{client_id}}, {{fecha_inicio}}
  sql_template          text NOT NULL CHECK (length(sql_template) > 0),

  -- Descripcion tecnica para el agente (audiencia: dev/data)
  descripcion           text NOT NULL,

  -- Version humanizada (audiencia: CSM no-tecnico, via skill truora-domain)
  descripcion_csm       text,

  -- Schema de parametros: [{name, type, required, default, description}, ...]
  parametros            jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Ejemplos de uso en lenguaje natural
  ejemplos_uso          text[] DEFAULT '{}',

  -- Skills donde el query esta documentado (para citaciones del agente)
  skill_referencias     text[] DEFAULT '{}',

  -- Estado del ciclo de vida
  status                text NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','approved','deprecated')),

  -- Tracking
  creado_por            text NOT NULL,
  ultima_validacion     timestamptz,
  veces_usado           integer NOT NULL DEFAULT 0,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  actualizado_en        timestamptz NOT NULL DEFAULT now(),

  -- Embedding para busqueda semantica (nombre + descripcion concatenados).
  -- Dim 1536 = OpenAI ada-002 / text-embedding-3-small / voyage-large-2.
  embedding             vector(1536)
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_queries_repo_producto
  ON public.queries_repository (producto, status);

CREATE INDEX IF NOT EXISTS idx_queries_repo_fuente
  ON public.queries_repository (fuente, status);

CREATE INDEX IF NOT EXISTS idx_queries_repo_tags
  ON public.queries_repository USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_queries_repo_status_uso
  ON public.queries_repository (status, veces_usado DESC);

-- Indice vectorial para busqueda semantica (top-k similar queries)
CREATE INDEX IF NOT EXISTS idx_queries_repo_embedding
  ON public.queries_repository
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);  -- 50 listas para ~60-1000 rows; ajustar si crece

-- Full-text search en espanol (fallback cuando no hay embedding)
CREATE INDEX IF NOT EXISTS idx_queries_repo_fts
  ON public.queries_repository
  USING gin (to_tsvector('spanish', nombre || ' ' || descripcion || ' ' || COALESCE(descripcion_csm, '')));

ALTER TABLE public.queries_repository ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICIES
-- ============================================================================

-- 1) SELECT: cualquier email en `csm` lee todas las queries approved+draft.
--    (mismo patron team-wide read que cliente_notas / boti_alertas)
CREATE POLICY "Equipo CSM lee queries" ON public.queries_repository
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.csm
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- 2) INSERT: solo admins del agente (JP, Ana, JD).
--    Backend service_role pasa por encima de RLS para seed automatico.
CREATE POLICY "Admins crean queries" ON public.queries_repository
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- 3) UPDATE: solo admins.
CREATE POLICY "Admins editan queries" ON public.queries_repository
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- 4) DELETE: solo admins (rara vez; preferir status='deprecated').
CREATE POLICY "Admins borran queries" ON public.queries_repository
  FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- ============================================================================
-- TRIGGER: actualizado_en automatico
-- ============================================================================

CREATE OR REPLACE FUNCTION public.queries_repository_set_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_queries_repository_actualizado_en
  BEFORE UPDATE ON public.queries_repository
  FOR EACH ROW
  EXECUTE FUNCTION public.queries_repository_set_actualizado_en();

-- ============================================================================
-- Verificacion post-migration:
--
-- 1) pgvector habilitado:
--    SELECT * FROM pg_extension WHERE extname = 'vector';
--
-- 2) Schema:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'queries_repository' ORDER BY ordinal_position;
--
-- 3) Policies (esperado 4):
--    SELECT policyname, cmd FROM pg_policies WHERE tablename = 'queries_repository';
--
-- 4) Indices vectoriales:
--    SELECT indexname FROM pg_indexes WHERE tablename = 'queries_repository';
-- ============================================================================
