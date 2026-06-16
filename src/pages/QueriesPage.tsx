/**
 * Página /queries — Query Repository (biblioteca del catálogo de queries).
 *
 * Aterrizaje búsqueda + cards (por producto / por fuente). Al abrir una query,
 * el drawer permite completar Client ID + fechas y copiar el SQL listo.
 * Oppy (asistente IA) vive como FAB flotante abajo a la derecha.
 *
 * Auth: abierta a todo el equipo CSM. Las funciones admin (ver drafts,
 * card de pendientes) se gatean por ADMIN_VIEW_EMAILS.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookText } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { MeshBackground } from "@/components/report-builder/MeshBackground";
import QueryBrowser from "@/components/queries/QueryBrowser";
import QueryDetailDrawer from "@/components/queries/QueryDetailDrawer";
import { OppyButton } from "@/components/oppy/OppyButton";
import { S, ADMIN_VIEW_EMAILS } from "@/components/queries/types";
import type { QueryRow } from "@/components/queries/types";
import { useQueriesRepository } from "@/hooks/useQueriesRepository";

/* DEV ONLY: saltar el gate de login en local (mismo patrón que Dashboard.tsx).
 * Gated a import.meta.env.DEV → rama muerta en el build de prod (Netlify). */
const DEV_BYPASS_LOGIN =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_DEV_BYPASS_LOGIN).toLowerCase() === "true";
const DEV_USER_EMAIL =
  (import.meta.env.VITE_DEV_USER_EMAIL as string | undefined)?.trim() || "jpmesa@truora.com";

export default function QueriesPage() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [selected, setSelected] = useState<QueryRow | null>(null);

  const { rows, loading, error } = useQueriesRepository();

  useEffect(() => {
    (async () => {
      if (DEV_BYPASS_LOGIN) {
        setUserEmail(DEV_USER_EMAIL.toLowerCase());
        setAuthChecked(true);
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const email = session?.user?.email?.toLowerCase() ?? null;
      if (!email) {
        navigate("/login");
        return;
      }
      setUserEmail(email);
      setAuthChecked(true);
    })();
  }, [navigate]);

  const isAdmin = useMemo(
    () => (userEmail ? ADMIN_VIEW_EMAILS.has(userEmail) : false),
    [userEmail]
  );

  const visibleRows = useMemo(
    () => (isAdmin ? rows : rows.filter((r) => r.status === "approved")),
    [rows, isAdmin]
  );

  const handleSelect = useCallback((row: QueryRow) => setSelected(row), []);

  if (!authChecked) return null;

  return (
    <>
      <MeshBackground />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: "100vh",
          color: S.text,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 24px",
            gap: 12,
            borderBottom: `0.5px solid ${S.border}`,
            background: "rgba(8,12,31,0.7)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button
              onClick={() => navigate("/")}
              title="Volver"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: S.muted,
                background: "transparent",
                border: `1px solid ${S.border}`,
                cursor: "pointer",
                padding: "6px 12px",
                borderRadius: 999,
                fontFamily: "inherit",
              }}
            >
              <ArrowLeft size={13} />
              <span>Volver</span>
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #7C4DFF, #4338CA)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <BookText size={14} color="white" strokeWidth={2.2} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: S.text }}>
                Query Repository
              </span>
            </div>
          </div>
        </div>

        <main style={{ maxWidth: 1080, margin: "0 auto", padding: "96px 28px 60px" }}>
          {/* Hero compacto */}
          <div style={{ marginBottom: 22 }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: "-0.02em",
                margin: 0,
                marginBottom: 8,
              }}
            >
              ¿Qué query necesitas?
            </h1>
            <span style={{ fontSize: 12.5, color: S.muted }}>
              Busca abajo, o si no sabes el nombre exacto preguntale a{" "}
              <b style={{ color: "#A78BFA" }}>Oppy</b> con el botón de abajo a la derecha ↘
            </span>
          </div>

          {loading && (
            <div
              style={{
                background: S.surface,
                border: `1px solid ${S.border}`,
                borderRadius: 14,
                padding: "40px 20px",
                textAlign: "center",
                color: S.muted,
                fontSize: 13,
              }}
            >
              Cargando catálogo…
            </div>
          )}

          {error && (
            <div
              style={{
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.30)",
                borderRadius: 14,
                padding: 16,
                fontSize: 13,
                color: "#FCA5A5",
              }}
            >
              Error al cargar el catálogo: {error}
            </div>
          )}

          {!loading && !error && visibleRows.length > 0 && (
            <QueryBrowser rows={visibleRows} onSelect={handleSelect} isAdmin={isAdmin} />
          )}
        </main>
      </div>

      {userEmail && <OppyButton userEmail={userEmail} currentRoute="/queries" />}

      <QueryDetailDrawer
        row={selected}
        rows={rows}
        onClose={() => setSelected(null)}
        onSelectRelated={setSelected}
        isAdmin={isAdmin}
      />
    </>
  );
}
