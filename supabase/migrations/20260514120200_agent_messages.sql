-- Mensajes (turnos) dentro de una agent_conversation.
-- Cada turno tiene rol, contenido, tool calls hechos por el agente,
-- y feedback opcional (thumbs up/down + comentario).
-- Embedding del contenido para RAG de conversaciones pasadas.
--
-- Crece N filas por conversacion (~5-20). A 50 conv/semana, ~500 filas/mes.
-- pgvector con ivfflat escala bien hasta ~100k filas; reindex si crece mas.

CREATE TABLE IF NOT EXISTS public.agent_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  conversation_id       uuid NOT NULL REFERENCES public.agent_conversations(id) ON DELETE CASCADE,

  -- Orden cronologico dentro de la conversacion (1-based)
  turno                 integer NOT NULL CHECK (turno > 0),

  -- Rol del mensaje
  rol                   text NOT NULL CHECK (rol IN ('user','assistant','tool')),

  -- Contenido del mensaje (texto plano para user/assistant; JSON stringified para tool results)
  contenido             text NOT NULL,

  -- Tool calls hechos por el assistant en este turno (si rol='assistant')
  -- Shape: [{ tool_name, input, output, took_ms, error? }, ...]
  tool_calls            jsonb DEFAULT '[]'::jsonb,

  -- Modelo usado (sonnet-4-6, haiku-4-5, etc.) — solo para rol='assistant'
  modelo                text,

  -- Token usage para telemetria (solo rol='assistant')
  -- Shape: { input_tokens, input_cached_tokens, output_tokens, cache_creation_tokens }
  tokens                jsonb,

  -- Feedback del CSM (solo rol='assistant')
  -- Shape: { rating: 'up'|'down', comentario?, resolved?: boolean }
  feedback              jsonb,

  -- Embedding del contenido para RAG (busqueda de conversaciones pasadas similares)
  -- Solo se llena para rol='user' (queremos buscar por la pregunta, no la respuesta).
  embedding             vector(1536),

  -- Timestamps
  creado_en             timestamptz NOT NULL DEFAULT now(),

  -- Tiempo total que tomo generar este turno (assistant only) — incluye tools
  latencia_ms           integer
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_agent_msg_conv
  ON public.agent_messages (conversation_id, turno);

CREATE INDEX IF NOT EXISTS idx_agent_msg_creado
  ON public.agent_messages (creado_en DESC);

-- Para review queue: thumbs-down sin resolver
CREATE INDEX IF NOT EXISTS idx_agent_msg_review
  ON public.agent_messages ((feedback ->> 'rating'), creado_en DESC)
  WHERE feedback ->> 'rating' = 'down'
    AND (feedback ->> 'resolved' IS NULL OR feedback ->> 'resolved' = 'false');

-- Vector index para RAG
CREATE INDEX IF NOT EXISTS idx_agent_msg_embedding
  ON public.agent_messages
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;

-- Unique (conversation_id, turno) — no duplicar turnos
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_msg_conv_turno
  ON public.agent_messages (conversation_id, turno);

ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICIES — heredan de agent_conversations
-- ============================================================================

-- 1) SELECT: si podes leer la conversacion, podes leer sus mensajes.
CREATE POLICY "Lee mensajes de mis conversaciones" ON public.agent_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_conversations c
      WHERE c.id = agent_messages.conversation_id
        AND (
          c.csm_email = (auth.jwt() ->> 'email')
          OR (auth.jwt() ->> 'email') = ANY (ARRAY[
            'jpmesa@truora.com',
            'jdiaz@truora.com'
          ])
        )
    )
  );

-- 2) INSERT: el dueno de la conversacion puede insertar mensajes user.
--    El service_role del backend inserta mensajes assistant/tool (pasa RLS).
CREATE POLICY "CSM dueno inserta mensajes" ON public.agent_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_conversations c
      WHERE c.id = agent_messages.conversation_id
        AND c.csm_email = (auth.jwt() ->> 'email')
    )
  );

-- 3) UPDATE: solo para actualizar feedback (thumbs up/down + comentario).
--    El dueno de la conversacion edita el feedback de los mensajes assistant.
CREATE POLICY "Dueno actualiza feedback" ON public.agent_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_conversations c
      WHERE c.id = agent_messages.conversation_id
        AND c.csm_email = (auth.jwt() ->> 'email')
    )
  );

-- 4) DELETE: solo admin (preservar historial).
CREATE POLICY "Solo admin borra mensajes" ON public.agent_messages
  FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- ============================================================================
-- REALTIME: streaming de mensajes nuevos al frontend
-- (SSE viene del backend Node; realtime es backup para listas de history)
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_messages;

-- ============================================================================
-- VIEW: review queue para admins
-- ============================================================================

CREATE OR REPLACE VIEW public.agent_review_queue AS
SELECT
  m.id              AS message_id,
  m.conversation_id,
  m.turno,
  m.contenido       AS respuesta_agente,
  m.feedback,
  m.creado_en,
  c.csm_email,
  c.titulo          AS conversacion_titulo,
  c.client_id_externo,
  -- Pregunta original (turno user inmediatamente anterior)
  (
    SELECT contenido FROM public.agent_messages
    WHERE conversation_id = m.conversation_id
      AND turno = m.turno - 1
      AND rol = 'user'
    LIMIT 1
  ) AS pregunta_csm
FROM public.agent_messages m
JOIN public.agent_conversations c ON c.id = m.conversation_id
WHERE m.rol = 'assistant'
  AND m.feedback ->> 'rating' = 'down'
  AND (m.feedback ->> 'resolved' IS NULL OR m.feedback ->> 'resolved' = 'false')
ORDER BY m.creado_en DESC;

-- La view hereda RLS de las tablas base. Admins ven todo, CSMs ven solo lo suyo.

-- ============================================================================
-- Verificacion:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'agent_messages';
--   SELECT COUNT(*) FROM agent_review_queue;
-- ============================================================================
