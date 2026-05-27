-- ============================================================================
-- Ajuste de embeddings para Voyage AI (voyage-3)
-- ============================================================================
--
-- La tabla agent_global_memory tenia embedding vector(1536) (compatible OpenAI).
-- Cambiamos a vector(1024) que es la dimension de voyage-3.
--
-- Voyage AI fue elegido como provider de embeddings de Oppy por:
--   - SOC 2 Type II, no entrenan con inputs (B2B-only)
--   - Recomendado por Anthropic para retrieval con Claude
--   - Free tier 50M tokens (suficiente para uso CSM interno)
--
-- Tambien creamos la RPC match_memories que Oppy llama para retrieval semantico
-- antes de cada turn.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Cambio de dimension del embedding
-- ---------------------------------------------------------------------------

-- Drop indices que dependen de la columna embedding (no se pueden alterar in-place)
DROP INDEX IF EXISTS public.idx_agent_memory_embedding;

-- Cambiar la dimension. agent_global_memory esta vacia (0 rows verificado),
-- asi que no hay datos que migrar.
ALTER TABLE public.agent_global_memory
  ALTER COLUMN embedding TYPE vector(1024);

-- Re-crear el index ivfflat con cosine ops para vector(1024)
CREATE INDEX idx_agent_memory_embedding
  ON public.agent_global_memory
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50)
  WHERE embedding IS NOT NULL AND estado = 'activa';

-- ---------------------------------------------------------------------------
-- 2. RPC match_memories
--
-- Devuelve las top N memorias mas similares semanticamente a query_embedding.
-- Filtra por estado='activa' por default y por umbral de similitud configurable.
--
-- Side-effect: incrementa veces_recuperada de las memorias devueltas (para
-- analytics futuras).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_memories(
  query_embedding  vector(1024),
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
BEGIN
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
    (1 - (m.embedding <=> query_embedding))::float AS similarity,
    m.creado_en
  FROM public.agent_global_memory m
  WHERE m.embedding IS NOT NULL
    AND m.estado = 'activa'
    AND (1 - (m.embedding <=> query_embedding)) > match_threshold
    AND (filter_tipo   IS NULL OR m.tipo   = filter_tipo)
    AND (filter_origen IS NULL OR m.origen = filter_origen)
  ORDER BY m.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
END;
$$;

COMMENT ON FUNCTION public.match_memories IS
  'Retrieval semantico de memorias para Oppy. Llamada antes de cada turn con embedding de la pregunta del CSM. Devuelve top N memorias activas con similitud > threshold.';

GRANT EXECUTE ON FUNCTION public.match_memories(vector, int, float, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC increment_memory_usage (opcional, para analytics)
--
-- Cuando una memoria es realmente USADA (no solo retrieved), incrementamos
-- el counter. El sub-workflow read_memories puede llamar esto para los IDs
-- que efectivamente le inyectara al system prompt.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.increment_memory_usage(memory_ids uuid[])
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  affected int;
BEGIN
  UPDATE public.agent_global_memory
     SET veces_recuperada = veces_recuperada + 1
   WHERE id = ANY(memory_ids);
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_memory_usage(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Verificacion post-migration
-- ---------------------------------------------------------------------------

-- Esperado al final:
--   SELECT atttypmod FROM pg_attribute
--     WHERE attrelid = 'public.agent_global_memory'::regclass
--       AND attname = 'embedding';
--   -- atttypmod = 1028 (1024 + 4 bytes overhead pgvector)
--
--   SELECT proname FROM pg_proc WHERE proname IN ('match_memories', 'increment_memory_usage');
--   -- 2 rows
