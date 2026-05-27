# Migrations del Query Repository Agent

5 archivos `.sql` + extension `pgvector`. Aplicar en orden cronológico
(prefijo de timestamp lo garantiza si se corre via Supabase CLI).

| Archivo | Crea |
|---|---|
| `20260514120000_queries_repository.sql` | Tabla `queries_repository` + pgvector extension + indices vectoriales/FTS |
| `20260514120100_agent_conversations.sql` | Tabla `agent_conversations` (sesiones de chat) |
| `20260514120200_agent_messages.sql` | Tabla `agent_messages` (turnos) + view `agent_review_queue` |
| `20260514120300_agent_global_memory.sql` | Tabla `agent_global_memory` (auto-memory del equipo) |
| `20260514120400_agent_usage_metrics.sql` | Tabla `agent_usage_metrics` + views `agent_metrics_resumen_30d`, `agent_metrics_cache_7d` |
| `20260514120500_agent_eval_suite.sql` | Tablas `agent_eval_questions`, `agent_eval_runs` + view `agent_eval_estado_actual` + 5 questions seed |

## Cómo aplicarlas

### Opción A — Supabase CLI (recomendada)

```bash
cd truora-mbr-app
supabase db push
```

Aplica todas las migrations pendientes en orden. Idempotente.

### Opción B — Manual desde Supabase Dashboard (sin CLI)

1. Abrir Supabase Dashboard → SQL Editor.
2. Copiar contenido de cada archivo en orden cronológico.
3. Pegar en SQL Editor → Run.
4. Verificar al final con los queries de verificación de cada archivo
   (al final de cada `.sql` hay un comentario con los checks).

## Verificación post-aplicación

```sql
-- 1. pgvector activo
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';

-- 2. 6 tablas creadas (5 nuevas + queries_repository)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'agent_%' OR table_name = 'queries_repository'
ORDER BY table_name;
-- Esperado: agent_conversations, agent_eval_questions, agent_eval_runs,
--           agent_global_memory, agent_messages, agent_usage_metrics, queries_repository

-- 3. Views creadas (3)
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public'
  AND (table_name LIKE 'agent_%' OR table_name = 'agent_review_queue')
ORDER BY table_name;
-- Esperado: agent_eval_estado_actual, agent_metrics_cache_7d,
--           agent_metrics_resumen_30d, agent_review_queue

-- 4. RLS habilitado en todas
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND (tablename LIKE 'agent_%' OR tablename = 'queries_repository');
-- Esperado: rowsecurity = true en TODAS

-- 5. Realtime habilitado en 2 (conversations + messages)
SELECT tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename LIKE 'agent_%';
-- Esperado: agent_conversations, agent_messages

-- 6. Seed inicial de eval suite (5 preguntas)
SELECT id, categoria FROM public.agent_eval_questions ORDER BY id;
-- Esperado: 5 filas (q01..q05)
```

## Modelo de datos (resumen visual)

```
queries_repository ─────────┐
  (catálogo curado)         │ (referenciado por search_query_repository tool)
                            ▼
                    [Backend Agente]
                            │
                            ▼
agent_conversations  ◄──────┤
  │ (sesiones)              │
  ▼                         │
agent_messages              │
  │ (turnos + tools)        │
  │                         │
  ├──► agent_review_queue   │ (view: feedback negativo sin resolver)
  │                         │
  └──► agent_usage_metrics  │ (telemetría: tokens, latencia, costos)
                            │
agent_global_memory ◄───────┤ (RAG: aprendizajes compartidos)
                            │
agent_eval_questions ───────┤
  │ (canónicas)             │
  ▼                         │
agent_eval_runs ────────────┘ (resultados anti-regresión)
```

## Permisos — patrón RLS

| Tabla | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `queries_repository` | Equipo CSM lee | Admins (JP/Ana/JD) |
| `agent_conversations` | Autor o admin | Autor (INSERT); autor o admin (UPDATE/DELETE) |
| `agent_messages` | Si lee la conversación, lee mensajes | Autor de conv (INSERT/UPDATE feedback); admin (DELETE) |
| `agent_global_memory` | Equipo CSM lee | Admins (manual); service_role (reflector) |
| `agent_usage_metrics` | Solo admins | Solo service_role del backend |
| `agent_eval_questions` | Solo admins | Solo admins |
| `agent_eval_runs` | Solo admins | Solo service_role |

**Admins del agente:** `jpmesa@truora.com`, `jdiaz@truora.com`.

JP entra como admin del agente porque es quien lo construye y mantiene.

## Cleanup (si hay que rollback)

Aplicar en orden INVERSO al de creación:

```sql
DROP VIEW IF EXISTS public.agent_eval_estado_actual CASCADE;
DROP TABLE IF EXISTS public.agent_eval_runs CASCADE;
DROP TABLE IF EXISTS public.agent_eval_questions CASCADE;

DROP VIEW IF EXISTS public.agent_metrics_cache_7d CASCADE;
DROP VIEW IF EXISTS public.agent_metrics_resumen_30d CASCADE;
DROP TABLE IF EXISTS public.agent_usage_metrics CASCADE;

DROP TABLE IF EXISTS public.agent_global_memory CASCADE;

DROP VIEW IF EXISTS public.agent_review_queue CASCADE;
DROP TABLE IF EXISTS public.agent_messages CASCADE;
DROP TABLE IF EXISTS public.agent_conversations CASCADE;

DROP TABLE IF EXISTS public.queries_repository CASCADE;

-- pgvector queda habilitado (otros usos posibles, no hace daño dejar)
```
