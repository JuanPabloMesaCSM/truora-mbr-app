-- Notas por cliente para BotiAlertas (modal 360 + badge en tabla consolidada).
-- Trazabilidad inmediata de motivos de cambios de consumo. Equipo CSM completo
-- lee todas las notas (sync de equipo). El autor edita/borra; admins (Ana, JD)
-- pueden borrar cualquiera.
--
-- Futuro: migracion a HubSpot. El campo hubspot_engagement_id queda nullable
-- para guardar el ID del engagement una vez sincronizado.

CREATE TABLE IF NOT EXISTS public.cliente_notas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Autoridad: TCI es estable independiente de duplicados RLS (cliente esta en
  -- 3 filas de `clientes` por el patron admin-duplicate Ana+JD).
  client_id_externo     text NOT NULL CHECK (length(client_id_externo) > 0),

  -- Best-effort para joins. Apunta al cliente_id "real" (CSM dueno, no admin
  -- duplicado). Si el cliente se elimina, la nota sobrevive con el TCI.
  cliente_id            uuid REFERENCES public.clientes(id) ON DELETE SET NULL,

  -- Vinculo opcional con una alerta especifica de boti_alertas. Si esta lleno,
  -- la UI muestra una mini-pill del producto/severidad.
  boti_alerta_id        uuid REFERENCES public.boti_alertas(id) ON DELETE SET NULL,

  autor_email           text NOT NULL CHECK (length(autor_email) > 0),

  -- Categoria reservada para futuro (motivo / accion / contexto / seguimiento).
  -- Hoy la UI no la expone; default = 'seguimiento'.
  categoria             text NOT NULL DEFAULT 'seguimiento'
                          CHECK (categoria IN ('motivo','accion','contexto','seguimiento')),

  contenido             text NOT NULL CHECK (length(contenido) BETWEEN 1 AND 2000),

  -- Vinculo bidireccional con HubSpot cuando se sincronice. Hoy NULL siempre.
  hubspot_engagement_id text,

  creado_en             timestamptz NOT NULL DEFAULT now(),
  editado_en            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cliente_notas_tci
  ON public.cliente_notas (client_id_externo, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_cliente_notas_alerta
  ON public.cliente_notas (boti_alerta_id)
  WHERE boti_alerta_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cliente_notas_autor
  ON public.cliente_notas (autor_email, creado_en DESC);

ALTER TABLE public.cliente_notas ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICIES
-- ============================================================================

-- 1) SELECT: cualquier email presente en `csm` lee todas las notas.
--    Mismo patron que boti_alertas/clientes (decision team-visibility 2026-04-29).
CREATE POLICY "Equipo CSM lee todas las notas" ON public.cliente_notas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.csm
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- 2) INSERT: el autor solo puede crear notas con su propio email,
--    Y debe ser dueno del cliente (csm_email match en clientes para ese TCI)
--    O ser admin (Ana, JD).
CREATE POLICY "CSM duenio o admin crea notas" ON public.cliente_notas
  FOR INSERT TO authenticated
  WITH CHECK (
    autor_email = (auth.jwt() ->> 'email')
    AND (
      (auth.jwt() ->> 'email') = ANY (ARRAY['amarquez@truora.com','jdiaz@truora.com'])
      OR EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.csm_email = (auth.jwt() ->> 'email')
          AND (
            c.client_id_di  = cliente_notas.client_id_externo
            OR c.client_id_bgc = cliente_notas.client_id_externo
            OR c.client_id_ce  = cliente_notas.client_id_externo
          )
      )
    )
  );

-- 3) UPDATE: solo el autor edita su propia nota.
CREATE POLICY "Autor edita su nota" ON public.cliente_notas
  FOR UPDATE TO authenticated
  USING (autor_email = (auth.jwt() ->> 'email'))
  WITH CHECK (autor_email = (auth.jwt() ->> 'email'));

-- 4) DELETE: el autor o admins (Ana, JD).
CREATE POLICY "Autor o admin borra nota" ON public.cliente_notas
  FOR DELETE TO authenticated
  USING (
    autor_email = (auth.jwt() ->> 'email')
    OR (auth.jwt() ->> 'email') = ANY (ARRAY['amarquez@truora.com','jdiaz@truora.com'])
  );

-- ============================================================================
-- TRIGGER: editado_en se actualiza automaticamente cuando cambia contenido
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cliente_notas_set_editado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.contenido IS DISTINCT FROM OLD.contenido THEN
    NEW.editado_en = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_cliente_notas_editado_en
  BEFORE UPDATE ON public.cliente_notas
  FOR EACH ROW
  EXECUTE FUNCTION public.cliente_notas_set_editado_en();

-- ============================================================================
-- REALTIME: habilitar para que un admin/CSM vea notas aparecer sin refresh
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.cliente_notas;

-- ============================================================================
-- Verificacion post-migration:
--
-- 1) Schema:
--    SELECT column_name, data_type, is_nullable
--    FROM information_schema.columns
--    WHERE table_name = 'cliente_notas';
--
-- 2) RLS policies:
--    SELECT polname, cmd FROM pg_policies WHERE tablename = 'cliente_notas';
--    Esperado: 4 filas (SELECT, INSERT, UPDATE, DELETE).
--
-- 3) Realtime:
--    SELECT * FROM pg_publication_tables WHERE tablename = 'cliente_notas';
-- ============================================================================
