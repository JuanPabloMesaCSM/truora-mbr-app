-- Oncall MBRs: 20 clientes sin CSM asignado, visibles para todos los CSMs activos.
-- No se tocan las policies de `clientes` para no alterar la visibilidad actual por cartera.

CREATE TABLE IF NOT EXISTS public.clientes_oncall (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  csm_email text,                   -- nullable: estos clientes no tienen CSM dueño
  client_id_di text,
  client_id_bgc text,
  client_id_ce text,
  caso_uso text,
  activo boolean NOT NULL DEFAULT true,
  mrr_avg numeric,                  -- priorización por valor (no requerido por Report Builder)
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clientes_oncall ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active CSMs can read oncall clients" ON public.clientes_oncall
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.csm c
      WHERE c.email = (auth.jwt() ->> 'email') AND c.activo = true
    )
  );

CREATE POLICY "Admins can update oncall clients" ON public.clientes_oncall
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = ANY (ARRAY['jpmesa@truora.com','amarquez@truora.com','jdiaz@truora.com'])
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = ANY (ARRAY['jpmesa@truora.com','amarquez@truora.com','jdiaz@truora.com'])
  );

INSERT INTO public.clientes_oncall (nombre, client_id_di, client_id_bgc, client_id_ce, mrr_avg) VALUES
  ('AiPrise',                  'TCId528e6cf59cd7f5829d5ca3d5b1c6070', 'TCId528e6cf59cd7f5829d5ca3d5b1c6070', NULL,                                  6200),
  ('Quipu',                    'TCIbf21dd25f648a3300907e646ae0807b6', NULL,                                  'TCIbf21dd25f648a3300907e646ae0807b6', 4900),
  ('Coofisam',                 'TCI1631a5660ae53210230fc0ac01874125', 'TCI1631a5660ae53210230fc0ac01874125', NULL,                                  4500),
  ('Syntage',                  'TCI63a26ea732cebe012943332ca61fe556', 'TCI63a26ea732cebe012943332ca61fe556', 'TCI63a26ea732cebe012943332ca61fe556', 3700),
  ('Hubla',                    NULL,                                  NULL,                                  'TCI602da9bd0b1a304b16f5b6e34b8a9077', 3700),
  ('winland.com.mx',           'TCI6e9bf819596a8a8480ee53548a1d2dc2', NULL,                                  NULL,                                  3200),
  ('avisbudget.cl',            NULL,                                  'TCIc3f12afee3558486b9d0142217533b33', NULL,                                  3200),
  ('qoop.Ai',                  NULL,                                  'TCI4af9e1f47b1acfc486200d502e7179a7', NULL,                                  3100),
  ('Rankmi',                   'TCI747b973977d0dff8eec1b496811b52d5', 'TCI747b973977d0dff8eec1b496811b52d5', NULL,                                  2700),
  ('Rombo Tech',               NULL,                                  'TCI108918e87284fb14aea9c07ffc063ef3', NULL,                                  2400),
  ('Hughes de Colombia',       'TCI452b8c8741fa1a144d8c6e81254a2f83', 'TCI452b8c8741fa1a144d8c6e81254a2f83', 'TCI452b8c8741fa1a144d8c6e81254a2f83', 2400),
  ('bongoanalytics.com',       'TCI0101d66fc53a034e12d9a78d6ae41ce0', NULL,                                  NULL,                                  2300),
  ('Electrocreditosdelcauca',  'TCI2b10a5114932a0cd6b3c87771073b149', NULL,                                  'TCI2b10a5114932a0cd6b3c87771073b149', 2300),
  ('Transportes Humadea',      NULL,                                  'TCIc90dfe77d22d2c89ecb1ffe261536dab', NULL,                                  2100),
  ('mine-class',               'TCI67f2afbab3a0a92951910884fc21fd2f', NULL,                                  NULL,                                  2000),
  ('Smartup Digital',          NULL,                                  NULL,                                  'TCI5320cb95ef2bbd43a60e7b12c339fc4f', 2000),
  ('Confinancia',              NULL,                                  'TCI23607f9ba94744874839bb4f2c06d529', NULL,                                  2000),
  ('LUMA',                     'TCI93453a81a8c4b08368c474f4d4d0dce5', NULL,                                  NULL,                                  2000),
  ('Tecnocash',                NULL,                                  'TCI2fc58bee46a7a8445c12231d00768997', NULL,                                  2000),
  ('Progesion',                'TCI673312bd1ee752b092f38150cb1d941a', 'TCI673312bd1ee752b092f38150cb1d941a', NULL,                                  1300)
ON CONFLICT DO NOTHING;
