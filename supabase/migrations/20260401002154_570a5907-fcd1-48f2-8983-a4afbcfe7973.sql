
CREATE TABLE IF NOT EXISTS public.csm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  email text NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.csm ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read csm" ON public.csm
  FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  csm_email text NOT NULL,
  client_id_di text,
  client_id_bgc text,
  client_id_ce text,
  caso_uso text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CSM sees own clients or admin sees all" ON public.clientes
  FOR SELECT TO authenticated
  USING (
    csm_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = 'jpmesa@truora.com'
  );

CREATE POLICY "CSM or admin can update clients" ON public.clientes
  FOR UPDATE TO authenticated
  USING (
    csm_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = 'jpmesa@truora.com'
  )
  WITH CHECK (
    csm_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = 'jpmesa@truora.com'
  );
