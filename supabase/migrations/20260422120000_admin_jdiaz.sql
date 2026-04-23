-- Agrega a Juan Pablo Díaz (jdiaz@truora.com) como admin en las policies de clientes.
-- Efecto: ve todos los clientes en el Report Builder.
-- No afecta la visibilidad de otros CSMs (la policy es per-JWT).

DROP POLICY IF EXISTS "CSM sees own clients or admin sees all" ON public.clientes;
CREATE POLICY "CSM sees own clients or admin sees all" ON public.clientes
  FOR SELECT TO authenticated
  USING (
    csm_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = ANY (ARRAY['jpmesa@truora.com', 'amarquez@truora.com', 'jdiaz@truora.com'])
  );

DROP POLICY IF EXISTS "CSM or admin can update clients" ON public.clientes;
CREATE POLICY "CSM or admin can update clients" ON public.clientes
  FOR UPDATE TO authenticated
  USING (
    csm_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = ANY (ARRAY['jpmesa@truora.com', 'amarquez@truora.com', 'jdiaz@truora.com'])
  )
  WITH CHECK (
    csm_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = ANY (ARRAY['jpmesa@truora.com', 'amarquez@truora.com', 'jdiaz@truora.com'])
  );
