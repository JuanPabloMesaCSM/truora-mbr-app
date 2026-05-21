-- Modelo D — Drift detection + reconciliacion humana para queries_repository.
--
-- Contexto:
--   El catalogo (queries_repository) es la "vitrine" curada para CSMs y la
--   fuente que el agente IA consulta antes de armar SQL nuevo.
--   Los workflows n8n vivos (Report Builder DI/BGC/CE, Portfolio Sync,
--   Dashboard Metrics) son la fuente operativa real.
--
--   Modelo D: el sync NO reescribe sql_template automaticamente. Compara
--   hashes del SQL vivo (extraido via MCP nativo zapsign) contra
--   workflow_snapshots.sql_hash. Si difiere, marca
--   workflow_snapshots.drift_detected_at + propaga drift_detected_at en
--   queries_repository a todos los bloques de ese workflow + inserta en
--   catalog_sync_alerts. Admin (JP/JD) reconcilia manualmente: decide si
--   el cambio en el workflow debe propagarse al sql_template curado
--   (ej: refactor real) o si solo se actualiza el snapshot (ej: comentario,
--   formato).
--
-- Decision de diseño 2026-05-20:
--   Snapshot vive en tabla aparte (workflow_snapshots, 1 fila por workflow)
--   en vez de duplicarse en cada bloque de queries_repository.
--   Razon: 4 workflows × ~30 KB SQL c/u = 120 KB vs 31 bloques × ~30 KB
--   = 930 KB. Ademas el cron compara hash 1x por workflow, no 31x.
--
-- Anatomia del cambio:
--   1) CREATE workflow_snapshots — 1 fila por workflow productivo
--   2) ALTER queries_repository — FK + bloque_id + drift_detected_at + UX
--   3) CREATE catalog_sync_alerts — log de drifts + decisiones
--   4) Indices + RLS
--
-- Respeta feedback_no_auto_deploy: este archivo se aplica con
-- `supabase db push` SOLO cuando JP de la autorizacion explicita.

-- ============================================================================
-- 1) workflow_snapshots — snapshot del SQL del workflow vivo + hash
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.workflow_snapshots (
  workflow_id           text PRIMARY KEY,
  workflow_name         text NOT NULL,

  -- SQL completo del workflow (concatenacion de todos los Code/Snowflake
  -- nodes que producen el query final, ej: el monolitico del Report Builder).
  -- ~30 KB tipico.
  sql_completo          text NOT NULL,

  -- SHA256 (hex) del SQL completo en el ultimo sync reconciliado.
  -- Se recomputa cada corrida del cron y se compara contra el SQL vivo
  -- via MCP. Si difiere → drift.
  sql_hash              text NOT NULL,

  -- Cuando se confirmo por ultima vez que el snapshot esta alineado con
  -- el workflow vivo (sea por seed inicial o por reconciliacion humana)
  last_synced_at        timestamptz NOT NULL DEFAULT now(),

  -- Cuando el cron detecto drift pendiente de reconciliacion.
  -- NULL = alineado. NOT NULL = hay drift abierto.
  drift_detected_at     timestamptz,

  -- Metadatos utiles para el sync y el admin panel
  fuente                text NOT NULL CHECK (fuente IN ('snowflake','clickhouse','supabase')),
  nota                  text,  -- contexto humano del workflow

  creado_en             timestamptz NOT NULL DEFAULT now(),
  actualizado_en        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_snapshots_drift_pending
  ON public.workflow_snapshots (drift_detected_at)
  WHERE drift_detected_at IS NOT NULL;

COMMENT ON TABLE public.workflow_snapshots IS
  'Snapshot del SQL de cada workflow productivo en n8n.zapsign.com.br. 1 fila por workflow. Comparar sql_hash contra hash del SQL vivo (via MCP) para detectar drift.';

COMMENT ON COLUMN public.workflow_snapshots.workflow_id IS
  'ID del workflow en n8n.zapsign.com.br (ej: aJTbPA3uXIHUUdjo para Report Builder DI).';

COMMENT ON COLUMN public.workflow_snapshots.sql_completo IS
  'SQL completo del workflow tal cual aparece en el nodo Snowflake/HTTP/CH.';

-- ============================================================================
-- 2) Columnas nuevas en queries_repository
-- ============================================================================

ALTER TABLE public.queries_repository
  -- FK opcional al workflow productivo. NULL si la query es 100% curada
  -- (ej: queries auxiliares de exploracion que no viven en n8n).
  ADD COLUMN IF NOT EXISTS workflow_id_origen     text
    REFERENCES public.workflow_snapshots(workflow_id) ON DELETE SET NULL,

  -- Identificador del bloque dentro del workflow
  -- (ej: 1_metricas_generales para Report Builder DI bloque 1).
  -- Permite que el cron detecte qual bloque del UNION ALL representa
  -- esta query y propague drift_detected_at solo a los bloques afectados.
  ADD COLUMN IF NOT EXISTS bloque_id_origen       text,

  -- Timestamp del primer drift detectado pendiente de reconciliacion.
  -- Se propaga desde workflow_snapshots cuando el cron detecta cambio.
  -- NULL = alineado. NOT NULL = drift pendiente.
  ADD COLUMN IF NOT EXISTS drift_detected_at      timestamptz,

  -- Texto destacado en la card del frontend /queries.
  -- Para warnings, gotchas, contexto critico que el CSM debe leer ANTES
  -- de usar el query (ej: "Esta query usa CONVERT_TIMEZONE — cuidado
  -- con DATE_TRUNC mensual, ver feedback_timezone_date_picker").
  ADD COLUMN IF NOT EXISTS nota_importante        text,

  -- IDs de otras queries del repo relacionadas. Alimenta "Tambien podes
  -- ver" en el frontend (cross-references curadas, no auto-detectadas).
  ADD COLUMN IF NOT EXISTS queries_relacionadas   uuid[] DEFAULT '{}';

-- Indice parcial para listar queries con drift pendiente (admin panel)
CREATE INDEX IF NOT EXISTS idx_queries_repo_drift_pending
  ON public.queries_repository (drift_detected_at)
  WHERE drift_detected_at IS NOT NULL;

-- Indice por workflow+bloque para lookup rapido durante sync
CREATE INDEX IF NOT EXISTS idx_queries_repo_workflow_bloque
  ON public.queries_repository (workflow_id_origen, bloque_id_origen)
  WHERE workflow_id_origen IS NOT NULL;

COMMENT ON COLUMN public.queries_repository.workflow_id_origen IS
  'FK a workflow_snapshots.workflow_id. NULL si la query es curada y no vive en n8n.';

COMMENT ON COLUMN public.queries_repository.bloque_id_origen IS
  'Identificador del bloque dentro del workflow (ej: 1_metricas_generales). Para UNION ALL del Report Builder.';

COMMENT ON COLUMN public.queries_repository.drift_detected_at IS
  'Propagado desde workflow_snapshots cuando el cron detecta cambio.';

COMMENT ON COLUMN public.queries_repository.nota_importante IS
  'Warning / gotcha / contexto critico. Se renderiza destacado en la card de /queries.';

COMMENT ON COLUMN public.queries_repository.queries_relacionadas IS
  'IDs de queries relacionadas (cross-refs curadas para "Tambien podes ver").';

-- ============================================================================
-- 3) Tabla catalog_sync_alerts — log de drifts + decisiones de reconciliacion
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.catalog_sync_alerts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK a la query afectada (NULL si el drift es sobre un bloque
  -- recien aparecido en el workflow que aun no tiene entrada en el catalogo)
  query_id              uuid REFERENCES public.queries_repository(id) ON DELETE CASCADE,

  -- FK al workflow afectado (replicado aqui para alertas sobre bloques
  -- nuevos sin entry en queries_repository todavia)
  workflow_id           text NOT NULL REFERENCES public.workflow_snapshots(workflow_id) ON DELETE CASCADE,
  bloque_id             text NOT NULL,

  detected_at           timestamptz NOT NULL DEFAULT now(),

  -- Hashes para diff de auditoria
  old_hash              text,  -- NULL si es un bloque nuevo sin entrada previa
  new_hash              text NOT NULL,

  -- SQLs literales (para mostrar diff en el admin panel sin pegarle al
  -- MCP otra vez). NOTA: estos son los SQLs del WORKFLOW COMPLETO al
  -- momento de la deteccion, no del bloque aislado.
  old_sql_snapshot      text,
  new_sql_snapshot      text NOT NULL,

  -- Estado del ciclo de vida de la alerta
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','reviewing','reconciled','ignored')),

  -- Trazabilidad de la decision
  reconciled_by         text,        -- email admin
  reconciled_at         timestamptz,
  reconciled_action     text CHECK (reconciled_action IN (
                          'updated_template',       -- sql_template del catalogo actualizado
                          'updated_snapshot_only',  -- solo se refresco hash+snapshot (cambio cosmetico)
                          'new_query_created',      -- bloque nuevo → INSERT en queries_repository
                          'deprecated_query',       -- query marcada como deprecated
                          'ignored'                 -- drift aceptado sin cambios
                        )),
  notes                 text,        -- razon humana de la decision

  creado_en             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_sync_alerts_status
  ON public.catalog_sync_alerts (status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_catalog_sync_alerts_query_id
  ON public.catalog_sync_alerts (query_id)
  WHERE query_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_sync_alerts_workflow
  ON public.catalog_sync_alerts (workflow_id, bloque_id, detected_at DESC);

COMMENT ON TABLE public.catalog_sync_alerts IS
  'Log de drifts detectados por el cron Catalog Sync + decisiones de reconciliacion humana. Modelo D.';

-- ============================================================================
-- 4) RLS — workflow_snapshots
-- ============================================================================

ALTER TABLE public.workflow_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipo CSM lee snapshots" ON public.workflow_snapshots
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.csm
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "Admins crean snapshots" ON public.workflow_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

CREATE POLICY "Admins editan snapshots" ON public.workflow_snapshots
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

CREATE POLICY "Admins borran snapshots" ON public.workflow_snapshots
  FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- Trigger actualizado_en
CREATE OR REPLACE FUNCTION public.workflow_snapshots_set_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.actualizado_en = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_workflow_snapshots_actualizado_en
  BEFORE UPDATE ON public.workflow_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.workflow_snapshots_set_actualizado_en();

-- ============================================================================
-- 5) RLS — catalog_sync_alerts
-- ============================================================================

ALTER TABLE public.catalog_sync_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Equipo CSM lee alertas de sync" ON public.catalog_sync_alerts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.csm
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "Admins crean alertas de sync" ON public.catalog_sync_alerts
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

CREATE POLICY "Admins reconcilian alertas" ON public.catalog_sync_alerts
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

CREATE POLICY "Admins borran alertas" ON public.catalog_sync_alerts
  FOR DELETE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = ANY (ARRAY[
      'jpmesa@truora.com',
      'jdiaz@truora.com'
    ])
  );

-- ============================================================================
-- 6) Validacion de consistencia en catalog_sync_alerts
-- ============================================================================

ALTER TABLE public.catalog_sync_alerts
  ADD CONSTRAINT catalog_sync_alerts_reconciliation_consistent
  CHECK (
    (status IN ('pending','reviewing'))
    OR (
      status IN ('reconciled','ignored')
      AND reconciled_by IS NOT NULL
      AND reconciled_at IS NOT NULL
      AND reconciled_action IS NOT NULL
    )
  );

-- ============================================================================
-- Verificacion post-migration:
--
-- 1) Tabla workflow_snapshots existe + tiene RLS:
--    SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'workflow_snapshots';
--
-- 2) Columnas nuevas en queries_repository (5 esperadas):
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'queries_repository'
--      AND column_name IN ('workflow_id_origen','bloque_id_origen',
--          'drift_detected_at','nota_importante','queries_relacionadas');
--
-- 3) FK queries_repository -> workflow_snapshots:
--    SELECT conname FROM pg_constraint
--    WHERE conrelid = 'public.queries_repository'::regclass
--      AND contype = 'f';
--
-- 4) Tabla catalog_sync_alerts:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'catalog_sync_alerts' ORDER BY ordinal_position;
--
-- 5) Policies catalog_sync_alerts + workflow_snapshots (esperado 4 cada):
--    SELECT tablename, policyname, cmd FROM pg_policies
--    WHERE tablename IN ('catalog_sync_alerts','workflow_snapshots');
-- ============================================================================
