# Query Repository Agent — webhooks n8n

Tres webhooks proxy que conectan el MCP server / backend del agente con
Snowflake y ClickHouse sin exponer credenciales fuera de n8n.

| Webhook | Estado | Propósito |
|---|---|---|
| `/webhook/sf-agent-readonly` | **FASE A (ahora)** | Ejecuta SQL SELECT contra Snowflake con LIMIT 100 forzado, rechaza DML/DDL. Devuelve rows JSON. |
| `/webhook/ch-agent-query` | **FASE A (ahora)** | Llama un Query Endpoint de ClickHouse (1 de 4 UUIDs) con `queryVariables`. Devuelve rows JSON. |
| `/webhook/sf-agent-full-execute` | **FASE B (post API key)** | Ejecuta SQL sin LIMIT. Manda Telegram al admin pidiendo confirmación con botones Sí/No antes de correr. |

**Host:** `https://n8n.zapsign.com.br/webhook/...`

## Credenciales requeridas en n8n

| Credencial | Tipo | Uso |
|---|---|---|
| `Snowflake account 12` | Snowflake | sf-agent-readonly, sf-agent-full-execute |
| `ClickHouse Agent` | Basic Auth (a crear) | ch-agent-query |
| Telegram bot BotiAlertas (existente) | Telegram | sf-agent-full-execute |

### Crear credencial "ClickHouse Agent"

1. n8n → Credentials → New → buscar **"Basic Auth"** (no es CH específico, usamos el genérico).
2. Name: `ClickHouse Agent`
3. User: tu `key_id` de la API key "Automatización Oppy permanente".
4. Password: tu `key_secret`.
5. Save.

---

## Workflow 1: `sf-agent-readonly`

### Topología

```
[Webhook: POST /sf-agent-readonly]
   │  response mode = Using 'Respond to Webhook' Node
   ▼
[Code: Validate SQL]
   │  output: { ok, sql, error?, applied_limit }
   ▼
[IF: $json.ok === true]
   │
   ├─ TRUE ─► [Snowflake: Execute Query]
   │              │  query = {{ $json.sql }}
   │              ▼
   │         [Code: Format Success Response]
   │              ▼
   │         [Respond to Webhook: 200]
   │
   └─ FALSE ─► [Respond to Webhook: 400]
                  body = {{ { error: $json.error } }}
```

### Setup paso a paso

**1. Webhook node**
- HTTP Method: `POST`
- Path: `sf-agent-readonly`
- Response Mode: `Using 'Respond to Webhook' Node`
- Authentication: `Header Auth` → seleccionar credencial `Agent Webhook Auth`
  (Header Name: `X-Agent-Secret`, Value: el secret hex generado).

**2. Code: Validate SQL**
- Mode: `Run Once for All Items`
- Language: `JavaScript`
- Código: pegar contenido de `agent_sf_readonly_validator.js`
- La auth ya quedó en el Webhook node — este nodo solo valida SQL.

**3. IF node**
- Condition: `{{ $json.ok }}` `is true` (Boolean comparison).

**4. Snowflake: Execute Query** (rama TRUE)
- Operation: `Execute Query`
- Query: `={{ $json.sql }}`
- Credentials: `Snowflake account 12`
- Continue On Fail: ON (queremos atrapar errores de SF para devolverlos al agente)

**5. Code: Format Success Response** (después de Snowflake)
- Código: pegar `agent_sf_readonly_format.js`

**6. Respond to Webhook (rama TRUE)**
- Response Code: `200`
- Response Body: `={{ $json }}`
- Response Headers: `Content-Type: application/json`

**7. Respond to Webhook (rama FALSE)**
- Response Code: `400`
- Response Body: `={{ $json }}` (ya viene como `{ ok: false, error }`)

### Test con curl

```bash
curl -X POST https://n8n.zapsign.com.br/webhook/sf-agent-readonly \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: <AGENT_SECRET>" \
  -d '{"sql": "SELECT CURRENT_DATE() AS today, CURRENT_USER() AS usr"}'
```

Esperado:
```json
{
  "ok": true,
  "rows": [{ "TODAY": "2026-05-14", "USR": "..." }],
  "row_count": 1,
  "applied_limit": 100,
  "took_ms": 1234
}
```

### Test de rejection

```bash
curl -X POST https://n8n.zapsign.com.br/webhook/sf-agent-readonly \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: <AGENT_SECRET>" \
  -d '{"sql": "DROP TABLE clientes"}'
```

Esperado: `400 { ok: false, error: "DML/DDL not allowed..." }`

---

## Workflow 2: `ch-agent-query`

### Topología

```
[Webhook: POST /ch-agent-query]
   │  body: { endpoint_id: "di|bgc|ce|global", query_variables: {...} }
   ▼
[Code: Build CH Request]
   │  output: { ok, url, body, error? }
   ▼
[IF: $json.ok === true]
   │
   ├─ TRUE ─► [HTTP Request: POST CH endpoint]
   │              │  auth = ClickHouse Agent (Basic Auth)
   │              ▼
   │         [Code: Format CH Response]
   │              ▼
   │         [Respond to Webhook: 200]
   │
   └─ FALSE ─► [Respond to Webhook: 400]
```

### Setup paso a paso

**1. Webhook node**
- HTTP Method: `POST`
- Path: `ch-agent-query`
- Response Mode: `Using 'Respond to Webhook' Node`

**2. Code: Build CH Request**
- Código: pegar `agent_ch_query_build.js`
- ⚠️ **Pegar arriba los 4 UUIDs reales** de los Query Endpoints de DI/BGC/CE/Global
  (los tenés en tu memoria `reference_ch_endpoints.md`).

**3. IF node** — idéntico al workflow 1.

**4. HTTP Request** (rama TRUE)
- Method: `POST`
- URL: `={{ $json.url }}`
- Authentication: `Predefined Credential Type` → `Basic Auth` → seleccionar `ClickHouse Agent`
- Send Body: ON, JSON, `={{ $json.body }}`
- Send Headers: `Content-Type: application/json`
- Response: Include Headers: OFF, Response Format: JSON

**5. Code: Format CH Response**
- Código: pegar `agent_ch_query_format.js`

**6. Respond to Webhook** — idéntico al workflow 1.

### Test con curl

```bash
curl -X POST https://n8n.zapsign.com.br/webhook/ch-agent-query \
  -H "Content-Type: application/json" \
  -H "X-Agent-Secret: <AGENT_SECRET>" \
  -d '{
    "endpoint_id": "di",
    "query_variables": {
      "client_id": "TCI04ff8...",
      "month_start": "2026-04-01"
    }
  }'
```

---

## Workflow 3: `sf-agent-full-execute` — DEFERIDO

Se construye **después** de que el agente productivo esté funcionando con los 2 webhooks anteriores. Razón: requiere flujo de aprobación humana vía Telegram con callback, que es más complejo de testear y no es bloqueante para validar el agente.

Cuando llegue el momento:
- Topología: `Webhook → Telegram Send (con buttons Sí/No) → Wait → IF approved → Snowflake Execute → Respond`.
- Reusa el bot BotiAlertas.
- Aprobadores: vos (jpmesa) + Ana + JD.
- Timeout de aprobación: 10 min, después se rechaza por default.

---

## Setup `AGENT_SECRET`

En n8n → Settings → Environment Variables → New:
- Key: `AGENT_SECRET`
- Value: string aleatorio de 32+ chars (generá con `openssl rand -hex 32`)

El backend del agente leerá el mismo secret de su `.env`. Si no coincide, el webhook rechaza con 401.

**Por qué este secret:** los webhooks n8n son públicos por default (cualquiera con la URL puede llamarlos). Sin secret, cualquiera podría correr SQL contra tu SF aunque sea SELECT limitado. El secret va en header, no en URL, así no se loggea en accesos.

---

## Test suite

Una vez importados y activados los 2 workflows, correr el test suite:

```bash
export AGENT_SECRET="el-mismo-string-que-pusiste-en-n8n-env-vars"
bash truora-mbr-app/n8n/agent_test_webhooks.sh
```

Cubre 12 casos: SELECT válidos, DML/DDL rechazado, multiple statements,
secret inválido, SF error real (columna inexistente), CH endpoints,
sanity check contra `IDENTITY_PROCESSES`.

Esperado: `12 pass, 0 fail`. Si algo falla, el output muestra qué test
y el response real de n8n para debugging.

---

## Errores comunes

| Error en n8n | Causa | Fix |
|---|---|---|
| `Cannot find module 'X'` en Code node | n8n free no permite `require` de npm packages | Reescribir lógica con built-ins. Para HTTP, usar `this.helpers.httpRequest`. |
| Snowflake node devuelve `null` o vacío | Query con `;` final o syntax error | El validator ya remueve `;` final — chequear logs del SF node |
| `Authentication failed` en HTTP Request CH | Credencial mal configurada | Verificar Basic Auth: user=key_id, password=key_secret (no al revés) |
| Webhook responde 500 sin body | Algún Code node tiró exception unhandled | Activar "Continue On Fail" + Switch para atrapar errors |
| Optional chaining `?.` no funciona | Runtime n8n no lo soporta | Usar `obj && obj.prop` (regla del proyecto) |
