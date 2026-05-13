# Portfolio Consumption Sync — guia n8n (migrado a ClickHouse 2026-05-11)

Flujo independiente del cron BotiAlertas. Corre Lunes / Miercoles / Viernes a las
06:00 hora Bogota y refresca la tabla `public.portfolio_consumption` que alimenta
el panel principal del Dashboard de Cartera (`/dashboard` en CSM Center).

NO toca `boti_alertas`, NO manda Telegram. Es solo: CH -> Code -> Supabase.

> **Fuente migrada de Snowflake a ClickHouse el 2026-05-11.** Motivo: CH es la
> fuente oficial de cobro desde diciembre 2025 (revertimos la decision 2026-04-14
> que ponia a SF como fuente). CH no tiene el lag del pipeline DynamoDB -> SF que
> afectaba al mes corriente y al ultimo mes cerrado. Ver skill
> `clickhouse-counters-metabase.md` para detalles del cambio.
>
> **Archivos legacy SF** se conservan con sufijo `_sf_legacy` como fallback:
> - `portfolio_consumption_whitelist_sf_legacy.js`
> - `portfolio_consumption_sync_sf_legacy.js`
> - `supabase/snowflake/portfolio_consumption_sync_sf_legacy.sql`

## Topologia (6 nodos)

```
[Schedule Trigger]
   |
   v
[Supabase: Get Clientes Whitelist]   -- cartera CSM Truora activa
   |
   v
[Code: Build Whitelist]              -- arma array de TCIs + string SQL legacy
   |
   v
[HTTP Request: CH Portfolio Endpoint] -- Query API Endpoint en CH Cloud
   |
   v
[Code: Prepare Upsert]               -- parsea JSONEachRow CH -> rows
   |
   v
[HTTP Request: Upsert portfolio_consumption]
```

## Configuracion paso a paso

### 1. Schedule Trigger

Sin cambios vs version SF.

- Mode: Custom (Cron Expression)
- Cron expression: `0 0 6 * * 1,3,5`
- Timezone: `America/Bogota`

### 2. Supabase: Get Clientes Whitelist

Sin cambios vs version SF.

- Resource: `Row` / Operation: `Get many rows`
- Table Name: `clientes`
- Return All: ON
- Filters: `activo equals true`
- Credentials: Supabase service_role.

### 3. Code: Build Whitelist

- Mode: Run Once for All Items
- Language: JavaScript
- Codigo: pegar `n8n/portfolio_consumption_whitelist.js`
- Output: 1 item con
  - `json.tci_list_array`: `["TCI...", "TCI...", ...]` (formato CH)
  - `json.tci_list`: `"'tci1','tci2',..."` (formato SF legacy, mantenido por compat)
  - `json.count`: numero de TCIs unicos

### 4. HTTP Request: CH Portfolio Endpoint (NUEVO — reemplaza Snowflake)

- **Method**: POST
- **URL**: `https://console-api.clickhouse.cloud/.api/query-endpoints/<UUID>/run`
  - Reemplazar `<UUID>` por el UUID del endpoint "Portfolio Consumption Sync"
    creado en CH Cloud (Save Query -> Share -> API Endpoint).
- **Authentication**: Generic Credential Type -> Basic Auth
  - User: keyId de la API key `Automatización Oppy permanente`
  - Password: keySecret de esa misma key
  - O reusar credential `ClickHouse Cloud Basic` si existe.
- **Send Headers** (additional):
  - `Content-Type`: `application/json`
  - `x-clickhouse-endpoint-version`: `2`
- **Send Body**: ON
- **Body Content Type**: JSON
- **Specify Body**: Using JSON
- **JSON**:
  ```
  ={{ { queryVariables: { tci_list: $('Build Whitelist').first().json.tci_list_array }, format: 'JSONEachRow' } }}
  ```
- **Response**: Format = JSON

> Si el editor n8n agrega un `=` adelante del valor en modo Expression
> (memoria `feedback_n8n_expression_mode.md`), revisar que el body no quede
> con `==` doble. Verificar haciendo "Execute node" en aislamiento.

> Latencia esperada: <10s con la whitelist completa (~95 TCIs, ~70M filas en CH
> con buen filtro de date_counted + client_id). Si supera 30s, considerar
> fragmentar en 2-3 batches.

#### Output esperado

JSONEachRow devuelve un objeto JSON por linea. n8n parsea cada linea como
un item separado o como un .data/.rows wrapped. El Code "Prepare Upsert"
maneja ambos casos.

Shape de cada fila:
```json
{
  "periodo_mes": "2026-04-01",
  "client_id":   "TCI6987...",
  "product":     "validations",
  "usage":       "37011"
}
```

> CH devuelve `usage` como string (UInt64). El Code lo castea a Number.

### 5. Code: Prepare Upsert

- Mode: Run Once for All Items
- Language: JavaScript
- Codigo: pegar `n8n/portfolio_consumption_sync.js`
- Output: 1 item con `json.rows = [...]`.
- `client_name` y `csm_owner` quedan **NULL** en cada row (CH no expone esos
  campos; frontend ya resuelve por lookup).

### 6. HTTP Request: Upsert portfolio_consumption

Sin cambios vs version SF.

- Method: POST
- URL: `https://<PROJECT_REF>.supabase.co/rest/v1/portfolio_consumption`
- Authentication: Predefined Credential Type -> Supabase API (service_role)
- Headers:
  - `Prefer`: `resolution=merge-duplicates,return=minimal`
  - `Content-Type`: `application/json`
- Body: `={{ $json.rows }}`

## Reglas billable aplicadas (referencia)

El SQL del endpoint CH replica las reglas oficiales del motor de facturacion
Truora (doc "Reglas de Calculo de Contadores de Cobro", 2026-05-08). Detalle
completo en skill `.claude/skills/clickhouse-counters-metabase.md`. Resumen:

| Bucket | Filtros |
|---|---|
| `validations` | `product LIKE 'validations_%' AND status IN ('success','failure') AND is_validation_retry = false AND validation_failure_status != 'system_error' AND validation_declined_reason NOT IN ('no_face_detected','front_document_not_found','document_not_recognized')` + counter adicional para filas con `manual_review_status='performed'` |
| `checks` | `product LIKE 'checks_%' AND status='completed' AND check_type NOT IN ('document-validation','validation')` |
| `truconnect` | `(product IN ('truconnect_outbound','truconnect_notification') AND status IN ('success','delivered','read')) OR (product='digital_identity_process' AND channel_type='inbound')` + exclusion linea demo `+17547045206` |

`FINAL` aplicado a `client_usage_records` para deduplicar version=1+version=2
del mismo `record_id`.

## Verificacion post-corrida

```sql
-- Resumen general de lo escrito por la ultima corrida
SELECT COUNT(*)             AS rows,
       COUNT(DISTINCT client_id) AS clientes,
       MAX(fecha_actualizado) AS ultima_corrida,
       MIN(periodo_mes)     AS desde,
       MAX(periodo_mes)     AS hasta
FROM public.portfolio_consumption;
```

Esperado: ~900 rows, ~100 clientes (cartera Truora), ultima_corrida = ahora.

```sql
-- Comparar con corrida anterior por bucket (sanidad)
SELECT periodo_mes, product, SUM(usage) AS total
FROM public.portfolio_consumption
WHERE periodo_mes >= DATE_TRUNC('month', NOW() - INTERVAL '4 months')
GROUP BY periodo_mes, product
ORDER BY periodo_mes DESC, product;
```

Esperado vs SF previo: el mes corriente y el ultimo mes pueden tener
**mas usage en CH** que en SF (porque SF tiene lag; CH no). Meses cerrados
deberian matchear ±2%.

## Rollback

Si el cron CH falla y hay que volver a SF:
1. En n8n, deshabilitar el nodo `HTTP Request: CH Portfolio Endpoint`.
2. Crear de nuevo el nodo `Snowflake: Portfolio Query` con el SQL de
   `portfolio_consumption_sync_sf_legacy.sql`.
3. En el Code "Prepare Upsert", reemplazar el codigo por el de
   `portfolio_consumption_sync_sf_legacy.js`.
4. El Code "Build Whitelist" actual emite ambos formatos, no hay que tocarlo.

Tiempo estimado de rollback: ~10 minutos.

## Troubleshooting

| Sintoma | Causa probable / fix |
|---|---|
| HTTP 401 contra CH | API key vencida o sin permisos. Revisar en CH Cloud Console -> API Keys. |
| HTTP 400 "Array does not start with '['" | Body JSON mal formado. El array `tci_list_array` se esta serializando como string. Verificar el JSON template del nodo HTTP. |
| Latencia > 30s | Whitelist muy grande o cobertura particion CH degradada. Fragmentar o reportar a plataforma. |
| Code Prepare devuelve 0 rows | El nodo HTTP devolvio el body en formato distinto. El Code detecta `.data`/`.rows`/item-por-fila; si ninguno matchea, revisar Response Format en el nodo HTTP. |
| `usage` queda string en la fila final | El Code ya hace `Number(usageRaw)`. Si pasa, revisar que CH no este devolviendo notacion cientifica para volumenes grandes. |
| Numeros menores que SF para abril/mayo | NO es bug — SF tenia lag. CH tiene el numero real. Confirmar con cliente o equipo facturacion. |
| Numeros del ultimo mes ajustan dia 1-4 | Truora reconcilia CH internamente entre 1-4 de cada mes. Esperar al dia 4 para reportes definitivos. |
