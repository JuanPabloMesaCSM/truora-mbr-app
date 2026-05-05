import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Activity, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { MeshBackground } from "@/components/report-builder/MeshBackground";
import { S } from "@/components/botialertas/types";
import {
  ClientePicker,
  PeriodoPicker,
  ProductosPicker,
  TipoFalloPicker,
} from "@/components/dashboard/Pickers";
import ClienteView from "@/components/dashboard/ClienteView";
import { useDashboardData } from "@/hooks/useDashboardData";
import {
  buildPreset,
  type ClienteRow,
  type Producto,
  type PeriodoSeleccion,
  type TipoFallo,
} from "@/components/dashboard/types";

/**
 * Página /dashboard — vista cliente individual con búsqueda por TCI.
 *
 * Flujo:
 *   1. Sin cliente: panel central con search-by-TCI hero + periodo picker grande.
 *   2. Con cliente: pickers suben al top bar; main muestra ClienteView con
 *      4 charts por producto (Recharts).
 *
 * Filtro global tipo_fallo (declinado/expirado/ambos): persiste en top bar
 * cuando hay cliente. Afecta principalmente las visuales de razones DI.
 *
 * RLS team-wide: cualquier CSM ve cualquier cliente (consistente con la
 * decisión 2026-04-29 de boti_alertas + clientes).
 */

export default function Dashboard() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [clientesLoading, setClientesLoading] = useState(true);
  const [clientesError, setClientesError] = useState<string | null>(null);

  /* ── selección activa del CSM ─────────────────────────────────── */
  const [selectedCliente, setSelectedCliente] = useState<ClienteRow | null>(null);
  const [periodo, setPeriodo] = useState<PeriodoSeleccion>(() => buildPreset("ult_3_meses"));
  const [productosSel, setProductosSel] = useState<Set<Producto>>(new Set(["DI", "BGC", "CE"]));
  const [tipoFallo, setTipoFallo] = useState<TipoFallo>("ambos");

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

      const { data, error } = await supabase
        .from("clientes")
        .select("id, nombre, csm_email, client_id_di, client_id_bgc, client_id_ce, activo")
        .eq("activo", true);

      if (error) {
        setClientesError(error.message);
      } else {
        setClientes((data ?? []) as ClienteRow[]);
      }
      setClientesLoading(false);
    })();
  }, [navigate]);

  /* ── productos disponibles según cliente seleccionado ─────────── */
  const productosAvail = useMemo(() => {
    const s = new Set<Producto>();
    if (selectedCliente?.client_id_di) s.add("DI");
    if (selectedCliente?.client_id_bgc) s.add("BGC");
    if (selectedCliente?.client_id_ce) s.add("CE");
    return s;
  }, [selectedCliente]);

  // Cuando cambia el cliente, ajustar productos seleccionados a los disponibles.
  useEffect(() => {
    if (!selectedCliente) return;
    setProductosSel((prev) => {
      const next = new Set<Producto>();
      prev.forEach((p) => { if (productosAvail.has(p)) next.add(p); });
      if (next.size === 0) productosAvail.forEach((p) => next.add(p));
      return next;
    });
  }, [selectedCliente, productosAvail]);

  /* ── params para el webhook ───────────────────────────────────── */
  const dashboardParams = useMemo(() => {
    if (!selectedCliente || !userEmail || productosSel.size === 0) return null;
    return {
      clientIdDi:  productosSel.has("DI")  ? selectedCliente.client_id_di  : null,
      clientIdBgc: productosSel.has("BGC") ? selectedCliente.client_id_bgc : null,
      clientIdCe:  productosSel.has("CE")  ? selectedCliente.client_id_ce  : null,
      fechaInicio: periodo.inicio,
      fechaFin:    periodo.fin,
      productos:   Array.from(productosSel),
      tipoFallo,
      email:       userEmail,
    };
  }, [selectedCliente, userEmail, productosSel, periodo, tipoFallo]);

  const { data, loading, error } = useDashboardData(dashboardParams);

  /* ── render ───────────────────────────────────────────────────── */
  if (!authChecked) return null;

  const hasSelection = !!selectedCliente;

  return (
    <>
      <MeshBackground />
      <div style={{
        position: "relative", zIndex: 1, minHeight: "100vh",
        color: S.text, fontFamily: "Inter, system-ui, sans-serif",
      }}>
        <TopBar
          onBack={() => navigate("/")}
          hasSelection={hasSelection}
          clientes={clientes}
          selectedCliente={selectedCliente}
          onSelectCliente={setSelectedCliente}
          periodo={periodo}
          onPeriodoChange={setPeriodo}
          productosSel={productosSel}
          productosAvail={productosAvail}
          onProductosChange={setProductosSel}
          tipoFallo={tipoFallo}
          onTipoFalloChange={setTipoFallo}
        />

        <main style={{ maxWidth: 1320, margin: "0 auto", padding: "92px 28px 60px" }}>
          {/* Panel central (sin cliente seleccionado) */}
          {!hasSelection && (
            <CentralPicker
              loading={clientesLoading}
              error={clientesError}
              clientes={clientes}
              onSelectCliente={setSelectedCliente}
              periodo={periodo}
              onPeriodoChange={setPeriodo}
            />
          )}

          {/* Vista cliente */}
          {hasSelection && loading && (
            <LoadingCard cliente={selectedCliente!.nombre} periodo={periodo} />
          )}

          {hasSelection && error && (
            <div style={errorBoxStyle}>
              Error al cargar métricas: {error}
            </div>
          )}

          {hasSelection && data && !loading && !error && (
            <ClienteView
              cliente={selectedCliente!}
              data={data}
              tipoFallo={tipoFallo}
            />
          )}
        </main>
      </div>
    </>
  );
}

/* ─────────────────────────── Top bar ─────────────────────────── */

function TopBar({
  onBack,
  hasSelection,
  clientes,
  selectedCliente,
  onSelectCliente,
  periodo,
  onPeriodoChange,
  productosSel,
  productosAvail,
  onProductosChange,
  tipoFallo,
  onTipoFalloChange,
}: {
  onBack: () => void;
  hasSelection: boolean;
  clientes: ClienteRow[];
  selectedCliente: ClienteRow | null;
  onSelectCliente: (c: ClienteRow | null) => void;
  periodo: PeriodoSeleccion;
  onPeriodoChange: (p: PeriodoSeleccion) => void;
  productosSel: Set<Producto>;
  productosAvail: Set<Producto>;
  onProductosChange: (s: Set<Producto>) => void;
  tipoFallo: TipoFallo;
  onTipoFalloChange: (t: TipoFallo) => void;
}) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 24px", gap: 12,
      background: "rgba(8,12,31,0.7)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderBottom: `1px solid ${S.border}`,
      zIndex: 10,
    }}>
      {/* Izquierda: volver + título */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "transparent", border: `1px solid ${S.border}`,
            color: S.muted, cursor: "pointer",
            padding: "6px 11px", borderRadius: 8,
            fontSize: 12,
          }}
        >
          <ArrowLeft size={13} />
          <span>Volver</span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Activity size={15} color="#7C4DFF" />
          <span style={{ fontSize: 14, fontWeight: 700, color: S.text }}>
            Dashboard de Cartera
          </span>
        </div>
      </div>

      {/* Derecha: pickers solo cuando hay cliente seleccionado */}
      {hasSelection && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <ClientePicker
            clientes={clientes}
            selected={selectedCliente}
            onSelect={onSelectCliente}
            variant="compact"
          />
          <PeriodoPicker value={periodo} onChange={onPeriodoChange} />
          <ProductosPicker
            selected={productosSel}
            available={productosAvail}
            onChange={onProductosChange}
          />
          <TipoFalloPicker value={tipoFallo} onChange={onTipoFalloChange} />
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Central picker (sin cliente) ─────────────────────────── */

function CentralPicker({
  loading,
  error,
  clientes,
  onSelectCliente,
  periodo,
  onPeriodoChange,
}: {
  loading: boolean;
  error: string | null;
  clientes: ClienteRow[];
  onSelectCliente: (c: ClienteRow | null) => void;
  periodo: PeriodoSeleccion;
  onPeriodoChange: (p: PeriodoSeleccion) => void;
}) {
  if (loading) {
    return (
      <div style={emptyCardStyle}>Cargando clientes…</div>
    );
  }
  if (error) {
    return (
      <div style={errorBoxStyle}>
        Error al cargar clientes: {error}
      </div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      style={{
        marginTop: 28,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
      }}
    >
      <ClientePicker
        clientes={clientes}
        selected={null}
        onSelect={onSelectCliente}
        variant="hero"
      />

      {/* Periodo picker grande con foco en "rango personalizado" */}
      <div
        style={{
          background: S.surface,
          border: `1px solid ${S.border}`,
          borderRadius: 16,
          padding: "20px 26px",
          maxWidth: 620,
          width: "100%",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "#7DD3FC",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            Periodo
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: S.text }}>
            {labelPeriodo(periodo)}
          </div>
          <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>
            Tip: para rangos custom (ej. "todo el 2026"), usá <strong style={{ color: S.text }}>Rango personalizado</strong>.
          </div>
        </div>
        <PeriodoPicker value={periodo} onChange={onPeriodoChange} />
      </div>
    </motion.div>
  );
}

function labelPeriodo(p: PeriodoSeleccion): string {
  if (p.preset === "custom") return `${p.inicio} → ${p.fin}`;
  return `${p.inicio} → ${p.fin}`;
}

/* ─────────────────────────── Estados ─────────────────────────── */

function LoadingCard({ cliente, periodo }: { cliente: string; periodo: PeriodoSeleccion }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: 14,
        padding: "50px 30px",
        textAlign: "center",
      }}
    >
      <Loader2
        size={28}
        style={{ color: "#7C4DFF", animation: "spin 1s linear infinite" }}
      />
      <div style={{ marginTop: 16, fontSize: 14, color: S.text, fontWeight: 600 }}>
        Consultando métricas de {cliente}…
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: S.muted }}>
        Rango: {periodo.inicio} → {periodo.fin}. Esto toma 30-60 segundos.
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}

const emptyCardStyle: React.CSSProperties = {
  background: S.surface,
  border: `1px solid ${S.border}`,
  borderRadius: 14,
  padding: "60px 30px",
  textAlign: "center",
  fontSize: 14,
  color: S.muted,
};

const errorBoxStyle: React.CSSProperties = {
  background: "rgba(239,68,68,0.10)",
  border: "1px solid rgba(239,68,68,0.30)",
  borderRadius: 14,
  padding: 16,
  fontSize: 13,
  color: "#FCA5A5",
};
