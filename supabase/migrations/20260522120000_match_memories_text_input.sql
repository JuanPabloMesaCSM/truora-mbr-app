-- ============================================================================
-- Fix: match_memories acepta query_embedding como text en lugar de vector
-- ============================================================================
--
-- Problema descubierto durante testing 2026-05-22:
--   PostgREST no castea JSON array a vector(N) cuando se pasa como argumento
--   de RPC (sí lo hace para INSERT en columna). Resultado: match_memories
--   devolvia 0 rows aunque las memorias existieran con embeddings validos.
--
-- Fix: la firma recibe el embedding como string JSON (ej "[0.1, -0.2, ...]")
-- y lo casteamos a vector(1024) dentro del body.
--
-- El sub-workflow read_memories ya manda el embedding con JSON.stringify(),
-- que produce exactamente ese formato. Cero cambios en el cliente.
-- ============================================================================

DROP FUNCTION IF EXISTS public.match_memories(vector, int, float, text, text);

CREATE OR REPLACE FUNCTION public.match_memories(
  query_embedding  text,
  match_count      int     DEFAULT 5,
  match_threshold  float   DEFAULT 0.40,
  filter_tipo      text    DEFAULT NULL,
  filter_origen    text    DEFAULT NULL
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
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
DECLARE
  qe vector(1024);
BEGIN
  -- Cast text JSON → vector(1024). pgvector entiende "[0.1, -0.2, ...]".
  qe := query_embedding::vector(1024);

  RETURN QUERY
  SELECT
    m.id,
    m.tipo,
    m.titulo,
    m.contenido,
    m.origen,
    m.source_conversation_id,
    m.creado_por,
    m.veces_recuperada,
    (1 - (m.embedding <=> qe))::float AS similarity,
    m.creado_en
  FROM public.agent_global_memory m
  WHERE m.embedding IS NOT NULL
    AND m.estado = 'activa'
    AND (1 - (m.embedding <=> qe)) > match_threshold
    AND (filter_tipo   IS NULL OR m.tipo   = filter_tipo)
    AND (filter_origen IS NULL OR m.origen = filter_origen)
  ORDER BY m.embedding <=> qe
  LIMIT GREATEST(match_count, 1);
END;
$$;

COMMENT ON FUNCTION public.match_memories(text, int, float, text, text) IS
  'Retrieval semantico de memorias para Oppy. query_embedding viene como string JSON (ej "[0.1, -0.2, ...]") y se castea a vector(1024) dentro. Workaround porque PostgREST no castea JSON array a vector en RPC args.';

GRANT EXECUTE ON FUNCTION public.match_memories(text, int, float, text, text) TO authenticated;
