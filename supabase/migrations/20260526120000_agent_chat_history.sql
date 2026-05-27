-- ============================================================================
-- Oppy Agent — Postgres Chat Memory (compatible n8n LangChain)
-- ============================================================================
--
-- Esta tabla sirve como backend de memoria conversacional del AI Agent en n8n.
-- El nodo "Postgres Chat Memory" de @n8n/langchain espera un schema simple
-- con session_id + message (jsonb).
--
-- Es DIFERENTE de agent_messages (que es nuestro audit log detallado con
-- conversation_id FK, turno, rol, embedding 1536, tool_calls, feedback,
-- latencia_ms, etc.). agent_messages es para análisis posterior / reflector;
-- agent_chat_history es solo para que el LLM tenga contexto de los últimos N
-- mensajes de la conversación actual.
--
-- Schema esperado por @langchain/community/stores/message/postgres:
--   - id (serial PK)
--   - session_id (text NOT NULL)
--   - message (jsonb NOT NULL) — formato BaseMessage de LangChain
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_chat_history (
  id          BIGSERIAL PRIMARY KEY,
  session_id  TEXT NOT NULL,
  message     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.agent_chat_history IS 'Memoria conversacional del AI Agent Oppy. Backend del nodo Postgres Chat Memory de n8n LangChain.';
COMMENT ON COLUMN public.agent_chat_history.session_id IS 'Identificador de conversación. Frontend lo pasa como conversation_id en cada turno.';
COMMENT ON COLUMN public.agent_chat_history.message    IS 'BaseMessage de LangChain serializado: { type: "human"|"ai"|"tool"|"system", data: {...} }';

-- Index para lookup eficiente por sesión (el nodo Memory lee últimos N mensajes)
CREATE INDEX IF NOT EXISTS idx_agent_chat_session
  ON public.agent_chat_history (session_id, created_at);

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.agent_chat_history ENABLE ROW LEVEL SECURITY;

-- Lectura: solo admins (esta tabla es interna del agente, no visible al CSM)
CREATE POLICY "agent_chat_history_admin_read"
  ON public.agent_chat_history
  FOR SELECT
  TO authenticated
  USING (
    lower(auth.jwt() ->> 'email') = ANY (
      ARRAY['amarquez@truora.com', 'jdiaz@truora.com', 'jpmesa@truora.com']
    )
  );

-- Insert: solo service_role (el AI Agent escribe via n8n con service_role key)
-- Bloquear inserts directos de usuarios autenticados.
CREATE POLICY "agent_chat_history_no_direct_insert"
  ON public.agent_chat_history
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- Update / Delete: nadie autenticado. El cleanup lo hace cron / admin via service_role.
CREATE POLICY "agent_chat_history_no_update"
  ON public.agent_chat_history
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "agent_chat_history_no_delete"
  ON public.agent_chat_history
  FOR DELETE
  TO authenticated
  USING (false);

-- ============================================================================
-- Verificación:
--   SELECT COUNT(*), MIN(created_at), MAX(created_at) FROM agent_chat_history;
--   SELECT session_id, COUNT(*) FROM agent_chat_history GROUP BY session_id ORDER BY 2 DESC LIMIT 10;
-- ============================================================================
