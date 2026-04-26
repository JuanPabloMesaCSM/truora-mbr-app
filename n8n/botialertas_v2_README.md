# BotiAlertas v2 — guia para armar el flujo n8n desde 0

Flujo unificado: corre una vez por semana, clasifica TODA la cartera (no solo top 20)
y deja dos salidas:

1. Mensaje Telegram personalizado por CSM con sus criticas / fuertes / crecimientos.
2. Snapshot completo en `public.boti_alertas` para alimentar la ruta `/botialertas`
   del CSM Center.

## Diferencias vs el flujo original

| Aspecto             | Original                              | v2                                                  |
|---------------------|---------------------------------------|-----------------------------------------------------|
| Whitelist           | Hardcoded por nodo                    | `clientes` Supabase (un fetch para los 3 productos) |
| CSM lookup          | `TRUORA_SCHEMA.CSM_CLIENTS` (stale)   | `csm` Supabase (email -> chat_id)                   |
| Salida              | 3 mensajes Telegram (top 20 c/u)      | 1 mensaje por CSM + upsert a `boti_alertas`         |
| Severidad           | Implicita (variacion <= -30 / >= 100) | Explicita (5 bandas) en Code node                   |
| Filtros en SQL      | LIMIT + variacion + volumen           | Ninguno — Code node decide                          |

## Topologia del workflow

```
[Cron: 0 8 * * 1, TZ America/Bogota]
   │
   ├── [Supabase: Get Clientes]    ─┐  parallel
   └── [Supabase: Get CSM]         ─┘
                │
   [Code: Prepare Whitelists]   <- consume Get Clientes
                │
                ├── [Snowflake: Snowflake DI]
                ├── [Snowflake: Snowflake BGC]
                └── [Snowflake: Snowflake CE]
                              │   (3 ramas en paralelo)
                              ▼
                       [Merge — Append, wait_for_all]
                              │
                       [Code: Classify]
                              │
                       [Switch by json.kind]
                          │              │
                  kind=row         kind=telegram
                          │              │
              [Supabase: Upsert      [Telegram: Send Message]
               boti_alertas]            (loop por item)
```

> El Merge es solo sincronizador. El Code "Classify" lee los 3 SF por nombre
> (`$('Snowflake DI').all()`, etc.), no via $input — asi no importa el shape de Merge.

## Configuracion paso a paso

### 1. Cron
- Mode: every week
- Hour: 8
- Minute: 0
- Day of Week: Monday
- Timezone: America/Bogota

### 2. Supabase: Get Clientes
- Operation: Execute Query
- SQL: pegar `supabase/snowflake/botialertas_v2_clientes.sql`
- Credentials: Supabase service_role (el anon no ve clientes con RLS)

### 3. Supabase: Get CSM
- Operation: Execute Query
- SQL:
  ```sql
  SELECT email, nombre, telegram_chat_id, telegram_handle
  FROM public.csm
  WHERE activo = true
    AND telegram_chat_id IS NOT NULL;
  ```

### 4. Code: Prepare Whitelists
- Mode: Run Once for All Items
- Language: JavaScript
- Codigo: `n8n/botialertas_v2_prepare_whitelists.js`
- Output esperado: 1 item con `di_values`, `bgc_values`, `ce_values`, `client_map`.

### 5. Snowflake DI / BGC / CE (3 nodos en paralelo)
- Operation: Execute Query
- Cada uno usa el SQL correspondiente:
  - `supabase/snowflake/botialertas_v2_di.sql`
  - `supabase/snowflake/botialertas_v2_bgc.sql`
  - `supabase/snowflake/botialertas_v2_ce.sql`
- Reemplazar el placeholder por la expresion n8n:
  - `{{DI_CLIENT_LIST_VALUES}}`  → `={{ $('Prepare Whitelists').first().json.di_values }}`
  - `{{BGC_CLIENT_LIST_VALUES}}` → `={{ $('Prepare Whitelists').first().json.bgc_values }}`
  - `{{CE_CLIENT_LIST_VALUES}}`  → `={{ $('Prepare Whitelists').first().json.ce_values }}`
- Connect: las 3 desde Prepare Whitelists.

### 6. Merge
- Mode: Append
- Number of Inputs: 3
- Wire DI / BGC / CE en orden a las 3 entradas.
- Solo sirve para esperar las 3 ramas — no se usa el output directamente.

### 7. Code: Classify
- Mode: Run Once for All Items
- Codigo: `n8n/botialertas_v2_classify.js`
- Lee por nombre: `Snowflake DI`, `Snowflake BGC`, `Snowflake CE`,
  `Prepare Whitelists`, `Get CSM`. Si renombras los nodos, ajustar adentro.

### 8. Switch by kind
- Mode: Expression
- Output 0 (rows):       `{{ $json.kind === 'row' }}`
- Output 1 (telegram):   `{{ $json.kind === 'telegram' }}`

### 9a. Supabase: Upsert boti_alertas
- Operation: Upsert
- Table: `boti_alertas`
- Conflict columns: `cliente_id, producto, periodo_actual_fin`
- Mapping: cada campo de `$json.payload.<col>`. Para `metricas_extra` usar
  `={{ JSON.stringify($json.payload.metricas_extra) }}` si el nodo no
  serializa jsonb automaticamente.

### 9b. Telegram: Send Message
- Chat ID: `={{ $json.payload.chat_id }}`
- Text:    `={{ $json.payload.text }}`
- Disable Notification: false
- Parse Mode: dejar en None — el mensaje no usa Markdown ni HTML.

## Idempotencia y reentries

- `boti_alertas` tiene UNIQUE `(cliente_id, producto, periodo_actual_fin)`.
  Re-correr el flujo el mismo dia sobreescribe la fila — seguro.
- Telegram NO es idempotente: si reejecutas, los CSMs reciben el mensaje otra vez.
  Para test manual: cambiar el `chat_id` a tu propio chat antes de probar.

## Severidad — bandas y umbrales

```
volume_floor_classify = 50      // por debajo en ambos meses -> 'estable'
volume_floor_telegram = 500     // bajo este umbral no se envia Telegram

variacion <= -50      -> 'critica'
variacion in (-50,-30] -> 'fuerte'
variacion in (-30,-10] -> 'leve'
variacion in (-10,+30) -> 'estable'
variacion >= +30      -> 'crecimiento'

prev = 0, curr >= floor -> 'crecimiento' (variacion_pct = null)
curr = 0, prev >= floor -> 'critica'     (variacion_pct = -100)
ambos < floor           -> 'estable'     (variacion_pct = null)
```

Telegram solo notifica `critica`, `fuerte`, `crecimiento`. `leve` y `estable`
quedan en la tabla pero no salen al chat.

## Notas operativas

- CSMs sin `telegram_chat_id` (Ana, Soporte) quedan fuera de Telegram pero sus
  clientes sí entran a `boti_alertas` (la ruta `/botialertas` los muestra).
- Clientes oncall (`csm_email IS NULL`) no generan Telegram — quedan en
  `boti_alertas` y los ven los admins (RLS) en `/botialertas`.
- Si una whitelist sale vacia (raro: ningun cliente activo con ese producto),
  el Code emite `('__EMPTY__')` para evitar SQL invalido. El Code de Classify
  ignora ese id por construccion.
