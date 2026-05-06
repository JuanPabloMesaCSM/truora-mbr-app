-- Portfolio Consumption Sync — query del nodo Snowflake del flujo n8n homonimo.
--
-- Cron: Lunes/Miercoles/Viernes 06:00 America/Bogota.
-- Output: una fila por (mes_BOG, client_id, product) para los ultimos 3 meses
-- calendarios (incluido el actual hasta hoy), filtrada a la cartera CSM Truora.
-- Frontend agrega al rango elegido.
--
-- Cherry-pick simplificado del query Metabase del dashboard "Counters por mes",
-- removiendo PRODUCT_IDENTIFIER (decision 2026-05-06: granularidad por producto
-- es suficiente para la vista panoramica; el sub-producto se ve en el drill-down).
--
-- WHITELIST: el placeholder de abajo (linea WHERE scd.CLIENT_ID IN ...) viene
-- del Code node "Build Whitelist" — lista de TCIs activos en Supabase.clientes
-- (DI union BGC union CE). Sin esto, SF devuelve TODOS los clientes (incluso
-- los que no son cartera Truora), inflando la tabla con ruido.

-- NO joineamos TRUORA_SCHEMA.CSM_CLIENTS: esa tabla esta desactualizada
-- (CSMs antiguos como Laura Devia, Carlos Eduardo Ospina). El csm_owner
-- correcto sale de Supabase.clientes.csm_email via lookup por TCI en el
-- frontend. Lo dejamos NULL en SF.
--
-- NO usamos CONVERT_TIMEZONE sobre PERIOD: el campo se guarda como
-- 'YYYY-MM-01 00:00:00' UTC (snapshot mensual). Convertir a BOG resta 5h
-- y empuja la fecha al mes anterior; al hacer DATE_TRUNC quedaria etiquetada
-- 1 mes atras (caso real: data de abril aparecia como marzo). Como ya esta
-- alineada al inicio de mes, el truncado directo es correcto.
--
-- Filtro WHERE: tomamos los ultimos 4 meses calendarios completos (DATE_TRUNC
-- al primer dia del mes -3) para tener holgura. El frontend recorta al rango
-- elegido por el CSM.

SELECT
  DATE_TRUNC('Month', scd.PERIOD)::DATE  AS periodo_mes,
  scd.CLIENT_ID                          AS client_id,
  scd.CLIENT_NAME_DYNAMODB_TABLE         AS client_name,
  CAST(NULL AS STRING)                   AS csm_owner,
  scd.PRODUCT                            AS product,
  SUM(scd.USAGE)                         AS usage
FROM TRUORA_SCHEMA.SHARED_COUNTERS_DYNAMO AS scd
WHERE scd.PERIOD >= DATE_TRUNC('Month', DATEADD('month', -3, CURRENT_DATE))
  AND scd.CLIENT_ID IN ({{ $('Build Whitelist').first().json.tci_list }})
GROUP BY
  DATE_TRUNC('Month', scd.PERIOD),
  scd.CLIENT_ID,
  scd.CLIENT_NAME_DYNAMODB_TABLE,
  scd.PRODUCT
ORDER BY 1 DESC, scd.CLIENT_ID;
