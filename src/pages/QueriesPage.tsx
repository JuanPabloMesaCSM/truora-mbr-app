/**
 * Página /queries — Query Repository (biblioteca).
 *
 * FASE 1 (esta): solo biblioteca buscable. Sin chat.
 * FASE 2 (Bloque C.2): se agregará el AgentChat cuando esté el backend.
 *
 * Auth gate: solo emails en ADMIN_VIEW_EMAILS (piloto controlado).
 * El resto del equipo CSM es redirigido a / .
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BookText, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { MeshBackground } from "@/components/report-builder/MeshBackground";
import QueryLibraryTable from "@/components/queries/QueryLibraryTable";
import QueryDetailDrawer from "@/components/queries/QueryDetailDrawer";
import { OppyButton } from "@/components/oppy/OppyButton";
import { S, ADMIN_VIEW_EMAILS } from "@/components/queries/types";
import type { QueryRow } from "@/components/queries/types";
import { useQueriesRepository } from "@/hooks/useQueriesRepository";

const DRIFT_AMBER = "#F59E0B";

export default function QueriesPage() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [selected, setSelected] = useState<QueryRow | null>(null);

  const { rows, loading, error } = useQueriesRepository();

  /* ── Auth gate ─────────────────────────────────────────────── */
  /* Abierta a todo el equipo CSM. Las funciones admin (banner drift,
   * filtro Estado, validar/ignorar cambios) siguen gated via isAdmin
   * basado en ADMIN_VIEW_EMAILS. */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email?.toLowerCase() ?? null;

      if (!email) {
        navigate("/login");
        return;
      }
      setUserEmail(email);
      setAuthChecked(true);
    })();
  }, [navigate]);

  const isAdmin = useMemo(() => {
    if (!userEmail) return false;
    return ADMIN_VIEW_EMAILS.has(userEmail);
  }, [userEmail]);

  /* Para CSMs normales (cuando se abra a todos) — solo aprobadas.
     En piloto admin-only mostramos todo así pueden validar drafts. */
  const visibleRows = useMemo(() => {
    if (isAdmin) return rows;
    return rows.filter((r) => r.status === "approved");
  }, [rows, isAdmin]);

  const pendingDriftCount = useMemo(
    () => rows.filter((r) => r.drift_detected_at).length,
    [rows]
  );

  const lastDriftDetection = useMemo(() => {
    const dates = rows
      .map((r) => r.drift_detected_at)
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).getTime());
    if (dates.length === 0) return null;
    return new Date(Math.max(...dates));
  }, [rows]);

  const handleSelect = useCallback((row: QueryRow) => {
    setSelected(row);
  }, []);

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
        <TopBar
          onBack={() => navigate("/")}
          isAdmin={isAdmin}
          pendingDriftCount={pendingDriftCount}
        />

        <main
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "104px 28px 60px",
          }}
        >
          {/* Hero / contexto */}
          <div style={{ marginBottom: 28 }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                margin: 0,
                marginBottom: 6,
              }}
            >
              Query Repository
            </h1>
            <p
              style={{
                fontSize: 13.5,
                color: S.muted,
                margin: 0,
                lineHeight: 1.5,
                maxWidth: 720,
              }}
            >
              Biblioteca de queries que el equipo CSM usa día a día: Dashboard,
              BotiAlertas y Report Builder.
            </p>

            {/* CTA al agente Oppy */}
            <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
              {userEmail && <OppyButton userEmail={userEmail} currentRoute="/queries" />}
              <span style={{ fontSize: 11.5, color: S.muted }}>
                Preguntale al agente sobre cualquier query del catálogo
              </span>
            </div>
          </div>

          {/* Banner admin: queries pendientes de validar */}
          {isAdmin && pendingDriftCount > 0 && (
            <div
              style={{
                background: "rgba(245,158,11,0.08)",
                border: `1px solid ${DRIFT_AMBER}40`,
                borderRadius: 12,
                padding: "14px 18px",
                marginBottom: 22,
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: `${DRIFT_AMBER}22`,
                  border: `1px solid ${DRIFT_AMBER}50`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={16} color={DRIFT_AMBER} />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: S.text,
                    marginBottom: 2,
                  }}
                >
                  {pendingDriftCount}{" "}
                  {pendingDriftCount === 1 ? "query pendiente" : "queries pendientes"} de validar
                </div>
                <div style={{ fontSize: 11.5, color: S.muted, lineHeight: 1.45 }}>
                  Cambiaron en producción y aún nadie las revisó.
                  {lastDriftDetection && (
                    <>
                      {" · Última detección: "}
                      {lastDriftDetection.toLocaleString("es-CO", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 10.5, color: S.muted, fontStyle: "italic" }}>
                Filtrar abajo en <b style={{ color: DRIFT_AMBER }}>Estado → Pendiente de validar</b>
              </div>
            </div>
          )}

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

          {!loading && !error && visibleRows.length === 0 && (
            <div
              style={{
                background: S.surface,
                border: `1px dashed ${S.border}`,
                borderRadius: 14,
                padding: "40px 20px",
                textAlign: "center",
                color: S.muted,
                fontSize: 13,
              }}
            >
              El catálogo todavía está vacío. Aplicá el seed inicial
              (<code>tmp/agent_seed_catalog/seeds.sql</code>) para arrancar.
            </div>
          )}

          {!loading && !error && visibleRows.length > 0 && (
            <QueryLibraryTable
              rows={visibleRows}
              onSelect={handleSelect}
              isAdmin={isAdmin}
            />
          )}
        </main>
      </div>

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

/* ─────────────── Top bar ─────────────── */

function TopBar({
  onBack,
  isAdmin,
  pendingDriftCount,
}: {
  onBack: () => void;
  isAdmin: boolean;
  pendingDriftCount: number;
}) {
  return (
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
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={onBack}
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
            transition: "all 0.15s",
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = S.text;
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = S.muted;
            e.currentTarget.style.borderColor = S.border;
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
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: S.text,
              letterSpacing: "-0.01em",
            }}
          >
            Query Repository
          </span>
          {isAdmin && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                color: "#FBBF24",
                background: "rgba(251,191,36,0.10)",
                border: "1px solid rgba(251,191,36,0.30)",
                borderRadius: 999,
                padding: "1px 8px",
                letterSpacing: "0.04em",
              }}
            >
              ADMIN PILOTO
            </span>
          )}
        </div>
      </div>

      {isAdmin && pendingDriftCount > 0 && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "rgba(245,158,11,0.10)",
            border: "1px solid rgba(245,158,11,0.40)",
            color: "#F59E0B",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 999,
            padding: "4px 12px",
            letterSpacing: "0.02em",
          }}
          title="Queries cambiadas en producción y pendientes de validar"
        >
          🔔 {pendingDriftCount} pendiente{pendingDriftCount === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}
