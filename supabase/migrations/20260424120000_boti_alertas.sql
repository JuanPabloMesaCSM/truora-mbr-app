-- BotiAlertas: snapshot semanal de consumo por cliente/producto.
-- n8n escribe aqui cada lunes 08:00 America/Bogota despues de los envios Telegram.
-- CSM Center (/botialertas) lee con RLS: CSM ve sus clientes, admins ven todos.

CREATE TABLE IF NOT EXISTS public.boti_alertas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id               uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  client_id_externo        text NOT NULL,
  producto                 text NOT NULL CHECK (producto IN ('DI','BGC','CE')),

  periodo_actual_inicio    date NOT NULL,
  periodo_actual_fin       date NOT NULL,
  periodo_anterior_inicio  date NOT NULL,
  periodo_anterior_fin     date NOT NULL,

  valor_actual             numeric,
  valor_anterior           numeric,
  variacion_pct            numeric,
  variacion_abs            numeric,

  severidad                text NOT NULL
    CHECK (severidad IN ('critica','fuerte','leve','estable','crecimiento')),

  metricas_extra           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- DI:  { conversion_actual, conversion_anterior, conversion_variacion }
  -- BGC: { score_actual, score_anterior }
  -- CE:  { inbound:{curr,prev}, outbound:{curr,prev}, notificaciones:{curr,prev} }

  creado_en                timestamptz NOT NULL DEFAULT now(),

  UNIQUE (cliente_id, producto, periodo_actual_fin)
);

CREATE INDEX IF NOT EXISTS idx_boti_alertas_cliente
  ON public.boti_alertas (cliente_id, producto, periodo_actual_fin DESC);

CREATE INDEX IF NOT EXISTS idx_boti_alertas_severidad
  ON public.boti_alertas (severidad, periodo_actual_fin DESC)
  WHERE severidad IN ('critica','fuerte','crecimiento');

ALTER TABLE public.boti_alertas ENABLE ROW LEVEL SECURITY;

-- CSM ve sus clientes; admins (jpmesa, amarquez, jdiaz) ven todo.
CREATE POLICY "CSM reads own alerts or admin reads all" ON public.boti_alertas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = boti_alertas.cliente_id
        AND c.csm_email = (auth.jwt() ->> 'email')
    )
    OR (auth.jwt() ->> 'email') = ANY (
      ARRAY['jpmesa@truora.com','amarquez@truora.com','jdiaz@truora.com']
    )
  );

-- n8n inserta con service_role_key (bypasea RLS) -- no se necesita policy de INSERT/UPDATE.
