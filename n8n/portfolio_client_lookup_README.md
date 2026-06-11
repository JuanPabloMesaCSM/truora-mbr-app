# Portfolio Client Lookup — guia n8n (webhook on-demand, 2026-06-11)

Flujo NUEVO, independiente del cron "Portfolio Consumption Sync". Permite
consultar el consumo por sub-producto de **CUALQUIER Client ID** (aunque NO
este en la cartera del CSM) de forma **efimera**: una sola consulta al endpoint
CH, devuelve el resultado y **no guarda nada** en Supabase.

Lo consume el panel principal del Dashboard de Cartera (`/dashboard`): la barra
"Consultar cualquier Client ID" arriba de la tabla portfolio. Cuando es un TCI
fuera de cartera, la misma tabla (PortfolioTable) muestra el resultado en modo
read-only (sin drill-down).

> **Finalidad:** muchas veces preguntan por clientes que no manejas; ver rapido
> que consumen da contexto de que hacen, sin tener que cargarlos a la base.

## Por que webhook (y no llamar a CH desde el frontend)

Las credenciales Basic Auth del endpoint CH no pueden ir en el bundle publico
(misma regla que el proxy de Oppy / la publishable key de Supabase). El front
pega a este webhook n8n, que tiene las credenciales del lado servidor.

## Topologia (4 nodos)

```
[Webhook: portfolio-client-lookup]   -- POST { client_id }
   |
   v
[Code: Build CH Body]                -- extrae client_id -> CSV para el param
   |
   v
[HTTP Request: CH Endpoint 69e67323] -- MISMO endpoint del cron (ya a 12 meses)
   |
   v
[Code: Prepare Rows]                  -- REUSA portfolio_consumption_sync.js
   |
   v
[Respond to Webhook]                  -- devuelve { rows: [...] } (First Incoming Item)
```

(Respond to Webhook puede ir como 5to nodo o configurarse el Webhook en modo
"Using Respond to Webhook node".)

## Configuracion paso a paso

### 1. Webhook

- HTTP Method: **POST**
- Path: `portfolio-client-lookup`
- Respond: **Using 'Respond to Webhook' node**
- **CORS** — Allowed Origins (CORS): `*` (el front pega desde Netlify y desde
  localhost en dev). Sin esto el navegador bloquea la respuesta.

URL resultante: `https://n8n.zapsign.com.br/webhook/portfolio-client-lookup`
(coincide con `PORTFOLIO_LOOKUP_WEBHOOK_URL` en `src/components/dashboard/types.ts`).

### 2. Code: Build CH Body

- Mode: Run Once for All Items
- Language: JavaScript
- Codigo: pegar `n8n/portfolio_client_lookup_build_body.js`
- Output: 1 item con `json.client_id_csv` (un solo TCI, o `'__none__'` si vino vacio).

### 3. HTTP Request: CH Endpoint (el MISMO del cron, 69e67323 — ahora 12 meses)

> El lookup usa el **mismo endpoint que el cron Portfolio Sync** (`69e67323`).
> Decision 2026-06-11: en vez de crear un endpoint aparte, se subio el query
> general de 3 a 12 meses (1 linea: `date_sub(MONTH, 12, today())`). Asi el cron
> guarda el año completo en la cartera Y el lookup (1 cliente) lo hereda gratis.
> **No hay endpoint dedicado.** Para que el cambio surta efecto en el endpoint
> hay que **Save** la query (correr en el editor NO actualiza el endpoint —
> memoria `feedback_ch_endpoint_editor_vs_saved`).

- **Method**: POST
- **URL**: `https://console-api.clickhouse.cloud/.api/query-endpoints/69e67323-9847-4dc4-8759-a244f09d6e9e/run`
- **Authentication**: Generic Credential Type -> Basic Auth (key `Automatización Oppy permanente`)
  - o reusar el mismo credential del cron Portfolio Sync.
- **Send Headers**:
  - `Content-Type`: `application/json`
  - `x-clickhouse-endpoint-version`: `2`
- **Send Body**: ON / Content Type: JSON / Specify Body: Using JSON
- **JSON**:
  ```
  ={{ { queryVariables: { client_id: $('Build CH Body').first().json.client_id_csv }, format: 'JSONEachRow' } }}
  ```
- **Response**: Format = JSON

> Latencia esperada del lookup: 2-6s incluso con 12 meses — es UN solo cliente
> (filtro client_id + date_counted muy selectivo). El rango ancho solo pesa en el
> cron (95 clientes a la vez); medir esa corrida con "Execute Workflow".

### 4. Code: Prepare Rows

- Mode: Run Once for All Items
- Language: JavaScript
- Codigo: **pegar el MISMO `n8n/portfolio_consumption_sync.js`** que usa el cron.
  Hace exactamente lo que necesitamos: parsea el `data` string JSONEachRow,
  descarta las filas-total (`checks completos`/`interacciones`), dedup por PK
  (premium por pais) y devuelve `{ rows: [...] }`.
- No hay que tocar nada: aunque el campo se llame "Prepare Upsert" en el cron,
  aca lo renombramos a "Prepare Rows" pero el codigo es identico (single source
  of truth del parser).

### 5. Respond to Webhook

- Respond With: **First Incoming Item**  (devuelve el `json` del Code anterior:
  `{ rows, count, ch_rows_parsed, ... }`).
- **Response Headers** (si CORS no se hereda del Webhook node): agregar
  `Access-Control-Allow-Origin: *`.

> No uses "JSON" con una expresion objeto pelada (`={{ $json }}`) — da
> `[object Object]` (memoria `feedback_n8n_http_body_json_bug`). "First Incoming
> Item" es lo correcto aca.

## Contrato front <-> webhook

Request (POST):
```json
{ "client_id": "TCIb4a69497cd6a328e720702723c18639a" }
```

Response:
```json
{
  "rows": [
    { "periodo_mes": "2026-04-01", "client_id": "TCI...", "product": "validations",
      "sub_product": "passive liveness", "usage": "59635", "nota": "face - manual review: 0" },
    ...
  ],
  "count": 23
}
```

El frontend (`useClientLookup.ts`) agrega TODAS las filas devueltas por
(client_id, product, sub_product) — NO filtra por el period picker del Dashboard
(ese es solo para la cartera) — y las renderiza con el mismo PortfolioTable en
modo read-only (sin drill-down, sin atenuar). El subtitulo muestra el rango real
cubierto por la data (`coveredFrom -> coveredTo`).

## Notas

- **Efimero**: este flujo NO escribe en `portfolio_consumption`. Es solo
  CH -> Code -> Respond. Nada se persiste.
- **Ventana = ultimo año (12 meses)**: el query general (`69e67323`) trae
  `date_sub(MONTH, 12, today())` (desde junio 2025 con la fecha actual). El cron
  de cartera Y el lookup comparten ESE endpoint — un solo query, sin duplicado.
- **Mismo endpoint que el cron**: si la query general cambia (reglas billable,
  productos nuevos, ventana), el lookup hereda el cambio automaticamente. Cero
  drift: hay una sola fuente.
- **Reglas billable**: las mismas del cron (ver `clickhouse-counters-metabase.md`).

## Troubleshooting

| Sintoma | Causa / fix |
|---|---|
| Front: "El webhook respondio HTTP 404" | El webhook no esta activo o el path no es `portfolio-client-lookup`. Activar el workflow. |
| Front: CORS error en consola | Falta `Access-Control-Allow-Origin: *` en el Webhook node (CORS) y/o en Respond to Webhook. |
| Respuesta `{ rows: [] }` para un TCI valido | El TCI no consumio en el ultimo año, o el param llego como `'__none__'` (body sin client_id). Revisar el Code "Build CH Body" input. |
| Solo trae 3 meses (no 12) | El HTTP node sigue apuntando a `69e67323` (el del cron). Cambiar la URL al UUID del endpoint dedicado `portfolio_client_lookup_12m`. |
| `[object Object]` en la respuesta | Respond to Webhook mal configurado: usar "First Incoming Item", no expresion objeto. |
| 0 filas siempre | El HTTP devolvio el body en otro formato. El parser maneja `data` string / `.data` array / item-por-fila; revisar Response Format = JSON en el HTTP node. |
