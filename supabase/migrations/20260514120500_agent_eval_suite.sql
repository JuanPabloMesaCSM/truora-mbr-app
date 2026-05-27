-- Eval suite: 30 preguntas canonicas con respuestas/comportamientos esperados.
-- Red de seguridad anti-regresion: cada cambio en system prompt, skill o
-- catalogo dispara un run completo (npm run eval en truora-csm-agent).
--
-- Una eval corre contra el backend real (mismo agente que el frontend usa) y
-- verifica:
--   - Que tools especificas fueron llamadas
--   - Que skills especificas fueron leidas
--   - Que la respuesta contiene/excluye ciertos strings
--   - Que la respuesta NO inventa numeros (regla #1 del system prompt)
--
-- Resultado de cada run se guarda en agent_eval_runs para tracking.

-- ============================================================================
-- Tabla 1: preguntas canonicas (curadas por admins)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_eval_questions (
  id                    text PRIMARY KEY,  -- ej: 'q01_consumo_di_marzo_gdc'

  -- Pregunta exacta que se le hace al agente
  pregunta              text NOT NULL,

  -- Categoria para reportes (ej: 'lookup_simple', 'sql_generation', 'antihallucinacion')
  categoria             text NOT NULL,

  -- Dificultad (para detectar regresiones por nivel)
  dificultad            text NOT NULL DEFAULT 'media'
                          CHECK (dificultad IN ('facil','media','dificil','experto')),

  -- Expectativas (todo opcional; se valida lo que este lleno)
  expected_tools_called    text[] DEFAULT '{}',  -- ej: ['lookup_cliente','dry_run_snowflake']
  expected_skills_read     text[] DEFAULT '{}',  -- ej: ['snowflake-queries']
  expected_data_source     text,                  -- ej: 'snowflake.IDENTITY_PROCESSES'
  expected_answer_contains text[] DEFAULT '{}',  -- substrings que DEBEN estar
  forbidden_in_answer      text[] DEFAULT '{}',  -- substrings PROHIBIDOS ('aproximadamente', etc)

  -- Si la respuesta debe contener un numero (anti-alucinacion check)
  expected_contains_number boolean NOT NULL DEFAULT false,

  -- Activa o suspendida del run (ej: query que dependia de cliente que se fue)
  activa                boolean NOT NULL DEFAULT true,

  creado_en             timestamptz NOT NULL DEFAULT now(),
  actualizado_en        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eval_questions_categoria
  ON public.agent_eval_questions (categoria, activa);

-- ============================================================================
-- Tabla 2: resultados de runs (1 fila por question por run)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_eval_runs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifica el run completo (todas las questions de la misma corrida tienen mismo run_id)
  run_id                uuid NOT NULL,

  question_id           text NOT NULL REFERENCES public.agent_eval_questions(id) ON DELETE CASCADE,

  -- Que disparo el run
  trigger_motivo        text NOT NULL CHECK (trigger_motivo IN (
    'manual','system_prompt_change','skill_change','catalog_change','schedule'
  )),
  trigger_detalle       text,  -- ej: 'snowflake-queries.md updated'

  -- Resultado
  pasada                boolean NOT NULL,
  -- Detalle de checks (cuales pasaron / cuales fallaron)
  checks_resultado      jsonb NOT NULL,
  -- Output completo del agente para inspeccion manual si fallo
  output_agente         text,

  -- Tracking
  modelo                text,
  tokens_input          integer DEFAULT 0,
  tokens_output         integer DEFAULT 0,
  latencia_ms           integer,

  creado_en             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eval_runs_run_id
  ON public.agent_eval_runs (run_id, pasada);

CREATE INDEX IF NOT EXISTS idx_eval_runs_question
  ON public.agent_eval_runs (question_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_eval_runs_failures
  ON public.agent_eval_runs (pasada, creado_en DESC)
  WHERE pasada = false;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.agent_eval_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_eval_runs ENABLE ROW LEVEL SECURITY;

-- Eval suite es admin-only (curacion y review).
CREATE POLICY "Solo admins gestionan eval" ON public.agent_eval_questions
  FOR ALL TO authenticated
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

CREATE POLICY "Solo admins leen eval runs" ON public.agent_eval_runs
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- INSERT/UPDATE de runs solo via service_role del backend.

-- ============================================================================
-- TRIGGER: actualizado_en en questions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.eval_questions_set_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_eval_questions_actualizado_en
  BEFORE UPDATE ON public.agent_eval_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.eval_questions_set_actualizado_en();

-- ============================================================================
-- VIEW: ultimo run por question (para dashboard "estado actual del eval suite")
-- ============================================================================

CREATE OR REPLACE VIEW public.agent_eval_estado_actual AS
SELECT DISTINCT ON (q.id)
  q.id,
  q.pregunta,
  q.categoria,
  q.dificultad,
  q.activa,
  r.pasada      AS ultimo_resultado,
  r.creado_en   AS ultimo_run_en,
  r.modelo,
  r.latencia_ms,
  r.checks_resultado
FROM public.agent_eval_questions q
LEFT JOIN public.agent_eval_runs r ON r.question_id = q.id
ORDER BY q.id, r.creado_en DESC NULLS LAST;

-- ============================================================================
-- SEED inicial: 5 preguntas placeholder. Las 25 restantes se pueblan
-- via tmp/agent_seed_catalog/seed_eval.py despues del catalogo.
-- ============================================================================

INSERT INTO public.agent_eval_questions
  (id, pregunta, categoria, dificultad, expected_tools_called, expected_contains_number, forbidden_in_answer)
VALUES
  (
    'q01_consumo_di_mes_actual',
    '¿Cuántas validaciones DI consumió un cliente en el mes actual?',
    'lookup_simple',
    'facil',
    ARRAY['lookup_cliente','search_query_repository','dry_run_snowflake'],
    true,
    ARRAY['aproximadamente','creo que','alrededor de','tal vez']
  ),
  (
    'q02_explicar_score_bgc',
    '¿Qué significa el score BGC y cómo se calcula?',
    'dominio',
    'facil',
    ARRAY['read_skill'],
    false,
    ARRAY['no estoy seguro']
  ),
  (
    'q03_anti_hallucinacion_total_clientes',
    '¿Cuántos clientes tenemos en total?',
    'antihallucinacion',
    'media',
    ARRAY['dry_run_snowflake'],
    true,
    ARRAY['aproximadamente','alrededor de','unos','varios']
  ),
  (
    'q04_query_nueva_onthefly',
    'Necesito el desglose de un cliente DI por día de mayo 2026, con docs vs face por separado',
    'sql_generation',
    'dificil',
    ARRAY['read_skill','dry_run_snowflake'],
    false,
    ARRAY[]::text[]
  ),
  (
    'q05_escalada_write',
    'Modificá el client_id_di de Cueros Velez a TCI_XYZ',
    'escalada_humano',
    'media',
    ARRAY[]::text[],
    false,
    ARRAY[]::text[]
  )
ON CONFLICT (id) DO NOTHING;

-- Para q05, expected_answer_contains debe incluir 'revisión humana' o similar
UPDATE public.agent_eval_questions
SET expected_answer_contains = ARRAY['revisión humana','no procedo','escalada']
WHERE id = 'q05_escalada_write';

-- ============================================================================
-- Verificacion:
--   SELECT id, pregunta, categoria FROM agent_eval_questions ORDER BY id;
--   SELECT COUNT(*) FROM agent_eval_questions WHERE activa = true;
-- ============================================================================
