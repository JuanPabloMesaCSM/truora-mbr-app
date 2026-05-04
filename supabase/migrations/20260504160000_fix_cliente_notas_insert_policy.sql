-- Fix RLS INSERT policy de cliente_notas.
--
-- Bug detectado 2026-05-04: ningún CSM podia crear notas desde la UI.
-- La policy original usaba EXISTS con cross-reference:
--   EXISTS (SELECT 1 FROM clientes c WHERE c.client_id_di = cliente_notas.client_id_externo ...)
-- El reference `cliente_notas.client_id_externo` dentro del subquery con alias `c`
-- no resolvia correctamente al row NEW en INSERT WITH CHECK → la policy evaluaba
-- FALSE para todos los CSMs reales (admins pasaban por el OR del ARRAY).
--
-- Fix: reemplazar EXISTS con IN (...) usando unnest() — evita ambiguedad outer/inner.

DROP POLICY IF EXISTS "CSM duenio o admin crea notas" ON public.cliente_notas;

CREATE POLICY "CSM duenio o admin crea notas" ON public.cliente_notas
  FOR INSERT TO authenticated
  WITH CHECK (
    autor_email = (auth.jwt() ->> 'email')
    AND (
      (auth.jwt() ->> 'email') = ANY (ARRAY['amarquez@truora.com','jdiaz@truora.com'])
      OR client_id_externo IN (
        SELECT unnest(ARRAY[client_id_di, client_id_bgc, client_id_ce])
        FROM public.clientes
        WHERE csm_email = (auth.jwt() ->> 'email')
      )
    )
  );

-- Verificacion:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'cliente_notas';
-- Esperado: 4 filas (SELECT, INSERT, UPDATE, DELETE).
