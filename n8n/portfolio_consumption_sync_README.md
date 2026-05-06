# Portfolio Consumption Sync — guia para armar el flujo n8n desde 0

Flujo independiente del cron BotiAlertas. Corre Lunes / Miercoles / Viernes a las
06:00 hora Bogota y refresca la tabla `public.portfolio_consumption` que alimenta
el panel principal del Dashboard de Cartera (`/dashboard` en CSM Center).

NO toca `boti_alertas`, NO manda Telegram. Es solo: SF -> Code -> Supabase.

## Topologia (6 nodos)

```
[Schedule Trigger]
   |
   v
[Supabase: Get Clientes Whitelist]   -- cartera CSM Truora activa
   |
   v
[Code: Build Whitelist]              -- arma string "'tci1','tci2',..."
   |
   v
[Snowflake: Portfolio Query]         -- SF filtrado por whitelist
   |
   v
[Code: Prepare Upsert]
   |
   v
[HTTP Request: Upsert portfolio_consumption]
```

> Sin la whitelist, SF devuelve TODA la base de SHARED_COUNTERS_DYNAMO
> (clientes huerfanos, equipos internos Truora, demo accounts) y la tabla
> portfolio_consumption se infla con ruido. La whitelist filtra a los TCIs
> de Supabase.clientes activos, que es la cartera real CSM Center.

## Configuracion paso a paso

### 1. Schedule Trigger
- Mode: Custom (Cron Expression)
- Cron expression: `0 0 6 * * 1,3,5`
  - n8n usa formato de 6 campos: `[Second] [Minute] [Hour] [DayOfMonth] [Month] [DayOfWeek]`.
  - Equivale a Lunes / Miercoles / Viernes a las 6:00:00 AM.
- Timezone: `America/Bogota`

> Alternativa sin cron expression: cambiar Trigger Interval a "Days" / "Weekday"
> y marcar Mon, Wed, Fri + hora 6:00. Mismo resultado, menos margen de error.

### 2. Supabase: Get Clientes Whitelist
- Resource: `Row`
- Operation: `Get many rows` (las versiones recientes del nodo Supabase ya no
  tienen "Execute Query" — Get many rows hace lo equivalente).
- Table Name: `clientes`
- Return All: ON (sin esto el nodo limita a 50 filas)
- Filters: `activo equals true`
- Credentials: Supabase service_role (mismo que usa BotiAlertas v2)
- Output: ~100 items, uno por cliente activo, con todas las columnas de
  `clientes` (incluidas `client_id_di`, `client_id_bgc`, `client_id_ce`).

> Si Get many rows no funciona en tu plan / version, fallback con HTTP Request
> a PostgREST: `GET https://<PROJECT>.supabase.co/rest/v1/clientes?activo=eq.true&select=client_id_di,client_id_bgc,client_id_ce,nombre,csm_email`
> con auth Supabase API y header `Prefer: count=exact`.

### 3. Code: Build Whitelist
- Mode: Run Once for All Items
- Language: JavaScript
- Codigo: pegar `n8n/portfolio_consumption_whitelist.js`
- Output: 1 item con `json.tci_list = "'tci1','tci2',..."` y `json.count`.

### 4. Snowflake: Portfolio Query
- Operation: Execute Query
- Credentials: la misma SF de BotiAlertas v2 (database/schema ya configurados)
- SQL: pegar `supabase/snowflake/portfolio_consumption_sync.sql`
  - El query inyecta el placeholder `{{ $('Build Whitelist').first().json.tci_list }}`
    en `WHERE scd.CLIENT_ID IN (...)`. Asegurate de NO pre-resolverlo: dejarlo tal
    cual en el editor para que n8n lo evalue al ejecutar.
- Output expected: ~900 items (uppercase keys: PERIODO_MES, CLIENT_ID, CLIENT_NAME,
  CSM_OWNER, PRODUCT, USAGE) — limitado a la cartera CSM Truora.

### 5. Code: Prepare Upsert
- Mode: Run Once for All Items
- Language: JavaScript
- Codigo: pegar `n8n/portfolio_consumption_sync.js`
- Output: 1 item con `json.rows = [...]` listo para upsert batch.

### 6. HTTP Request: Upsert portfolio_consumption
- Method: POST
- URL: `https://<PROJECT_REF>.supabase.co/rest/v1/portfolio_consumption`
- Authentication: Predefined Credential Type -> Supabase API
  - Reusar la misma credencial Supabase service_role que usa BotiAlertas v2 HTTP upsert.
- Send Headers (additional):
  - `Prefer`: `resolution=merge-duplicates,return=minimal`
  - `Content-Type`: `application/json`
- Body Content Type: JSON
- Specify Body: Using JSON
- JSON: `={{ $json.rows }}`

> El nodo Supabase nativo no se usa por la misma razon que en BotiAlertas v2:
> v1 mete todo en un INSERT batch y un solo conflict aborta. PostgREST con
> `Prefer: resolution=merge-duplicates` hace upsert real fila por fila.

## Tabla destino — esquema

`public.portfolio_consumption`:

| Columna            | Tipo         | Notas                              |
|--------------------|--------------|-------------------------------------|
| periodo_mes        | date         | Primer dia del mes BOG (PK)         |
| client_id          | text         | TCI directo de SF (PK)              |
| client_name        | text         | de SHARED_COUNTERS_DYNAMO           |
| csm_owner          | text         | de CSM_CLIENTS.OWNER (email truora) |
| product            | text         | validations / checks / outbound...  |
| usage              | bigint       | SUM(USAGE) del mes                  |
| fecha_actualizado  | timestamptz  | now() del cron                      |

PK compuesta: `(periodo_mes, client_id, product)`. El upsert usa esa PK como
conflict target (PostgREST lo detecta automaticamente con `merge-duplicates`).

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
-- Confirmar que solo hay clientes de la cartera Truora
SELECT pc.client_id, pc.client_name, pc.csm_owner
FROM public.portfolio_consumption pc
LEFT JOIN public.clientes c
  ON c.client_id_di  = pc.client_id
  OR c.client_id_bgc = pc.client_id
  OR c.client_id_ce  = pc.client_id
WHERE c.id IS NULL          -- huerfanos: NO deberian existir
LIMIT 20;
```

Si la 2da query devuelve 0 filas, la whitelist funciono correctamente.

> El nodo HTTP upsert devuelve `[{}]` por el header `Prefer: return=minimal`
> — eso es OK, no significa que escribio cero. Para confirmar, correr la
> query de arriba contra Supabase. Si querés ver las filas inline en el
> output del nodo HTTP, cambiar el header a `return=representation`
> temporalmente.

## Troubleshooting

| Sintoma                                 | Causa probable / fix                                                |
|-----------------------------------------|---------------------------------------------------------------------|
| Code node devuelve 0 rows               | SF nodo devolvio keys lowercase. El Code ya es defensivo, revisar SF.|
| HTTP 401 en upsert                      | Credencial Supabase no es service_role. Confirmar.                  |
| HTTP 409 conflict / duplicate key       | Falta el Prefer header. Verificar que PostgREST lo lee.             |
| Faltan clientes en la tabla             | El cliente no existe en SHARED_COUNTERS_DYNAMO ese mes (sin consumo).|
| csm_owner NULL para varios clientes     | El cliente no esta en CSM_CLIENTS. Coordinar con data team.         |

## Frecuencia y costo

3 corridas/semana, ~900 rows cada una -> ~12k upserts/mes. Despreciable contra
los limites de Supabase Free. Costo SF: 1 query agregada de ~5-10s por corrida,
trivial dentro del warehouse compartido.

Si despues queremos sensacion "live", subir a diario (`0 6 * * *`) sigue siendo
seguro. Mas frecuente que diario empieza a ser ruido — el dato base en
SHARED_COUNTERS_DYNAMO se actualiza por el pipeline DynamoDB->SF, que tiene su
propia frecuencia (verificar con `MAX(LAST_ALTERED)` en `INFORMATION_SCHEMA.TABLES`).
