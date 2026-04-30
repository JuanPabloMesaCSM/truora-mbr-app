-- BotiAlertas: agregar flag is_adhoc para diferenciar snapshots
-- generados por el cron jueves 8 PM (oficiales) vs los disparados a pedido
-- desde la UI por admins (Ana / JD).
--
-- En la página `/botialertas`, los CSMs normales solo ven snapshots oficiales
-- (is_adhoc=false). Los admins ven todos, con badge "Personalizada" en las
-- fechas custom para diferenciarlas visualmente.
--
-- El upsert n8n del cron sigue funcionando porque is_adhoc tiene DEFAULT false.

ALTER TABLE public.boti_alertas
  ADD COLUMN IF NOT EXISTS is_adhoc boolean NOT NULL DEFAULT false;

-- Index parcial para filtrar rápidamente por modo en /botialertas
CREATE INDEX IF NOT EXISTS idx_boti_alertas_is_adhoc
  ON public.boti_alertas (is_adhoc, periodo_actual_fin DESC);

COMMENT ON COLUMN public.boti_alertas.is_adhoc IS
  'true si el snapshot fue disparado a pedido desde la UI por un admin '
  '(no por el cron semanal). Se muestra en el dropdown de semanas con '
  'badge "Personalizada" y solo es visible para admins.';
