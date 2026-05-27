-- Memoria global del agente compartida por TODO el equipo.
-- Es la version multi-CSM de mi MEMORY.md (memoria persistente de Claude Code).
--
-- Como se llena:
--   - Sub-agente reflector (Haiku 4.5) corre al cerrar una agent_conversation.
--   - Lee el transcript, decide si hubo aprendizaje no obvio.
--   - Si si, escribe 1-3 entradas aca.
--   - Admins pueden agregar manualmente entradas (heuristicas conocidas).
--
-- Como se usa:
--   - Antes de cada request, el backend busca top-5 memorias relevantes
--     por similitud de embedding con la pregunta del CSM.
--   - Se inyectan al system prompt como "context useful para esta pregunta".

CREATE TABLE IF NOT EXISTS public.agent_global_memory (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tipo de memoria (mismo schema que mi MEMORY.md):
  --   user        — info del CSM y como prefiere trabajar
  --   feedback    — guidelines aprendidas (que hacer, que evitar)
  --   project     — estado de iniciativas, decisiones tomadas
  --   reference   — punteros a recursos externos (Linear, Slack, etc)
  --   technical   — gotchas de SF/CH/Supabase aprendidos de fallos pasados
  tipo                  text NOT NULL CHECK (tipo IN ('user','feedback','project','reference','technical')),

  -- Titulo corto (para listing en admin)
  titulo                text NOT NULL CHECK (length(titulo) BETWEEN 3 AND 200),

  -- Contenido (markdown soportado para citas, links)
  contenido             text NOT NULL CHECK (length(contenido) BETWEEN 10 AND 5000),

  -- Origen: 'reflector' (auto-generado) o 'manual' (escrito por admin)
  origen                text NOT NULL DEFAULT 'reflector'
                          CHECK (origen IN ('reflector','manual')),

  -- Si origen=reflector, link a la conversacion de donde se extrajo el aprendizaje
  source_conversation_id uuid REFERENCES public.agent_conversations(id) ON DELETE SET NULL,

  -- Quien creo la memoria (email CSM si manual, 'agent' si reflector)
  creado_por            text NOT NULL,

  -- Estado del lifecycle
  estado                text NOT NULL DEFAULT 'activa'
                          CHECK (estado IN ('activa','archivada','obsoleta')),

  -- Cuantas veces el agente ha recuperado esta memoria via RAG
  veces_recuperada      integer NOT NULL DEFAULT 0,

  -- Embedding para retrieval (titulo + contenido)
  embedding             vector(1536),

  creado_en             timestamptz NOT NULL DEFAULT now(),
  actualizado_en        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_memory_tipo
  ON public.agent_global_memory (tipo, estado, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_agent_memory_embedding
  ON public.agent_global_memory
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50)
  WHERE embedding IS NOT NULL AND estado = 'activa';

CREATE INDEX IF NOT EXISTS idx_agent_memory_uso
  ON public.agent_global_memory (estado, veces_recuperada DESC);

ALTER TABLE public.agent_global_memory ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICIES
-- ============================================================================

-- 1) SELECT: cualquier CSM lee (aprendizajes son del equipo).
CREATE POLICY "Equipo CSM lee memoria global" ON public.agent_global_memory
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.csm
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- 2) INSERT: solo admins (el agente reflector usa service_role).
CREATE POLICY "Admins crean memoria" ON public.agent_global_memory
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- 3) UPDATE: solo admins (editar, archivar, marcar obsoleta).
CREATE POLICY "Admins editan memoria" ON public.agent_global_memory
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- 4) DELETE: solo admins (raro; preferir estado='obsoleta').
CREATE POLICY "Admins borran memoria" ON public.agent_global_memory
  FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- ============================================================================
-- TRIGGER: actualizado_en
-- ============================================================================

CREATE OR REPLACE FUNCTION public.agent_memory_set_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_agent_memory_actualizado_en
  BEFORE UPDATE ON public.agent_global_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_memory_set_actualizado_en();
