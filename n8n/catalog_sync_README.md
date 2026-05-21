# Catalog Sync — guia n8n (drift detection Modelo D)

Workflow de mantenimiento del repositorio de querys (`/queries`).

Corre **diariamente a las 7 AM hora Bogota** + se puede disparar **manualmente** via
webhook desde el bot�n "Sync ahora" del admin panel de `/queries`. Comparara los
4 workflows productivos de Report Builder en `n8n.zapsign.com.br` contra el
snapshot guardado en `workflow_snapshots` (Supabase) y, si detecta drift,
**marca** las queries afectadas y crea alertas para que JP/JD las reconcilien
manualmente.

> **Modelo D** (decision 2026-05-20): el cron **no reescribe** `sql_completo` ni
> `sql_template`. Solo marca `drift_detected_at` y guarda el SQL nuevo en
> `catalog_sync_alerts.new_sql_snapshot`. El admin reconcilia manualmente en el
> admin panel decidiendo si propaga al catalogo (`updated_template`) o solo
> refresca el snapshot (`updated_snapshot_only`). Ver memoria
> `project_queries_repository_agent.md`.

## Que cubre

Sync sobre los **4 workflows Snowflake** del Report Builder:

| Workflow              | ID                | Bloques en queries_repository |
|-----------------------|-------------------|-------------------------------|
| Report Builder DI     | `aJTbPA3uXIHUUdjo`| 11                            |
| Report Builder BGC    | `vtBaV8Nscn6aUKl0`| 8                             |
| Report Builder CE     | `JiPo0n1sEUQbJ2k4`| 9                             |
| CE por Flujos y VRF   | `96t8Xl3WGpIaKCLb`| 3                             |

**No cubre los 7 endpoints CH** (cada uno es una query independiente en ClickHouse
Cloud, no un workflow n8n). Cuando se modifique un endpoint CH, el admin
actualiza `workflow_snapshots` directamente desde el admin panel o aplicando un
seed manual. Como los CH endpoints cambian muy rara vez, no justifica un sync
automatico.

## Topologia (10 nodos)

```
[Schedule Trigger: 0 0 7 * * * BOG]
                         \
[Webhook Trigger:         \
 /webhook/catalog-sync]    \
                            v
                       [Set: Workflow List]   -- 4 items, uno por workflow
                            |
                            v
                       [HTTP: POST MCP get_workflow_details]
                            |
                            v
                       [Code: Parse MCP]      -- catalog_sync_parse_mcp.js
                            |
                            v
                       [HTTP: GET Snapshot + Queries via PostgREST embed]
                            |
                            v
                       [Code: Detect Drift]   -- catalog_sync_detect_drift.js
                            |
                            v
                       [IF: drift === true]
                          / \
                       T /   \ F
                        /     \
        [HTTP: POST     [Set: Skipped]
         catalog_sync_alerts]
                        |
                        v
        [HTTP: PATCH workflow_snapshots]
                        |
                        v
        [HTTP: PATCH queries_repository]
                        |
                        v
        [Set: Result] (acumula por workflow)
                        |
                        v
        [Respond to Webhook]   (solo si fue webhook trigger)
```

## Pre-requisitos

1. **Acceso al MCP nativo de n8n zapsign**. Configurado y validado 2026-05-20.
   Ver `reference_n8n_mcp_zapsign.md`.

   - URL: `https://n8n.zapsign.com.br/mcp-server/http`
   - Auth: Bearer Access Token (JP lo tiene en lugar seguro — NO en repo)

   Crear credential en n8n:
   - Settings -> Credentials -> + Add
   - Type: **Header Auth**
   - Name: `MCP zapsign Access Token`
   - Header Name: `Authorization`
   - Header Value: `Bearer <ACCESS_TOKEN>` (pegar el token completo)

2. **Credential Supabase PostgREST** (ya existe para BotiAlertas / Portfolio Sync).
   - Type: Header Auth o predefinedCredentialType `supabaseApi`
   - apikey + Authorization Bearer service_role

3. **8 workflows con `Enable workflow access` activado en zapsign** (ya
   confirmado por JP 2026-05-20). Sin ese flag, el MCP devuelve error de
   permisos.

## Configuracion paso a paso

### 1. Schedule Trigger

- Mode: **Custom (Cron Expression)**
- Cron expression: `0 0 7 * * *` (6 campos: seg min hora dia mes wd)
  - Equivale a 7:00 AM todos los dias.
- Timezone: `America/Bogota`

> Nota: usar 6 campos (con seconds) como en BotiAlertas v2 y Portfolio Sync. Ver
> memoria sobre cron expression de Schedule Trigger.

### 2. Webhook Trigger (opcional, para "Sync ahora" desde admin panel)

- HTTP Method: **POST**
- Path: `catalog-sync`
- Response Mode: `When Last Node Finishes`
- Response Data: `JSON`
- Authentication: **Header Auth** (crear credential con un secret compartido
  entre frontend y n8n para evitar que cualquiera dispare el sync)

Path completo (productivo):
`https://n8n.zapsign.com.br/webhook/catalog-sync`

### 3. Set: Workflow List

- Mode: **Run Once for All Items**
- Keep Only Set: ON
- **Include Other Input Items**: OFF
- En **Values to Set**: clic en "Add Value" -> "JSON" (no "String") y pegar:

```json
[
  { "workflow_id": "aJTbPA3uXIHUUdjo", "workflow_name": "Report Builder DI" },
  { "workflow_id": "vtBaV8Nscn6aUKl0", "workflow_name": "Report Builder BGC" },
  { "workflow_id": "JiPo0n1sEUQbJ2k4", "workflow_name": "Report Builder CE" },
  { "workflow_id": "96t8Xl3WGpIaKCLb", "workflow_name": "CE por Flujos y VRF" }
]
```

Truco n8n: para que cada elemento del array salga como item separado (4 items en
vez de 1 item con array), usar **Code node** en lugar de Set:

```javascript
// Code node alternative para "Workflow List"
return [
  { json: { workflow_id: "aJTbPA3uXIHUUdjo", workflow_name: "Report Builder DI" } },
  { json: { workflow_id: "vtBaV8Nscn6aUKl0", workflow_name: "Report Builder BGC" } },
  { json: { workflow_id: "JiPo0n1sEUQbJ2k4", workflow_name: "Report Builder CE" } },
  { json: { workflow_id: "96t8Xl3WGpIaKCLb", workflow_name: "CE por Flujos y VRF" } },
];
```

**Recomiendo el Code node** — mas explicito y emite 4 items, que es lo que
necesitan los nodos siguientes para iterar 1 vez por workflow.

### 4. HTTP Request: POST MCP get_workflow_details

- **Method**: POST
- **URL**: `https://n8n.zapsign.com.br/mcp-server/http`
- **Authentication**: Generic Credential Type -> Header Auth
  -> credential `MCP zapsign Access Token` (creada en pre-requisitos).
- **Send Headers**: ON
  - `Content-Type`: `application/json`
  - `Accept`: `application/json, text/event-stream`
  > El Accept con `text/event-stream` es **obligatorio**. Sin el, el MCP no
  > devuelve formato SSE y el parser falla.
- **Send Body**: ON
- **Body Content Type**: `JSON`
- **Specify Body**: `Using JSON`
- **JSON**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_workflow_details",
    "arguments": {
      "workflowId": "={{ $json.workflow_id }}"
    }
  }
}
```

- **Options** -> **Response**:
  - **Response Format**: `String` (clave: si queda como JSON, n8n trata de
    parsear el SSE como JSON y falla)
  - **Never Error**: OFF (queremos que falle ruidosamente si el MCP no
    responde)
- **Options** -> **Batching** (importante):
  - Batch Size: 1
  - Batch Interval (ms): 500
  > Pacing minimo: 0.5s entre llamadas para no saturar el MCP.

El response queda en `$json.data` o `$json.body` segun version de n8n. El
parser maneja ambos casos.

### 5. Code: Parse MCP

- Mode: **Run Once for All Items**
- Language: **JavaScript**
- Codigo: pegar contenido de `truora-mbr-app/n8n/catalog_sync_parse_mcp.js`

Output esperado por workflow (4 items):

```json
{
  "workflow_id": "aJTbPA3uXIHUUdjo",
  "workflow_name": "Report Builder DI",
  "workflow_name_remoto": "Report Builder DI",
  "sql_completo_remoto": "WITH params AS ( SELECT CAST(...",
  "sql_hash_remoto": "d215a962129eb0ff22ceb4a0831c877c2f74cb3c9a0447e58645a8aecd7b6d20",
  "sf_nodes_count": 1
}
```

### 6. HTTP Request: GET Snapshot + Queries (PostgREST embed)

- **Method**: GET
- **URL**: `{{ $env.SUPABASE_URL }}/rest/v1/workflow_snapshots`
  (o hardcodear: `https://<project-ref>.supabase.co/rest/v1/workflow_snapshots`)
- **Authentication**: el credential Supabase service_role que ya usan
  BotiAlertas / Portfolio Sync.
- **Send Query Parameters**: ON
  - `workflow_id`: `={{ "eq." + $json.workflow_id }}`
  - `select`: `workflow_id,workflow_name,sql_completo,sql_hash,last_synced_at,drift_detected_at,queries_repository(id,slug,bloque_id_origen,nombre,drift_detected_at)`
- **Send Headers**: ON
  - `Accept`: `application/json`
- **Options** -> **Response** -> **Response Format**: `JSON`

El embed `queries_repository(...)` requiere que la FK
`queries_repository.workflow_id_origen -> workflow_snapshots.workflow_id` exista
(la creo la migration `20260520120000_queries_repository_modelo_d.sql`).

El response es un **array con 1 elemento** (porque filtramos por workflow_id).
Lo guardamos en `$json.snapshot_actual` mergeando con los datos del paso
anterior. **Importante**: el HTTP Request output mete el body en `$json` directamente
si es array; lo vamos a tratar en el siguiente Code node.

**Truco**: si el HTTP Request reemplaza todo el $json del item anterior
(pierdes `sql_completo_remoto` etc.), agregar despues un **Merge node**:
- Mode: `Combine`
- Combine By: `Position`
- Input 1: salida del Parse MCP (4 items)
- Input 2: salida del HTTP GET Snapshot (4 items)
- Resultado: 4 items combinados con todas las keys

Otra opcion mas limpia: en el HTTP Request node, configurar:
- **Options** -> **Response** -> **Include Response Headers and Status**: OFF
- **Always Output Data**: ON
- Despues del HTTP Request, agregar un **Code node corto** que reagrupa:

```javascript
// Re-attach upstream fields
const upstream = $('Code: Parse MCP').all();
const httpOutput = $input.all();
return httpOutput.map((item, idx) => ({
  json: {
    ...upstream[idx].json,
    snapshot_actual: item.json,  // ya es el array de PostgREST
  }
}));
```

### 7. Code: Detect Drift

- Mode: **Run Once for All Items**
- Language: **JavaScript**
- Codigo: pegar contenido de `truora-mbr-app/n8n/catalog_sync_detect_drift.js`

Output (4 items, uno por workflow):

```json
{
  "workflow_id": "aJTbPA3uXIHUUdjo",
  "workflow_name": "Report Builder DI",
  "drift": false,
  "alerts_payload": [],
  "workflow_patch_url": null,
  "queries_patch_url": null,
  "drift_payload": null,
  "message": "OK aJTbPA3uXIHUUdjo (Report Builder DI): sin drift. hash=d215a962129e...",
  "stats": { "queries_count": 11, "old_hash_prefix": "d215a962129e", "new_hash_prefix": "d215a962129e" }
}
```

O si hay drift:

```json
{
  "workflow_id": "aJTbPA3uXIHUUdjo",
  "drift": true,
  "alerts_payload": [/* 11 alerts, uno por bloque DI */],
  "workflow_patch_url": "/rest/v1/workflow_snapshots?workflow_id=eq.aJTbPA3uXIHUUdjo",
  "queries_patch_url": "/rest/v1/queries_repository?workflow_id_origen=eq.aJTbPA3uXIHUUdjo",
  "drift_payload": { "drift_detected_at": "2026-05-20T19:00:00.000Z" },
  "message": "DRIFT aJTbPA3uXIHUUdjo: 11 alert(s) creadas. hash d215a962129e -> abcd1234..."
}
```

### 8. IF: drift === true

- Condition: `{{ $json.drift }}` `Equal` `={{ true }}`
  - Cuidado: usar el tipo `Boolean` en el segundo operando, no string "true".
- **True branch**: continuar a HTTP POST alerts
- **False branch**: conectar a un **NoOp** (o Set "Skipped") y dejarlo asi.

### 9. HTTP Request: POST catalog_sync_alerts (rama TRUE)

- **Method**: POST
- **URL**: `{{ $env.SUPABASE_URL }}/rest/v1/catalog_sync_alerts`
- **Authentication**: Supabase service_role (mismo credential que paso 6)
- **Send Headers**: ON
  - `Content-Type`: `application/json`
  - `Prefer`: `return=minimal`
- **Send Body**: ON
- **Body Content Type**: `JSON`
- **Specify Body**: `Using JSON`
- **JSON**: `={{ $json.alerts_payload }}`
  > Importante: enviar el array directo, no envuelto en `{ rows: ... }`.
  > PostgREST acepta array para batch INSERT.

### 10. HTTP Request: PATCH workflow_snapshots (rama TRUE)

- **Method**: PATCH
- **URL**: `{{ $env.SUPABASE_URL + $json.workflow_patch_url }}`
- **Authentication**: Supabase service_role
- **Send Headers**: ON
  - `Content-Type`: `application/json`
  - `Prefer`: `return=minimal`
- **Send Body**: ON, JSON
- **JSON**: `={{ $json.drift_payload }}`

Body resultante: `{ "drift_detected_at": "2026-05-20T19:00:00.000Z" }`. NO se
toca `sql_completo` ni `sql_hash` (Modelo D).

### 11. HTTP Request: PATCH queries_repository (rama TRUE)

- **Method**: PATCH
- **URL**: `{{ $env.SUPABASE_URL + $json.queries_patch_url }}`
- **Authentication**: Supabase service_role
- **Send Headers**: ON
  - `Content-Type`: `application/json`
  - `Prefer`: `return=minimal`
- **Send Body**: ON, JSON
- **JSON**: `={{ $json.drift_payload }}`

Propaga `drift_detected_at = now()` a todas las queries con
`workflow_id_origen = workflow_id`. El frontend usa ese campo para mostrar el
badge "Pendiente de actualizacion" en las cards.

### 12. (Opcional) Set: Result Accumulator + Respond to Webhook

Si configuraste el Webhook Trigger del paso 2, conectar al final un nodo:

- **Respond to Webhook**:
  - Respond With: `JSON`
  - Response Body: 

```json
={{ {
  "ok": true,
  "synced_at": $now.toISO(),
  "results": $items().map(i => ({
    workflow_id: i.json.workflow_id,
    drift: i.json.drift || false,
    message: i.json.message
  }))
} }}
```

## Test plan

Antes de habilitar el cron:

### Test 1 — Probar el MCP directo

Desde PowerShell (no curl Unix). Validar que el MCP responde y devuelve SQL.

Ver memoria `reference_n8n_mcp_zapsign.md` seccion "Tests de validacion".

### Test 2 — Ejecutar el workflow manualmente, modo no-drift

1. Activar el workflow en n8n.
2. Click **Execute Workflow** en la UI.
3. Resultado esperado en cada uno de los 4 items: `drift: false`.
   (Porque el seed v3 guardo exactamente el SQL que esta en zapsign al
   2026-05-19/20.)
4. Verificar en Supabase:

   ```sql
   -- Esperado: ningun drift pendiente
   SELECT workflow_id, drift_detected_at, last_synced_at
   FROM public.workflow_snapshots
   ORDER BY workflow_id;
   -- drift_detected_at debe ser NULL para los 4 SF

   SELECT COUNT(*) FROM public.catalog_sync_alerts;
   -- Debe ser 0 si nunca hubo drift
   ```

### Test 3 — Forzar drift artificial (sanity check)

1. Editar 1 workflow en zapsign (cambiar un comentario en el SQL del nodo
   Snowflake — ej. agregar `-- test drift 2026-05-20`).
2. Ejecutar el workflow Catalog Sync manualmente.
3. Verificar en Supabase:

   ```sql
   -- 1 fila debe tener drift_detected_at NOT NULL
   SELECT workflow_id, drift_detected_at
   FROM public.workflow_snapshots
   WHERE drift_detected_at IS NOT NULL;

   -- N alerts (segun bloques del workflow afectado) con status='pending'
   SELECT workflow_id, bloque_id, status, old_hash, new_hash, detected_at
   FROM public.catalog_sync_alerts
   ORDER BY detected_at DESC LIMIT 20;

   -- queries del catalogo afectadas tienen drift_detected_at NOT NULL
   SELECT slug, drift_detected_at
   FROM public.queries_repository
   WHERE drift_detected_at IS NOT NULL
   ORDER BY slug;
   ```

4. Limpieza post-test:

   ```sql
   -- Borrar alerts del test
   DELETE FROM public.catalog_sync_alerts
   WHERE notes IS NULL AND status = 'pending';

   -- Resetear drift flags
   UPDATE public.workflow_snapshots SET drift_detected_at = NULL;
   UPDATE public.queries_repository SET drift_detected_at = NULL;
   ```

5. Revertir el cambio en zapsign (quitar el comentario test).
6. Re-ejecutar el workflow Catalog Sync para confirmar que vuelve a no-drift.

### Test 4 — Probar el webhook manual

```powershell
$body = '{}' | ConvertFrom-Json | ConvertTo-Json
Invoke-RestMethod -Method POST `
  -Uri "https://n8n.zapsign.com.br/webhook/catalog-sync" `
  -Headers @{ "Authorization" = "Bearer <SECRET_COMPARTIDO>" } `
  -ContentType "application/json" `
  -Body $body
```

Esperado: response JSON con `ok: true` y resumen por workflow.

## Files relacionados

| Archivo | Rol |
|---------|-----|
| `truora-mbr-app/n8n/catalog_sync_parse_mcp.js` | Code node parser SSE doble-anidado |
| `truora-mbr-app/n8n/catalog_sync_detect_drift.js` | Code node detector + builder de payloads |
| `truora-mbr-app/n8n/catalog_sync_README.md` | Este archivo |
| `truora-mbr-app/supabase/migrations/20260520120000_queries_repository_modelo_d.sql` | Schema Modelo D (workflow_snapshots + catalog_sync_alerts + cols en queries_repository) |
| `tmp/agent_seed_catalog/queries_repository_v3.sql` | Seed inicial del catalogo (38 queries + 11 snapshots) |

## Gotchas

1. **SSE Response Format**: el HTTP Request al MCP debe tener Response Format =
   String, no JSON. Si queda JSON, n8n falla con "Cannot parse response as JSON".

2. **Accept header obligatorio**: `text/event-stream` en el Accept. Sin esto el
   MCP responde formato distinto y el parser SSE falla.

3. **MCP timeout**: el endpoint MCP a veces tarda 5-15s en responder workflows
   grandes (Report Builder CE = 48 KB). Configurar timeout del HTTP Request en
   30s (default) o subir a 60s si vemos fallos.

4. **PostgREST embed**: el FK `queries_repository.workflow_id_origen ->
   workflow_snapshots.workflow_id` debe estar creado (migration ya lo creo).
   Sin esa FK, PostgREST no expone el embed.

5. **Batch INSERT alerts**: el cuerpo del POST a catalog_sync_alerts es un
   array. PostgREST lo procesa como batch automatico. Si un alert falla
   (constraint violation), TODO el batch aborta. Por eso usamos `status =
   'pending'` y los campos obligatorios (workflow_id, bloque_id, new_hash,
   new_sql_snapshot) siempre llenos.

6. **`drift_detected_at` no se resetea automaticamente**: si el admin reconcilia
   un drift, debe explicitamente UPDATE workflow_snapshots SET
   drift_detected_at = NULL + queries_repository SET drift_detected_at = NULL
   WHERE workflow_id_origen = X. Eso vive en el admin panel del frontend (paso
   siguiente del roadmap).

7. **Cambios en los `.sql` en disco no son drifts**: el cron compara contra el
   SQL **vivo en zapsign** (via MCP), no contra los `.sql` files del repo. Si
   JP edita `report_builder_di.sql` localmente, no genera drift. Solo lo genera
   modificar el nodo Snowflake en n8n.zapsign.com.br.
