-- Sesiones de conversacion del Query Repository Agent.
-- Cada conversacion = 1 hilo de chat con el agente sobre un tema/cliente.
-- Una conversacion tiene N agent_messages (turnos user + assistant).
--
-- Visibilidad: privada. Cada CSM ve solo sus conversaciones.
-- Admins (JP, Ana, JD) ven todas para review + telemetria.

CREATE TABLE IF NOT EXISTS public.agent_conversations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Quien inicio la conversacion
  csm_email             text NOT NULL CHECK (length(csm_email) > 0),

  -- Titulo auto-generado por el agente despues del primer turno
  -- (ej: "Consumo CE GDC marzo 2026", "Por que cayo PayJoy")
  titulo                text,

  -- TCI del cliente principal de la conversacion (si aplica).
  -- Permite filtrar "mostrame todas mis conversaciones sobre X cliente".
  client_id_externo     text,

  -- Resumen comprimido cuando la conversacion supera N turnos.
  -- Usado para compaction: en lugar de mandar todos los mensajes,
  -- mandamos summary + ultimos 5 turnos.
  resumen_comprimido    text,
  turnos_comprimidos    integer NOT NULL DEFAULT 0,

  -- Estado
  estado                text NOT NULL DEFAULT 'activa'
                          CHECK (estado IN ('activa','finalizada','archivada')),

  -- Reflexion del sub-agente al cerrar (se promueve a agent_global_memory
  -- si hay aprendizaje). Lleno solo en estado=finalizada.
  reflexion_aprendizaje text,

  -- Timestamps
  iniciada_en           timestamptz NOT NULL DEFAULT now(),
  ultima_actividad_en   timestamptz NOT NULL DEFAULT now(),
  finalizada_en         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agent_conv_csm
  ON public.agent_conversations (csm_email, ultima_actividad_en DESC);

CREATE INDEX IF NOT EXISTS idx_agent_conv_cliente
  ON public.agent_conversations (client_id_externo, ultima_actividad_en DESC)
  WHERE client_id_externo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_conv_estado
  ON public.agent_conversations (estado, ultima_actividad_en DESC);

ALTER TABLE public.agent_conversations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICIES
-- ============================================================================

-- 1) SELECT: el autor de la conversacion, o admins.
CREATE POLICY "Autor o admin lee conversaciones" ON public.agent_conversations
  FOR SELECT TO authenticated
  USING (
    csm_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- 2) INSERT: solo el propio CSM (no se pueden crear conversaciones para otros).
CREATE POLICY "CSM crea su conversacion" ON public.agent_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    csm_email = (auth.jwt() ->> 'email')
  );

-- 3) UPDATE: el autor (cambiar titulo, archivar) o admin.
CREATE POLICY "Autor o admin actualiza" ON public.agent_conversations
  FOR UPDATE TO authenticated
  USING (
    csm_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- 4) DELETE: solo admin (preservar historial para training).
CREATE POLICY "Solo admin borra conversaciones" ON public.agent_conversations
  FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- ============================================================================
-- TRIGGER: ultima_actividad_en se actualiza con cualquier cambio
-- ============================================================================

CREATE OR REPLACE FUNCTION public.agent_conv_set_ultima_actividad()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.ultima_actividad_en = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_agent_conv_ultima_actividad
  BEFORE UPDATE ON public.agent_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_conv_set_ultima_actividad();

-- ============================================================================
-- REALTIME: el frontend escucha cambios para refrescar "mis conversaciones"
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_conversations;

-- ============================================================================
-- Verificacion:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'agent_conversations';
-- ============================================================================
