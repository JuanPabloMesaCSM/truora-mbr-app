# Plan Completo: Oppy — Agente IA del CSM Center

> **Última actualización**: 2026-05-26
> **Estado**: Fases 0 + 1 + 2 + 3 + 4 ✅ DONE end-to-end. **AGENTE VIVO** (`Oppy Chat` con Claude Sonnet 4.6 + 10 tools + memoria + logging, validado E2E + anti-injection). Pendiente: conectar frontend chat drawer (próxima sesión), Fase 5 (eval suite + admin dashboard).
> **Fuente de verdad arquitectural**: `.claude/skills/oppy-agent.md` (creada 2026-05-22)
> **Decisión arquitectural**: orquestador en **n8n zapsign** + LLM **Claude Sonnet 4.6 + Haiku 4.5** (esperando API key Anthropic)
> **Filosofía**: armar TODA la infraestructura mientras se aprueba la API key. Plug-and-play cuando llegue.

## Estado al 2026-05-22 (resumen ejecutivo)

| Pieza | Estado | Detalle |
|---|---|---|
| 6 migrations base + agent_skills/oppy_chat_logs | ✅ aplicadas | Supabase via SQL Editor |
| 15 skills sincronizadas | ✅ | via `seed_all_skills.py` |
| Edge Function `oppy-skills-mcp` (REST + MCP + embed Voyage) | ✅ deployada | URL: `cjrhxmfnmajxiwiiuwym.supabase.co/functions/v1/oppy-skills-mcp` |
| Hook PostToolUse auto-sync | ✅ activo | `.claude/settings.json` + `on-skills-edit.ps1` |
| Sub-workflow `search_catalog` | ✅ activo | ID `0JciBgeQPeBdZ4LA` |
| Sub-workflow `get_query` | ✅ activo | ID `Ts9qg9OavSkM86sy` |
| Sub-workflow `list_skills` | ✅ activo | ID `g8jsQC54E7Xibuzz` |
| Sub-workflow `read_skill` | ✅ activo | ID `OOdK9p1BSAD8O6AQ` |
| Sub-workflow `search_skills` | ✅ activo | ID `lgR8O4eCgEsXyyUr` |
| Voyage API key + secret en Supabase | ✅ | `supabase secrets set VOYAGE_API_KEY=...` |
| Migration dim 1536→1024 + RPC `match_memories` | ✅ aplicada | con workaround del bug PostgREST + pgvector |
| Sub-workflow `read_memories` | ✅ activo | ID `MBeLBOYlIh1Bmbi9` |
| Sub-workflow `save_memory` | ✅ activo | ID `nySmTcHe8V5ZZcGJ` |
| Test end-to-end memoria semántica | ✅ verificado | query "cual TCI usa inDrive para verificacion antecedentes" → memoria "TCI BGC inDrive" con similarity 0.59 |
| Webhook backend `Snowflake Read Only` (`sf-agent-readonly`) | ✅ activo + logging | ID `GoNplEUMHuyFK2AO`, valida SQL read-only + ejecuta + loguea |
| Webhook backend `Agente Querys ClickHouse` (`ch-agent-query`) | ✅ activo + logging | ID `avMwfMdOaRdBEfgH`, whitelist 7 endpoints CH + ejecuta + loguea |
| Sub-workflow `execute_sf_readonly` (wrapper) | ✅ activo | ID `KqsJJgQoXF6GEleV` |
| Sub-workflow `execute_ch_query` (wrapper) | ✅ activo | ID `hOJ2jWsulvA4teTh` |
| Sub-workflow `get_workflow_details` (MCP) | ✅ activo | ID `aG790NJht3yGjuQd`, parse SSE + redactSecrets |
| Workflow principal `Oppy Chat` | ✅ activo | AI Agent (Sonnet 4.6) + Postgres Memory + 10 tools + logging. Validado E2E 2026-05-26. Webhook `/webhook/oppy-chat` |
| Tabla `agent_chat_history` (Postgres Chat Memory) | ✅ aplicada | migration `20260526120000` |
| Anti-injection validado | ✅ | 3 ataques rechazados (frase defensa) + 1 flagged |
| Workflow `Oppy Reflector` (Haiku 4.5) | ⏳ opcional | Auto-guardar memorias post-conversación |
| Frontend chat drawer (sin commit) | ⏳ próxima sesión | MOCK_MODE = true → cambiar a false + webhook URL |
| Eval suite (5 questions seed + 20 faltan + runner) | ⏳ Fase 5 | Sin urgencia |

**Bugs descubiertos hoy** (documentados):
- PostgREST + pgvector RPC con WHERE/ORDER/LIMIT y operator `<=>` devuelve `[]` silenciosamente desde HTTP (funciona desde SQL Editor). Workaround: RPC mínima + filtros en cliente. Ver memoria `feedback_postgrest_pgvector_rpc_silent_zero`.

---

## Visión final (lo que vamos a entregar)

Un agente IA que el equipo CSM consulta desde el CSM Center vía drawer lateral ("Oppy"). Cuando un CSM pregunta:

> *"necesito una tablita con consumos por país y custom_type últimos 3 meses de inDrive, para pasarle el dato de cuánto $$ representa cada proyecto"*

el agente:

1. **Lee skills relevantes** (`truora-domain` → confirma "consumos = facturable = CH"; `clickhouse-counters-metabase` → reglas billable)
2. **Busca semánticamente en el catálogo** queries similares (encuentra `ClickHouse — BGC por país y tipo`)
3. **Consulta memoria persistente** (encuentra "TCI BGC inDrive = TCIxxx" de conversación previa)
4. **Modifica el SQL del catálogo** para usar `date_counted >= date_sub(MONTH, 3, today())`
5. **Ejecuta** via webhook `ch-agent-query` con `client_id="TCIxxx"` → resultados reales
6. **Devuelve al CSM**: tabla con consumos por país + custom_type últimos 3 meses
7. **Reflector** (cuando CSM dice "perfecto") guarda 1-3 aprendizajes a memoria
8. **Eventual promoción**: si la query se repite, admin la promueve al catálogo

Nada inventado. Todo anclado a skills + catálogo + memoria + ejecución real.

---

## Arquitectura final (4 fuentes + reflector + ejecución)

```
                ┌─────────────────────────────────────────────────────────────┐
                │  CSM Center (truora-mbr-app)                                │
                │   ─ pill Oppy en TopBar (todas las rutas)                   │
                │   ─ OppyChatDrawer (framer-motion)                          │
                │   ─ useOppyChat hook                                        │
                └────────────────────────┬────────────────────────────────────┘
                                         │ POST /oppy-chat
                                         ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  n8n zapsign — Workflow "Oppy Chat" (orquestador)                        │
   │   ─ Webhook                                                              │
   │   ─ Code: Validate & Prepare (Capa 2 sanitize)                           │
   │   ─ HTTP: rate-limit check (Capa 5)                                      │
   │   ─ HTTP: fetch 2 skills criticas (pre-cargadas)                         │
   │   ─ HTTP: fetch top-5 memorias relevantes (Capa C, post-API key)         │
   │   ─ AI Agent (Claude Sonnet 4.6)                                         │
   │   │   ├ Chat Model: Anthropic                                            │
   │   │   ├ Memory: Window Buffer (turn-level dentro de la sesion)           │
   │   │   └ Tools (10 sub-workflows):                                        │
   │   │       │ search_catalog          ←→ queries_repository                │
   │   │       │ get_query               ←→ queries_repository                │
   │   │       │ list_skills             ←→ agent_skills                      │
   │   │       │ read_skill              ←→ agent_skills                      │
   │   │       │ search_skills           ←→ agent_skills (full-text)          │
   │   │       │ read_memories           ←→ agent_global_memory (pgvector)    │
   │   │       │ save_memory             ←→ agent_global_memory (insert)      │
   │   │       │ execute_ch_query        ←→ webhook ch-agent-query            │
   │   │       │ execute_sf_readonly     ←→ webhook sf-agent-readonly         │
   │   │       └ get_workflow_details    ←→ MCP nativo zapsign                │
   │   ─ Code: Post-LLM validation (Capa 4)                                   │
   │   ─ HTTP: insert agent_messages + agent_usage_metrics + oppy_chat_logs   │
   │   └ Respond to Webhook                                                   │
   └────────────────────┬─────────────────────────────────────────────────────┘
                        │
                        │ (Trigger paralelo cuando se cierra sesión o feedback positivo)
                        ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │  n8n zapsign — Workflow "Oppy Reflector" (cron + trigger)                │
   │   ─ Lee transcript de agent_messages                                     │
   │   ─ Claude Haiku 4.5 decide qué guardar                                  │
   │   ─ Genera embedding del aprendizaje                                     │
   │   └ INSERT agent_global_memory                                           │
   └──────────────────────────────────────────────────────────────────────────┘
```

---

## Estado actual (qué ya está construido)

### ✅ Listo, en disco/Supabase

| Pieza | Path | Estado |
|---|---|---|
| Catálogo `queries_repository` | `truora-mbr-app/supabase/migrations/20260514120000_queries_repository.sql` | Aplicada, 46 entries en prod |
| Migrations agente: conversations + messages + global_memory + usage_metrics + eval_suite | `truora-mbr-app/supabase/migrations/20260514120{100..500}_*.sql` | Escritas, pendiente aplicar |
| Migration nueva: agent_skills + oppy_chat_logs + search_agent_skills RPC | `truora-mbr-app/supabase/migrations/20260521170000_agent_skills_and_oppy_logs.sql` | Escrita hoy, pendiente aplicar |
| Edge Function `oppy-skills-mcp` (REST + MCP) | `tmp/oppy_agent/edge_function/index.ts` | Escrita, pendiente deploy |
| Hook Claude Code auto-sync skills | `.claude/settings.json` + `.claude/hooks/on-skills-edit.ps1` | Configurado |
| Script sync `sync_skill.py` + `seed_all_skills.py` | `tmp/oppy_agent/*.py` | Escrito |
| Frontend chat drawer (mock) | `truora-mbr-app/src/components/oppy/*` + `src/hooks/useOppyChat.ts` | Mock mode, sin commit |
| Pill "Oppy" en TopBar | `truora-mbr-app/src/components/report-builder/WelcomeStep.tsx` + `src/pages/QueriesPage.tsx` | Sin commit |
| Webhooks `sf-agent-readonly` + `ch-agent-query` | n8n.zapsign.com.br | Funcionando |
| MCP nativo zapsign | n8n.zapsign.com.br/mcp-server/http | Habilitado, access token en 1Password de JP |
| 4 archivos SQL del Report Builder en disco | `truora-mbr-app/supabase/snowflake/*.sql` | Source of truth |
| Workflow Catalog Sync (drift detection) | n8n.zapsign.com.br | Funcionando, cron diario 7 AM BOG |

### ❌ Pendiente construir

| Pieza | Cuándo |
|---|---|
| 10 sub-workflows en n8n (catalog x2 + skills x3 + memory x2 + execution x3) | Fases 1-3 |
| Workflow principal `Oppy Chat` (orquestador) | Fase 4 (requiere API key Anthropic) |
| Workflow `Oppy Reflector` | Fase 4 (requiere API key Anthropic + Haiku) |
| Embeddings seed para queries_repository.embedding | Fase 2 (requiere API key embedding provider) |
| Embeddings auto en agent_global_memory.embedding | Fase 4 (cuando memorias se escriben) |
| Eval suite con 25 preguntas (5 ya seed) | Fase 5 |
| Eval suite runner (cron n8n o GitHub Action) | Fase 5 |

---

## Decisiones cerradas

1. **Orquestador = n8n workflow en zapsign**. No Python no Edge Function.
   - Razón: ya tenemos backbone n8n, JP lo conoce, integra con webhooks existentes.
   - Con: armado más visual, menos refactorable que código.

2. **LLM principal = Anthropic Claude Sonnet 4.6** (vía nodo nativo n8n). LLM reflector = **Haiku 4.5**.
   - Razón: tool calling robusto, MCP nativo funciona, calidad de razonamiento sobre SQL.
   - Bloqueante: API key pendiente de aprobación de Truora.

3. **Skills = Supabase tabla `agent_skills` + Edge Function `oppy-skills-mcp`** (REST + MCP).
   - Razón: source online unificado, accesible desde n8n (REST) y desde futuros agentes (MCP).
   - Sync: hook Claude Code PostToolUse cuando se edita un `.md`.

4. **Búsqueda semántica en catálogo + memoria**: pgvector con embeddings dim 1536.
   - Provider candidato: Voyage-3 (256 dim, $0.18/1M tokens) o OpenAI `text-embedding-3-small` (1536 dim, $0.02/1M).
   - Decisión final cuando llegue API key.

5. **Ejecución de queries**: 3 tools que llaman webhooks existentes + MCP nativo.
   - `execute_ch_query` ←→ `ch-agent-query` webhook
   - `execute_sf_readonly` ←→ `sf-agent-readonly` webhook
   - `get_workflow_details` ←→ MCP nativo zapsign
   - Defensa: parser SQL valida read-only antes de invocar webhook (rechaza UPDATE/DELETE/DROP).

6. **5 capas de defensa** anti-injection + anti-alucinación (definidas previamente, ver `system_prompt.md` + Anexos del PLAN viejo).

7. **Admins del agente**: `jpmesa@truora.com`, `jdiaz@truora.com` (NO amarquez).

8. **Frontend**: drawer lateral con pill TopBar (ya armado en mock). Conexión real al final.

9. **Pre-carga en system prompt**: 2 skills críticas (`query-repository`, `truora-domain`). Resto on-demand.

10. **MCP server (Edge Function `/mcp`)**: ya escrito pero NO se usa desde el día 1 — Claude vía n8n usa REST. El endpoint MCP queda futureproof para cuando otros agentes (Claude Code, etc.) consuman las skills via protocolo nativo.

---

## Fases del proyecto

Cada fase es **independiente y testeable**. Las Fases 0-3 NO requieren API key Anthropic — son la "infra mientras esperamos". La Fase 4 conecta todo cuando llegue la key. Fase 5 es polish.

---

### Fase 0 — Setup (no requiere API key)

**Objetivo**: dejar la base de datos y la Edge Function lista para que las Fases 1-3 construyan encima.

**Pasos**:

1. **JP**: crear `.env` en `c:\Users\Administrador\csm-center\.env`:
   ```
   SUPABASE_URL=https://<proyecto>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service_role>
   OPPY_SYNC_ENABLED=true
   ```

2. **JP**: aplicar las 5 migrations pendientes del agente en Supabase SQL Editor (orden cronológico):
   - `20260514120100_agent_conversations.sql`
   - `20260514120200_agent_messages.sql`
   - `20260514120300_agent_global_memory.sql`
   - `20260514120400_agent_usage_metrics.sql`
   - `20260514120500_agent_eval_suite.sql`
   - `20260521170000_agent_skills_and_oppy_logs.sql`

3. **JP**: verificar:
   ```sql
   SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
   -- Esperado: vector 0.x.x

   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name LIKE 'agent_%' OR table_name = 'queries_repository' OR table_name = 'oppy_chat_logs'
   ORDER BY table_name;
   -- Esperado: agent_conversations, agent_eval_questions, agent_eval_runs,
   --           agent_global_memory, agent_messages, agent_skills, agent_usage_metrics,
   --           oppy_chat_logs, queries_repository
   ```

4. **JP**: seed inicial de skills:
   ```powershell
   cd c:\Users\Administrador\csm-center
   python tmp\oppy_agent\seed_all_skills.py
   ```

5. **JP**: deploy Edge Function:
   ```powershell
   cd c:\Users\Administrador\csm-center\truora-mbr-app\supabase
   mkdir -Force functions\oppy-skills-mcp
   Copy-Item ..\..\tmp\oppy_agent\edge_function\index.ts functions\oppy-skills-mcp\
   supabase functions deploy oppy-skills-mcp --no-verify-jwt
   ```

6. **JP**: test del hook (editar trivialmente una skill, ver `tmp/oppy_agent/sync.log`).

**Entregables**:
- Base de datos lista (9 tablas + 4 views + RPCs)
- Edge Function deployada y respondiendo
- 15 skills sincronizadas a Supabase
- Hook funcionando

**Tiempo estimado**: 30 min JP solo.

---

### Fase 1 — Sub-workflows para Skills + Catálogo (5 tools, no requiere API key)

**Objetivo**: los 5 tools básicos que cubren **A** (skills) y **B** (catálogo) construidos como sub-workflows independientes, **testeables sin LLM**.

| # | Sub-workflow | Backend | Input | Output |
|---|---|---|---|---|
| 1 | `Oppy Tool: search_catalog` | Supabase REST | `{search_text, producto?, limit?}` | `{results: [...]}` |
| 2 | `Oppy Tool: get_query` | Supabase REST | `{slug}` | `{...query completa}` |
| 3 | `Oppy Tool: list_skills` | Edge Function REST | `{}` | `{skills: [...]}` |
| 4 | `Oppy Tool: read_skill` | Edge Function REST | `{name}` | `{...skill completa}` |
| 5 | `Oppy Tool: search_skills` | Edge Function REST | `{query, limit?}` | `{results: [...]}` |

Cada sub-workflow tiene topología idéntica:
- Execute Workflow Trigger (con schema de input)
- HTTP Request a Supabase o Edge Function
- Code node: sanitize output (Capa 3 — `stripInjection`)
- Respond to Webhook

**Testing**: cada sub-workflow se ejecuta manualmente con payloads de test y se valida output. No requiere LLM.

**Tiempo estimado**: 1.5 hrs JP con mi guía nodo por nodo.

---

### Fase 2 — Sub-workflows de Memoria (Capa C, no requiere API key Anthropic, sí provider de embeddings)

**Objetivo**: memoria persistente entre conversaciones via `agent_global_memory` con pgvector.

**Pre-requisito**: API key de provider de embeddings. **Si no se tiene aún**, se puede simular con full-text search sobre `content` (downgrade temporal) y migrar a embeddings cuando llegue la key.

| # | Sub-workflow | Backend | Para qué |
|---|---|---|---|
| 6 | `Oppy Tool: read_memories` | Supabase RPC `match_memories_v1` o full-text fallback | Top N memorias relevantes a la pregunta del CSM |
| 7 | `Oppy Tool: save_memory` | Supabase INSERT con embedding | Reflector escribe nuevos aprendizajes |

Estructura del sub-workflow `read_memories`:
- Input: `{query: string, user_email: string, limit: number}`
- HTTP Request a provider embeddings (Voyage / OpenAI) → embedding del query
- HTTP Request a Supabase RPC `match_memories_v1(embedding, user_email_filter, limit)` que hace cosine similarity
- Code: sanitize + format
- Respond

Estructura de `save_memory`:
- Input: `{content: string, source_conversation_id: uuid, tags?: string[]}`
- HTTP Request a provider embeddings → embedding del content
- HTTP Request a Supabase INSERT en `agent_global_memory` con embedding
- Respond `{id: uuid}`

**Side-effect**: necesitamos también el `Oppy Reflector` (workflow separado) que llama `save_memory` después de cada conversación cerrada. Eso va en Fase 4 (requiere Haiku).

**Tiempo estimado**: 1.5 hrs JP con mi guía + ~30 min testing.

---

### Fase 3 — Sub-workflows de Ejecución (Capa D, no requiere API key Anthropic)

**Objetivo**: 3 tools de ejecución que conectan a webhooks/MCP ya existentes.

| # | Sub-workflow | Backend | Para qué |
|---|---|---|---|
| 8 | `Oppy Tool: execute_ch_query` | Webhook `ch-agent-query` en zapsign | Ejecutar SQL contra ClickHouse |
| 9 | `Oppy Tool: execute_sf_readonly` | Webhook `sf-agent-readonly` en zapsign | Ejecutar SQL read-only contra Snowflake |
| 10 | `Oppy Tool: get_workflow_details` | MCP nativo zapsign (HTTP) | Leer SQL productivo de workflows |

Cada uno con defensas adicionales:

**`execute_ch_query`**:
- Input: `{sql: string, params: object, timeout_ms?: number}`
- Code: **valida** que el SQL es read-only:
  - Parser AST simplificado: rechaza `INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE`
  - Acepta solo `SELECT` o `WITH ... SELECT`
- Code: **cap de timeout** (default 30s, max 60s)
- Code: **cap de rows** (LIMIT 1000 inyectado si no existe)
- HTTP Request a `https://n8n.zapsign.com.br/webhook/ch-agent-query` con `{sql, params}`
- Code: sanitize output (no leak de columnas internas)
- Respond `{rows: [...], row_count, latency_ms}`

**`execute_sf_readonly`**: idéntico pero contra `sf-agent-readonly`.

**`get_workflow_details`**:
- Input: `{workflow_id: string}` (uno de los 8 IDs confirmados de zapsign)
- HTTP Request al MCP nativo (parser SSE doble-anidado, igual al Catalog Sync)
- Code: extrae `parameters.query` del nodo Snowflake
- Respond `{workflow_name, sql, last_modified}`

**Tiempo estimado**: 2 hrs JP con mi guía + ~30 min testing.

---

### Fase 4 — Orquestador (requiere API key Anthropic)

**Objetivo**: armar el workflow principal `Oppy Chat` que coordina todos los tools + el workflow `Oppy Reflector`.

**Pre-requisito**: API key Anthropic aprobada y agregada como credencial en n8n zapsign.

**Trabajo**:

#### 4a. Workflow principal `Oppy Chat`

Topología (~12 nodos):

```
[Webhook POST /oppy-chat]
  ↓
[Code: Validate & Prepare]    ← Capa 2: input sanitize
  ↓
[HTTP: rate-limit check]      ← Capa 5
  ├ throttled → Respond 429
  └ continúa
  ↓
[HTTP: fetch critical skills] ← carga query-repository.md + truora-domain.md
  ↓
[HTTP: read top-5 memorias]   ← Capa C: contexto user-specific
  ↓
[AI Agent: Claude Sonnet 4.6]
  ├ Chat Model: Anthropic
  ├ System Message: prompt fortificado + skills críticas + memorias inyectadas
  ├ Memory: Window Buffer (10 turns)
  └ Tools: los 10 sub-workflows de Fases 1-3
  ↓
[Code: Post-LLM Validation]   ← Capa 4
  ↓
[Branch:]
  ├ [HTTP: insert agent_messages]     ← turn-level
  ├ [HTTP: insert agent_usage_metrics] ← costos + tokens
  └ [HTTP: insert oppy_chat_logs]     ← Capa 5 audit
  ↓
[Respond to Webhook]
```

System prompt: usar `tmp/oppy_agent/system_prompt.md` v2 fortificado (con expresiones que inyectan las 2 skills críticas y las top-5 memorias).

#### 4b. Workflow `Oppy Reflector`

Trigger: cron diario 11 PM BOG + trigger directo desde `Oppy Chat` cuando el CSM da feedback positivo (👍).

Topología (~6 nodos):

```
[Cron / Webhook Trigger]
  ↓
[HTTP: SELECT agent_messages WHERE created_at > yesterday AND reflector_processed = false]
  ↓
[Split: por session_id]
  ↓
[AI Agent: Claude Haiku 4.5]
  ├ System Message: "Lee este transcript y devuelve 0-3 aprendizajes no obvios..."
  └ Output: JSON array de {content, tags, importance}
  ↓
[Loop: por aprendizaje]
  ├ [HTTP: save_memory sub-workflow] ← genera embedding + INSERT
  └ [HTTP: UPDATE agent_messages.reflector_processed = true]
```

#### 4c. Conectar frontend al webhook real

- Cambiar `MOCK_MODE = false` en `useOppyChat.ts`
- Set env var `VITE_OPPY_WEBHOOK_URL` en Vercel apuntando a `https://n8n.zapsign.com.br/webhook/oppy-chat`
- Build + deploy a Vercel

#### 4d. Tests E2E

Suite de 12 tests (4 funcionalidad + 4 anti-injection + 4 anti-alucinación), ver Anexos de PLAN viejo. Adicional:

- Test 13: memoria — preguntar A en sesión 1, cerrar, abrir sesión 2 y preguntar B relacionado, ver si el reflector escribió memoria y si el agente la usa.
- Test 14: ejecución — preguntar "cuánto consumió X en mayo", agente debe llamar `execute_ch_query` + devolver tabla con números reales.
- Test 15: get_workflow_details — agente debe poder leer el SQL productivo de un workflow vía MCP nativo.

**Tiempo estimado**: 3-4 hrs JP con mi guía + 1 hr testing.

---

### Fase 5 — Eval suite + monitoring + hardening

**Objetivo**: anti-regresión + observabilidad + production polish.

#### 5a. Completar 25 preguntas en `agent_eval_questions`

Ya hay 5 seeded (q01-q05). Faltan 20 que cubran:
- Búsqueda exacta de slug en catálogo
- Búsqueda semántica (sinónimos, paráfrasis)
- Read de skills específicas
- Memoria (preguntar algo, después algo relacionado, ver si recuerda)
- Ejecución (verificar números reales contra fixtures)
- Anti-injection (intentos varios)
- Anti-alucinación (preguntas sin respuesta en catálogo)
- Lenguaje CSM (que no use jerga prohibida)

#### 5b. Eval suite runner

Workflow n8n `Oppy Eval Suite Runner`:
- Trigger: cron semanal lunes 6 AM BOG + manual
- Lee todas las `agent_eval_questions` con `enabled = true`
- Por cada una: invoca el webhook de Oppy Chat con la pregunta
- Compara la respuesta contra `expected_pattern` (regex) y `forbidden_pattern`
- INSERT en `agent_eval_runs` con resultado
- Si tasa de fallo > 10%, notifica Telegram a admins

#### 5c. Dashboard de monitoring

Nueva ruta en CSM Center `/oppy/admin` (solo admins):
- Costos últimos 7 días (vía `agent_metrics_resumen_30d`)
- Tasa de éxito eval suite (vía `agent_eval_estado_actual`)
- Conversaciones flagged (vía `oppy_chat_logs WHERE flagged`)
- Top preguntas (vía `agent_messages` aggregation)

#### 5d. Production hardening

- Backup automático: cron diario que exporta `agent_global_memory` y `agent_messages` a S3 / Supabase storage
- Rate limit refinado: por user_email + por IP, con grace period para admins
- Cost guardrails: si `agent_usage_metrics.total_tokens_today > $50`, throttle

**Tiempo estimado**: 4-5 hrs total (puede dividirse en varias sesiones).

---

## Cronograma propuesto

Asumiendo que la API key Anthropic se aprueba en **2 semanas** (~2026-06-04):

| Semana | Fase | Quién | Cuándo se hace |
|---|---|---|---|
| **Esta semana (2026-05-21 a 2026-05-28)** | Fase 0 + Fase 1 | JP (con mi guía nodo por nodo) | En cualquier momento, no bloqueado |
| **Semana 2 (2026-05-28 a 2026-06-04)** | Fase 2 + Fase 3 | JP + provider embeddings (si aprobado) | Si no, Fase 2 con full-text fallback |
| **Cuando llegue API key (~2026-06-04)** | Fase 4 (1-2 días) | JP + yo, sesión intensiva | Plug-and-play, todo listo de Fases 0-3 |
| **Semana 4 (2026-06-04 a 2026-06-11)** | Fase 5 | JP + yo, sin urgencia | Polish + monitoring |

Total real: **~12-15 hrs de trabajo combinado, repartido en 3-4 semanas**.

---

## Decisión inmediata — ¿arrancamos Fase 0?

Fase 0 son los 6 pasos del JP del bloque "Fase 0 — Setup" arriba. Son ~30 min y NO requieren ninguna API key. Mientras los hacés, yo puedo:

1. Actualizar la memoria `project_queries_repository_agent` con la decisión de orquestador n8n + Claude (para que próximas sesiones tengan contexto fresco).
2. Preparar el detalle nodo-por-nodo de los 5 sub-workflows de Fase 1, listo para que cuando termines Fase 0 arrancamos directo.

Decime cuando estés en Fase 0 paso 1 o si querés que arranquemos juntos paso 1.
