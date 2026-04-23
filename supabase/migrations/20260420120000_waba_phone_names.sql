-- ══════════════════════════════════════════════════════════════════
-- waba_phone_names — diccionario de nombres amigables por línea WhatsApp
-- Uso: reemplaza números crudos (+5215519355383) por etiquetas (MX Ecommerce)
-- en Ce12 (Consumo por Línea) y Ce14 (Heatmap de actividad).
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.waba_phone_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  phone_number text NOT NULL,
  friendly_name text NOT NULL,
  country text,
  caso_uso text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_waba_phone_names_lookup
  ON public.waba_phone_names (client_id, phone_number)
  WHERE activo = true;

ALTER TABLE public.waba_phone_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read waba names"
  ON public.waba_phone_names
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can write waba names"
  ON public.waba_phone_names
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'email') = 'jpmesa@truora.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'jpmesa@truora.com');

-- ══════════════════════════════════════════════════════════════════
-- Seed PayJoy (CLIENT_ID = TCI1e6cf6d9442fe8e1ceb5180a451192d8)
-- Fuente: CASE WHEN del query Metabase usado por el CSM a 2026-04-20
-- ══════════════════════════════════════════════════════════════════

INSERT INTO public.waba_phone_names (client_id, phone_number, friendly_name, country, caso_uso) VALUES
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+27720864487',    'PayJoy ZA Collections',     'ZA', 'Cobranzas'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+50763693098',    'PayJoy Panama Marketing',   'PA', 'Marketing'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+50767576829',    'PayJoy PA Merchant OPS',    'PA', 'Merchant Ops'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+50769649874',    'PayJoy PA Cobranzas',       'PA', 'Cobranzas'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+51908870486',    'PayJoy PE MOPS',            'PE', 'Merchant Ops'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+51973377590',    'PayJoy PE Marketing',       'PE', 'Marketing'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+51995144365',    'PayJoy PE Cobranzas',       'PE', 'Cobranzas'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+5214422869534',  'PayJoy Mexico Cap Clerks',  'MX', 'Cap Clerks'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+5215512272813',  'PayJoy Collections MX 3',   'MX', 'Cobranzas'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+5215512273742',  'PayJoy Collections MX 2',   'MX', 'Cobranzas'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+5215519355383',  'PayJoy MX Ecommerce',       'MX', 'Ecommerce'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+5215519571091',  'PayJoy Collections MX 1',   'MX', 'Cobranzas'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+5215522830841',  'PayJoy MX Merchant Ops',    'MX', 'Merchant Ops'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+5215573219989',  'PayJoy Ecommerce MX',       'MX', 'Ecommerce'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+5215610377797',  'PayJoy BizOps Global',      'MX', 'BizOps'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+5215653319498',  'PayJoy MX Credit Line',     'MX', 'Credit Line'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+5511910355265',  'PayJoy Collections BR',     'BR', 'Cobranzas'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+5511967750447',  'PayJoy Collections BR 2',   'BR', 'Cobranzas'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+5511978397332',  'PayJoy Parcerias',          'BR', 'Marketing'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+573054020079',   'PayJoy Tarjetas COL',       'CO', 'Tarjetas'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+573050420079',   'PayJoy Tarjetas COL 2',     'CO', 'Tarjetas'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+573160237164',   'PayJoy Colombia Marketing', 'CO', 'Marketing'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+573246849743',   'PayJoy COL Collections',    'CO', 'Cobranzas'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+593983066006',   'PayJoy EC PB Promociones',  'EC', 'Marketing'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+593987516471',   'PayJoy Ecuador Marketing',  'EC', 'Marketing'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+593989344766',   'PayJoy EC Cobranzas',       'EC', 'Cobranzas'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+593999119106',   'PayJoy MOps EC',            'EC', 'Merchant Ops'),
  ('TCI1e6cf6d9442fe8e1ceb5180a451192d8', '+19403295686',    'Truora Demo',               'US', 'Demo')
ON CONFLICT (client_id, phone_number) DO UPDATE
  SET friendly_name = EXCLUDED.friendly_name,
      country       = EXCLUDED.country,
      caso_uso      = EXCLUDED.caso_uso,
      activo        = true,
      updated_at    = now();
