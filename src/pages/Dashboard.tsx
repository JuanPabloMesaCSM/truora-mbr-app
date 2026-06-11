import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Activity, Loader2, Download } from "lucide-react";
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
import PortfolioTable from "@/components/dashboard/PortfolioTable";
import ClientLookupBar from "@/components/dashboard/ClientLookupBar";
import { useDashboardData } from "@/hooks/useDashboardData";
import { usePortfolioConsumption } from "@/hooks/usePortfolioConsumption";
import { useClientLookup } from "@/hooks/useClientLookup";
import { exportDashboardPDF } from "@/utils/exportDashboardPDF";
import {
  buildPreset,
  fmtMonthShort,
  type ClienteRow,
  type Producto,
  type PeriodoSeleccion,
  type TipoFallo,
} from "@/components/dashboard/types";

// DEV ONLY: saltar el gate de login en local (mismo patrón que Index.tsx).
// En este modo el cliente Supabase usa service_role (ver supabaseClient.ts),
// así que clientes / portfolio_consumption cargan sin sesión. Gated a DEV.
const DEV_BYPASS_LOGIN =
  import.meta.env.DEV && String(import.meta.env.VITE_DEV_BYPASS_LOGIN).toLowerCase() === "true";
const DEV_USER_EMAIL =
  (import.meta.env.VITE_DEV_USER_EMAIL as string | undefined)?.trim() || "jpmesa@truora.com";

/**
 * Página /dashboard — Dashboard de Cartera.
 *
 * Flujo:
 *   1. Sin cliente: panel central muestra tabla portfolio (consumo de toda la
 *      cartera dentro del rango). Click en fila → entra al cliente.
 *      Header siempre tiene search-by-TCI + period picker centrado.
 *   2. Con cliente: header agrega productos + tipo_fallo; main muestra
 *      ClienteView con los 4 charts por producto.
 *
 * Datos:
 *   - Tabla portfolio: lee public.portfolio_consumption (cron LMV 6 AM BOG).
 *   - Drill-down: webhook n8n on-demand (~30-60s).
 *
 * RLS team-wide: cualquier CSM ve cualquier cliente (decisión 2026-04-29).
 */

export default function Dashboard() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [clientesLoading, setClientesLoading] = useState(true);
  const [clientesError, setClientesError] = useState<string | null>(null);

  // Mapeo email → nombre legible de la tabla csm. Para mostrar "Daniela
  // Tibaquirá" en vez de "dtibaquira@truora.com" en la tabla portfolio.
  const [csmNombres, setCsmNombres] = useState<Map<string, string>>(new Map());

  /* ── selección activa del CSM ─────────────────────────────────── */
  const [selectedCliente, setSelectedCliente] = useState<ClienteRow | null>(null);
  const [periodo, setPeriodo] = useState<PeriodoSeleccion>(() => buildPreset("ult_3_meses"));
  const [productosSel, setProductosSel] = useState<Set<Producto>>(new Set(["DI", "BGC", "CE"]));
  const [tipoFallo, setTipoFallo] = useState<TipoFallo>("ambos");

  /* ── auth + fetch initial ─────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      let email: string | null = null;
      if (DEV_BYPASS_LOGIN) {
        email = DEV_USER_EMAIL;
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.email) {
          navigate("/login");
          return;
        }
        email = session.user.email;
      }
      setUserEmail(email);
      setAuthChecked(true);

      const [clientesRes, csmRes] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, nombre, csm_email, client_id_di, client_id_bgc, client_id_ce, activo")
          .eq("activo", true),
        supabase.from("csm").select("email, nombre"),
      ]);

      if (clientesRes.error) {
        setClientesError(clientesRes.error.message);
      } else {
        setClientes((clientesRes.data ?? []) as ClienteRow[]);
      }

      const m = new Map<string, string>();
      for (const c of (csmRes.data ?? []) as { email: string; nombre: string | null }[]) {
        if (c.email && c.nombre) m.set(c.email, c.nombre);
      }
      setCsmNombres(m);

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

  /* ── params para el webhook (drill-down) ──────────────────────── */
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

  /* ── portfolio (panel principal sin cliente) ──────────────────── */
  const portfolio = usePortfolioConsumption(periodo);

  /* ── lookup efímero de cualquier Client ID (fuera de cartera) ──── */
  const lookup = useClientLookup();

  // Best-effort: si el TCI consultado SÍ está en algún cliente local, mostramos
  // su nombre canónico. Si no, es un TCI externo y mostramos el TCI crudo.
  const lookupName = useMemo(() => {
    const id = lookup.clientId;
    if (!id) return null;
    const c = clientes.find(
      (x) => x.client_id_di === id || x.client_id_bgc === id || x.client_id_ce === id
    );
    return c?.nombre ?? null;
  }, [lookup.clientId, clientes]);

  /* ── export PDF ───────────────────────────────────────────────── */
  const [exporting, setExporting] = useState(false);

  async function handleExportPDF() {
    if (!selectedCliente) return;
    const root = document.getElementById("dashboard-export-root");
    if (!root) return;
    const safeName = selectedCliente.nombre.replace(/[^\w\-]+/g, "_");
    const filename = `Dashboard_${safeName}_${periodo.inicio}_${periodo.fin}.pdf`;
    setExporting(true);
    try {
      await exportDashboardPDF({ rootElement: root, filename });
    } catch (err) {
      console.error("[Dashboard] export PDF error:", err);
    } finally {
      setExporting(false);
    }
  }

  /* ── render ───────────────────────────────────────────────────── */
  if (!authChecked) return null;

  const hasSelection = !!selectedCliente;
  const canExport = hasSelection && !!data && !loading && !error;

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
          canExport={canExport}
          exporting={exporting}
          onExport={handleExportPDF}
        />

        <main style={{ maxWidth: 1320, margin: "0 auto", padding: "92px 28px 60px" }}>
          {/* Sin cliente: barra de lookup + (resultado lookup | tabla portfolio) */}
          {!hasSelection && (
            clientesLoading ? (
              <div style={emptyCardStyle}>Cargando clientes…</div>
            ) : clientesError ? (
              <div style={errorBoxStyle}>Error al cargar clientes: {clientesError}</div>
            ) : (
              <>
                <ClientLookupBar
                  onSearch={lookup.query}
                  onClear={lookup.clear}
                  loading={lookup.loading}
                  active={lookup.active}
                />

                {lookup.active ? (
                  lookup.loading ? (
                    <LookupLoadingCard tci={lookup.clientId!} />
                  ) : lookup.error ? (
                    <div style={errorBoxStyle}>
                      Error al consultar {lookup.clientId}: {lookup.error}
                      <div style={{ fontSize: 11, marginTop: 8, color: S.muted }}>
                        Verificá que el webhook "Portfolio Client Lookup" esté activo en n8n.
                      </div>
                    </div>
                  ) : lookup.notFound ? (
                    <LookupEmptyCard tci={lookup.clientId!} />
                  ) : (
                    <PortfolioTable
                      rows={lookup.rows}
                      meta={{ ultimaActualizacion: null, filasOrigen: 0 }}
                      loading={false}
                      error={null}
                      clientes={clientes}
                      csmNombres={csmNombres}
                      periodo={periodo}
                      disableDrilldown
                      dimUnassigned={false}
                      titleOverride={`Consulta: ${lookupName ?? lookup.clientId}`}
                      subtitleOverride={
                        <>
                          Consumo facturable ·{" "}
                          {lookup.coveredFrom && lookup.coveredTo
                            ? `${fmtMonthShort(lookup.coveredFrom)} → ${fmtMonthShort(lookup.coveredTo)}`
                            : "últimos 3 meses"}
                          {lookupName
                            ? " · cliente en CSM Center"
                            : " · fuera de tu cartera"}
                        </>
                      }
                      footerOverride={
                        <>
                          ▸ expandí una fila para ver el desglose por sub-producto. Trae todo el
                          rango disponible (último año).
                        </>
                      }
                    />
                  )
                ) : (
                  <PortfolioTable
                    rows={portfolio.rows}
                    meta={portfolio.meta}
                    loading={portfolio.loading}
                    error={portfolio.error}
                    clientes={clientes}
                    csmNombres={csmNombres}
                    periodo={periodo}
                    onClickCliente={setSelectedCliente}
                  />
                )}
              </>
            )
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
  canExport,
  exporting,
  onExport,
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
  canExport: boolean;
  exporting: boolean;
  onExport: () => void;
}) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0,
      display: "grid",
      gridTemplateColumns: "1fr auto 1fr",
      alignItems: "center",
      padding: "14px 24px", gap: 12,
      background: "rgba(8,12,31,0.7)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderBottom: `1px solid ${S.border}`,
      zIndex: 10,
    }}>
      {/* Izquierda: volver + título */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifySelf: "start" }}>
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

      {/* Centro: search TCI + periodo (siempre visible) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifySelf: "center", flexWrap: "wrap" }}>
        <ClientePicker
          clientes={clientes}
          selected={selectedCliente}
          onSelect={onSelectCliente}
          variant="compact"
        />
        <PeriodoPicker value={periodo} onChange={onPeriodoChange} />
      </div>

      {/* Derecha: filtros que solo aplican al drill-down */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, justifySelf: "end", flexWrap: "wrap" }}>
        {hasSelection && (
          <>
            <ProductosPicker
              selected={productosSel}
              available={productosAvail}
              onChange={onProductosChange}
            />
            <TipoFalloPicker value={tipoFallo} onChange={onTipoFalloChange} />
            <button
              onClick={onExport}
              disabled={!canExport || exporting}
              title={canExport ? "Exportar a PDF" : "Esperá a que carguen las métricas"}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 12px", borderRadius: 999,
                fontSize: 12, fontWeight: 600,
                color: canExport && !exporting ? "#FFFFFF" : S.muted,
                background: canExport && !exporting
                  ? "linear-gradient(135deg, #7C4DFF, #4B6FFF)"
                  : S.surface,
                border: canExport && !exporting
                  ? "1px solid rgba(124,77,255,0.5)"
                  : `1px solid ${S.border}`,
                cursor: canExport && !exporting ? "pointer" : "not-allowed",
                opacity: canExport ? 1 : 0.55,
                boxShadow: canExport && !exporting
                  ? "0 2px 10px rgba(124,77,255,0.25)"
                  : "none",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                if (canExport && !exporting) e.currentTarget.style.opacity = "0.88";
              }}
              onMouseLeave={(e) => {
                if (canExport && !exporting) e.currentTarget.style.opacity = "1";
              }}
            >
              {exporting
                ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                : <Download size={13} />}
              <span>{exporting ? "Generando…" : "Exportar PDF"}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
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

function LookupLoadingCard({ tci }: { tci: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: 14,
        padding: "44px 30px",
        textAlign: "center",
      }}
    >
      <Loader2 size={26} style={{ color: "#7C4DFF", animation: "spin 1s linear infinite" }} />
      <div style={{ marginTop: 14, fontSize: 14, color: S.text, fontWeight: 600 }}>
        Consultando consumo de{" "}
        <code style={{ fontSize: 12, color: S.muted }}>{tci}</code>…
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: S.muted }}>
        Consulta directa a ClickHouse (últimos 3 meses). Toma unos segundos.
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </motion.div>
  );
}

function LookupEmptyCard({ tci }: { tci: string }) {
  return (
    <div style={emptyCardStyle}>
      <div style={{ fontSize: 14, fontWeight: 600, color: S.text, marginBottom: 6 }}>
        Sin consumo para este Client ID.
      </div>
      <div style={{ fontSize: 12 }}>
        <code style={{ fontSize: 11, color: S.muted }}>{tci}</code> no registró consumo en el
        último año. Verificá que el TCI sea correcto.
      </div>
    </div>
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
