import { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight,
  X as XIcon, ClipboardCopy, Check,
} from "lucide-react";
import {
  S, SEV_META, PROD_LIST, PROD_META,
  fmtNum, fmtNumSigned, fmtPct, fmtMonthLong, fmtRangeHumano, pctDelta,
} from "./types";
import type { Alerta, Producto, Severidad } from "./types";

interface Props {
  rows: Alerta[];           // filas de la semana seleccionada (ya filtradas por scope)
  allWeeksRows: Alerta[];   // historico completo para sparklines (ya filtradas por scope)
  csmByEmail: Record<string, { nombre: string }>;
  weekFin: string;          // YYYY-MM-DD de la semana seleccionada
  scope: "all" | "mine";    // para el botón "copiar resumen"
}

type KpiKey = "riesgo" | "creciendo" | "estables" | "total";

/* ========================================================================
   DashboardView — vista de embudo
   ======================================================================== */
export default function DashboardView({ rows, allWeeksRows, csmByEmail, weekFin, scope }: Props) {
  const [expandedProduct, setExpandedProduct] = useState<Producto | null>(null);
  const [expandedKpi, setExpandedKpi] = useState<KpiKey | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [drawerClient, setDrawerClient] = useState<string | null>(null);

  /* ─── aggregations ─────────────────────────────────────────────── */

  const productAggs = useMemo(() => {
    const out = {} as Record<Producto, {
      valor_actual: number;
      valor_anterior: number;
      variacion_pct: number | null;
      variacion_abs: number;
      counts: Record<Severidad, number>;
    }>;
    for (const p of PROD_LIST) {
      const rs = rows.filter((r) => r.producto === p);
      const va = rs.reduce((s, r) => s + Number(r.valor_actual ?? 0), 0);
      const vp = rs.reduce((s, r) => s + Number(r.valor_anterior ?? 0), 0);
      const counts: Record<Severidad, number> = { critica: 0, fuerte: 0, crecimiento: 0, leve: 0, estable: 0 };
      rs.forEach((r) => counts[r.severidad]++);
      out[p] = {
        valor_actual: va,
        valor_anterior: vp,
        variacion_pct: pctDelta(va, vp),
        variacion_abs: va - vp,
        counts,
      };
    }
    return out;
  }, [rows]);

  const portfolioCounts = useMemo(() => {
    const riesgo = new Set<string>();
    const creciendo = new Set<string>();
    const estables = new Set<string>();
    const total = new Set<string>();
    for (const r of rows) {
      total.add(r.cliente_id);
      if (r.severidad === "critica" || r.severidad === "fuerte") riesgo.add(r.cliente_id);
      else if (r.severidad === "crecimiento") creciendo.add(r.cliente_id);
      else if (r.severidad === "estable" || r.severidad === "leve") estables.add(r.cliente_id);
    }
    for (const id of riesgo) estables.delete(id);
    for (const id of creciendo) estables.delete(id);
    return { riesgo, creciendo, estables, total };
  }, [rows]);

  // Top movers: estricto a las 3 severidades del header (crítica + fuerte + crecimiento).
  // SIN filtro de volumen — los conteos del card y la lista deben matchear EXACTO.
  // (El filtro VOLUME_FLOOR_TELEGRAM=500 vive en classify.js solo para evitar spam de
  // Telegram, pero todas las clasificaciones se guardan en boti_alertas y deben mostrarse acá.)
  const topMovers = useMemo(() => {
    const out = {} as Record<Producto, { caidas: Alerta[]; crecimientos: Alerta[] }>;
    for (const p of PROD_LIST) {
      const rs = rows.filter((r) => r.producto === p);
      const sorted = [...rs].sort(
        (a, b) => Math.abs(Number(b.variacion_abs ?? 0)) - Math.abs(Number(a.variacion_abs ?? 0))
      );
      out[p] = {
        caidas: sorted.filter((r) => r.severidad === "critica" || r.severidad === "fuerte"),
        crecimientos: sorted.filter((r) => r.severidad === "crecimiento"),
      };
    }
    return out;
  }, [rows]);

  // Resumen global cross-producto.
  const globalRiesgo = useMemo(() => {
    return rows
      .filter((r) => r.severidad === "critica" || r.severidad === "fuerte")
      .sort((a, b) => Math.abs(Number(b.variacion_abs ?? 0)) - Math.abs(Number(a.variacion_abs ?? 0)));
  }, [rows]);

  const globalCrecimiento = useMemo(() => {
    return rows
      .filter((r) => r.severidad === "crecimiento")
      .sort((a, b) => Math.abs(Number(b.variacion_abs ?? 0)) - Math.abs(Number(a.variacion_abs ?? 0)));
  }, [rows]);

  const consolidatedRows = useMemo(() => {
    const byClient: Record<string, {
      cliente_id: string;
      nombre: string;
      csm_email: string | null;
      cells: Partial<Record<Producto, Alerta>>;
      balance: number;
    }> = {};
    for (const r of rows) {
      if (!byClient[r.cliente_id]) {
        byClient[r.cliente_id] = {
          cliente_id: r.cliente_id,
          nombre: r.cliente?.nombre ?? r.client_id_externo,
          csm_email: r.cliente?.csm_email ?? null,
          cells: {},
          balance: 0,
        };
      }
      byClient[r.cliente_id].cells[r.producto] = r;
    }
    // Balance = suma de variacion_abs cross-producto. La suma de todos los balances
    // debe igualar al delta del Oppy hero (matemáticamente: Σ_clients Σ_products
    // variacion_abs = Σ_all_rows variacion_abs = totalActual - totalAnterior).
    for (const c of Object.values(byClient)) {
      c.balance = PROD_LIST.reduce((s, p) => s + Number(c.cells[p]?.variacion_abs ?? 0), 0);
    }
    // Sort por |balance| descendente — los que más mueven volumen (sin importar
    // el signo o si clasificaron como alerta) flotan al tope. Esto surfacea
    // clientes con caídas grandes en número pero severidad 'estable' (% bajo).
    return Object.values(byClient).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [rows]);

  // Histórico por TCI+producto (no por cliente_id) para que sobreviva si el dedup
  // de boti_alertas eligió cliente_ids distintos en distintas semanas.
  const historyByTciProduct = useMemo(() => {
    const m: Record<string, Alerta[]> = {};
    for (const r of allWeeksRows) {
      const key = r.client_id_externo + "|" + r.producto;
      if (!m[key]) m[key] = [];
      m[key].push(r);
    }
    for (const k in m) m[k].sort((a, b) => a.periodo_actual_fin.localeCompare(b.periodo_actual_fin));
    return m;
  }, [allWeeksRows]);

  /* ─── helpers para encabezados de fechas ───────────────────────── */
  const sample = rows[0];
  const mesActualLabel = sample ? fmtMonthLong(sample.periodo_actual_fin) : "—";
  const mesPrevLabel   = sample ? fmtMonthLong(sample.periodo_anterior_fin) : "—";
  const rangoActual    = sample ? fmtRangeHumano(sample.periodo_actual_inicio, sample.periodo_actual_fin) : "—";
  const rangoPrev      = sample ? fmtRangeHumano(sample.periodo_anterior_inicio, sample.periodo_anterior_fin) : "—";

  /* ─── render ───────────────────────────────────────────────────── */

  const drawerData = drawerClient ? consolidatedRows.find((c) => c.cliente_id === drawerClient) : null;

  // Pulso general "Oppy" — suma de volumen actual vs anterior cross-producto.
  // Aviso: las 3 métricas tienen unidades distintas (validaciones / checks /
  // conversaciones), pero el ratio de cambio sigue siendo informativo como
  // "qué tanto se mueve el consumo total del equipo".
  const oppyTotal = PROD_LIST.reduce(
    (acc, p) => ({
      actual: acc.actual + productAggs[p].valor_actual,
      anterior: acc.anterior + productAggs[p].valor_anterior,
    }),
    { actual: 0, anterior: 0 }
  );

  return (
    <>
      <Pulse weekFin={weekFin} totalClientes={portfolioCounts.total.size} rangoActual={rangoActual} rangoPrev={rangoPrev} />

      <OppyHero totalActual={oppyTotal.actual} totalAnterior={oppyTotal.anterior} />

      <KpiBanner
        counts={portfolioCounts}
        expanded={expandedKpi}
        onToggle={(k) => setExpandedKpi(expandedKpi === k ? null : k)}
        consolidatedRows={consolidatedRows}
        csmByEmail={csmByEmail}
        onClickClient={(id) => setDrawerClient(id)}
      />

      <CopyResumenButton
        weekFin={weekFin}
        scope={scope}
        portfolioCounts={portfolioCounts}
        productAggs={productAggs}
        topMovers={topMovers}
      />

      <ProductRow
        aggs={productAggs}
        expanded={expandedProduct}
        onToggle={(p) => setExpandedProduct(expandedProduct === p ? null : p)}
        topMovers={topMovers}
        csmByEmail={csmByEmail}
        onClickClient={(id) => setDrawerClient(id)}
        mesActualLabel={mesActualLabel}
        mesPrevLabel={mesPrevLabel}
      />

      <TableSection
        open={tableOpen}
        onToggle={() => setTableOpen((o) => !o)}
        rows={consolidatedRows}
        csmByEmail={csmByEmail}
        onClickClient={(id) => setDrawerClient(id)}
        mesActualLabel={mesActualLabel}
        mesPrevLabel={mesPrevLabel}
      />

      <GlobalSummary
        riesgo={globalRiesgo}
        crecimiento={globalCrecimiento}
        csmByEmail={csmByEmail}
        onClickClient={(id) => setDrawerClient(id)}
        mesActualLabel={mesActualLabel}
        mesPrevLabel={mesPrevLabel}
      />

      <AnimatePresence>
        {drawerData && (
          <ClientModal
            data={drawerData}
            history={historyByTciProduct}
            csmByEmail={csmByEmail}
            onClose={() => setDrawerClient(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/** Color por severidad individual, usado en filas de tablas. */
function sevColor(severidad: Severidad): string {
  if (severidad === "critica") return "#EF4444";
  if (severidad === "fuerte") return "#F59E0B";
  if (severidad === "crecimiento") return "#10B981";
  if (severidad === "leve") return "#FBBF24";
  return "#94A3B8";
}

function severityScore(cells: Partial<Record<Producto, Alerta>>): number {
  let s = 0;
  for (const k of Object.keys(cells)) {
    const a = cells[k as Producto];
    if (!a) continue;
    if (a.severidad === "critica") s += 4;
    else if (a.severidad === "fuerte") s += 2;
    else if (a.severidad === "crecimiento") s += 1;
  }
  return s;
}

/* =========================================================================
   PULSE — header con periodo y rangos REALES
   ========================================================================= */
function Pulse({
  weekFin, totalClientes, rangoActual, rangoPrev,
}: { weekFin: string; totalClientes: number; rangoActual: string; rangoPrev: string }) {
  const fechaTitulo = new Date(weekFin).toLocaleDateString("es-CO", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      style={{ marginBottom: 24 }}
    >
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        fontSize: 11, fontWeight: 600, color: "#7DD3FC",
        letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 14,
      }}>
        <div style={{ width: 18, height: 1, background: "#7DD3FC", opacity: 0.6 }} />
        Pulso del portafolio
      </div>

      <h1 style={{
        fontSize: 32, fontWeight: 800, color: S.text,
        lineHeight: 1.1, letterSpacing: "-0.02em",
        margin: 0, marginBottom: 12,
      }}>
        Semana del {fechaTitulo}
      </h1>

      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ fontSize: 12.5, color: S.muted, lineHeight: 1.5 }}>
          <span style={{ color: S.dim, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginRight: 6 }}>
            Actual
          </span>
          <span style={{ color: S.text, fontWeight: 600 }}>{rangoActual}</span>
        </div>
        <div style={{ fontSize: 12.5, color: S.muted, lineHeight: 1.5 }}>
          <span style={{ color: S.dim, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginRight: 6 }}>
            Anterior
          </span>
          <span style={{ color: S.text, fontWeight: 600 }}>{rangoPrev}</span>
        </div>
        <div style={{ fontSize: 12.5, color: S.muted, lineHeight: 1.5 }}>
          <span style={{ color: S.dim, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginRight: 6 }}>
            Cobertura
          </span>
          <span style={{ color: S.text, fontWeight: 600 }}>{totalClientes} clientes con datos</span>
        </div>
      </div>
    </motion.div>
  );
}

/* =========================================================================
   OPPY HERO — pulso general cross-producto (centrado en pantalla)
   Muestra "Oppy creció/decreció X%" combinando volumen total de los 3 productos.
   Las unidades difieren (validaciones / checks / conversaciones) — interpretarse
   como "ritmo combinado del consumo del equipo", no como una unidad única.
   ========================================================================= */
function OppyHero({ totalActual, totalAnterior }: { totalActual: number; totalAnterior: number }) {
  const delta = totalActual - totalAnterior;
  const pct = pctDelta(totalActual, totalAnterior);
  const isUp = (pct ?? 0) >= 0;
  const color = pct == null ? S.muted : isUp ? "#10B981" : "#EF4444";
  const verb = isUp ? "creció" : "decreció";
  const TrendIcon = isUp ? TrendingUp : TrendingDown;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1, ease: "easeOut" }}
      style={{
        position: "relative",
        background: `linear-gradient(180deg, ${color}12 0%, ${S.surface} 75%)`,
        border: `1px solid ${color}40`,
        borderRadius: 18,
        padding: "26px 24px 22px",
        marginBottom: 22,
        textAlign: "center",
        overflow: "hidden",
      }}
    >
      {/* glow sutil de fondo */}
      <div style={{
        position: "absolute",
        top: -40, left: "50%", transform: "translateX(-50%)",
        width: 320, height: 80,
        background: `radial-gradient(ellipse at center, ${color}25, transparent 70%)`,
        filter: "blur(20px)",
        pointerEvents: "none",
      }} />

      <div style={{
        position: "relative",
        fontSize: 10, color: S.muted,
        letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700,
        marginBottom: 14,
      }}>
        Pulso general · Oppy
      </div>

      <div style={{
        position: "relative",
        display: "inline-flex", alignItems: "baseline",
        gap: 14, flexWrap: "wrap", justifyContent: "center",
        marginBottom: 6,
      }}>
        <span style={{
          fontSize: 22, color: S.text, fontWeight: 700,
          letterSpacing: "-0.01em",
        }}>
          Oppy <span style={{ color }}>{verb}</span>
        </span>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          fontSize: 44, fontWeight: 800, color,
          letterSpacing: "-0.03em", lineHeight: 1,
        }}>
          <TrendIcon size={32} strokeWidth={2.6} />
          {fmtPct(pct)}
        </span>
      </div>

      <div style={{ position: "relative", fontSize: 12.5, color: S.muted, marginTop: 10 }}>
        <span style={{ color: S.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtNum(totalActual)}</span>
        <span style={{ color: S.dim, margin: "0 6px" }}>actual</span>
        <span style={{ color: S.dim, margin: "0 4px" }}>vs</span>
        <span style={{ color: S.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtNum(totalAnterior)}</span>
        <span style={{ color: S.dim, margin: "0 6px" }}>anterior</span>
        <span style={{ color: S.dim, margin: "0 6px" }}>·</span>
        <span style={{ color, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtNumSigned(delta)}</span>
      </div>

      <div style={{ position: "relative", fontSize: 10.5, color: S.dim, marginTop: 8, fontStyle: "italic" }}>
        consumo total combinado · validaciones + checks + conversaciones
      </div>
    </motion.div>
  );
}

/* =========================================================================
   KPI BANNER — clickeable + expand inline
   ========================================================================= */
function KpiBanner({
  counts, expanded, onToggle, consolidatedRows, csmByEmail, onClickClient,
}: {
  counts: { riesgo: Set<string>; creciendo: Set<string>; estables: Set<string>; total: Set<string> };
  expanded: KpiKey | null;
  onToggle: (k: KpiKey) => void;
  consolidatedRows: { cliente_id: string; nombre: string; csm_email: string | null; cells: Partial<Record<Producto, Alerta>> }[];
  csmByEmail: Record<string, { nombre: string }>;
  onClickClient: (cliente_id: string) => void;
}) {
  const items: { key: KpiKey; label: string; size: number; sub?: string; color: string; icon: typeof TrendingDown; expandable: boolean }[] = [
    { key: "riesgo",    label: "En riesgo",    size: counts.riesgo.size,    sub: "críticas + fuertes", color: "#EF4444", icon: TrendingDown, expandable: true },
    { key: "creciendo", label: "Creciendo",    size: counts.creciendo.size, sub: ">+30% MoM",          color: "#10B981", icon: TrendingUp,   expandable: true },
    { key: "estables",  label: "Estables",     size: counts.estables.size,                              color: "#94A3B8", icon: Minus,        expandable: true },
    { key: "total",     label: "Cartera",      size: counts.total.size,     sub: "clientes con datos", color: "#7DD3FC", icon: Minus,        expandable: false },
  ];

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
      }}>
        {items.map((it, i) => {
          const Icon = it.icon;
          const isActive = expanded === it.key;
          return (
            <motion.button
              key={it.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08 + i * 0.05, ease: "easeOut" }}
              onClick={() => it.expandable && onToggle(it.key)}
              disabled={!it.expandable}
              style={{
                position: "relative", overflow: "hidden",
                background: isActive ? `${it.color}10` : S.surface,
                border: `1px solid ${isActive ? `${it.color}50` : S.border}`,
                borderRadius: 14, padding: "16px 18px 16px 22px",
                textAlign: "left",
                cursor: it.expandable ? "pointer" : "default",
                transition: "all 0.18s",
              }}
              onMouseEnter={(e) => { if (it.expandable && !isActive) e.currentTarget.style.borderColor = S.borderHi; }}
              onMouseLeave={(e) => { if (it.expandable && !isActive) e.currentTarget.style.borderColor = S.border; }}
            >
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: it.color }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon size={11} color={it.color} strokeWidth={2.4} />
                  <span style={{ fontSize: 10, color: S.muted, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 600 }}>
                    {it.label}
                  </span>
                </div>
                {it.expandable && (
                  <ChevronDown size={12} color={isActive ? it.color : S.dim}
                    style={{ transition: "transform 0.18s", transform: isActive ? "rotate(180deg)" : "none" }} />
                )}
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: isActive ? it.color : S.text, lineHeight: 1, letterSpacing: "-0.02em" }}>
                {it.size}
              </div>
              {it.sub && (
                <div style={{ fontSize: 11, color: S.dim, marginTop: 6, fontWeight: 500 }}>
                  {it.sub}
                </div>
              )}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {expanded && expanded !== "total" && (
          <motion.div
            key={expanded}
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 12 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <KpiExpandList
              kpiKey={expanded}
              clientIds={
                expanded === "riesgo" ? counts.riesgo
                : expanded === "creciendo" ? counts.creciendo
                : counts.estables
              }
              consolidatedRows={consolidatedRows}
              csmByEmail={csmByEmail}
              onClickClient={onClickClient}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function KpiExpandList({
  kpiKey, clientIds, consolidatedRows, csmByEmail, onClickClient,
}: {
  kpiKey: KpiKey;
  clientIds: Set<string>;
  consolidatedRows: { cliente_id: string; nombre: string; csm_email: string | null; cells: Partial<Record<Producto, Alerta>> }[];
  csmByEmail: Record<string, { nombre: string }>;
  onClickClient: (cliente_id: string) => void;
}) {
  const accent = kpiKey === "riesgo" ? "#EF4444" : kpiKey === "creciendo" ? "#10B981" : "#94A3B8";
  const titulo = kpiKey === "riesgo" ? "Clientes en riesgo" : kpiKey === "creciendo" ? "Clientes en crecimiento" : "Clientes estables";

  const filtered = consolidatedRows.filter((c) => clientIds.has(c.cliente_id));

  if (filtered.length === 0) {
    return (
      <div style={{ background: S.surfaceLo, border: `1px solid ${accent}30`, borderRadius: 14, padding: 16, color: S.dim, fontSize: 12 }}>
        Sin clientes en esta categoría.
      </div>
    );
  }

  return (
    <div style={{
      background: S.surfaceLo, border: `1px solid ${accent}30`,
      borderRadius: 14, padding: "14px 16px",
    }}>
      <div style={{ fontSize: 11, color: accent, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, marginBottom: 12 }}>
        {titulo} · {filtered.length}
      </div>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 8,
      }}>
        {filtered.map((c) => {
          const csm = c.csm_email ? csmByEmail[c.csm_email]?.nombre || c.csm_email : "—";
          return (
            <button
              key={c.cliente_id}
              onClick={() => onClickClient(c.cliente_id)}
              style={{
                background: S.surface, border: `1px solid ${S.border}`,
                borderRadius: 10, padding: "10px 12px",
                textAlign: "left", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${accent}50`; e.currentTarget.style.background = `${accent}08`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.background = S.surface; }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: S.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.nombre}
                </div>
                <div style={{ fontSize: 10, color: S.dim, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {csm}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {PROD_LIST.map((p) => {
                  const a = c.cells[p];
                  if (!a) return null;
                  const meets =
                    (kpiKey === "riesgo" && (a.severidad === "critica" || a.severidad === "fuerte")) ||
                    (kpiKey === "creciendo" && a.severidad === "crecimiento") ||
                    (kpiKey === "estables" && (a.severidad === "estable" || a.severidad === "leve"));
                  if (!meets) return null;
                  return (
                    <span key={p}
                      style={{
                        fontSize: 9, fontWeight: 700, color: PROD_META[p].color,
                        background: `${PROD_META[p].color}1A`,
                        border: `1px solid ${PROD_META[p].color}40`,
                        padding: "2px 6px", borderRadius: 6,
                        letterSpacing: "0.05em",
                      }}
                      title={`${PROD_META[p].label}: ${fmtPct(a.variacion_pct)}`}
                    >
                      {PROD_META[p].sigla}
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   COPY RESUMEN BUTTON
   ========================================================================= */
function CopyResumenButton({
  weekFin, scope, portfolioCounts, productAggs, topMovers,
}: {
  weekFin: string;
  scope: "all" | "mine";
  portfolioCounts: { riesgo: Set<string>; creciendo: Set<string>; estables: Set<string>; total: Set<string> };
  productAggs: Record<Producto, { valor_actual: number; valor_anterior: number; variacion_pct: number | null }>;
  topMovers: Record<Producto, { caidas: Alerta[]; crecimientos: Alerta[] }>;
}) {
  const [copied, setCopied] = useState(false);

  const buildText = () => {
    const fechaTitulo = new Date(weekFin).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    const lines: string[] = [];
    lines.push(`📊 BotiAlertas — Semana del ${fechaTitulo}`);
    lines.push(scope === "mine" ? "Cartera: solo mi cartera" : "Cartera: equipo completo");
    lines.push("");
    lines.push("Pulso del portafolio:");
    lines.push(`• En riesgo:  ${portfolioCounts.riesgo.size} clientes (críticas + fuertes)`);
    lines.push(`• Creciendo:  ${portfolioCounts.creciendo.size}`);
    lines.push(`• Estables:   ${portfolioCounts.estables.size}`);
    lines.push(`• Cobertura:  ${portfolioCounts.total.size} clientes con datos`);
    lines.push("");
    lines.push("Por producto:");
    for (const p of PROD_LIST) {
      const a = productAggs[p];
      const m = PROD_META[p];
      lines.push(`• ${m.label} (${m.sigla}): ${fmtNum(a.valor_anterior)} → ${fmtNum(a.valor_actual)} (${fmtPct(a.variacion_pct)})`);
    }
    for (const p of PROD_LIST) {
      const tm = topMovers[p];
      const m = PROD_META[p];
      if (tm.caidas.length > 0) {
        lines.push("");
        lines.push(`⚠ Top caídas — ${m.label}:`);
        tm.caidas.slice(0, 3).forEach((r) => {
          lines.push(`  • ${r.cliente?.nombre ?? r.client_id_externo}: ${fmtNum(r.valor_anterior)} → ${fmtNum(r.valor_actual)} (${fmtPct(r.variacion_pct)})`);
        });
      }
    }
    return lines.join("\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildText());
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };

  return (
    <div style={{ marginBottom: 26, display: "flex", justifyContent: "flex-end" }}>
      <button
        onClick={handleCopy}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          fontSize: 12, fontWeight: 600,
          color: copied ? "#10B981" : "#7DD3FC",
          background: copied ? "rgba(16,185,129,0.12)" : "rgba(56,189,248,0.10)",
          border: `1px solid ${copied ? "rgba(16,185,129,0.35)" : "rgba(56,189,248,0.30)"}`,
          padding: "7px 14px", borderRadius: 999,
          cursor: "pointer", transition: "all 0.18s",
        }}
      >
        {copied ? <Check size={13} /> : <ClipboardCopy size={13} />}
        {copied ? "Copiado al portapapeles" : "Copiar resumen"}
      </button>
    </div>
  );
}

/* =========================================================================
   PRODUCT ROW — 3 cards expandibles
   ========================================================================= */
function ProductRow({
  aggs, expanded, onToggle, topMovers, csmByEmail, onClickClient,
  mesActualLabel, mesPrevLabel,
}: {
  aggs: Record<Producto, { valor_actual: number; valor_anterior: number; variacion_pct: number | null; variacion_abs: number; counts: Record<Severidad, number> }>;
  expanded: Producto | null;
  onToggle: (p: Producto) => void;
  topMovers: Record<Producto, { caidas: Alerta[]; crecimientos: Alerta[] }>;
  csmByEmail: Record<string, { nombre: string }>;
  onClickClient: (cliente_id: string) => void;
  mesActualLabel: string;
  mesPrevLabel: string;
}) {
  return (
    <div style={{ marginBottom: 26 }}>
      <SectionLabel label="Por producto" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {PROD_LIST.map((p, i) => (
          <ProductCard
            key={p}
            producto={p}
            agg={aggs[p]}
            expanded={expanded === p}
            onClick={() => onToggle(p)}
            delay={i}
          />
        ))}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key={expanded}
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 14 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <ProductDetail
              producto={expanded}
              caidas={topMovers[expanded].caidas}
              crecimientos={topMovers[expanded].crecimientos}
              csmByEmail={csmByEmail}
              onClickClient={onClickClient}
              mesActualLabel={mesActualLabel}
              mesPrevLabel={mesPrevLabel}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProductCard({
  producto, agg, expanded, onClick, delay,
}: {
  producto: Producto;
  agg: { valor_actual: number; valor_anterior: number; variacion_pct: number | null; variacion_abs: number; counts: Record<Severidad, number> };
  expanded: boolean;
  onClick: () => void;
  delay: number;
}) {
  const m = PROD_META[producto];
  const [hover, setHover] = useState(false);
  const isUp = (agg.variacion_pct ?? 0) >= 0;
  const deltaColor = agg.variacion_pct == null ? S.muted : isUp ? "#10B981" : "#EF4444";
  const TrendIcon = isUp ? TrendingUp : TrendingDown;

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.12 + delay * 0.06, ease: "easeOut" }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", overflow: "hidden",
        background: hover || expanded ? S.surfaceHi : S.surface,
        border: `1px solid ${expanded ? `${m.color}50` : hover ? S.borderHi : S.border}`,
        borderRadius: 16, padding: "18px 20px 16px 22px",
        textAlign: "left", cursor: "pointer",
        transition: "all 0.18s",
        boxShadow: expanded ? `0 8px 28px rgba(0,0,0,0.4), 0 0 0 1px ${m.color}30` : "0 2px 10px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: m.color }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>{m.emoji}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: S.text, lineHeight: 1.1 }}>{m.label}</div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: m.color, letterSpacing: "0.10em", textTransform: "uppercase", marginTop: 2 }}>
              {m.sigla}
            </div>
          </div>
        </div>
        <ChevronDown size={16} color={S.muted} style={{ transition: "transform 0.18s", transform: expanded ? "rotate(180deg)" : "none" }} />
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: S.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
          {fmtNum(agg.valor_actual)}
        </div>
        <div style={{ fontSize: 12, color: S.muted }}>
          vs <span style={{ color: S.text, fontWeight: 600 }}>{fmtNum(agg.valor_anterior)}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 700, color: deltaColor }}>
          <TrendIcon size={14} strokeWidth={2.6} />
          {fmtPct(agg.variacion_pct)}
        </span>
        <span style={{ fontSize: 11, color: S.muted, fontWeight: 500 }}>
          ({fmtNumSigned(agg.variacion_abs)})
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {agg.counts.critica > 0 && (
          <SevBadge color={SEV_META.critica.color} label={`${agg.counts.critica} crítica${agg.counts.critica === 1 ? "" : "s"}`} />
        )}
        {agg.counts.fuerte > 0 && (
          <SevBadge color={SEV_META.fuerte.color} label={`${agg.counts.fuerte} fuerte${agg.counts.fuerte === 1 ? "" : "s"}`} />
        )}
        {agg.counts.crecimiento > 0 && (
          <SevBadge color={SEV_META.crecimiento.color} label={`${agg.counts.crecimiento} creciendo`} />
        )}
        {agg.counts.critica === 0 && agg.counts.fuerte === 0 && agg.counts.crecimiento === 0 && (
          <span style={{ fontSize: 10.5, color: S.dim, fontWeight: 500 }}>Sin movimientos relevantes</span>
        )}
      </div>
    </motion.button>
  );
}

function SevBadge({ color, label }: { color: string; label: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color,
      background: `${color}1A`, border: `1px solid ${color}40`,
      padding: "2.5px 7px", borderRadius: 999,
      letterSpacing: "0.04em",
    }}>
      {label}
    </span>
  );
}

/* =========================================================================
   PRODUCT DETAIL — todas las caídas + todos los crecimientos
   con headers explícitos por columna
   ========================================================================= */
function ProductDetail({
  producto, caidas, crecimientos, csmByEmail, onClickClient,
  mesActualLabel, mesPrevLabel,
}: {
  producto: Producto;
  caidas: Alerta[];
  crecimientos: Alerta[];
  csmByEmail: Record<string, { nombre: string }>;
  onClickClient: (cliente_id: string) => void;
  mesActualLabel: string;
  mesPrevLabel: string;
}) {
  const m = PROD_META[producto];
  return (
    <div style={{
      background: S.surfaceLo,
      border: `1px solid ${m.color}30`,
      borderRadius: 16,
      padding: "18px 20px",
    }}>
      <div style={{ fontSize: 11, color: m.color, letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, marginBottom: 16 }}>
        Detalle · {m.label}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(440px, 1fr))", gap: 18 }}>
        <MoversTable
          title={`⚠ En riesgo (${caidas.length})`}
          subtitle="críticas + fuertes · color por severidad"
          rows={caidas}
          variant="caida"
          csmByEmail={csmByEmail}
          onClickClient={onClickClient}
          mesActualLabel={mesActualLabel}
          mesPrevLabel={mesPrevLabel}
        />
        <MoversTable
          title={`📈 Creciendo (${crecimientos.length})`}
          subtitle="ordenados por impacto absoluto"
          rows={crecimientos}
          variant="crecimiento"
          csmByEmail={csmByEmail}
          onClickClient={onClickClient}
          mesActualLabel={mesActualLabel}
          mesPrevLabel={mesPrevLabel}
        />
      </div>
    </div>
  );
}

/* =========================================================================
   GLOBAL SUMMARY — sección agregada cross-producto
   En riesgo (críticas+fuertes de TODOS los productos) vs Creciendo (todos)
   ========================================================================= */
function GlobalSummary({
  riesgo, crecimiento, csmByEmail, onClickClient, mesActualLabel, mesPrevLabel,
}: {
  riesgo: Alerta[];
  crecimiento: Alerta[];
  csmByEmail: Record<string, { nombre: string }>;
  onClickClient: (cliente_id: string) => void;
  mesActualLabel: string;
  mesPrevLabel: string;
}) {
  if (riesgo.length === 0 && crecimiento.length === 0) return null;

  return (
    <div style={{ marginBottom: 26 }}>
      <SectionLabel label="Resumen global por severidad" />
      <div style={{
        background: S.surfaceLo,
        border: `1px solid ${S.border}`,
        borderRadius: 16,
        padding: "18px 20px",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: 18 }}>
          <MoversTable
            title={`⚠ En riesgo (${riesgo.length})`}
            subtitle="todos los críticos + fuertes · color por severidad"
            rows={riesgo}
            variant="caida"
            showProductCol
            csmByEmail={csmByEmail}
            onClickClient={onClickClient}
            mesActualLabel={mesActualLabel}
            mesPrevLabel={mesPrevLabel}
          />
          <MoversTable
            title={`📈 Creciendo (${crecimiento.length})`}
            subtitle="todos los crecimientos por producto"
            rows={crecimiento}
            variant="crecimiento"
            showProductCol
            csmByEmail={csmByEmail}
            onClickClient={onClickClient}
            mesActualLabel={mesActualLabel}
            mesPrevLabel={mesPrevLabel}
          />
        </div>
      </div>
    </div>
  );
}

function MoversTable({
  title, subtitle, rows, variant, showProductCol, csmByEmail, onClickClient,
  mesActualLabel, mesPrevLabel,
}: {
  title: string;
  subtitle: string;
  rows: Alerta[];
  variant: "caida" | "crecimiento";
  showProductCol?: boolean;
  csmByEmail: Record<string, { nombre: string }>;
  onClickClient: (cliente_id: string) => void;
  mesActualLabel: string;
  mesPrevLabel: string;
}) {
  const labelDelta = variant === "caida" ? "Disminución" : "Aumento";
  const labelPct   = variant === "caida" ? "Decreció"     : "Creció";

  // Cuando showProductCol=true, agregamos columna producto antes de los números.
  const cols = showProductCol
    ? "minmax(160px, 1.6fr) minmax(58px, 0.5fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(70px, 0.8fr)"
    : "minmax(160px, 1.6fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(80px, 1fr) minmax(70px, 0.8fr)";

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: S.text }}>{title}</div>
        <div style={{ fontSize: 10.5, color: S.muted, marginTop: 2 }}>{subtitle}</div>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: S.dim, padding: "10px 0" }}>
          Sin {variant === "caida" ? "alertas en riesgo" : "crecimientos"} esta semana.
        </div>
      ) : (
        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 10, overflow: "hidden" }}>
          {/* header */}
          <div style={{
            display: "grid", gridTemplateColumns: cols,
            background: S.surfaceLo,
            borderBottom: `1px solid ${S.border}`,
            fontSize: 9.5, fontWeight: 700, color: S.muted,
            letterSpacing: "0.08em", textTransform: "uppercase",
          }}>
            <div style={{ padding: "9px 12px" }}>Cliente</div>
            {showProductCol && <div style={{ padding: "9px 12px" }}>Prod</div>}
            <div style={{ padding: "9px 12px", textAlign: "right" }}>Total {mesPrevLabel}</div>
            <div style={{ padding: "9px 12px", textAlign: "right" }}>Total {mesActualLabel}</div>
            <div style={{ padding: "9px 12px", textAlign: "right" }}>{labelDelta}</div>
            <div style={{ padding: "9px 12px", textAlign: "right" }}>{labelPct}</div>
          </div>
          {/* rows: cada fila se colorea por su propia severidad */}
          <div style={{ maxHeight: 460, overflowY: "auto" }}>
            {rows.map((r, i) => {
              const csm = r.cliente?.csm_email ? csmByEmail[r.cliente.csm_email]?.nombre : null;
              const accent = sevColor(r.severidad);
              const prodMeta = PROD_META[r.producto];
              return (
                <button
                  key={r.id}
                  onClick={() => onClickClient(r.cliente_id)}
                  style={{
                    display: "grid", gridTemplateColumns: cols,
                    width: "100%",
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    border: "none",
                    borderBottom: `1px solid ${S.border}`,
                    cursor: "pointer", textAlign: "left",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = `${accent}10`)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)")}
                >
                  <div style={{ padding: "10px 12px", minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    {/* dot de severidad */}
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: accent, flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, color: S.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.cliente?.nombre ?? r.client_id_externo}
                      </div>
                      {csm && (
                        <div style={{ fontSize: 10, color: S.dim, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {csm}
                        </div>
                      )}
                    </div>
                  </div>
                  {showProductCol && (
                    <div style={{ padding: "10px 12px", display: "flex", alignItems: "center" }}>
                      <span style={{
                        fontSize: 9.5, fontWeight: 700, color: prodMeta.color,
                        background: `${prodMeta.color}1A`, border: `1px solid ${prodMeta.color}40`,
                        padding: "2px 7px", borderRadius: 999, letterSpacing: "0.05em",
                      }}>
                        {prodMeta.sigla}
                      </span>
                    </div>
                  )}
                  <div style={{ padding: "10px 12px", fontSize: 12, color: S.muted, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                    {fmtNum(r.valor_anterior)}
                  </div>
                  <div style={{ padding: "10px 12px", fontSize: 12, color: S.text, fontWeight: 600, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                    {fmtNum(r.valor_actual)}
                  </div>
                  <div style={{ padding: "10px 12px", fontSize: 12, color: accent, fontWeight: 700, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                    {fmtNumSigned(r.variacion_abs)}
                  </div>
                  <div style={{ padding: "10px 12px", fontSize: 12.5, color: accent, fontWeight: 700, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                    {fmtPct(r.variacion_pct)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   SECTION LABEL
   ========================================================================= */
function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      fontSize: 10, fontWeight: 600, color: S.muted,
      letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 12,
    }}>
      <div style={{ width: 16, height: 1, background: S.border }} />
      {label}
    </div>
  );
}

/* =========================================================================
   TABLE SECTION
   ========================================================================= */
function TableSection({
  open, onToggle, rows, csmByEmail, onClickClient,
  mesActualLabel, mesPrevLabel,
}: {
  open: boolean;
  onToggle: () => void;
  rows: { cliente_id: string; nombre: string; csm_email: string | null; cells: Partial<Record<Producto, Alerta>>; balance: number }[];
  csmByEmail: Record<string, { nombre: string }>;
  onClickClient: (cliente_id: string) => void;
  mesActualLabel: string;
  mesPrevLabel: string;
}) {
  return (
    <div style={{ marginBottom: 40 }}>
      <button
        onClick={onToggle}
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          fontSize: 12, fontWeight: 600, color: S.text,
          background: S.surface, border: `1px solid ${S.border}`,
          padding: "9px 16px", borderRadius: 999, cursor: "pointer",
          transition: "all 0.18s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = S.borderHi; e.currentTarget.style.background = S.surfaceHi; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.background = S.surface; }}
      >
        <ChevronRight size={13} style={{ transition: "transform 0.18s", transform: open ? "rotate(90deg)" : "none" }} />
        {open ? "Ocultar tabla completa" : "Ver tabla completa"}
        <span style={{ fontSize: 11, color: S.muted, marginLeft: 4 }}>({rows.length} clientes)</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 16 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            style={{ overflow: "hidden" }}
          >
            <ConsolidatedTable
              rows={rows}
              csmByEmail={csmByEmail}
              onClickClient={onClickClient}
              mesActualLabel={mesActualLabel}
              mesPrevLabel={mesPrevLabel}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ConsolidatedTable({
  rows, csmByEmail, onClickClient, mesActualLabel, mesPrevLabel,
}: {
  rows: { cliente_id: string; nombre: string; csm_email: string | null; cells: Partial<Record<Producto, Alerta>>; balance: number }[];
  csmByEmail: Record<string, { nombre: string }>;
  onClickClient: (cliente_id: string) => void;
  mesActualLabel: string;
  mesPrevLabel: string;
}) {
  // Cliente · DI · BGC · CE · CSM · Balance (este último cierra)
  const cols = "minmax(170px, 1.5fr) repeat(3, minmax(190px, 1.3fr)) minmax(130px, 0.85fr) minmax(110px, 0.85fr)";

  // Total de la columna balance (debe coincidir con el delta del Oppy hero).
  const totalBalance = rows.reduce((s, r) => s + r.balance, 0);
  const totalColor = totalBalance >= 0 ? "#10B981" : "#EF4444";

  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`,
      borderRadius: 14, overflow: "hidden",
    }}>
      {/* Two-row header: 1) producto label, 2) sub-headers numericos */}
      <div style={{
        display: "grid", gridTemplateColumns: cols,
        background: S.surfaceLo,
        borderBottom: `1px solid ${S.border}`,
      }}>
        <div style={{ padding: "12px 14px 4px", fontSize: 10, fontWeight: 700, color: S.muted, letterSpacing: "0.10em", textTransform: "uppercase" }}>
          Cliente
        </div>
        {PROD_LIST.map((p) => (
          <div key={p} style={{ padding: "12px 14px 4px", fontSize: 10, fontWeight: 700, color: PROD_META[p].color, letterSpacing: "0.10em", textTransform: "uppercase" }}>
            {PROD_META[p].sigla} · {PROD_META[p].label}
          </div>
        ))}
        <div style={{ padding: "12px 14px 4px", fontSize: 10, fontWeight: 700, color: S.muted, letterSpacing: "0.10em", textTransform: "uppercase" }}>
          CSM
        </div>
        <div style={{ padding: "12px 14px 4px", fontSize: 10, fontWeight: 700, color: "#7DD3FC", letterSpacing: "0.10em", textTransform: "uppercase", textAlign: "right" }}
             title="Suma de variaciones absolutas DI + BGC + CE para este cliente. La suma de toda la columna debe coincidir con el pulso general de Oppy.">
          Balance
        </div>
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: cols,
        background: S.surfaceLo,
        borderBottom: `1px solid ${S.border}`,
        fontSize: 9.5, fontWeight: 600, color: S.dim,
      }}>
        <div style={{ padding: "0 14px 10px" }} />
        {PROD_LIST.map((p) => (
          <div key={p} style={{ padding: "0 14px 10px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <span>{mesPrevLabel}</span>
            <span>{mesActualLabel}</span>
            <span style={{ textAlign: "right" }}>Variación</span>
          </div>
        ))}
        <div style={{ padding: "0 14px 10px" }} />
        <div style={{ padding: "0 14px 10px", textAlign: "right", fontStyle: "italic" }}>Σ DI+BGC+CE</div>
      </div>

      <div>
        {rows.map((r, i) => {
          const csm = r.csm_email ? csmByEmail[r.csm_email]?.nombre || r.csm_email : "—";
          const bColor = r.balance > 0 ? "#10B981" : r.balance < 0 ? "#EF4444" : S.muted;
          return (
            <button
              key={r.cliente_id}
              onClick={() => onClickClient(r.cliente_id)}
              style={{
                display: "grid", gridTemplateColumns: cols,
                width: "100%",
                background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                border: "none", cursor: "pointer", textAlign: "left",
                borderBottom: `1px solid ${S.border}`,
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(124,77,255,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)")}
            >
              <div style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600, color: S.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {r.nombre}
              </div>
              {PROD_LIST.map((p) => (
                <div key={p} style={{ padding: "12px 14px" }}>
                  <ProductCell alerta={r.cells[p]} />
                </div>
              ))}
              <div style={{ padding: "12px 14px", fontSize: 11.5, color: S.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {csm}
              </div>
              <div style={{ padding: "12px 14px", fontSize: 12.5, fontWeight: 700, color: bColor, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                {fmtNumSigned(r.balance)}
              </div>
            </button>
          );
        })}

        {/* Footer total — cierra la columna Balance con la suma. Debe coincidir con Oppy delta. */}
        <div style={{
          display: "grid", gridTemplateColumns: cols,
          background: S.surfaceLo,
          borderTop: `2px solid ${S.borderHi}`,
          fontSize: 11, fontWeight: 700,
        }}>
          <div style={{ padding: "12px 14px", color: S.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Total
          </div>
          <div style={{ padding: "12px 14px" }} />
          <div style={{ padding: "12px 14px" }} />
          <div style={{ padding: "12px 14px" }} />
          <div style={{ padding: "12px 14px", color: S.dim, fontSize: 10.5, fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            = pulso Oppy
          </div>
          <div style={{ padding: "12px 14px", fontSize: 14, fontWeight: 800, color: totalColor, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
            {fmtNumSigned(totalBalance)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductCell({ alerta }: { alerta?: Alerta }) {
  if (!alerta) {
    return (
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6,
        fontSize: 11, color: S.dim, fontVariantNumeric: "tabular-nums",
      }}>
        <span>—</span>
        <span>—</span>
        <span style={{ textAlign: "right" }}>—</span>
      </div>
    );
  }
  const sev = SEV_META[alerta.severidad];
  const isImportant = ["critica", "fuerte", "crecimiento"].includes(alerta.severidad);
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6,
      fontSize: 11.5, fontVariantNumeric: "tabular-nums", alignItems: "center",
    }}>
      <span style={{ color: S.muted }}>{fmtNum(alerta.valor_anterior)}</span>
      <span style={{ color: S.text, fontWeight: 600 }}>{fmtNum(alerta.valor_actual)}</span>
      <span style={{
        textAlign: "right", color: isImportant ? sev.color : S.muted,
        fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 4,
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: 999, background: sev.color,
          opacity: isImportant ? 1 : 0.4, flexShrink: 0,
        }} />
        {fmtPct(alerta.variacion_pct)}
      </span>
    </div>
  );
}

/* =========================================================================
   CLIENT MODAL — centrado, no sidebar
   ========================================================================= */
function ClientModal({
  data, history, csmByEmail, onClose,
}: {
  data: { cliente_id: string; nombre: string; csm_email: string | null; cells: Partial<Record<Producto, Alerta>> };
  history: Record<string, Alerta[]>;
  csmByEmail: Record<string, { nombre: string }>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // bloquea scroll del fondo mientras el modal está abierto
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const csm = data.csm_email ? csmByEmail[data.csm_email]?.nombre || data.csm_email : "Sin CSM asignado";
  const tci = Object.values(data.cells).find(Boolean)?.client_id_externo ?? "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        style={{
          width: "min(720px, 100%)",
          maxHeight: "calc(100vh - 32px)",
          background: S.surfaceLo,
          border: `1px solid ${S.borderHi}`,
          borderRadius: 18,
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* header fijo */}
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "20px 24px",
          borderBottom: `1px solid ${S.border}`,
          background: S.surfaceLo,
          flexShrink: 0,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, color: "#7DD3FC", letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
              Detalle 360°
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: S.text, letterSpacing: "-0.02em", marginBottom: 4, wordBreak: "break-word" }}>
              {data.nombre}
            </div>
            <div style={{ fontSize: 11, color: S.dim, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all", marginBottom: 6 }}>
              {tci}
            </div>
            <div style={{ fontSize: 11, color: S.muted }}>
              CSM: <span style={{ color: S.text, fontWeight: 600 }}>{csm}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: `1px solid ${S.border}`,
              borderRadius: 10, width: 30, height: 30,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: S.muted, cursor: "pointer", flexShrink: 0,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = S.text; e.currentTarget.style.borderColor = S.borderHi; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = S.muted; e.currentTarget.style.borderColor = S.border; }}
          >
            <XIcon size={14} />
          </button>
        </div>

        {/* body scrollable */}
        <div style={{
          flex: 1, overflowY: "auto",
          padding: "16px 24px 24px",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          {PROD_LIST.map((p) => {
            const a = data.cells[p];
            if (!a) return <ProductSection key={p} producto={p} alerta={null} history={[]} />;
            // Histórico keyed por TCI (no por cliente_id) — sobrevive a dedupes inconsistentes.
            const hist = history[`${a.client_id_externo}|${p}`] ?? [];
            return <ProductSection key={p} producto={p} alerta={a} history={hist} />;
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ProductSection({
  producto, alerta, history,
}: {
  producto: Producto;
  alerta: Alerta | null;
  history: Alerta[];
}) {
  const m = PROD_META[producto];
  if (!alerta) {
    return (
      <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, padding: "12px 14px", opacity: 0.55 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: S.muted }}>
          <span>{m.emoji}</span>
          <span>{m.label}</span>
          <span style={{ color: S.dim, fontSize: 11 }}>· cliente no usa este producto</span>
        </div>
      </div>
    );
  }

  const sev = SEV_META[alerta.severidad];
  return (
    <div style={{
      background: S.surface, border: `1px solid ${m.color}30`,
      borderRadius: 12, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{m.emoji}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: S.text }}>{m.label}</div>
            <div style={{ fontSize: 9.5, color: m.color, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 700 }}>{m.sigla}</div>
          </div>
        </div>
        <span style={{
          fontSize: 9.5, fontWeight: 700, color: sev.color,
          background: sev.bg, border: `1px solid ${sev.border}`,
          padding: "3px 8px", borderRadius: 999,
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          {sev.label}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: S.text, letterSpacing: "-0.02em" }}>{fmtNum(alerta.valor_actual)}</div>
        <div style={{ fontSize: 11, color: S.muted }}>vs <span style={{ color: S.text, fontWeight: 600 }}>{fmtNum(alerta.valor_anterior)}</span></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: sev.color }}>{fmtPct(alerta.variacion_pct)}</span>
        <span style={{ fontSize: 11, color: S.muted }}>({fmtNumSigned(alerta.variacion_abs)})</span>
      </div>

      <ExtrasBlock producto={producto} alerta={alerta} />

      {/* sparkline de variación: refleja la trayectoria real (cae cuando cae) */}
      {history.length >= 2 && (
        <VariacionSparklineBlock history={history} color={m.color} />
      )}

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${S.border}`, fontSize: 10.5, color: S.dim }}>
        {fmtRangeHumano(alerta.periodo_anterior_inicio, alerta.periodo_anterior_fin)}
        {" → "}
        {fmtRangeHumano(alerta.periodo_actual_inicio, alerta.periodo_actual_fin)}
      </div>
    </div>
  );
}

function VariacionSparklineBlock({ history, color }: { history: Alerta[]; color: string }) {
  const points = history
    .map((r) => Number(r.variacion_pct))
    .filter((v) => Number.isFinite(v));
  if (points.length < 2) return null;

  const lastVal = points[points.length - 1];
  const firstVal = points[0];
  const trendColor = lastVal < firstVal ? "#EF4444" : lastVal > firstVal ? "#10B981" : color;

  const fechaInicio = new Date(history[0].periodo_actual_fin).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  const fechaFin    = new Date(history[history.length - 1].periodo_actual_fin).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        fontSize: 10, color: S.muted, fontWeight: 600,
        letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6,
      }}>
        <span>Variación histórica · {history.length} sem</span>
        <span style={{ color: trendColor, fontWeight: 700, letterSpacing: 0, textTransform: "none" }}>
          {firstVal.toFixed(1)}% → {lastVal.toFixed(1)}%
        </span>
      </div>
      <Sparkline points={points} color={trendColor} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: S.dim, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        <span>{fechaInicio}</span>
        <span>{fechaFin}</span>
      </div>
    </div>
  );
}

function ExtrasBlock({ producto, alerta }: { producto: Producto; alerta: Alerta }) {
  const e = alerta.metricas_extra as Record<string, unknown>;

  if (producto === "DI") {
    const ca = num(e.conversion_actual);
    const cp = num(e.conversion_anterior);
    if (ca == null && cp == null) return null;
    return (
      <ExtraRow
        label="✅ Conversión"
        prevText={cp != null ? cp.toFixed(1) + "%" : "—"}
        currText={ca != null ? ca.toFixed(1) + "%" : "—"}
      />
    );
  }
  if (producto === "BGC") {
    const sa = num(e.score_actual);
    const sp = num(e.score_anterior);
    if (sa == null && sp == null) return null;
    return (
      <ExtraRow
        label="⭐ Score promedio"
        prevText={sp != null ? sp.toFixed(1) : "—"}
        currText={sa != null ? sa.toFixed(1) : "—"}
      />
    );
  }
  if (producto === "CE") {
    const inb = e.inbound as { curr?: unknown; prev?: unknown } | undefined;
    const out = e.outbound as { curr?: unknown; prev?: unknown } | undefined;
    const not = e.notificaciones as { curr?: unknown; prev?: unknown } | undefined;
    if (!inb && !out && !not) return null;
    return (
      <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "8px 10px", marginTop: 4 }}>
        <div style={{ fontSize: 10, color: S.muted, fontWeight: 600, marginBottom: 4 }}>Desglose</div>
        <ExtraRowSmall label="Inbound"  prevText={fmtNum(num(inb?.prev))} currText={fmtNum(num(inb?.curr))} />
        <ExtraRowSmall label="Outbound" prevText={fmtNum(num(out?.prev))} currText={fmtNum(num(out?.curr))} />
        <ExtraRowSmall label="Notif"    prevText={fmtNum(num(not?.prev))} currText={fmtNum(num(not?.curr))} />
      </div>
    );
  }
  return null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ExtraRow({ label, prevText, currText }: { label: string; prevText: string; currText: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "8px 10px", marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: S.muted, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, color: S.text, fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: S.muted }}>{prevText}</span>
        <span style={{ margin: "0 4px", color: S.dim }}>→</span>
        <span style={{ fontWeight: 600 }}>{currText}</span>
      </span>
    </div>
  );
}

function ExtraRowSmall({ label, prevText, currText }: { label: string; prevText: string; currText: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
      <span style={{ fontSize: 10.5, color: S.muted }}>{label}</span>
      <span style={{ fontSize: 11, color: S.text, fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: S.muted }}>{prevText}</span>
        <span style={{ margin: "0 4px", color: S.dim }}>→</span>
        <span style={{ fontWeight: 600 }}>{currText}</span>
      </span>
    </div>
  );
}

/* =========================================================================
   SPARKLINE — SVG con baseline 0 si aplica
   ========================================================================= */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(280);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const height = 56;
  const padding = 6;
  if (points.length < 2) {
    return <div ref={ref} style={{ height, fontSize: 10, color: S.dim }}>No hay suficientes datos.</div>;
  }
  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const range = (max - min) || 1;
  const stepX = (width - padding * 2) / (points.length - 1);
  const scaleY = (v: number) => height - padding - ((v - min) / range) * (height - padding * 2);
  const baseY = scaleY(0);

  const linePath = points
    .map((v, i) => {
      const x = padding + i * stepX;
      const y = scaleY(v);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  // area ahora cierra contra la línea base 0 (no contra el bottom)
  const lastX = (padding + (points.length - 1) * stepX).toFixed(1);
  const firstX = padding.toFixed(1);
  const areaPath =
    linePath +
    ` L${lastX} ${baseY.toFixed(1)} L${firstX} ${baseY.toFixed(1)} Z`;

  const showBaseline = baseY > padding && baseY < height - padding;

  return (
    <div ref={ref} style={{ width: "100%", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        <defs>
          <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {showBaseline && (
          <line x1={padding} y1={baseY} x2={width - padding} y2={baseY}
                stroke={S.dim} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
        )}
        <path d={areaPath} fill={`url(#spark-${color.replace("#", "")})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((v, i) => {
          const x = padding + i * stepX;
          const y = scaleY(v);
          const isLast = i === points.length - 1;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={isLast ? 2.6 : 1.6}
              fill={isLast ? color : S.surfaceLo}
              stroke={color}
              strokeWidth={isLast ? 0 : 1.4}
            />
          );
        })}
      </svg>
    </div>
  );
}
