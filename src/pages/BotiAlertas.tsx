import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, Calendar, ChevronDown, Users, User, Crown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { MeshBackground } from "@/components/report-builder/MeshBackground";
import DashboardView from "@/components/botialertas/DashboardView";
import ClassicView from "@/components/botialertas/ClassicView";
import { S, fmtWeek, ADMIN_EMAILS } from "@/components/botialertas/types";
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
  // Para admins (Ana, JD): filtra por csm_email específico cuando no es null.
  // Cuando es null, muestran toda la cartera. CSMs reales no usan este state.
  const [adminCsmFilter, setAdminCsmFilter] = useState<string | null>(null);

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

      const [
        { data: alertas, error: aErr },
        { data: csms, error: cErr },
        { data: clientes, error: clErr },
      ] = await Promise.all([
        supabase
          .from("boti_alertas" as never)
          .select("*, cliente:clientes!cliente_id(nombre, csm_email)")
          .order("periodo_actual_fin", { ascending: false })
          .order("variacion_pct", { ascending: true }),
        supabase.from("csm").select("email, nombre"),
        supabase.from("clientes").select("id, nombre, csm_email, client_id_di, client_id_bgc, client_id_ce"),
      ]);

      if (clErr) console.warn("BotiAlertas: error fetching clientes:", clErr.message);

      // Mapa TCI -> dueño canónico (excluye admins de la elección).
      // Admin emails: gente que NO tiene cartera real (ven todo por RLS, no por csm_email).
      // Histórico: Ana (amarquez) y JD (jdiaz) tenían el portafolio entero duplicado bajo su email
      // para visibilidad cross-equipo. Con la nueva RLS de equipo, eso ya no es necesario y genera
      // ruido al mostrarlos como CSM dueño. Acá los excluimos del display.
      const tciToCanonical: Record<string, { id: string; nombre: string; csm_email: string; isAdmin: boolean }> = {};
      for (const c of (clientes ?? []) as Array<{ id: string; nombre: string; csm_email: string; client_id_di: string | null; client_id_bgc: string | null; client_id_ce: string | null }>) {
        const isAdmin = ADMIN_EMAILS.has(c.csm_email);
        for (const tci of [c.client_id_di, c.client_id_bgc, c.client_id_ce]) {
          if (!tci) continue;
          const existing = tciToCanonical[tci];
          // Reemplaza si no hay entry, o el existing es admin y el current es real
          if (!existing || (existing.isAdmin && !isAdmin)) {
            tciToCanonical[tci] = { id: c.id, nombre: c.nombre, csm_email: c.csm_email, isAdmin };
          }
        }
      }

      if (aErr) setError(aErr.message);
      else {
        const raw = (alertas ?? []) as unknown as Alerta[];
        // Enrich: override cliente_id, nombre y csm_email al dueño canónico (no-admin si existe).
        // Necesario porque el dedup de prepare_whitelists.js puede haber elegido la fila admin
        // duplicada — en ese caso, cliente_id apunta a Ana/jdiaz y el display muestra al admin
        // como CSM, lo cual es incorrecto.
        const enriched: Alerta[] = raw.map((r) => {
          const real = tciToCanonical[r.client_id_externo];
          if (!real) return r;
          return {
            ...r,
            cliente_id: real.id,
            cliente: { nombre: real.nombre, csm_email: real.csm_email },
          };
        });

        // Dedup defensivo: si dedup en prepare_whitelists fallara y hubiera 2 filas para
        // mismo (TCI, producto, semana), el override unifica cliente_id pero las filas
        // siguen siendo 2. Aquí nos quedamos solo con la primera.
        const seen = new Set<string>();
        const deduped: Alerta[] = [];
        for (const r of enriched) {
          const key = `${r.client_id_externo}|${r.producto}|${r.periodo_actual_fin}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(r);
        }

        setRows(deduped);
        if (deduped.length > 0) setSelectedWeek(deduped[0].periodo_actual_fin);
      }
      if (cErr) {
        console.warn("BotiAlertas: error fetching csm:", cErr.message);
      } else {
        setCsmRows((csms ?? []) as { email: string; nombre: string }[]);
      }
      setLoading(false);
    })();
  }, [navigate]);

  /* ── derived ──────────────────────────────────────────────────── */
  const isAdmin = !!userEmail && ADMIN_EMAILS.has(userEmail);

  const csmByEmail = useMemo(() => {
    const m: Record<string, { nombre: string }> = {};
    for (const c of csmRows) m[c.email] = { nombre: c.nombre };
    return m;
  }, [csmRows]);

  // Lista de CSMs reales para el dropdown de admin (excluye admins, ordena por nombre)
  const realCsmList = useMemo(() => {
    return csmRows
      .filter((c) => !ADMIN_EMAILS.has(c.email))
      .filter((c) => c.email !== "soporte@truora.com")  // soporte no tiene cartera
      .slice()
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [csmRows]);

  const weeks = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.periodo_actual_fin));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [rows]);

  const scopedAllWeeks = useMemo(() => {
    // Admins: si seleccionaron un CSM en el dropdown, filtran por ese csm_email.
    // Si null, muestran toda la cartera. El toggle "all/mine" no aplica a admins.
    if (isAdmin) {
      if (!adminCsmFilter) return rows;
      return rows.filter((r) => r.cliente?.csm_email === adminCsmFilter);
    }
    // CSMs reales: comportamiento original (toggle "all" / "mine").
    if (scope === "all") return rows;
    if (!userEmail) return rows;
    return rows.filter((r) => r.cliente?.csm_email === userEmail);
  }, [rows, scope, userEmail, isAdmin, adminCsmFilter]);

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
          isAdmin={isAdmin}
          adminCsmFilter={adminCsmFilter}
          setAdminCsmFilter={setAdminCsmFilter}
          realCsmList={realCsmList}
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

          {!loading && !error && rows.length > 0 && weekRows.length === 0 && !isAdmin && scope === "mine" && (
            <EmptyCard text="No tienes clientes con alertas esta semana. Cambia a 'Toda la cartera' para ver al equipo." />
          )}

          {!loading && !error && rows.length > 0 && weekRows.length === 0 && isAdmin && adminCsmFilter && (
            <EmptyCard text={`No hay alertas para ${csmByEmail[adminCsmFilter]?.nombre ?? adminCsmFilter} esta semana. Selecciona otra cartera o vuelve a "Toda la cartera".`} />
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
  isAdmin, adminCsmFilter, setAdminCsmFilter, realCsmList,
}: {
  onBack: () => void;
  weeks: string[];
  selectedWeek: string | null;
  onSelectWeek: (w: string) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  scope: Scope;
  setScope: (s: Scope) => void;
  isAdmin: boolean;
  adminCsmFilter: string | null;
  setAdminCsmFilter: (e: string | null) => void;
  realCsmList: { email: string; nombre: string }[];
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
        {isAdmin ? (
          <AdminCsmDropdown
            csms={realCsmList}
            selected={adminCsmFilter}
            onSelect={setAdminCsmFilter}
          />
        ) : (
          <ToggleGroup
            options={[
              { value: "all",  label: "Toda la cartera", icon: Users },
              { value: "mine", label: "Solo mi cartera", icon: User },
            ]}
            value={scope}
            onChange={(v) => setScope(v as Scope)}
            color="#7C4DFF"
          />
        )}

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

/* ─────────── Admin CSM dropdown (solo visible para Ana / JD) ─────────── */

function AdminCsmDropdown({
  csms, selected, onSelect,
}: {
  csms: { email: string; nombre: string }[];
  selected: string | null;
  onSelect: (e: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ADMIN_COLOR = "#7C4DFF";

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

  const selectedNombre = selected
    ? csms.find((c) => c.email === selected)?.nombre ?? selected
    : "Toda la cartera";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, fontWeight: 600,
          color: ADMIN_COLOR,
          background: `${ADMIN_COLOR}18`,
          border: `1px solid ${ADMIN_COLOR}40`,
          cursor: "pointer", padding: "7px 14px",
          borderRadius: 999, transition: "all 0.15s",
          minWidth: 220, justifyContent: "space-between",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Crown size={13} />
          <span style={{ fontWeight: 700, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: `${ADMIN_COLOR}CC` }}>Admin</span>
          <span style={{ color: S.text }}>·</span>
          <span>{selectedNombre}</span>
        </span>
        <ChevronDown size={13} style={{ transition: "transform 0.18s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: "absolute", left: 0, top: "100%", marginTop: 8,
            minWidth: 260,
            background: S.surfaceHi,
            border: `1px solid ${S.borderHi}`,
            borderRadius: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
            padding: 6,
            maxHeight: 360, overflowY: "auto",
            zIndex: 20,
          }}
        >
          {/* Toda la cartera (default) */}
          {(() => {
            const isSel = selected === null;
            return (
              <button
                onClick={() => { onSelect(null); setOpen(false); }}
                style={{
                  width: "100%", textAlign: "left",
                  padding: "9px 12px", borderRadius: 8,
                  background: isSel ? `${ADMIN_COLOR}18` : "transparent",
                  border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 12, color: isSel ? ADMIN_COLOR : S.text,
                  fontWeight: isSel ? 600 : 500,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Users size={12} />
                  <span>Toda la cartera</span>
                </span>
                {isSel && <span style={{ fontSize: 10, color: ADMIN_COLOR }}>✓</span>}
              </button>
            );
          })()}

          {/* Divider */}
          <div style={{ height: 1, background: S.border, margin: "6px 4px" }} />

          {/* Lista de CSMs */}
          {csms.map((c) => {
            const isSel = c.email === selected;
            return (
              <button
                key={c.email}
                onClick={() => { onSelect(c.email); setOpen(false); }}
                style={{
                  width: "100%", textAlign: "left",
                  padding: "9px 12px", borderRadius: 8,
                  background: isSel ? `${ADMIN_COLOR}18` : "transparent",
                  border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 12, color: isSel ? ADMIN_COLOR : S.text,
                  fontWeight: isSel ? 600 : 500,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <User size={12} />
                  <span>{c.nombre}</span>
                </span>
                {isSel && <span style={{ fontSize: 10, color: ADMIN_COLOR }}>✓</span>}
              </button>
            );
          })}
        </motion.div>
      )}
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
