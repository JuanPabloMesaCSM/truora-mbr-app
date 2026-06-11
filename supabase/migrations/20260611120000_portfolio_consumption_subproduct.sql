-- Portfolio Consumption — desglose por SUB-PRODUCTO (product identifier).
--
-- 2026-06-11: la tabla pasa de grano (mes x cliente x producto) a
-- (mes x cliente x producto x sub_product), adoptando la query maestra de
-- counters de Truora (ver clickhouse/portfolio_subproduct_migration.sql).
-- Se agrega `sub_product` (document validation / passive liveness / truface /
-- ocr / por pais en checks / inbound-outbound-notification en CE / forms / ...)
-- y `nota` (desglose fino: manual review, message_category, check_type por pais).
--
-- La tabla es un CACHE que repuebla el cron "Portfolio Consumption Sync".
-- TRUNCATE para reconstruir con el nuevo grano (las filas viejas de 3 buckets
-- ya no aplican y no tienen sub_product para la nueva PK NOT NULL).

ALTER TABLE public.portfolio_consumption ADD COLUMN IF NOT EXISTS sub_product text;
ALTER TABLE public.portfolio_consumption ADD COLUMN IF NOT EXISTS nota        text;

-- Reconstruccion limpia del cache con el nuevo grano.
TRUNCATE TABLE public.portfolio_consumption;

-- Nueva PK incluye sub_product. sub_product NOT NULL (la query siempre lo emite;
-- las filas-total 'checks completos' / 'interacciones' se descartan en el Code node).
ALTER TABLE public.portfolio_consumption ALTER COLUMN sub_product SET DEFAULT '';
ALTER TABLE public.portfolio_consumption ALTER COLUMN sub_product SET NOT NULL;

ALTER TABLE public.portfolio_consumption DROP CONSTRAINT portfolio_consumption_pkey;
ALTER TABLE public.portfolio_consumption
  ADD CONSTRAINT portfolio_consumption_pkey
  PRIMARY KEY (periodo_mes, client_id, product, sub_product);

-- Verificacion post-migration:
--   \d public.portfolio_consumption   (deben aparecer sub_product, nota + PK de 4 cols)
--   SELECT count(*) FROM public.portfolio_consumption;  (0 tras truncate; se llena en la proxima corrida del cron)
