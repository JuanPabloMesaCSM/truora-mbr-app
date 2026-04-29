-- BotiAlertas: cambio de RLS para que TODO el equipo CSM lea TODAS las alertas.
-- Motivo: la pagina /botialertas se usa como visual de la sync semanal del equipo.
-- Necesitan ver toda la cartera; el filtro "solo mi cartera" se aplica en el frontend.
-- INSERT/UPDATE/DELETE siguen restringidos al service_role (n8n) o policies existentes.

-- ------------------------------------------------------------------------
-- 1) boti_alertas — SELECT abierto a cualquier email presente en csm
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS "CSM reads own alerts or admin reads all" ON public.boti_alertas;

CREATE POLICY "Equipo CSM lee todas las alertas" ON public.boti_alertas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.csm
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- ------------------------------------------------------------------------
-- 2) clientes — SELECT abierto a cualquier email presente en csm
--    Reemplaza solo la SELECT policy. La UPDATE policy "CSM or admin can
--    update clients" sigue intacta (filtra escrituras por csm_email).
-- ------------------------------------------------------------------------
DROP POLICY IF EXISTS "CSM sees own clients or admin sees all" ON public.clientes;

CREATE POLICY "Equipo CSM lee todos los clientes" ON public.clientes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.csm
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- Verificacion post-migration:
--   SELECT polname, cmd FROM pg_policies WHERE tablename IN ('boti_alertas','clientes');
-- Esperado:
--   boti_alertas | SELECT | "Equipo CSM lee todas las alertas"
--   clientes     | SELECT | "Equipo CSM lee todos los clientes"
--   clientes     | UPDATE | "CSM or admin can update clients"  (intacta)
