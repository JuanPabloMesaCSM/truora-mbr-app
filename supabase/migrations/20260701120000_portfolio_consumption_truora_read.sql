-- Abre la lectura de portfolio_consumption a TODOS los @truora.com (no solo CSMs).
--
-- Motivo: el Dashboard de Cartera (/dashboard) se habilita como vista interna para
-- PMs, VPs, Project Managers, etc. — no solo el equipo CSM. SOLO el dashboard se
-- expone: el resto de la app (Report Builder, BotiAlertas, Queries) sigue gated
-- porque `clientes` queda con RLS owner-only y esas páginas dependen de eso.
--
-- Seguridad: el login es Google OAuth con hint hd:truora.com, así que el email del
-- JWT es Google-verificado, y truora.com es un Google Workspace → no existen cuentas
-- @truora.com fuera del Workspace. Por eso `email LIKE '%@truora.com'` sobre el JWT
-- es un chequeo de dominio confiable (el sufijo literal `@truora.com` no es spoofeable
-- por subdominios: `x@a.truora.com` NO matchea `%@truora.com`).
--
-- Nombres: los viewers NO leen `clientes` (RLS owner-only intacta). El cron
-- "Portfolio Consumption Sync" llena `client_name` (nombre canónico) y `csm_owner`
-- (email del CSM dueño) en cada fila, así el dashboard muestra nombres sin abrir
-- `clientes`. Ver n8n/portfolio_consumption_sync.js.

DROP POLICY IF EXISTS "Equipo CSM lee portfolio_consumption" ON public.portfolio_consumption;

CREATE POLICY "Truora team lee portfolio_consumption"
  ON public.portfolio_consumption
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') LIKE '%@truora.com'
  );

-- INSERT/UPDATE/DELETE siguen solo via service_role_key (cron). Sin policy.

-- Verificacion post-migration:
--   SELECT polname, cmd, qual FROM pg_policies WHERE tablename = 'portfolio_consumption';
-- Esperado: 1 policy SELECT "Truora team lee portfolio_consumption" con qual LIKE '%@truora.com'.
