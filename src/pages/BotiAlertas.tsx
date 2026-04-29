import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, Calendar, ChevronDown, Users, User } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { MeshBackground } from "@/components/report-builder/MeshBackground";
import DashboardView from "@/components/botialertas/DashboardView";
import ClassicView from "@/components/botialertas/ClassicView";
import { S, fmtWeek } from "@/components/botialertas/types";
import type { Alerta } from "@/components/botialertas/types";

type ViewMode = "dashboard" | "classic";
type Scope = "all" | "mine";

export default function BotiAlertas() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Alerta[]>([]);
  const [csmRows, setCsmRows] = useState<{ email: string; nombre: string }[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [scope, setScope] = useState<Scope>("all");

  /* ── auth + fetch ─────────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) {
        navigate("/login");
        return;
      }
      setUserEmail(session.user.email);
      setAuthChecked(true);

      const [{ data: alertas, error: aErr }, { data: csms, error: cErr }] = await Promise.all([
        supabase
          .from("boti_alertas" as never)
          .select("*, cliente:clientes!cliente_id(nombre, csm_email)")
          .order("periodo_actual_fin", { ascending: false })
          .order("variacion_pct", { ascending: true }),
        supabase.from("csm").select("email, nombre"),
      ]);

      if (aErr) setError(aErr.message);
      else {
        const list = (alertas ?? []) as unknown as Alerta[];
        setRows(list);
        if (list.length > 0) setSelectedWeek(list[0].periodo_actual_fin);
      }
      if (cErr) {
        // no es fatal: la tabla CSM column mostrará el email si falta el nombre
        console.warn("BotiAlertas: error fetching csm:", cErr.message);
      } else {
        setCsmRows((csms ?? []) as { email: string; nombre: string }[]);
      }
      setLoading(false);
    })();
  }, [navigate]);

  /* ── derived ──────────────────────────────────────────────────── */
  const csmByEmail = useMemo(() => {
    const m: Record<string, { nombre: string }> = {};
    for (const c of csmRows) m[c.email] = { nombre: c.nombre };
    return m;
  }, [csmRows]);

  const weeks = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.periodo_actual_fin));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [rows]);

  const scopedAllWeeks = useMemo(() => {
    if (scope === "all") return rows;
    if (!userEmail) return rows;
    return rows.filter((r) => r.cliente?.csm_email === userEmail);
  }, [rows, scope, userEmail]);

  const weekRows = useMemo(() => {
    if (!selectedWeek) return [];
    return scopedAllWeeks.filter((r) => r.periodo_actual_fin === selectedWeek);
  }, [scopedAllWeeks, selectedWeek]);

  /* ── render ───────────────────────────────────────────────────── */
  if (!authChecked) return null;

  return (
    <>
      <MeshBackground />
      <div style={{
        position: "relative", zIndex: 1, minHeight: "100vh",
        color: S.text, fontFamily: "Inter, system-ui, sans-serif",
      }}>
        <TopBar
          onBack={() => navigate("/")}
          weeks={weeks}
          selectedWeek={selectedWeek}
          onSelectWeek={setSelectedWeek}
          viewMode={viewMode}
          setViewMode={setViewMode}
          scope={scope}
          setScope={setScope}
        />

        <main style={{ maxWidth: 1280, margin: "0 auto", padding: "92px 28px 60px" }}>
          {loading && <EmptyCard text="Cargando alertas…" />}

          {error && (
            <div style={{
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.30)",
              borderRadius: 14, padding: 16,
              fontSize: 13, color: "#FCA5A5",
            }}>
              Error al cargar: {error}
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <EmptyCard text="Aún no hay alertas. El flujo BotiAlertas corre los lunes a las 8:00 AM (hora Bogotá)." />
          )}

          {!loading && !error && rows.length > 0 && weekRows.length === 0 && scope === "mine" && (
            <EmptyCard text="No tienes clientes con alertas esta semana. Cambia a 'Toda la cartera' para ver al equipo." />
          )}

          {!loading && !error && weekRows.length > 0 && selectedWeek && (
            viewMode === "dashboard" ? (
              <DashboardView
                rows={weekRows}
                allWeeksRows={scopedAllWeeks}
                csmByEmail={csmByEmail}
                weekFin={selectedWeek}
                scope={scope}
              />
            ) : (
              <ClassicView rows={weekRows} />
            )
          )}
        </main>
      </div>
    </>
  );
}

/* ─────────────────────────── Top bar ─────────────────────────── */

function TopBar({
  onBack, weeks, selectedWeek, onSelectWeek,
  viewMode, setViewMode, scope, setScope,
}: {
  onBack: () => void;
  weeks: string[];
  selectedWeek: string | null;
  onSelectWeek: (w: string) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  scope: Scope;
  setScope: (s: Scope) => void;
}) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 24px", gap: 12,
      borderBottom: `0.5px solid ${S.border}`,
      background: "rgba(8,12,31,0.7)", backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)", zIndex: 10,
      flexWrap: "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button
          onClick={onBack}
          title="Volver"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, fontWeight: 600,
            color: S.muted, background: "transparent",
            border: `1px solid ${S.border}`,
            cursor: "pointer", padding: "6px 12px",
            borderRadius: 999, transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = S.text; e.currentTarget.style.borderColor = S.borderHi; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = S.muted; e.currentTarget.style.borderColor = S.border; }}
        >
          <ArrowLeft size={13} />
          <span>Volver</span>
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #38BDF8, #0891B2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Bell size={14} color="white" strokeWidth={2.2} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: S.text, letterSpacing: "-0.01em" }}>
            BotiAlertas
          </span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <ToggleGroup
          options={[
            { value: "all",  label: "Toda la cartera", icon: Users },
            { value: "mine", label: "Solo mi cartera", icon: User },
          ]}
          value={scope}
          onChange={(v) => setScope(v as Scope)}
          color="#7C4DFF"
        />

        <ToggleGroup
          options={[
            { value: "dashboard", label: "Dashboard" },
            { value: "classic",   label: "Vista clásica" },
          ]}
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          color="#7DD3FC"
        />

        <WeekDropdown weeks={weeks} selected={selectedWeek} onSelect={onSelectWeek} />
      </div>
    </div>
  );
}

/* ─────────── Toggle group (pill segmented) ─────────── */

function ToggleGroup({
  options, value, onChange, color,
}: {
  options: { value: string; label: string; icon?: typeof Users }[];
  value: string;
  onChange: (v: string) => void;
  color: string;
}) {
  return (
    <div style={{
      display: "inline-flex",
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${S.border}`,
      borderRadius: 999,
      padding: 3,
    }}>
      {options.map((o) => {
        const active = value === o.value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 11, fontWeight: 600,
              color: active ? color : S.muted,
              background: active ? `${color}15` : "transparent",
              border: `1px solid ${active ? `${color}40` : "transparent"}`,
              padding: "5px 12px", borderRadius: 999,
              cursor: "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = S.text; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = S.muted; }}
          >
            {Icon && <Icon size={12} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────── Week dropdown ─────────── */

function WeekDropdown({
  weeks, selected, onSelect,
}: {
  weeks: string[];
  selected: string | null;
  onSelect: (w: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (weeks.length === 0) return null;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, fontWeight: 600,
          color: "#7DD3FC",
          background: "rgba(56,189,248,0.10)",
          border: "1px solid rgba(56,189,248,0.30)",
          cursor: "pointer", padding: "7px 14px",
          borderRadius: 999, transition: "all 0.15s",
          minWidth: 220, justifyContent: "space-between",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={13} />
          <span>Semana del {selected ? fmtWeek(selected) : "—"}</span>
        </span>
        <ChevronDown size={13} style={{ transition: "transform 0.18s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: "absolute", right: 0, top: "100%", marginTop: 8,
            minWidth: 260,
            background: S.surfaceHi,
            border: `1px solid ${S.borderHi}`,
            borderRadius: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
            padding: 6,
            maxHeight: 320, overflowY: "auto",
            zIndex: 20,
          }}
        >
          {weeks.map((w, i) => {
            const isSel = w === selected;
            return (
              <button
                key={w}
                onClick={() => { onSelect(w); setOpen(false); }}
                style={{
                  width: "100%", textAlign: "left",
                  padding: "9px 12px", borderRadius: 8,
                  background: isSel ? "rgba(56,189,248,0.12)" : "transparent",
                  border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 12, color: isSel ? "#7DD3FC" : S.text,
                  fontWeight: isSel ? 600 : 500,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              >
                <span>Semana del {fmtWeek(w)}</span>
                {i === 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                    textTransform: "uppercase", color: "#7DD3FC",
                    background: "rgba(56,189,248,0.15)",
                    padding: "2px 6px", borderRadius: 4,
                  }}>
                    Última
                  </span>
                )}
              </button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

/* ─────────── Empty card ─────────── */

function EmptyCard({ text }: { text: string }) {
  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`,
      borderRadius: 14, padding: "32px 24px", textAlign: "center",
      color: S.muted, fontSize: 13,
    }}>
      {text}
    </div>
  );
}
