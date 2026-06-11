import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ── DEV ONLY: bypass de RLS para pruebas en local sin login ──────────────────
// Cuando se prueba en local con VITE_DEV_BYPASS_LOGIN=true, no hay sesión
// Supabase, así que el anon key devuelve 0 filas (RLS exige authenticated).
// Para ver datos sin loguearse, usamos la service_role (bypassa RLS).
//
// SEGURIDAD: gated a `import.meta.env.DEV` (Vite lo reemplaza por `false` en el
// build de prod → rama muerta) + la flag de bypass + la key presente. La key
// VITE_DEV_SERVICE_ROLE_KEY vive SOLO en `.env.local` (gitignored); Netlify no
// la tiene → el build de prod queda en anon. NUNCA setear esa var en Netlify.
const DEV_BYPASS =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_DEV_BYPASS_LOGIN).toLowerCase() === 'true';
const DEV_SERVICE_KEY = import.meta.env.VITE_DEV_SERVICE_ROLE_KEY as string | undefined;
const useDevServiceRole = DEV_BYPASS && !!DEV_SERVICE_KEY;

if (useDevServiceRole) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabaseClient] DEV bypass activo: usando service_role (RLS bypass). Solo local — nunca en prod.'
  );
}

export const supabase = createClient<Database>(
  SUPABASE_URL,
  useDevServiceRole ? (DEV_SERVICE_KEY as string) : SUPABASE_ANON_KEY,
  {
    auth: {
      storage: localStorage,
      // Con service_role no hay sesión de usuario que persistir/refrescar.
      persistSession: !useDevServiceRole,
      autoRefreshToken: !useDevServiceRole,
    },
  }
);
