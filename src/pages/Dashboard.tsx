import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Activity, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { MeshBackground } from "@/components/report-builder/MeshBackground";
import { S } from "@/components/botialertas/types";
import { ClientePicker, PeriodoPicker, ProductosPicker } from "@/components/dashboard/Pickers";
import ClienteView from "@/components/dashboard/ClienteView";
import { useDashboardData } from "@/hooks/useDashboardData";
import { buildPreset, type ClienteRow, type Producto, type PeriodoSeleccion } from "@/components/dashboard/types";

/**
 * Página /dashboard — vista cliente individual.
 *
 * El CSM elige (cliente, periodo, productos) en el top bar y se dispara el
 * webhook n8n que devuelve counters + tendencia + razones de rechazo.
 *
 * RLS team-wide: cualquier CSM ve cualquier cliente (consistente con la
 * decisión 2026-04-29 de boti_alertas + clientes).
 */

export default function Dashboard() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Lista completa de clientes activos (lo lee de Supabase al mount).
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [clientesLoading, setClientesLoading] = useState(true);
  const [clientesError, setClientesError] = useState<string | null>(null);

  // Selección del top bar.
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<PeriodoSeleccion>(() => buildPreset("ult_3_meses"));
  const [productosSel, setProductosSel] = useState<Set<Producto>>(new Set(["DI", "BGC", "CE"]));

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
        .eq("activo", true)
        .order("nombre", { ascending: true });

      if (error) {
        setClientesError(error.message);
      } else {
        setClientes((data ?? []) as ClienteRow[]);
      }
      setClientesLoading(false);
    })();
  }, [navigate]);

  /* ── derived: cliente seleccionado + productos disponibles ────── */
  const cliente = useMemo(
    () => clientes.find((c) => c.id === selectedClienteId) ?? null,
    [clientes, selectedClienteId]
  );

  const productosAvail = useMemo(() => {
    const s = new Set<Producto>();
    if (cliente?.client_id_di) s.add("DI");
    if (cliente?.client_id_bgc) s.add("BGC");
    if (cliente?.client_id_ce) s.add("CE");
    return s;
  }, [cliente]);

  // Cuando cambia el cliente, ajustar productos seleccionados a los disponibles.
  useEffect(() => {
    if (!cliente) return;
    setProductosSel((prev) => {
      const next = new Set<Producto>();
      prev.forEach((p) => { if (productosAvail.has(p)) next.add(p); });
      // Si quedó vacío (cliente sin overlap), usar todos los disponibles.
      if (next.size === 0) productosAvail.forEach((p) => next.add(p));
      return next;
    });
  }, [cliente, productosAvail]);

  /* ── params para el webhook ───────────────────────────────────── */
  const dashboardParams = useMemo(() => {
    if (!cliente || !userEmail || productosSel.size === 0) return null;
    return {
      clientIdDi:  productosSel.has("DI")  ? cliente.client_id_di  : null,
      clientIdBgc: productosSel.has("BGC") ? cliente.client_id_bgc : null,
      clientIdCe:  productosSel.has("CE")  ? cliente.client_id_ce  : null,
      fechaInicio: periodo.inicio,
      fechaFin:    periodo.fin,
      productos:   Array.from(productosSel),
      email:       userEmail,
    };
  }, [cliente, userEmail, productosSel, periodo]);

  const { data, loading, error } = useDashboardData(dashboardParams);

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
          clientes={clientes}
          selectedClienteId={selectedClienteId}
          onSelectCliente={setSelectedClienteId}
          periodo={periodo}
          onPeriodoChange={setPeriodo}
          productosSel={productosSel}
          productosAvail={productosAvail}
          onProductosChange={setProductosSel}
        />

        <main style={{ maxWidth: 1280, margin: "0 auto", padding: "92px 28px 60px" }}>
          {clientesLoading && <EmptyCard text="Cargando clientes…" />}

          {clientesError && (
            <div style={errorBoxStyle}>
              Error al cargar clientes: {clientesError}
            </div>
          )}

          {!clientesLoading && !cliente && (
            <EmptyCard text="Seleccioná un cliente arriba para ver sus métricas." />
          )}

          {cliente && loading && (
            <LoadingCard cliente={cliente.nombre} periodo={periodo} />
          )}

          {cliente && error && (
            <div style={errorBoxStyle}>
              Error al cargar métricas: {error}
            </div>
          )}

          {cliente && data && !loading && !error && (
            <ClienteView cliente={cliente} data={data} />
          )}
        </main>
      </div>
    </>
  );
}

/* ─────────────────────────── Top bar ─────────────────────────── */

function TopBar({
  onBack,
  clientes,
  selectedClienteId,
  onSelectCliente,
  periodo,
  onPeriodoChange,
  productosSel,
  productosAvail,
  onProductosChange,
}: {
  onBack: () => void;
  clientes: ClienteRow[];
  selectedClienteId: string | null;
  onSelectCliente: (id: string | null) => void;
  periodo: PeriodoSeleccion;
  onPeriodoChange: (p: PeriodoSeleccion) => void;
  productosSel: Set<Producto>;
  productosAvail: Set<Producto>;
  onProductosChange: (s: Set<Producto>) => void;
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
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <ClientePicker
          clientes={clientes}
          selectedId={selectedClienteId}
          onSelect={onSelectCliente}
        />
        <PeriodoPicker value={periodo} onChange={onPeriodoChange} />
        {selectedClienteId && (
          <ProductosPicker
            selected={productosSel}
            available={productosAvail}
            onChange={onProductosChange}
          />
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Estados ─────────────────────────── */

function EmptyCard({ text }: { text: string }) {
  return (
    <div
      style={{
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: 14,
        padding: "60px 30px",
        textAlign: "center",
        fontSize: 14,
        color: S.muted,
      }}
    >
      {text}
    </div>
  );
}

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

const errorBoxStyle: React.CSSProperties = {
  background: "rgba(239,68,68,0.10)",
  border: "1px solid rgba(239,68,68,0.30)",
  borderRadius: 14,
  padding: 16,
  fontSize: 13,
  color: "#FCA5A5",
};
