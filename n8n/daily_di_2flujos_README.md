# Reporte Diario DI 2 Flujos — guía para armar el flujo n8n

Workflow nuevo en **n8n self-hosted (`n8n.zapsign.com.br`)**. Corre todos los días a las **2pm
hora Bogotá**, calcula 3 métricas DI para **1 cliente + 2 flujos**, arma un resumen y lo manda por
**Telegram a los destinatarios definidos** (hoy: Sebas Durán `sduran@truora.com` + JD `jdiaz@truora.com`).

- Cliente: `TCId5981cce1073baf2a0bc311dc90220bc`
- Flujo 1: `IPFd2ce1706f9d0a34ac4699ee9cb5deae2`
- Flujo 2: `IPFdbb5de09c089403c0e20b86313abc47b`
- Métricas: (A) Conversión del proceso, (B) Conversión por usuario único, (C) Razones de rechazo doc/rostro
- Comparación: HOY (parcial, hasta las 2pm) vs AYER (D-1, día completo)

> El **PDF** (idéntico al canvas MBR) NO está en esta fase — se agrega después (requiere navegador
> headless). Esta fase entrega el **resumen en texto** listo para reenviar al cliente.

## Topología

```
[Schedule Trigger: diario 14:00 America/Bogota]
   │
   ├── [Snowflake: SF Conversión]  ─┐
   ├── [Snowflake: SF Razones]     ─┤  (3 ramas en paralelo desde el Schedule)
   └── [Supabase: Get CSM]         ─┘
                 │
        [Merge — Append, 3 inputs, wait for all]
                 │
        [Code: Armar Resumen]   <- lee los 3 nodos por nombre
                 │
        [Telegram: Send Message]  (a Sebas)
```

> El Merge solo sincroniza (espera las 3 ramas). El Code lee cada nodo por nombre
> (`$('SF Conversión').all()`, `$('SF Razones').all()`, `$('Get CSM').all()`), no via `$input` —
> así no importa el shape del Merge. Mismo patrón que BotiAlertas v2.

## Configuración paso a paso

### 1. Schedule Trigger
- Trigger Interval: **Every Day**
- Hour: `14`  ·  Minute: `0`
- Timezone: **America/Bogota** (en Settings del workflow o en el nodo)
- Cron equivalente (6 campos): `0 0 14 * * *`

### 2. Snowflake "SF Conversión"
- Operation: **Execute Query**
- SQL: **Query 1** de `supabase/snowflake/daily_di_2flujos.sql`
- Credencial: la misma Snowflake del Report Builder DI
- Input: conectar desde el Schedule (recibe 1 item → corre 1 vez)

### 3. Snowflake "SF Razones"
- Operation: **Execute Query**
- SQL: **Query 2** de `supabase/snowflake/daily_di_2flujos.sql`
- Input: conectar desde el Schedule

### 4. Supabase "Get CSM"  (nodo nativo Supabase, NO Postgres)
- Node type: **Supabase** (`n8n-nodes-base.supabase`) — mismo patrón que el Get CSM de BotiAlertas.
- Resource: **Row** · Operation: **Get Many** (getAll)
- Table: `csm`
- Return All: ON
- Must Match: **Any Filter** (OR)
- Filtros (una condición por destinatario):
  - `email` **equals** `sduran@truora.com`
  - `email` **equals** `jdiaz@truora.com`
- Devuelve 1 fila por destinatario; el Code hace fan-out (1 mensaje Telegram por CSM con
  `telegram_chat_id`). Para sumar/quitar destinatarios: agregar/quitar condiciones aquí.
- Credencial: la **Supabase API** que ya usa BotiAlertas (`fZOtoTxHemxxHeT4`, "Supabase account 88"),
  configurada con la **service_role key** (el anon no ve `csm` con RLS). No requiere password de
  Postgres ni connection pooler.
- Input: conectar desde el Schedule
- Devuelve la fila con columnas `email, nombre, telegram_chat_id, telegram_handle` (minúsculas);
  el Code node lee `telegram_chat_id` y `nombre`.

### 5. Merge
- Mode: **Append**
- Number of Inputs: `3`
- Cablear SF Conversión / SF Razones / Get CSM a las 3 entradas.

### 6. Code "Armar Resumen"
- Mode: **Run Once for All Items**
- Language: JavaScript
- Código: `n8n/daily_di_2flujos_resumen.js`
- Editar en el bloque CONFIG: `CLIENTE_NOMBRE`, `UMBRAL_CAIDA_PP` (default 10 pp) y los nombres
  legibles de `FLUJOS` (default "Flujo 1" / "Flujo 2").
- Si renombrás los nodos SF/CSM, ajustar los `$('...')` de adentro.
- Output: 1 item `{ json: { payload: { chat_id, text, ... } } }`.

### 7. Telegram "Send Message"
- Resource: Message · Operation: Send Message
- Credencial: la misma de BotiAlertas (`lGEU7pBUR5rd62Em`)
- Chat ID: `={{ $json.payload.chat_id }}`
- Text:    `={{ $json.payload.text }}`
- Parse Mode: **None** (el mensaje no usa Markdown/HTML)

## Prerrequisitos (confirmar antes de activar el cron)

1. **Sebas en `csm`**: existe su fila con `telegram_chat_id` poblado **y** ya le dio `/start` al bot
   de Telegram (si nunca inició chat con el bot, Telegram no le puede escribir primero).
2. **Email de Sebas** puesto en el nodo Get CSM (`<<EMAIL_SEBAS>>`).
3. **Umbral de alerta** (`UMBRAL_CAIDA_PP`, default 10 pp) acordado.
4. **Zona horaria del corte**: por defecto el SQL usa `CURRENT_DATE` (día de la sesión SF). Para día
   operativo Bogotá, ver la nota TZ al inicio del `.sql`.

## Cómo probar (sin spamear a Sebas)

1. En el nodo Get CSM, temporalmente filtrar por **tu propio email** (JP) para que el `chat_id`
   resuelva a tu chat.
2. **Execute Workflow** manual → verificar:
   - SF Conversión y SF Razones devuelven filas.
   - El Code arma el texto (revisar el output del Code node).
   - Telegram **llega** a tu chat.
3. Volver el Get CSM al email de Sebas y activar el Schedule.

## Notas

- **Volumen hoy vs ayer**: hoy es parcial (hasta las 2pm) y ayer es día completo → el volumen de hoy
  se ve más bajo hasta cerrar el día. La conversión % (ratio) sí es comparable. Por eso las alertas
  se basan en caída de **conversión** (pp) y en **flujo en 0 hoy**, no en caída de volumen.
- **Flujo que no aparece** en SF Conversión = 0 procesos hoy y ayer → el Code lo marca como posible
  flujo/URL caído (señal que pidió el cliente).
- No persiste a ninguna tabla (a diferencia de BotiAlertas). Es solo notificación. Si más adelante se
  quiere histórico, se agrega un upsert a Supabase como rama paralela.
