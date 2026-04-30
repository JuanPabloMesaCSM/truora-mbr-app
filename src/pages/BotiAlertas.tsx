import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, Calendar, ChevronDown, Users, User, Crown, CalendarPlus } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { MeshBackground } from "@/components/report-builder/MeshBackground";
import DashboardView from "@/components/botialertas/DashboardView";
import AdhocModal from "@/components/botialertas/AdhocModal";
import { S, fmtWeek, ADMIN_EMAILS, ADMIN_VIEW_EMAILS } from "@/components/botialertas/types";
import type { Alerta } from "@/components/botialertas/types";

type Scope = "all" | "mine";

type ClienteRow = {
  id: string;
  nombre: string;
  csm_email: string;
  client_id_di: string | null;
  client_id_bgc: string | null;
  client_id_ce: string | null;
};

/** Aplica TCI override + dedup a las filas de boti_alertas.
 *  Lo extrajimos afuera del componente para reutilizarlo entre el initial
 *  fetch y el refetch post-adhoc sin duplicar lógica. */
function enrichAlertas(raw: Alerta[], clientes: ClienteRow[]): Alerta[] {
  const tciToCanonical: Record<string, { id: string; nombre: string; csm_email: string; isAdmin: boolean }> = {};
  for (const c of clientes) {
    const isAdmin = ADMIN_EMAILS.has(c.csm_email);
    for (const tci of [c.client_id_di, c.client_id_bgc, c.client_id_ce]) {
      if (!tci) continue;
      const existing = tciToCanonical[tci];
      if (!existing || (existing.isAdmin && !isAdmin)) {
        tciToCanonical[tci] = { id: c.id, nombre: c.nombre, csm_email: c.csm_email, isAdmin };
      }
    }
  }

  const enriched: Alerta[] = raw.map((r) => {
    const real = tciToCanonical[r.client_id_externo];
    if (!real) return r;
    return {
      ...r,
      cliente_id: real.id,
      cliente: { nombre: real.nombre, csm_email: real.csm_email },
    };
  });

  // Dedup defensivo
  const seen = new Set<string>();
  const deduped: Alerta[] = [];
  for (const r of enriched) {
    const key = `${r.client_id_externo}|${r.producto}|${r.periodo_actual_fin}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  return deduped;
}

export default function BotiAlertas() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Alerta[]>([]);
  const [csmRows, setCsmRows] = useState<{ email: string; nombre: string }[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  // Para admins (Ana, JD): filtra por csm_email específico cuando no es null.
  // Cuando es null, muestran toda la cartera. CSMs reales no usan este state.
  const [adminCsmFilter, setAdminCsmFilter] = useState<string | null>(null);
  // Modal "Filtrar fechas" para que admins disparen una corrida ad-hoc
  const [adhocModalOpen, setAdhocModalOpen] = useState(false);
  // Cache de `clientes` (rellenado en initial fetch). Lo usamos al refrescar
  // después de un ad-hoc para aplicar el TCI override sin volver a pedir clientes.
  const clientesCacheRef = useRef<ClienteRow[]>([]);

  /* ── refetch alertas (lo llama handleAdhocSuccess para traer la nueva fila
       que el flujo n8n acaba de upsertear) ─────────────────────────── */
  const refetchAlertas = useCallback(async () => {
    const { data: alertas, error: aErr } = await supabase
      .from("boti_alertas" as never)
      .select("*, cliente:clientes!cliente_id(nombre, csm_email)")
      .order("periodo_actual_fin", { ascending: false })
      .order("variacion_pct", { ascending: true });

    if (aErr) {
      setError(aErr.message);
      return;
    }
    const raw = (alertas ?? []) as unknown as Alerta[];
    setRows(enrichAlertas(raw, clientesCacheRef.current));
  }, []);

  /* ── handler ad-hoc: cuando el modal completa exitosamente, refresca
       la tabla y setea la nueva fecha como semana activa ───────────── */
  const handleAdhocSuccess = useCallback(async (fechaCorte: string) => {
    await refetchAlertas();
    setSelectedWeek(fechaCorte);
  }, [refetchAlertas]);

  /* ── auth + fetch initial ─────────────────────────────────────── */
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

      // Guardar clientes en cache para refetch post-adhoc (sin re-fetch de clientes).
      const clientesArr = (clientes ?? []) as ClienteRow[];
      clientesCacheRef.current = clientesArr;

      if (clErr) console.warn("BotiAlertas: error fetching clientes:", clErr.message);

      if (aErr) setError(aErr.message);
      else {
        const raw = (alertas ?? []) as unknown as Alerta[];
        const deduped = enrichAlertas(raw, clientesArr);
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
  // Admin VIEW: ve el dropdown "Ver cartera de" (Ana, JD, JP Mesa para debug)
  const isAdminView = !!userEmail && ADMIN_VIEW_EMAILS.has(userEmail);
  // Admin puro: NO tiene cartera real (Ana, JD). JP NO entra acá.
  const isPureAdmin = !!userEmail && ADMIN_EMAILS.has(userEmail);

  const csmByEmail = useMemo(() => {
    const m: Record<string, { nombre: string }> = {};
    for (const c of csmRows) m[c.email] = { nombre: c.nombre };
    return m;
  }, [csmRows]);

  // Lista de CSMs reales para el dropdown de admin.
  // Excluye admins puros (Ana, JD) — JP sí queda incluido para que pueda
  // verse a sí mismo en la lista cuando entra como admin view.
  const realCsmList = useMemo(() => {
    return csmRows
      .filter((c) => !ADMIN_EMAILS.has(c.email))
      .filter((c) => c.email !== "soporte@truora.com")  // soporte no tiene cartera
      .slice()
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [csmRows]);

  // Filas visibles según el rol: admin view ve todas (incluyendo ad-hoc),
  // CSMs reales ven solo las del cron semanal (is_adhoc=false).
  const visibleRows = useMemo(() => {
    if (isAdminView) return rows;
    return rows.filter((r) => !r.is_adhoc);
  }, [rows, isAdminView]);

  const weeks = useMemo(() => {
    const set = new Set<string>();
    visibleRows.forEach((r) => set.add(r.periodo_actual_fin));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [visibleRows]);

  // Set de fechas que son ad-hoc (para mostrar el badge "Personalizada"
  // en el dropdown — solo lo ven admins, ya que las filas adhoc se filtran
  // antes para no-admins).
  const adhocWeeks = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.is_adhoc) set.add(r.periodo_actual_fin);
    });
    return set;
  }, [rows]);

  const scopedAllWeeks = useMemo(() => {
    // Admin view + selección de CSM en dropdown: prevalece el filtro del dropdown.
    if (isAdminView && adminCsmFilter) {
      return visibleRows.filter((r) => r.cliente?.csm_email === adminCsmFilter);
    }
    // Toggle "Solo mi cartera" (CSMs reales + JP en modo admin view).
    if (scope === "mine" && userEmail) {
      return visibleRows.filter((r) => r.cliente?.csm_email === userEmail);
    }
    // Default: toda la cartera visible.
    return visibleRows;
  }, [visibleRows, scope, userEmail, isAdminView, adminCsmFilter]);

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
          adhocWeeks={adhocWeeks}
          selectedWeek={selectedWeek}
          onSelectWeek={setSelectedWeek}
          scope={scope}
          setScope={setScope}
          isAdminView={isAdminView}
          isPureAdmin={isPureAdmin}
          adminCsmFilter={adminCsmFilter}
          setAdminCsmFilter={setAdminCsmFilter}
          realCsmList={realCsmList}
          onClickAdhoc={() => setAdhocModalOpen(true)}
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

          {!loading && !error && rows.length > 0 && weekRows.length === 0 && scope === "mine" && !adminCsmFilter && (
            <EmptyCard text="No tienes clientes con alertas esta semana. Cambia a 'Toda la cartera' para ver al equipo." />
          )}

          {!loading && !error && rows.length > 0 && weekRows.length === 0 && isAdminView && adminCsmFilter && (
            <EmptyCard text={`No hay alertas para ${csmByEmail[adminCsmFilter]?.nombre ?? adminCsmFilter} esta semana. Selecciona otra cartera o vuelve a "Toda la cartera".`} />
          )}

          {!loading && !error && weekRows.length > 0 && selectedWeek && (
            <DashboardView
              rows={weekRows}
              allWeeksRows={scopedAllWeeks}
              csmByEmail={csmByEmail}
              weekFin={selectedWeek}
              scope={scope}
            />
          )}
        </main>
      </div>

      {isAdminView && userEmail && (
        <AdhocModal
          open={adhocModalOpen}
          onClose={() => setAdhocModalOpen(false)}
          userEmail={userEmail}
          onSuccess={handleAdhocSuccess}
        />
      )}
    </>
  );
}

/* ─────────────────────────── Top bar ─────────────────────────── */

function TopBar({
  onBack, weeks, adhocWeeks, selectedWeek, onSelectWeek,
  scope, setScope,
  isAdminView, isPureAdmin, adminCsmFilter, setAdminCsmFilter, realCsmList,
  onClickAdhoc,
}: {
  onBack: () => void;
  weeks: string[];
  adhocWeeks: Set<string>;
  selectedWeek: string | null;
  onSelectWeek: (w: string) => void;
  scope: Scope;
  setScope: (s: Scope) => void;
  isAdminView: boolean;
  isPureAdmin: boolean;
  adminCsmFilter: string | null;
  setAdminCsmFilter: (e: string | null) => void;
  realCsmList: { email: string; nombre: string }[];
  onClickAdhoc: () => void;
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
        {/* Admin view (Ana, JD, JP): muestra dropdown ADMIN */}
        {isAdminView && (
          <AdminCsmDropdown
            csms={realCsmList}
            selected={adminCsmFilter}
            onSelect={setAdminCsmFilter}
          />
        )}

        {/* Toggle "Toda / Solo mi cartera": visible para CSMs reales y JP
            (admin view con cartera). Pure admins (Ana, JD) NO lo ven porque
            no tienen cartera real. */}
        {!isPureAdmin && (
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

        {isAdminView && (
          <button
            onClick={onClickAdhoc}
            title="Calcular alertas para una fecha personalizada"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, fontWeight: 600,
              color: "#7C4DFF",
              background: "rgba(124,77,255,0.10)",
              border: "1px solid rgba(124,77,255,0.32)",
              cursor: "pointer", padding: "7px 14px",
              borderRadius: 999, transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(124,77,255,0.18)";
              e.currentTarget.style.borderColor = "rgba(124,77,255,0.50)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(124,77,255,0.10)";
              e.currentTarget.style.borderColor = "rgba(124,77,255,0.32)";
            }}
          >
            <CalendarPlus size={13} />
            <span>Filtrar fechas</span>
          </button>
        )}

        <WeekDropdown weeks={weeks} adhocWeeks={adhocWeeks} selected={selectedWeek} onSelect={onSelectWeek} />
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
  weeks, adhocWeeks, selected, onSelect,
}: {
  weeks: string[];
  adhocWeeks: Set<string>;
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
            const isAdhoc = adhocWeeks.has(w);
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
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {isAdhoc && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: "#7C4DFF",
                      background: "rgba(124,77,255,0.15)",
                      padding: "2px 6px", borderRadius: 4,
                    }}>
                      Personalizada
                    </span>
                  )}
                  {!isAdhoc && i === 0 && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: "#7DD3FC",
                      background: "rgba(56,189,248,0.15)",
                      padding: "2px 6px", borderRadius: 4,
                    }}>
                      Última
                    </span>
                  )}
                </span>
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
