# Dashboard Metrics Detail — workflow n8n operativo

README paso a paso para armar el workflow `Dashboard Metrics Detail` en la UI de n8n cloud (no se puede crear vía API: el plan actual de Truora rechaza `/api/v1/*` con 401, ver memoria `feedback_n8n_cloud_api_limitation.md`).

Este workflow lo dispara el frontend de la página `/dashboard` cuando el CSM elige (cliente, periodo, productos) y necesita **counters + tendencia mensual + razones de rechazo** del rango. Latencia objetivo: **30–60 s síncrono**.

---

## Resumen funcional

```
Frontend POST /webhook/dashboard-metrics-detail
   │   body: { client_id_di, client_id_bgc, client_id_ce,
   │           fecha_inicio, fecha_fin, productos[], email }
   ↓
n8n: Webhook → Set Params (Code) → 3 IFs por producto en paralelo
                                      ├── Snowflake DI
                                      ├── Snowflake BGC
                                      └── Snowflake CE
                                              │
                                       Merge (append)
                                              │
                                     Stitch (Code)
                                              │
                                     Respond to Webhook (JSON + CORS)
   │
   ↓
Frontend recibe { ok, data: { DI:{bloque:[...]}, BGC:{...}, CE:{...} } }
```

Total: **9 nodos** + 3 IFs = **12 visibles**.

---

## Pre-requisitos

- Acceso al proyecto n8n donde ya viven `BotiAlertas v2 (clean)` y `BotiAlertas Ad-hoc` (esos workflows comparten credenciales y patrón).
- Credenciales ya creadas (no hay que crearlas de cero, sólo asignarlas):
  - **Snowflake account 12** (`4mHU8cUMvycnsnu5`) — para los 3 nodos Snowflake.
  - No hace falta Telegram ni Supabase aquí (este flujo no upserta ni notifica).
- Los 3 SQL files versionados en el repo:
  - `truora-mbr-app/supabase/snowflake/dashboard_metrics_di.sql`
  - `truora-mbr-app/supabase/snowflake/dashboard_metrics_bgc.sql`
  - `truora-mbr-app/supabase/snowflake/dashboard_metrics_ce.sql`
- Los 2 Code node JS:
  - `truora-mbr-app/n8n/dashboard_metrics_set_params.js`
  - `truora-mbr-app/n8n/dashboard_metrics_stitch.js`

---

## Paso 1 — Crear workflow

1. n8n UI → **+ New Workflow**.
2. Nombre: **`Dashboard Metrics Detail`**.
3. **Settings** (engranaje arriba a la derecha):
   - **Timezone:** `America/Bogota`
   - **Save execution data:** `All` (para debug; cuando esté estable lo bajamos a `Errored only`).
   - **Save successful execution data:** `Yes`.
4. Save.

---

## Paso 2 — Webhook trigger

Add node → **Webhook**.

| Campo | Valor |
|---|---|
| HTTP Method | `POST` |
| Path | `dashboard-metrics-detail` |
| Authentication | `None` (lo cierran desde frontend con email) |
| Respond | `Using 'Respond to Webhook' Node` ← **CRÍTICO** |
| Response Code | (default) |
| Response Data | (default) |

> El `Respond: Using Respond to Webhook Node` deja al flujo decidir el momento exacto de responder. Si lo dejás en `Immediately`, el cliente recibe `200` antes de que corra Snowflake.

URL final (la mostrará al guardar): `https://truora.app.n8n.cloud/webhook/dashboard-metrics-detail`

Anotala — va a `src/components/dashboard/types.ts` como `DASHBOARD_DETAIL_WEBHOOK_URL` cuando arme el frontend.

---

## Paso 3 — Set Params (Code node)

Add node → **Code** (no "Set"; necesitamos lógica condicional).

| Campo | Valor |
|---|---|
| Mode | `Run Once for All Items` |
| Language | `JavaScript` |
| Code | **copiá el contenido completo de** [`dashboard_metrics_set_params.js`](dashboard_metrics_set_params.js) |

**Test:** ejecutá el workflow con un body de prueba (ver Paso 10). El output del nodo debe ser **un solo item** con campos `client_id_di`, `client_id_bgc`, `client_id_ce`, `fecha_inicio`, `fecha_fin`, `productos`, `email`, `run_di`, `run_bgc`, `run_ce`.

---

## Paso 4 — Tres IF nodes (gating por producto)

3 nodos `IF`, cada uno tomando el output de Set Params.

### IF — Run DI

| Campo | Valor |
|---|---|
| Conditions | Add condition |
| Type | `Boolean` |
| Value 1 | `={{ $json.run_di }}` |
| Operator | `is true` |

### IF — Run BGC

| Type | `Boolean` |
| Value 1 | `={{ $json.run_bgc }}` |
| Operator | `is true` |

### IF — Run CE

| Type | `Boolean` |
| Value 1 | `={{ $json.run_ce }}` |
| Operator | `is true` |

> Conectá la salida `true` de cada IF a su Snowflake respectivo. La salida `false` queda desconectada — esa rama simplemente no continúa.

---

## Paso 5 — Snowflake DI

Add node → **Snowflake** (nodo nativo n8n, no HTTP).

| Campo | Valor |
|---|---|
| Credential | **Snowflake account 12** (`4mHU8cUMvycnsnu5`) |
| Operation | `Execute Query` |
| Query | (ver abajo) |

**Query:** copiá el contenido de [`dashboard_metrics_di.sql`](../supabase/snowflake/dashboard_metrics_di.sql) y reemplazá los 3 placeholders por expresiones n8n:

```
{{CLIENT_ID}}    →  ={{ $('Set Params').first().json.client_id_di }}
{{FECHA_INICIO}} →  ={{ $('Set Params').first().json.fecha_inicio }}
{{FECHA_FIN}}    →  ={{ $('Set Params').first().json.fecha_fin }}
```

**Cuidado con el `=` adelante** (memoria `feedback_n8n_expression_mode.md`): n8n agrega un `=` visual al modo Expression. **NO escribas `=` vos**. Si te queda doble (`=={{ ... }}`) el placeholder no se evalúa y SF te tira `error: invalid identifier '{{CLIENT_ID}}'`.

**Verificá el output del SQL una vez antes de seguir** — debe haber filas con `BLOQUE`, `PERIODO`, `COL1..COL_EXTRA4`. Si tira `compilation error`, revisá los placeholders.

Conectá: `IF Run DI (true)` → `Snowflake DI`.

---

## Paso 6 — Snowflake BGC

Mismo nodo y credencial. Query: [`dashboard_metrics_bgc.sql`](../supabase/snowflake/dashboard_metrics_bgc.sql).

Reemplazos:
```
{{CLIENT_ID}}    →  ={{ $('Set Params').first().json.client_id_bgc }}
{{FECHA_INICIO}} →  ={{ $('Set Params').first().json.fecha_inicio }}
{{FECHA_FIN}}    →  ={{ $('Set Params').first().json.fecha_fin }}
```

Conectá: `IF Run BGC (true)` → `Snowflake BGC`.

---

## Paso 7 — Snowflake CE

Mismo nodo y credencial. Query: [`dashboard_metrics_ce.sql`](../supabase/snowflake/dashboard_metrics_ce.sql).

Reemplazos:
```
{{CLIENT_ID}}    →  ={{ $('Set Params').first().json.client_id_ce }}
{{FECHA_INICIO}} →  ={{ $('Set Params').first().json.fecha_inicio }}
{{FECHA_FIN}}    →  ={{ $('Set Params').first().json.fecha_fin }}
```

Conectá: `IF Run CE (true)` → `Snowflake CE`.

---

## Paso 8 — Merge

Add node → **Merge**.

| Campo | Valor |
|---|---|
| Mode | `Append` |
| Number of inputs | `3` |

Conectá:
- `Snowflake DI`  → Merge input 1
- `Snowflake BGC` → Merge input 2
- `Snowflake CE`  → Merge input 3

> El Merge en `Append` simplemente concatena las filas que llegan. Si una rama no corrió (porque su IF gating fue false), esa entrada queda vacía y el Merge no falla. **No usar mode `Combine` aquí** — perdería filas si no hay match.

---

## Paso 9 — Stitch (Code node)

Add node → **Code**.

| Campo | Valor |
|---|---|
| Mode | `Run Once for All Items` |
| Language | `JavaScript` |
| Code | **copiá el contenido completo de** [`dashboard_metrics_stitch.js`](dashboard_metrics_stitch.js) |

> El Stitch lee items por **nombre de nodo SF** (`$('Snowflake DI').all()` etc.), no por el orden del Merge. Mismo patrón que el `Classify` de BotiAlertas v2. El Merge funciona como sincronizador (espera a que terminen las 3 ramas) — no como fuente de datos.

> El stitch envuelve el output como `{ response: {...} }` para que el siguiente nodo pueda hacer `={{ $json.response }}` sin ambigüedad.

Conectá: `Merge` → `Stitch`.

---

## Paso 10 — Respond to Webhook

Add node → **Respond to Webhook**.

| Campo | Valor |
|---|---|
| Respond With | `JSON` |
| Response Body | `={{ $json.response }}` |
| Options → Response Headers | (ver abajo) |

**Headers obligatorios para CORS** (frontend desde `csmcenter.netlify.app`):

| Name | Value |
|---|---|
| `Access-Control-Allow-Origin` | `*` |
| `Content-Type` | `application/json` |

> Sin estos headers, el frontend recibe el JSON pero el browser bloquea el acceso por CORS y `fetch` rechaza con error de red opaco. Patrón ya validado en BotiAlertas Ad-hoc.

Conectá: `Stitch` → `Respond to Webhook`.

---

## Paso 11 — Activar y testear

1. **Save** el workflow.
2. **Toggle Active** (arriba a la derecha) → ON.
3. Test desde Postman / cURL / la consola del browser:

```bash
curl -X POST https://truora.app.n8n.cloud/webhook/dashboard-metrics-detail \
  -H 'Content-Type: application/json' \
  -d '{
    "client_id_di":  "TCIb4a69497cd6a328e720702723c18639a",
    "client_id_bgc": null,
    "client_id_ce":  null,
    "fecha_inicio":  "2026-01-01",
    "fecha_fin":     "2026-04-30",
    "productos":     ["DI"],
    "email":         "jpmesa@truora.com"
  }'
```

Esperado: respuesta JSON en ~40-50 s con shape:

```json
{
  "ok": true,
  "fecha_inicio": "2026-01-01",
  "fecha_fin": "2026-04-30",
  "productos": ["DI"],
  "productos_ejecutados": { "DI": true, "BGC": false, "CE": false },
  "data": {
    "DI": {
      "1_metricas_generales": [
        { "periodo": "2026-01-01", "col1": "360325", "col2": "172312", ... }
      ],
      "4_historico_mensual": [
        { "periodo": "2026-01-01", "col1": "111063", "col2": "53554", "col3": "48.2", ... },
        { "periodo": "2026-02-01", "col1": "80502", ... },
        ...
      ],
      "7_razones_doc":     [ ... ],
      "8_razones_rostro":  [ ... ],
      "9_abandono":        [ ... ],
      "10_declinados":     [ ... ]
    },
    "BGC": null,
    "CE": null
  }
}
```

4. Probá los 3 productos juntos:

```bash
curl ... -d '{
  "client_id_di":  "TCI...",
  "client_id_bgc": "TCI...",
  "client_id_ce":  "TCI...",
  "fecha_inicio":  "2026-01-01",
  "fecha_fin":     "2026-04-30",
  "productos":     ["DI","BGC","CE"],
  "email":         "jpmesa@truora.com"
}'
```

Las 3 ramas SF corren en paralelo, así que el tiempo total es **max(latencias)** ≈ **40-45 s** (DI suele ser el más lento). Si te queda en serie, revisá que cada IF tenga su propia salida true conectada a su Snowflake respectivo (no compartiendo nodo).

---

## Troubleshooting

### `invalid identifier '{{CLIENT_ID}}'`
El placeholder no se reemplazó. Revisá el campo Query del Snowflake node: tiene que estar en modo Expression (icono `fx` activo) y los `={{ ... }}` SIN el `=` doble. Memoria: `feedback_n8n_expression_mode.md`.

### `compilation error: error line N at position M`
SF rechazó el SQL. Mirá el output del Snowflake node en la última ejecución — n8n muestra el SQL final con placeholders ya resueltos. Copialo a un Snowflake worksheet manual y debugealo allí.

### Stitch tira `Cannot read property 'all' of undefined`
Una rama de IF se ejecutó cuando no debía. El `tryGetItems` ya tiene try/catch — si seguís viendo este error, revisá que el nombre del nodo SF en el código (`'Snowflake DI'`) coincida exactamente (case-sensitive, con espacio) con el nombre real del nodo en la UI.

### Webhook no responde / cuelga
- Verificá que el Webhook tenga `Respond: Using 'Respond to Webhook' Node`.
- Si el flujo fue editado por API, F5 al editor antes de testear (memoria `feedback_n8n_ui_cache.md`).
- En la pestaña Executions, abrí la última corrida — si quedó en running >5min, abortala y revisá cuál nodo se colgó.

### Frontend rechaza por CORS
Headers en Respond to Webhook. Sin `Access-Control-Allow-Origin: *` el browser bloquea aunque el body llegue OK.

### Latencia >90 s para clientes muy grandes
El `bloque1` de DI hace ~14 sub-queries con `SELECT COUNT(...) FROM clasif_actual`. Optimización Fase 2: refactorear a un solo `SELECT SUM(CASE WHEN ... THEN 1 ELSE 0 END) AS ...` agrupado. Bajaría a ~15-20 s. Pendiente hasta que se vea en producción.

---

## Credenciales

| Credencial | ID | Uso |
|---|---|---|
| Snowflake account 12 | `4mHU8cUMvycnsnu5` | Snowflake DI / BGC / CE |

> No requiere Supabase ni Telegram en este flujo.

---

## Diferencias vs `BotiAlertas v2 (clean)` y `BotiAlertas Ad-hoc`

| Aspecto | BotiAlertas v2 / Ad-hoc | Dashboard Metrics Detail |
|---|---|---|
| Trigger | Cron / webhook ad-hoc | Webhook (frontend) |
| Scope | TODOS los clientes (whitelist dinámica) | UN cliente puntual (cliente_id_di/bgc/ce) |
| Periodo | MTD vs PMTD (mes actual vs mes anterior) | Rango arbitrario `[fecha_inicio..fecha_fin]` con prev = mismo ancho hacia atrás |
| Output | Upsert a `boti_alertas` + Telegram | Respond JSON (sin persistencia) |
| SQL | 1 query por producto, output flat | 1 query por producto, output normalizado por bloque |
| Stitch | `classify.js` (severidad + Telegram cards) | `dashboard_metrics_stitch.js` (parser de bloques) |
| Filtros | Whitelist por TCI | Productos seleccionables por el CSM |
| Latencia | 30-90 s (cron); 30-60 s (ad-hoc) | 30-60 s |

---

## Próximos pasos (post-armado del workflow)

Cuando este flow esté validado contra los 3 ejemplos del [tmp/dashboard_validation/](../../tmp/dashboard_validation/) ya corridos en SF directo:

1. **Frontend**: `src/pages/Dashboard.tsx` + componentes en `src/components/dashboard/`. Hook `useDashboardData` que combina `boti_alertas` (instantáneo) + este webhook (on-demand).
2. **Constante** `DASHBOARD_DETAIL_WEBHOOK_URL` en `src/components/dashboard/types.ts` apuntando a la URL del webhook.
3. **Smoke** end-to-end con cliente real desde la UI.

Plan completo en `C:\Users\Administrador\.claude\plans\actualmente-tenemos-dos-dashboards-pure-hammock.md`.
