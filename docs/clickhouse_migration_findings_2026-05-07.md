# Migración Snowflake → ClickHouse — Discovery 2026-05-07

> Documento vivo. Se va llenando durante la sesión de discovery y queda como
> artefacto para reunión con equipo el 2026-05-08.

---

> **Actualización 2026-05-07 (post-discovery):** Confirmado por JP que la
> estrategia de plataforma es **enriquecer `client_usage_records` con más
> columnas, NO replicar tablas SF**. Toda la migración futura pasa por esta
> tabla. Eso cambia el foco del análisis: lo importante no es "qué tablas
> faltan replicar" sino "qué columnas necesitamos que pueblen — y cuáles
> ya están listas para consumir".

## 1. Contexto

**Por qué este análisis:**
La base de datos del Report Builder y del Dashboard de Cartera está
principalmente en Snowflake. ClickHouse se usa hoy solo como complemento
de **conciliación** — agregamos lo que aparece en CH (en `client_usage_records`)
y NO en Snowflake / Sheet del front. La intención de mediano plazo es
**migrar progresivamente** las consultas de SF a CH a medida que el equipo
de plataforma vaya replicando tablas. Última inspección: hace ~2 semanas
(2026-04-22 aprox).

**Restricción de la sesión:**
Solo consultas read-only. Verbos permitidos: `SELECT`, `SHOW`, `DESCRIBE`,
`EXISTS`. Nunca `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `DROP`, `TRUNCATE`,
`OPTIMIZE`, `CREATE`, `RENAME`, `ATTACH`, `DETACH`, `KILL`.

**Modo de ejecución:**
Opción C — JP corre los queries en consola CH Cloud y pega output acá.

---

## 2. Estado actual (snapshot 2026-04-22)

### 2.1 Tabla CH en uso hoy

| Tabla | Schema/DB | Uso |
|---|---|---|
| `client_usage_records` | (por confirmar en F1) | Source para los 6 Query Endpoints CH consumidos por n8n |

### 2.2 Query Endpoints CH activos

Los 4 endpoints HTTP en CH Cloud que n8n golpea hoy (memoria
`reference_ch_endpoints.md`):

| UUID | Producto | Query |
|---|---|---|
| `e0425fdf...` | DI | Q2 / Q3 (validation_flow_id, status, retries) |
| `ad039af3...` | BGC | Q4 (country, check_type, status) |
| `113d8964...` | CE | Q5 (truconnect_outbound/notification por flow) |
| `fa833763...` | Global | Q1 / Q6 (mapeo producto_csm + tendencia mensual) |

### 2.3 Tablas Snowflake que cargan los Report Builders

Las que cargan los workflows n8n hoy (skill `snowflake-queries.md`):

| Tabla SF | Producto | Uso clave |
|---|---|---|
| `IDENTITY_PROCESSES` | DI | Procesos, status, declined_reason, canceled_reason |
| `DOCUMENT_VALIDATION_HISTORY` | DI | Validations doc/face/signature, retries, motivos |
| `SENT_OUTBOUND_MESSAGES` | CE | Outbound + notifications, status (success/failure) |
| `CONVERSATIONS_STEPS` | CE | Inbounds (`TRIGGER_CHANNEL_TYPE='inbound'`), funnel OTB |
| `VW_INTERNAL_AGENT_TICKET_SUMMARY` | CE | Atendidas por agente, mediana, cerradas |
| `BACKGROUND_CHECKS_LIST` (o similar) | BGC | Checks por país y tipo, score |
| `TRUORA_SCHEMA.TENANT` | shared | Resolver `truora_client_id → company_name` |
| `IDENTITY_PROCESSES.VARIABLES` (VARIANT) | DI | Forms ad-hoc (Cueros Velez two-motors, etc.) |

### 2.4 Brechas estructurales conocidas (snapshot abril)

| Producto | Gap CH vs SF | Notas |
|---|---|---|
| DI | ~1-11% (varía por cliente) | CH no tiene users únicos ni breakdown declined vs canceled |
| BGC | ~3% | CH no tiene `score`, faltan motivos detallados |
| CE | ~2% | CH no tiene desglose agentes ni medianas — solo conteos |

**Decisión vigente** (2026-04-14): SF es la fuente oficial; CH solo para
`client_usage_records` agregado. **El propósito de hoy es ver si esa
decisión sigue válida o si ya tenemos tablas nuevas para mover algo.**

---

## 3. Discovery — Fase 1: Inventario macro

### Objetivo
Listar todas las tablas y bases de datos disponibles hoy en CH, marcar
cuáles son nuevas vs el snapshot del 2026-04-22.

### Por qué este query
- Lectura única sobre `system.tables` — más eficiente que iterar
  `SHOW TABLES` por database.
- Trae `engine` para distinguir tablas reales (`MergeTree`,
  `ReplacingMergeTree`) de vistas (`MaterializedView`, `View`) y
  distribuidas (`Distributed`).
- Trae `total_rows` y `size` → pista de cuáles tienen volumen serio
  (candidatas a uso productivo) vs tablas vacías o de prueba.

### Query ejecutado

```sql
SELECT
    database,
    name AS table_name,
    engine,
    total_rows,
    formatReadableSize(total_bytes) AS size
FROM system.tables
WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema', 'default')
ORDER BY database, name;
```

### Resultado

```
database     table_name                                    engine                       total_rows    size
production   client_usage_records                          SharedReplacingMergeTree     70.560.891    1.47 GiB
staging      client_usage_records                          SharedReplacingMergeTree         11.830    275.56 KiB
staging      client_usage_records_merge_tree               SharedMergeTree                       1    1.74 KiB
staging      client_usage_records_replacing_merge_tree     SharedReplacingMergeTree          3.892    96.83 KiB
staging      client_usage_records_yearly_partition         SharedMergeTree                     106    4.92 KiB
```

### Hallazgos

**HALLAZGO 1 — No hay tablas nuevas desde 2026-04-22.**
La situación es idéntica al snapshot previo: solo `client_usage_records`
en `production`. El equipo de plataforma **no ha replicado tablas nuevas**
de Snowflake en las últimas 2 semanas.

**HALLAZGO 2 — Solo 1 tabla productiva con volumen real.**
- `production.client_usage_records`: 70,5M filas, 1,47 GiB.
- Engine: `SharedReplacingMergeTree` → motor con dedup por clave primaria
  vía colapso de duplicados (pensado para sources que pueden re-emitir
  registros). Coherente con un pipeline streaming desde Snowflake.

**HALLAZGO 3 — `staging` parece ser laboratorio de plataforma.**
Las 4 tablas de staging tienen volúmenes triviales (1 / 106 / 3.892 / 11.830 filas)
y nombres con sufijos `_merge_tree`, `_replacing_merge_tree`,
`_yearly_partition`. Probable interpretación: el equipo está **probando
distintos motores y particionamientos** para la misma data, posiblemente
buscando optimización de query latency o reducción de costo. La presencia
de `_yearly_partition` sugiere que evalúan particionar por año (hoy, asumimos,
está particionado por mes o sin partición explícita).

**HALLAZGO 4 — La decisión de mantener SF como fuente oficial sigue válida.**
Sin tablas nuevas, no hay base para mover queries de DI / BGC / CE
detallados a CH. La conciliación actual (SF + CH agregado para gap)
permanece como arquitectura correcta.

### Decisión / próximo paso

Vamos a Fase 2 con foco doble:
1. **Inspeccionar el schema de `production.client_usage_records`** para
   ver si la **tabla misma** ganó columnas nuevas (puede haber columnas
   que no estamos consumiendo en nuestros 6 queries CH actuales).
2. **Inspeccionar `staging.client_usage_records_yearly_partition`** para
   confirmar la hipótesis de "lab de optimización" — su `PARTITION BY`
   nos dice qué evalúa plataforma.

Las otras 3 staging las saltamos: `_merge_tree` (1 fila) y
`_replacing_merge_tree` (3.892 filas) son demasiado pequeñas para aportar
señal — y si tuvieran un schema interesante, plataforma ya habría
promovido la versión definitiva a `production`.

---

## 4. Discovery — Fase 2: Schema de tablas nuevas relevantes

> Se llena después de Fase 1 con los queries `DESCRIBE` + `SELECT … LIMIT 5`
> de cada tabla candidata. Una sub-sección por tabla.

### 4.1 `production.client_usage_records` — schema actual

**Por qué inspeccionar esta tabla:**
Aunque sabíamos que existía, es **la única tabla productiva** y queremos
saber si en estas 2 semanas le agregaron columnas nuevas que aún no
consumimos en los 6 queries CH activos. Cada columna nueva puede ser un
slot de información que dejamos en SF innecesariamente.

**Query DESCRIBE:**
```sql
DESCRIBE TABLE production.client_usage_records;
```

**Query sample (1 fila reciente, formato Vertical para legibilidad):**
```sql
SELECT *
FROM production.client_usage_records
ORDER BY date_counted DESC
LIMIT 1
FORMAT Vertical;
```

**Resultado DESCRIBE:**
```
client_id                   String
billing_hub                 String
product                     LowCardinality(String)
record_id                   String
date_counted                DateTime('UTC')
status                      LowCardinality(String)
country                     LowCardinality(String)
version                     UInt32
check_type                  LowCardinality(String)
database_statuses           Array(Tuple(String, LowCardinality(String), LowCardinality(String)))
dataset_results             Array(Tuple(LowCardinality(String), LowCardinality(String)))
validation_failure_status   LowCardinality(String)
validation_flow_id          String
is_validation_retry         Bool
manual_review_status        LowCardinality(String)
waba_phone_number           String
channel_type                LowCardinality(String)
document_type               LowCardinality(String)
validation_type_alias       LowCardinality(String)
message_category            LowCardinality(String)
validation_declined_reason  LowCardinality(String)
source                      String DEFAULT ''
```

**Resultado SAMPLE (1 fila — `checks_check` de Cueros Velez 2026-05-07):**
```
client_id:                  TCI74cf7e31da0662c51385166e50b199c8
billing_hub:                ''
product:                    checks_check
record_id:                  CHKaaf5160f678450abd84953197db41a15
date_counted:               2026-05-07 23:49:21
status:                     not_started
country:                    CO
version:                    1
check_type:                 cedula
database_statuses:          []
dataset_results:            []
validation_failure_status:  ''
validation_flow_id:         ''
is_validation_retry:        false
manual_review_status:       ''
waba_phone_number:          ''
channel_type:               ''
document_type:              ''
validation_type_alias:      ''
message_category:           ''
validation_declined_reason: ''
source:                     ''
```

> Nota: la fila sample es un BGC (`checks_check`), por eso la mayoría de
> campos DI/CE-específicos vienen vacíos. Eso es **esperado** y no
> "preocupante" — significa que las columnas existen para todos los
> productos pero solo se llenan cuando aplica.

**Comparación con columnas que ya consumimos:**

| Columna | ¿Usada hoy? | En qué query |
|---|---|---|
| `client_id` | ✅ | Todos (filtro WHERE) |
| `billing_hub` | ❌ | Ninguno |
| `product` | ✅ | Todos (CASE / filtro) |
| `record_id` | 🟡 | Solo COUNT(*), no se proyecta |
| `date_counted` | ✅ | Todos (filtro WHERE / `toStartOfMonth`) |
| `status` | ✅ | Todos (countIf) |
| `country` | ✅ | Q4 (BGC por país) |
| `version` | ❌ | Ninguno |
| `check_type` | ✅ | Q4 (BGC) |
| `database_statuses` | ❌ | Ninguno |
| `dataset_results` | ❌ | Ninguno |
| `validation_failure_status` | ✅ | Q2/Q3 (DI) |
| `validation_flow_id` | ✅ | Q2/Q3/Q5 |
| `is_validation_retry` | ✅ | Q1/Q2/Q3/Q4 |
| `manual_review_status` | ❌ | Ninguno |
| `waba_phone_number` | ❌ | Ninguno |
| `channel_type` | ❌ | Ninguno |
| `document_type` | ❌ | Ninguno |
| `validation_type_alias` | ❌ | Ninguno |
| `message_category` | ❌ | Ninguno |
| `validation_declined_reason` | ❌ | Ninguno |
| `source` | ❌ | Ninguno |

**HALLAZGO 5 — La tabla tiene 11 columnas que NO consumimos.**
Y varias de ellas cubren métricas que hoy sacamos de Snowflake:

- **`validation_declined_reason`** → top razones DI declinadas. Hoy lo
  sacamos de `IDENTITY_PROCESSES.DECLINED_REASON` (skill
  `feedback_di_razones_process_level.md`). **Si CH la trae confiable
  y completa, podríamos mover los bloques DI-7 / DI-8 / DI-10 a CH.**
- **`document_type`** → split por tipo de documento (cedula, pasaporte,
  RUT, etc). Hoy es un nice-to-have que no exponemos pero el equipo
  comercial lo pide.
- **`validation_type_alias`** → probable equivalente de `type` en
  `DOCUMENT_VALIDATION_HISTORY` (face / document / signature). Si lo es,
  cubre el slide DI-3 (Doc vs Rostro).
- **`waba_phone_number`** → permitiría filtrar CE por línea WhatsApp en
  CH directamente (hoy lo hacemos via `WABA_PHONE_NUMBER` en
  `VW_INTERNAL_AGENT_TICKET_SUMMARY`).
- **`message_category`** → categoría de WhatsApp (utility / marketing /
  authentication). Hoy NO la tenemos en ningún panel; es info que el
  cliente comercial pide.
- **`channel_type`** → puede ser `inbound` / `outbound` / `notification`.
  Si lo es, sustituye el filtro `TRIGGER_CHANNEL_TYPE` que hoy hacemos
  sobre `CONVERSATIONS_STEPS` en SF.
- **`database_statuses` / `dataset_results`** → arrays de tuplas con
  detalle por dataset que se consultó (ej: en BGC, qué bases legales
  retornaron OK/error). Granularidad nueva que no exponíamos.
- **`manual_review_status`** → estado de revisión manual. Útil para
  clientes con flujo MR (manual review) — caso PayJoy y similares.
- **`billing_hub`** → probablemente identifica la unidad de cobro
  (Truora MX vs Truora CO). Útil si en algún momento queremos partir
  reportes por hub.
- **`source`** → de dónde se originó el record (API directa, dashboard,
  validation standalone…). Potencialmente **clave para resolver el
  problema de clientes DI standalone** sin ir a Snowflake.

**HALLAZGO 6 — Engine `LowCardinality(String)` confirma intención de
escalado.**
Casi todas las columnas string son `LowCardinality(String)` — un tipo de
ClickHouse que comprime fuertemente cuando hay pocos valores distintos
(< ~10K únicos). Que plataforma haya elegido ese tipo para 14 de las 22
columnas indica que **diseñaron la tabla para crecer mucho** sin perder
performance de filtro / GROUP BY. La tabla está pensada como source
analítica de largo plazo.

**Veredicto:**
- ✅ La tabla **misma** tiene mucho más jugo del que sacamos.
- 🟡 Antes de "migrar nada", hay que **validar cuáles columnas están
  pobladas confiablemente** (un sample de 1 fila no alcanza — necesitamos
  un check de cobertura por producto).

---

### 4.3 Cobertura real de las 11 columnas no consumidas — abril 2026

**Por qué este query:**
F2.1 nos dijo qué columnas existen pero no si están **pobladas
confiablemente**. Antes de proponer migración de queries SF→CH para alguna
métrica, necesitamos saber qué porcentaje de filas tiene cada columna
poblada y para qué productos. Una sola pasada por abril completo (mes
estable, 6.7M filas) nos da el universo.

**Query ejecutado:**
```sql
SELECT
    product,
    count() AS total_filas,
    countIf(validation_declined_reason != '') AS con_declined_reason,
    countIf(document_type != '')               AS con_document_type,
    countIf(validation_type_alias != '')       AS con_validation_type_alias,
    countIf(waba_phone_number != '')           AS con_waba_phone_number,
    countIf(message_category != '')            AS con_message_category,
    countIf(channel_type != '')                AS con_channel_type,
    countIf(manual_review_status != '')        AS con_manual_review,
    countIf(source != '')                      AS con_source,
    countIf(length(database_statuses) > 0)     AS con_database_statuses,
    countIf(length(dataset_results) > 0)       AS con_dataset_results
FROM production.client_usage_records
WHERE date_counted >= '2026-04-01'
  AND date_counted <  '2026-05-01'
GROUP BY product
ORDER BY total_filas DESC;
```

**Resultado (% sobre total_filas de cada producto):**

| Producto | Filas | declined | doc_type | type_alias | waba | msg_cat | channel | manual_rev | source | db_stat | dataset |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `truconnect_notification` | 2,18M | — | — | — | **100%** | **78,9%** | — | — | — | — | — |
| `checks_check` (BGC) | 1,31M | — | — | — | — | — | — | — | — | 10,9% | **97,7%** |
| `truconnect_outbound` | 996K | — | — | — | **100%** | **79,5%** | — | — | — | — | — |
| `digital_identity_process` | 836K | **0%** ⚠️ | — | — | 54,2% | — | **100%** | — | — | — | — |
| `validations_document_validation` | 370K | 0,4% | **100%** | 0,04% | — | — | — | 10,7% | — | — | — |
| `document_recognition_ocr` | 320K | — | — | — | — | — | — | — | — | — | — |
| `validations_face_recognition_passive_liveness` | 285K | 0,3% | — | **100%** | — | — | — | 11,9% | — | — | — |
| `validations_face_search` | 279K | 0,02% | — | — | — | — | — | — | — | — | — |
| `validations_phone_verification` | 47K | 0,01% | — | — | — | — | — | — | — | — | — |
| `checks_premium_collector` | 30K | — | — | 100% | — | — | — | — | — | — | — |
| `validations_email_verification` | 21K | — | — | — | — | — | — | — | — | — | — |
| `forms_response` | 21K | — | — | — | — | — | — | — | — | — | — |
| `validations_electronic_signature` | 13K | — | — | — | — | — | — | — | — | — | — |
| `validations_face_recognition` | 8,5K | 0,2% | — | **100%** | — | — | — | 8,7% | — | — | — |
| `validations_face_recognition_facematch_or_active_liveness` | 3K | — | — | **100%** | — | — | — | — | — | — | — |
| `validations_face_recognition_speech_match` | 253 | 1,2% | — | **100%** | — | — | — | 0,8% | — | — | — |
| `checks_continuous_check` | 36 | — | — | — | — | — | — | — | — | 11,1% | **100%** |
| `validations_face_recognition_government_validation` | 20 | — | — | **100%** | — | — | — | 35% | — | — | — |

**HALLAZGO 10 — `validation_declined_reason` está prácticamente vacío.**
La columna que F2.1 destacó como la más prometedora — la que iba a
sustituir `IDENTITY_PROCESSES.DECLINED_REASON` para los bloques DI-7/8/10 —
**está poblada en menos del 1% de las filas**. Para `digital_identity_process`
(los 836K procesos del mes) está en **0%**. Esto es un veto duro a mover
los bloques de razones DI a CH hoy. SF sigue siendo única fuente confiable
para `DECLINED_REASON` a nivel proceso.

**HALLAZGO 11 — Hay 4 columnas migrables con cobertura sólida:**
- `waba_phone_number` (100% en CE, 54,2% en DI procesos): permitiría filtrar
  CE per WABA directamente en CH. **Reemplaza** la lectura de
  `WABA_PHONE_NUMBER` en `VW_INTERNAL_AGENT_TICKET_SUMMARY`.
- `message_category` (~79% en CE): info nueva (utility/marketing/auth) que
  hoy NO exponemos en ningún panel. **Agrega valor**, no reemplaza.
- `channel_type` (100% en `digital_identity_process`): identifica canal de
  origen del proceso DI. Útil pero NO reemplaza el filtro
  `TRIGGER_CHANNEL_TYPE` de `CONVERSATIONS_STEPS` (eso es para CE,
  channel_type acá es para DI procesos).
- `document_type` (100% en `validations_document_validation`): split por
  tipo de documento (cedula, pasaporte, RUT). **Agrega valor** para
  reportes BGC/DI con desagregado por tipo.
- `validation_type_alias` (100% en TODAS las variantes face_recognition_*):
  permite distinguir entre las 5 sub-variantes de face recognition sin
  parsear el nombre del producto. **Reemplaza** parsing manual.

**HALLAZGO 12 — `dataset_results` para BGC es oro nuevo (97,7% en `checks_check`).**
Plataforma ya entrega un `Array(Tuple(String, String))` con detalle de
qué bases legales se consultaron y qué resultado dio cada una. Hoy NO
exponemos esta granularidad en ningún panel. **Es una oportunidad de
producto**, no migración: nuevo módulo BGC posible.

**HALLAZGO 13 — `source` está 0% poblado en TODOS los productos.**
La columna existe en el schema pero plataforma aún no la llena. Era la
candidata para resolver el problema de detección de validations
standalone (si `source` distinguiera "API standalone" de "API proceso",
sustituiría la heurística `identity_process_id IS NULL OR ''` en SF).
**Por ahora no sirve.** Pregunta para plataforma: ¿está en roadmap?

**HALLAZGO 14 — CH tiene 18 productos distintos; nuestro Q1 los mete en 4 buckets.**
Productos hoy mal-clasificados o ignorados:
- `document_recognition_ocr` (320K filas/mes) — cae en "ELSE" del Q1.
- `forms_response` (21K filas/mes) — cae en "ELSE". Relevante para forms
  de captura (caso Cueros Velez two-motors, addicolombia).
- `validations_phone_verification` (47K) y `validations_email_verification`
  (21K) — agrupados en `DI_validaciones`, técnicamente NO son DI.
- `checks_premium_collector` (30K) y `checks_continuous_check` (36) — son
  BGC variantes pero el CASE solo incluye `checks_check`.

**Implicancia operativa:** clientes BGC con uso de `premium_collector`
están viendo solo `checks_check` en sus métricas. Worth verificar caso
puntual (¿algún cliente con uso significativo de premium_collector?).

### 4.2 `staging.client_usage_records_yearly_partition` — qué experimenta plataforma

**Por qué inspeccionar esta tabla:**
El sufijo `_yearly_partition` sugiere que plataforma está evaluando
particionar la tabla productiva por año. Mirar su `PARTITION BY` nos da
señal de **hacia dónde apunta la optimización** — relevante para mañana
porque define si en el corto plazo van a invertir en performance de la
tabla actual o en replicar tablas nuevas. El `SHOW CREATE TABLE` revela
particionamiento, claves primarias y orden de inserción.

**Query SHOW CREATE TABLE:**
```sql
SHOW CREATE TABLE staging.client_usage_records_yearly_partition;
```

**Resultado:**
```sql
CREATE TABLE staging.client_usage_records_yearly_partition (
    `client_id` String,
    `billing_hub` String,
    `product` LowCardinality(String),
    `record_id` String,
    `date_counted` DateTime('UTC'),
    `status` LowCardinality(String),
    `country` LowCardinality(String),
    `check_type` LowCardinality(String),
    `database_statuses` Array(Tuple(String, LowCardinality(String), LowCardinality(String))),
    `dataset_results` Array(Tuple(LowCardinality(String), LowCardinality(String))),
    `validation_failure_status` LowCardinality(String),
    `validation_flow_id` String,
    `is_validation_retry` Bool,
    `manual_review_status` LowCardinality(String),
    `waba_phone_number` String
)
ENGINE = SharedMergeTree('/clickhouse/tables/{uuid}/{shard}', '{replica}')
PARTITION BY toYear(date_counted)
ORDER BY (product, client_id, date_counted, status)
SETTINGS index_granularity = 8192
```

**HALLAZGO 7 — Staging es un snapshot OBSOLETO de production (15 cols vs 22).**

Le faltan exactamente las 7 columnas que destacamos como más valiosas en F2.1:
`version`, `channel_type`, `document_type`, `validation_type_alias`,
`message_category`, `validation_declined_reason`, `source`.

**Implicancia clave:** plataforma **agregó esas 7 columnas a producción
después** de crear el experimento `_yearly_partition`. Eso significa que
**la migración SF→CH SÍ está avanzando**, pero **verticalmente** (más
columnas en la tabla actual) en lugar de **horizontalmente** (más tablas
nuevas). Cambia el mensaje para mañana: pasamos de "plataforma no
replicó nada" a "plataforma está enriqueciendo la tabla actual con
campos que YA podríamos consumir".

**HALLAZGO 8 — Particionamiento yearly es sub-óptimo para nuestros queries.**

`PARTITION BY toYear(date_counted)` significa que un query que filtra por
`date_counted >= '2026-04-01' AND date_counted < '2026-05-01'` (los
nuestros, que leen 1 mes) igual escanea toda la partición 2026. Si
production usa el mismo esquema, hay una optimización potencial pidiendo
particionamiento mensual.

**HALLAZGO 9 — `ORDER BY (product, client_id, date_counted, status)` está alineado con nuestro access pattern.**

Nuestros queries CH actuales filtran exactamente en ese orden
(`product` ya implícito por las CASE / IN, `client_id` siempre presente,
`date_counted` con BETWEEN, `status` con countIf). El sorting key actual
**ya nos beneficia** — no hace falta pedir cambios al equipo en esa parte.

**Hipótesis confirmada:** staging NO es exploración de schemas nuevos;
es **lab de optimización física** sobre el mismo dataset. Plataforma
está evaluando engines (`SharedMergeTree` vs `SharedReplacingMergeTree`) y
estrategias de particionamiento (yearly), pero el schema "líder" sigue
siendo el de `production`.

---

## 5. Mapa de migración SF → CH (entregable de reunión)

### 5.1 Por tabla SF — ¿la podemos mover a CH?

| Tabla SF | Cobertura CH | Veredicto | Razón |
|---|---|---|---|
| `IDENTITY_PROCESSES` (process metadata + decline reason) | Parcial | ❌ NO migrable | `validation_declined_reason` está 0% poblado en CH. SF sigue siendo única fuente para razones DI declinadas. |
| `DOCUMENT_VALIDATION_HISTORY` (validations face/doc/sig + retry) | Parcial | 🟡 Mixto | CH tiene `is_validation_retry`, `validation_failure_status`, `document_type`, `validation_type_alias` pobladas. NO tiene los motivos detallados. Se pueden mover conteos pero no razones. |
| `SENT_OUTBOUND_MESSAGES` (outbound + notif por status) | Buena | 🟡 Migrable con ajuste | CH cubre conteo y status alineado (fix 2026-04-29). Agrega `waba_phone_number` (100%) y `message_category` (~79%) que SF no tiene. **Posible mover Ce1 a CH** si validamos paridad numérica con un cliente. |
| `CONVERSATIONS_STEPS` (inbounds, funnel OTB) | Nula | ❌ NO migrable | CH no tiene `TRIGGER_CHANNEL_TYPE` ni la jerarquía de steps. SF único. |
| `VW_INTERNAL_AGENT_TICKET_SUMMARY` (atendidas/medianas) | Nula | ❌ NO migrable | CH no tiene tickets ni medianas de respuesta/duración. SF único. |
| `BACKGROUND_CHECKS_LIST` (BGC detalle por país y check) | Buena + extra | 🟡 Migrable + agrega valor | CH cubre `country`, `check_type`, `status`, `is_validation_retry`. **Y agrega `dataset_results` (97,7%) y `database_statuses` (10,9%) que SF expone parcial.** Posible nuevo módulo BGC con detalle por dataset. |
| `IDENTITY_PROCESSES.VARIABLES` (VARIANT JSON, forms ad-hoc) | Nula | ❌ NO migrable | CH no expone JSON de variables del flujo. SF único. |

### 5.2 Por columna nueva en CH — ¿qué podemos aprovechar HOY?

| Columna CH | Cobertura | Acción recomendada | Esfuerzo |
|---|---|---|---|
| `dataset_results` | 97,7% (BGC) | **Nuevo módulo BGC** que muestre desglose por base legal | M (1-2 sprints) |
| `waba_phone_number` | 100% (CE) | Mover filtro WABA de SF a CH para Ce4/Ce5 | S (~3 días) |
| `message_category` | 79% (CE) | **Nueva métrica**: distribución utility/marketing/auth en CE | S (~2 días) |
| `document_type` | 100% (DI doc) | **Nueva métrica**: split por tipo de documento (cedula/pasaporte) | S (~2 días) |
| `validation_type_alias` | 100% (face_*) | Distinguir 5 sub-variantes de face_recognition sin parsear nombre | XS (~1 día) |
| `database_statuses` | 11% (BGC) | Cobertura baja, esperar a que plataforma la pueble más | — |
| `manual_review_status` | 11% (DI face/doc) | Cobertura baja para módulo dedicado, valor limitado | — |
| `version` | (no medido) | Metadata interna, sin uso de negocio | — |
| `channel_type` | 100% (DI procesos) | Distinguir canal de origen DI (web/app/whatsapp) | S |
| `validation_declined_reason` | <1% (universal) | **No usar.** Confirmar con plataforma si se va a poblar | — |
| `source` | 0% (universal) | **No usar.** Confirmar con plataforma si está en roadmap | — |

### 5.3 Recomendación priorizada para sprint corto

1. **Auditar Q1 (mapeo de productos)** — agregar `checks_premium_collector`,
   `checks_continuous_check` al bucket BGC; clarificar `forms_response`,
   `document_recognition_ocr`, `phone_verification`, `email_verification`.
   Hoy estamos infrarreportando volumen para algunos clientes. **Esfuerzo
   XS, impacto inmediato.**

2. **Validar paridad CE → CH para Ce1** con un cliente piloto (GDC marzo
   ya validado). Si los números matchean, mover Ce1 a CH y liberar la
   query SF más pesada del workflow `Report Builder CE`.

3. **Diseñar módulo BGC con `dataset_results`** — info nueva que el
   equipo comercial pide (qué bases legales fallaron y por qué). No es
   migración, es feature.

4. **Esperar respuesta plataforma** sobre `validation_declined_reason` y
   `source` antes de comprometer trabajo de migración DI.

---

## 6. Preguntas pendientes para el equipo de plataforma (mañana)

> Acumulamos preguntas concretas durante el discovery para llevarlas a
> la reunión.

- [ ] ¿Hay roadmap publicado de tablas que se van a replicar a CH?
- [ ] ¿Cuál es la latencia promedio de réplica SF → CH para las tablas
      ya replicadas?
- [ ] ¿Tablas con `MaterializedView` engine están refrescadas en tiempo
      real o por batch?
### Bloqueantes para migración (alta prioridad)

- [ ] **¿Por qué `validation_declined_reason` está 0% en `digital_identity_process`?**
      Es la columna que más impactaría a CSM (mover bloques DI-7/8/10 a CH).
      ¿Está en roadmap poblarla? ¿En qué plazo? ¿Aplicará retroactivamente
      o solo desde cierta fecha?
- [ ] **¿Por qué `source` está 0% en TODOS los productos?**
      Sería clave para distinguir validations standalone vs proceso, lo cual
      hoy resolvemos con heurística en SF. ¿Plan de implementación?
- [ ] **¿`dataset_results` (97,7% en BGC) qué semántica tiene?**
      ¿Cuál es la convención de los `Tuple(String, String)`? ¿Hay un diccionario
      de claves canónicas que podamos consumir para construir un panel?

### Decisión de roadmap (media prioridad)

- [ ] **¿En qué orden van a replicar las tablas SF a CH?**
      Necesitamos `IDENTITY_PROCESSES` (con DECLINED_REASON) y
      `DOCUMENT_VALIDATION_HISTORY` para mover Report Builder DI;
      `SENT_OUTBOUND_MESSAGES` y `CONVERSATIONS_STEPS` para CE;
      `BACKGROUND_CHECKS_LIST` con motivos para BGC.
- [ ] **¿La estrategia es replicar tablas o seguir enriqueciendo
      `client_usage_records` con más columnas?**
      Saber esto cambia nuestro plan de migración (queries específicas vs
      query genérica con más columnas).
- [ ] **¿Qué evalúan en `staging` con el experimento `_yearly_partition`?**
      ¿Costo de almacenamiento, latencia de query, retención? Y ese
      schema OBSOLETO (15 cols vs 22) — ¿está en plan deprecarlo?

### Observaciones técnicas (baja prioridad)

- [ ] **¿`production.client_usage_records` está particionada por mes o
      por año?** Con 70M filas y queries que leen 1 mes, particionamiento
      mensual sería más eficiente.
- [ ] **¿`validation_type_alias` se va a poblar para `validations_document_validation`
      y `validations_face_search`?** Hoy solo está al 100% en `face_recognition_*`.
- [ ] **¿`message_category` (79% en CE) por qué no es 100%?** ¿Los 21%
      restantes son mensajes legacy o un caso de uso específico?

---

## 7. Próximos pasos post-reunión

### NIVEL 1 — Mejoras inmediatas a queries CH existentes (XS, ~1 día total)

Sin migrar nada de SF, con solo modificar los 6 endpoints actuales:

- **Q1 + Q6** — Corregir CASE de mapeo `producto_csm`. Agregar
  `checks_premium_collector` y `checks_continuous_check` a BGC; clarificar
  `forms_response` y `document_recognition_ocr` (hoy en "ELSE"). Resuelve
  infrarreporte de volumen para 5+ clientes en `boti_alertas`.
- **Q2/Q3** — Agregar `channel_type` y `validation_type_alias` al GROUP BY.
  Habilita split DI por canal y distinción entre las 5 sub-variantes de
  face_recognition sin parsear nombre.
- **Q5** — Agregar `waba_phone_number` y `message_category`. Permite
  filtrar CE per WABA directo en CH (sustituyendo cruce con SF) y nueva
  métrica de distribución utility/marketing/auth.

### NIVEL 2 — Migración parcial SF → CH (S, ~1-2 sprints)

Queries que hoy están en SF y se pueden mover con las columnas nuevas:

1. **Ce1 (consumo total CE)** — pilotar con GDC marzo (ya validado), si
   paridad <0,5% mover a CH. Libera la query SF más pesada del workflow
   `Report Builder CE`.
2. **Filtro WABA per-módulo Ce4/Ce5** — mover `WHERE WABA_PHONE_NUMBER IN (...)`
   de SF a CH. Mantener agentes/medianas en SF (no migrable).
3. **Split DI por `document_type`** — migrar el desglose de tipo de
   documento de `DOCUMENT_VALIDATION_HISTORY` a CH.

### NIVEL 3 — Nuevos módulos/features (M, valor agregado)

No es migración, son features nuevas que las columnas habilitan:

1. **Slide CE: distribución por `message_category`** (utility/marketing/auth).
2. **Módulo BGC: desglose por `dataset_results`** — qué bases legales se
   consultaron y qué resultado dio cada una. **Pendiente confirmar
   semántica de los Tuple con plataforma.**
3. **Slide DI: split por `document_type`** (cedula/pasaporte/RUT...).
4. **Slide DI: split por `channel_type`** (web/app/whatsapp...).

### Acciones independientes de la respuesta de plataforma

1. **Sprint XS — Auditar Q1 (mapeo producto_csm).** Agregar
   `checks_premium_collector` y `checks_continuous_check` al bucket BGC.
   Decidir si `forms_response` y `document_recognition_ocr` van a un
   bucket propio o se mantienen en "ELSE". Validar impacto en
   `boti_alertas` para clientes con uso de premium_collector.

2. **Sprint S — Pilotar `waba_phone_number` en CH para Ce4/Ce5.**
   Validar paridad numérica con SF en un cliente CE de volumen alto
   (PayJoy / GDC). Si matchea, sustituir el filtro WABA del workflow
   `Report Builder CE`.

3. **Sprint S — Nueva métrica CE `message_category`.** Distribución
   utility/marketing/auth por cliente. Útil para comerciales en MBR.

4. **Sprint M — Diseño módulo BGC `dataset_results`.** Validar semántica
   con plataforma (pregunta abierta), diseñar slide nuevo en canvas MBR,
   exponer en Report Builder BGC.

### Acciones que dependen de plataforma

- Si confirman que **van a poblar `validation_declined_reason`**: planear
  migración progresiva DI-7/8/10 a CH con dual-source durante 1 mes
  para validar paridad antes de cortar SF.
- Si confirman que **van a poblar `source`**: migrar la detección de
  standalone validations de SF (heurística) a CH (campo explícito).
  Simplifica Opción C documentada en `standalone-validations-mbr.md`.
- Si confirman que **van a replicar tablas SF**: definir orden de
  prioridad junto con plataforma (sugerencia: `IDENTITY_PROCESSES` con
  DECLINED_REASON primero — es el bloqueo mayor).

---

## 8. Log cronológico de la sesión

| Hora | Acción |
|---|---|
| 2026-05-07 — | Doc creado, contexto cargado, Fase 1 query preparado |
| 2026-05-07 — | F1 ejecutado. Sin tablas nuevas. Solo `production.client_usage_records` (70.5M filas) productiva + 4 staging exploratorias. F2 enfocado en schema de la tabla productiva + experimento `_yearly_partition` |
| 2026-05-07 — | F2.1+F2.2 ejecutados. Hallazgo grande: 11 columnas no consumidas, varias cubren métricas que hoy sacamos de SF (`validation_declined_reason`, `document_type`, `waba_phone_number`, `message_category`, `channel_type`, `source`). Próximo: validar cobertura real (cuántas filas las tienen pobladas por producto) antes de proponer migración. |
| 2026-05-07 — | F2.3 (`SHOW CREATE TABLE` staging yearly_partition) ejecutado. Staging tiene SOLO 15 columnas vs 22 de production — le faltan las 7 columnas más valiosas que destacamos en F2.1. Plataforma está evolucionando el schema verticalmente (más columnas). Próximo: query de cobertura por producto sobre production para ver cuáles columnas nuevas están confiablemente pobladas. |
| 2026-05-07 — | F2.4 (cobertura por producto sobre abril 2026 production) ejecutado. Hallazgos clave: `validation_declined_reason` 0% en procesos DI (NO migrable, veto fuerte), `source` 0% universal, `dataset_results` 97,7% en BGC (oportunidad de feature nuevo), 4 columnas migrables con cobertura sólida (waba_phone_number, message_category, document_type, validation_type_alias), 18 productos en CH vs 4 buckets actuales en Q1 (mal-clasificación detectada). Mapa SF→CH y preguntas para plataforma actualizados. Doc cerrado para reunión. |
| 2026-05-07 — | JP confirma estrategia plataforma: enriquecer `client_usage_records`, NO replicar tablas. Triangulación 6 endpoints CH × hallazgos × queries SF actuales agregada en sección 7 con 3 niveles de oportunidad: Nivel 1 (mejoras XS a CH actuales), Nivel 2 (migración parcial SF→CH), Nivel 3 (módulos nuevos). Top 3 pedidos a plataforma definidos. |
