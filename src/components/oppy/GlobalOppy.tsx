/**
 * GlobalOppy — monta el FAB de Oppy en TODAS las páginas del CSM Center,
 * para que el asistente acompañe toda la experiencia (Report Builder, Dashboard,
 * BotiAlertas, Queries, Validador, Oncall, etc.).
 *
 * Se monta una sola vez en App.tsx (dentro de BrowserRouter). Resuelve el email
 * del CSM (con el mismo bypass DEV que las páginas) y se oculta en rutas donde
 * el FAB no debe aparecer: login, admin y las vistas MBR/preview client-facing.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { OppyButton } from "./OppyButton";

const DEV_BYPASS_LOGIN =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_DEV_BYPASS_LOGIN).toLowerCase() === "true";
const DEV_USER_EMAIL =
  (import.meta.env.VITE_DEV_USER_EMAIL as string | undefined)?.trim() || "jpmesa@truora.com";

/* Rutas donde NO se muestra el FAB (login, admin y MBR/preview client-facing). */
const HIDE_PREFIXES = ["/login", "/admin", "/mbr", "/SBR", "/mock", "/cerebro"];

export function GlobalOppy() {
  const { pathname } = useLocation();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (DEV_BYPASS_LOGIN) {
        if (!cancelled) setEmail(DEV_USER_EMAIL.toLowerCase());
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!cancelled) setEmail(session?.user?.email?.toLowerCase() ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const hidden = HIDE_PREFIXES.some((p) => pathname.toLowerCase().startsWith(p));
  if (hidden || !email) return null;

  return <OppyButton userEmail={email} currentRoute={pathname} />;
}
