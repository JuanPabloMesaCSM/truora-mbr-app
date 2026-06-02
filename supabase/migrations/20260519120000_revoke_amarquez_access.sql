-- Revocar acceso de amarquez@truora.com (Ana Marquez) al CSM Center y BotiAlertas.
-- Ana ya no trabaja en la compania.
--
-- Acciones:
--   1. ALTER POLICY en las 4 policies que TODAVIA tienen su email hardcoded.
--   2. DELETE filas duplicadas en `clientes` con csm_email = amarquez (eran
--      duplicados RLS-admin, no clientes reales).
--   3. DELETE fila en `csm` (libera el slot del equipo y al borrarla,
--      pierde acceso a las policies team-wide que chequean EXISTS csm).
--
-- Policies que YA NO la tenian (cleanup previo, NO se tocan):
--   - clientes.SELECT       — reemplazada por "Equipo CSM lee todos los clientes" (team_visibility 2026-04-29)
--   - boti_alertas.SELECT   — reemplazada por "Equipo CSM lee todas las alertas" (team_visibility 2026-04-29)
--   - cliente_notas.SELECT  — usa EXISTS csm desde el dia 1
--   - clientes_oncall.SELECT — usa EXISTS csm desde el dia 1
--
-- Nota: ALTER POLICY es idempotente sobre el valor de la expresion, asi que
-- re-correr esta migration despues no rompe.

-- ============================================================================
-- 1. clientes — UPDATE policy
-- ============================================================================

ALTER POLICY "CSM or admin can update clients" ON public.clientes
  USING (
    csm_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = ANY (ARRAY['jpmesa@truora.com', 'jdiaz@truora.com'])
  )
  WITH CHECK (
    csm_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = ANY (ARRAY['jpmesa@truora.com', 'jdiaz@truora.com'])
  );

-- ============================================================================
-- 2. clientes_oncall — UPDATE policy
-- ============================================================================

ALTER POLICY "Admins can update oncall clients" ON public.clientes_oncall
  USING (
    (auth.jwt() ->> 'email') = ANY (ARRAY['jpmesa@truora.com','jdiaz@truora.com'])
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = ANY (ARRAY['jpmesa@truora.com','jdiaz@truora.com'])
  );

-- ============================================================================
-- 3. cliente_notas — INSERT policy (la actual es del fix 20260504160000)
-- ============================================================================

ALTER POLICY "CSM duenio o admin crea notas" ON public.cliente_notas
  WITH CHECK (
    autor_email = (auth.jwt() ->> 'email')
    AND (
      (auth.jwt() ->> 'email') = ANY (ARRAY['jdiaz@truora.com'])
      OR client_id_externo IN (
        SELECT unnest(ARRAY[client_id_di, client_id_bgc, client_id_ce])
        FROM public.clientes
        WHERE csm_email = (auth.jwt() ->> 'email')
      )
    )
  );

-- ============================================================================
-- 4. cliente_notas — DELETE policy
-- ============================================================================

ALTER POLICY "Autor o admin borra nota" ON public.cliente_notas
  USING (
    autor_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = ANY (ARRAY['jdiaz@truora.com'])
  );

-- ============================================================================
-- 5. Borrar duplicados RLS en clientes
--
-- Patron admin-duplicate (decision 2026-04-22): cada cliente real tiene
-- ~3 filas en `clientes`: una con csm_email del CSM real + 2 duplicados
-- (amarquez + jdiaz) para visibilidad RLS. Esos duplicados quedaron
-- redundantes despues de team_visibility (2026-04-29), pero seguian vivos.
-- Ahora limpiamos los de amarquez.
--
-- Cuidado: boti_alertas y cliente_notas tienen FK a clientes.id.
-- Las filas de amarquez son duplicados (mismos TCIs que el CSM real),
-- entonces NO deberian tener boti_alertas linkeadas — los upserts del cron
-- van contra el cliente_id "real" (CSM dueno), no contra el duplicado.
-- Pero por seguridad, hacemos DELETE con ON DELETE CASCADE / SET NULL
-- que ya tienen las FK.
-- ============================================================================

DELETE FROM public.clientes
WHERE csm_email = 'amarquez@truora.com';

-- ============================================================================
-- 6. Borrar fila en csm (libera el slot del equipo)
--
-- Efecto: aunque Ana intentara login con su email, la RLS team-wide
-- (EXISTS csm WHERE email = jwt.email) le devolveria FALSE => no ve nada.
-- ============================================================================

DELETE FROM public.csm
WHERE email = 'amarquez@truora.com';

-- ============================================================================
-- Verificacion post-migration:
--
-- 1) Cero filas suyas en clientes:
--    SELECT COUNT(*) FROM public.clientes WHERE csm_email = 'amarquez@truora.com';
--    -- Esperado: 0
--
-- 2) Cero en csm:
--    SELECT COUNT(*) FROM public.csm WHERE email = 'amarquez@truora.com';
--    -- Esperado: 0
--
-- 3) Policies sin su email (esperado 0 matches):
--    SELECT tablename, policyname
--    FROM pg_policies
--    WHERE schemaname = 'public'
--      AND (qual LIKE '%amarquez%' OR with_check LIKE '%amarquez%');
--    -- Esperado: 0 filas
-- ============================================================================
