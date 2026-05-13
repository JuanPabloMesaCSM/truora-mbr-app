# Validacion SF vs CH — Dashboard Detail Consumo Mensual

Antes de hacer flip del flujo Dashboard Metrics Detail a CH, validar que las
filas que devolveria el endpoint CH para `consumo_mensual` matchean con lo
que SF devolvia en el bloque legacy (`*_with_consumo_legacy.sql`).

## Criterio go/no-go

| Mes vs corrida | Diff aceptable |
|---|---|
| Meses cerrados (3+ meses atras, ya conciliados por Truora) | `<2%` por sub-producto |
| Ultimo mes cerrado (en ventana de correccion 1-4) | `<5%` |
| Mes corriente | CH siempre >= SF (porque SF tiene lag). NO bloqueante. |
| Sub-producto que aparece en CH pero NO en SF | Probable lag SF. Aceptable si en meses cerrados convergen. |
| Sub-producto que aparece en SF pero NO en CH | Investigar — puede ser bug del mapping. NO migrar hasta resolver. |

## Set de clientes test

Recomendado para cubrir todos los escenarios:

| TCI | Cliente | Productos | Notas |
|---|---|---|---|
| `TCI6987c4e6d65a984225fb198d91aa9f5c` | Enlace CSC | DI solo | El caso original del lag SF. Volumenes altos. |
| `TCI74cf7e31da0662c51385166e50b199c8` | Cueros Velez | DI + BGC + CE | Cubre los 3 productos. |
| `TCIe521279fda8520a9696e7f3998ab64e6` | (CE puro) | DI + BGC + CE | Volumenes bajos pero tiene inbound CE — testea derivacion. |

## Query SF (referencia — corre en consola Snowflake)

Reemplazar `<TCI>` por cada cliente. Reemplazar `<FECHA_INICIO>` / `<FECHA_FIN>`.

```sql
-- DI
SELECT
  DATE_TRUNC('Month', s.PERIOD)::DATE AS periodo_mes,
  'validations'                       AS producto_root,
  s.PRODUCT_IDENTIFIER                AS product_identifier,
  SUM(s.USAGE)                        AS usage
FROM TRUORA.TRUORA_SCHEMA.SHARED_COUNTERS_DYNAMO s
WHERE s.CLIENT_ID = '<TCI>'
  AND s.PERIOD BETWEEN '<FECHA_INICIO>' AND '<FECHA_FIN>'
  AND LOWER(s.PRODUCT) = 'validations'
GROUP BY 1, 2, 3

UNION ALL

-- BGC
SELECT
  DATE_TRUNC('Month', s.PERIOD)::DATE AS periodo_mes,
  'checks'                            AS producto_root,
  s.PRODUCT_IDENTIFIER                AS product_identifier,
  SUM(s.USAGE)                        AS usage
FROM TRUORA.TRUORA_SCHEMA.SHARED_COUNTERS_DYNAMO s
WHERE s.CLIENT_ID = '<TCI>'
  AND s.PERIOD BETWEEN '<FECHA_INICIO>' AND '<FECHA_FIN>'
  AND LOWER(s.PRODUCT) = 'checks'
GROUP BY 1, 2, 3

UNION ALL

-- CE
SELECT
  DATE_TRUNC('Month', s.PERIOD)::DATE AS periodo_mes,
  'truconnect'                        AS producto_root,
  s.PRODUCT_IDENTIFIER                AS product_identifier,
  SUM(s.USAGE)                        AS usage
FROM TRUORA.TRUORA_SCHEMA.SHARED_COUNTERS_DYNAMO s
WHERE s.CLIENT_ID = '<TCI>'
  AND s.PERIOD BETWEEN '<FECHA_INICIO>' AND '<FECHA_FIN>'
  AND LOWER(s.PRODUCT) = 'truconnect'
GROUP BY 1, 2, 3

ORDER BY 1 DESC, 2, 3;
```

## Query CH (corre en consola CH Cloud)

```sql
-- Pega aqui el contenido completo de dashboard_detail_consumo_mensual.sql
-- y en Query Variables setea:
--   client_id_di  = '<TCI>'  (o '' si no aplica)
--   client_id_bgc = '<TCI>'  (o '' si no aplica)
--   client_id_ce  = '<TCI>'  (o '' si no aplica)
--   fecha_inicio  = '<FECHA_INICIO>'
--   fecha_fin     = '<FECHA_FIN>'
```

Nota: si el cliente solo tiene 1 producto, pasar el mismo TCI solo en la var
correspondiente y `''` en las otras dos. El SQL filtra por cada uno por separado.

## Plantilla de comparacion (planilla mental)

Para cada cliente / mes / sub-producto:

```
Cliente: <CLIENTE>
Rango: <INICIO> a <FIN>

| Mes | producto_root | product_identifier | SF | CH | Diff % | OK? |
|-----|---------------|--------------------|----|----|--------|-----|
| ... |               |                    |    |    |        |     |
```

Casos que se anticipan (basado en validacion del Portfolio Sync 2026-05-11):

1. **Match perfecto** (<2%):
   - `validations / passive_liveness`
   - `validations / face_search`
   - `validations / electronic_signature`
   - `validations / phone_verification`
   - `checks / checks` (si el cliente es BGC real, ej Cueros Velez)
   - `truconnect / outbound`, `truconnect / notification`, `truconnect / inbound`

2. **Diff ~0,2% por Manual Review** (Opcion A aplicada):
   - `validations / document_validation`
   - `validations / document_manual_review`
   - `validations / face_manual_review`
   El CH emite el MR como counter aparte concatenando `_mr` al record_id. Si SF
   y CH no matchean exacto puede ser por validaciones que tuvieron mas de 1 MR
   (retries). Aceptable hasta ~5%.

3. **CH > SF en mes corriente y ultimo mes**: ES el motivo de la migracion.
   Confirma que el lag SF se elimina al ir a CH.

4. **`checks / checks` con CH < SF**: si pasa, revisar que SF no este contando
   `document-validation` interno en el bloque consumo (ese filtro lo aplicamos
   en CH via `check_type NOT IN (...)`). Caso clasico: Enlace CSC reportaba
   `checks / checks = 0` en SF para meses sin BGC, pero CH `checks_check` con
   `check_type='document-validation'` mostraba miles. CH correctamente los
   excluye con el filtro de check_type.

## Checklist pre-flip

- [ ] Endpoint CH creado en CH Cloud con el SQL `dashboard_detail_consumo_mensual.sql`
- [ ] Test curl manual del endpoint con los 3 clientes test, rango feb-mar 2026
- [ ] Comparacion SF vs CH para los 3 clientes test: feb (cerrado), mar (cerrado),
      abr (lag SF), may (corriente). Documentar diff por sub-producto.
- [ ] Para CLIENTES BGC reales (Cueros Velez): confirmar que CH check_type filter
      no remueve filas legitimas que SF si cuenta.
- [ ] Validacion en frontend (Dashboard, /dashboard) con cliente real:
      - Tomar valores del chart "Consumo Mensual por Producto" antes del cambio.
      - Hacer flip.
      - Volver a tomar los valores. Para meses cerrados debe matchear ±2%.
        Para abril/mayo debe SUBIR (en clientes activos, no bajar).
