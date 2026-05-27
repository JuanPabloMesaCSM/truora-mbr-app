-- Fix definitivo: match_memories en SQL puro (sin plpgsql).
-- Hipotesis: el DECLARE + cast en plpgsql + STABLE no se comporta bien con
-- PostgREST. SQL puro elimina ese vector de problema.

DROP FUNCTION IF EXISTS public.match_memories(text, int, float, text, text);

CREATE OR REPLACE FUNCTION public.match_memories(
  query_embedding text,
  match_count     int    DEFAULT 5,
  match_threshold float  DEFAULT 0.4,
  filter_tipo     text   DEFAULT NULL,
  filter_origen   text   DEFAULT NULL
)
RETURNS TABLE (
  id                      uuid,
  tipo                    text,
  titulo                  text,
  contenido               text,
  origen                  text,
  source_conversation_id  uuid,
  creado_por              text,
  veces_recuperada        integer,
  similarity              float,
  creado_en               timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    m.id,
    m.tipo,
    m.titulo,
    m.contenido,
    m.origen,
    m.source_conversation_id,
    m.creado_por,
    m.veces_recuperada,
    (1 - (m.embedding <=> query_embedding::vector(1024)))::float AS similarity,
    m.creado_en
  FROM public.agent_global_memory m
  WHERE m.embedding IS NOT NULL
    AND m.estado = 'activa'
    AND (1 - (m.embedding <=> query_embedding::vector(1024))) > match_threshold
    AND (filter_tipo   IS NULL OR m.tipo   = filter_tipo)
    AND (filter_origen IS NULL OR m.origen = filter_origen)
  ORDER BY m.embedding <=> query_embedding::vector(1024)
  LIMIT GREATEST(match_count, 1);
$$;

GRANT EXECUTE ON FUNCTION public.match_memories(text, int, float, text, text) TO authenticated;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
