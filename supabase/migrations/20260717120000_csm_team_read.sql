-- Fix: el dropdown "ADMIN · Ver cartera de" en /botialertas le salia VACIO a
-- jdiaz@truora.com (JD). Causa raiz: drift de RLS en la tabla `csm`.
--
-- El repo declaraba `csm` SELECT como `USING (true)` (roster legible por todo el
-- equipo), pero la base viva tenia una policy mas estricta (solo la propia fila
-- del caller, o whitelist con solo 'jpmesa') que NUNCA sumo a jdiaz.
--
-- Sintoma: JD leia TODOS los clientes/alertas (RLS de esas tablas usa
-- EXISTS(csm WHERE email=jwt) y su email SI esta en csm), por eso veia el
-- dashboard con datos; pero al leer `csm` directo solo obtenia su propia fila
-- -> realCsmList (que filtra a los admins) quedaba vacio -> dropdown sin CSMs.
--
-- Fix: garantizar una policy PERMISSIVE de SELECT `USING (true)` para
-- authenticated (como el repo original). Las policies permissive se combinan con
-- OR, asi que aunque exista otra policy con nombre distinto, esta reabre la
-- lectura del roster para todo el equipo (incluido JD).
--
-- NOTA de seguridad: `csm` = {nombre, email, activo} del equipo interno. No es
-- PII sensible; el equipo ya se ve entre si en Telegram/MBRs. No hay downgrade.
--
-- Verificacion en vivo (2026-07-17) confirmo el drift: ademas de la policy del
-- repo, existia una segunda policy permissive "CSM ve su propio registro" con
-- USING ((email = auth.email()) OR (auth.email() = 'jpmesa@truora.com')) que
-- solo whitelisteaba a jpmesa -> jdiaz nunca fue agregado. La dropeamos porque
-- queda redundante bajo USING(true) y confunde el modelo de acceso.

DROP POLICY IF EXISTS "CSM ve su propio registro" ON public.csm;
DROP POLICY IF EXISTS "Authenticated can read csm" ON public.csm;

CREATE POLICY "Authenticated can read csm" ON public.csm
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- Verificacion post-migration:
--
-- 1) Que policies SELECT existen sobre csm (deberia quedar SOLO la de arriba;
--    si aparece otra con USING distinto de 'true', dropearla):
--    SELECT policyname, cmd, permissive, qual
--    FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'csm';
--
-- 2) Como JD (o cualquier CSM) desde la app: la tabla csm debe devolver 10
--    filas -> el dropdown admin muestra 8 CSMs (10 - jdiaz admin - soporte).
-- ============================================================================
