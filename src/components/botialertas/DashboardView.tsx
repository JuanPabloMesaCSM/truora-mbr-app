import { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight,
  X as XIcon, ClipboardCopy, Check,
} from "lucide-react";
import {
  S, SEV_META, PROD_LIST, PROD_META,
  fmtNum, fmtNumSigned, fmtPct, fmtRange, pctDelta,
  TOP_MOVERS_MIN_VOL,
} from "./types";
import type { Alerta, Producto, Severidad } from "./types";

interface Props {
  rows: Alerta[];           // filas de la semana seleccionada (ya filtradas por scope)
  allWeeksRows: Alerta[];   // historico completo para sparklines (ya filtradas por scope)
  csmByEmail: Record<string, { nombre: string }>;
  weekFin: string;          // YYYY-MM-DD de la semana seleccionada
  scope: "all" | "mine";    // para el botón "copiar resumen"
}

/* ========================================================================
   DashboardView — vista de embudo:
   1) Hero + Pulse banner
   2) Por producto (expandible -> top movers)
   3) Tabla consolidada (toggle)
   4) Drawer 360 al click en cliente
   ======================================================================== */
export default function DashboardView({ rows, allWeeksRows, csmByEmail, weekFin, scope }: Props) {
  const [expandedProduct, setExpandedProduct] = useState<Producto | null>(null);
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
    // estables no debe contar a alguien que también esté en riesgo o creciendo
    for (const id of riesgo) estables.delete(id);
    for (const id of creciendo) estables.delete(id);
    return { riesgo: riesgo.size, creciendo: creciendo.size, estables: estables.size, total: total.size };
  }, [rows]);

  const topMovers = useMemo(() => {
    const out = {} as Record<Producto, { caidas: Alerta[]; crecimientos: Alerta[] }>;
    for (const p of PROD_LIST) {
      const rs = rows.filter((r) => r.producto === p);
      const filtered = rs.filter((r) => {
        const max = Math.max(Number(r.valor_actual ?? 0), Number(r.valor_anterior ?? 0));
        return max >= TOP_MOVERS_MIN_VOL;
      });
      const sorted = [...filtered].sort(
        (a, b) => Math.abs(Number(b.variacion_abs ?? 0)) - Math.abs(Number(a.variacion_abs ?? 0))
      );
      out[p] = {
        caidas: sorted.filter((r) => Number(r.variacion_abs ?? 0) < 0).slice(0, 5),
        crecimientos: sorted.filter((r) => Number(r.variacion_abs ?? 0) > 0).slice(0, 5),
      };
    }
    return out;
  }, [rows]);

  const consolidatedRows = useMemo(() => {
    const byClient: Record<string, {
      cliente_id: string;
      nombre: string;
      csm_email: string | null;
      cells: Partial<Record<Producto, Alerta>>;
    }> = {};
    for (const r of rows) {
      if (!byClient[r.cliente_id]) {
        byClient[r.cliente_id] = {
          cliente_id: r.cliente_id,
          nombre: r.cliente?.nombre ?? r.client_id_externo,
          csm_email: r.cliente?.csm_email ?? null,
          cells: {},
        };
      }
      byClient[r.cliente_id].cells[r.producto] = r;
    }
    // Ordenar: clientes con más severidad primero, luego alfabético
    return Object.values(byClient).sort((a, b) => {
      const aSev = severityScore(a.cells);
      const bSev = severityScore(b.cells);
      if (aSev !== bSev) return bSev - aSev;
      return a.nombre.localeCompare(b.nombre);
    });
  }, [rows]);

  const historyByClientProduct = useMemo(() => {
    const m: Record<string, Alerta[]> = {};
    for (const r of allWeeksRows) {
      const key = r.cliente_id + "|" + r.producto;
      if (!m[key]) m[key] = [];
      m[key].push(r);
    }
    for (const k in m) m[k].sort((a, b) => a.periodo_actual_fin.localeCompare(b.periodo_actual_fin));
    return m;
  }, [allWeeksRows]);

  /* ─── render ───────────────────────────────────────────────────── */

  const drawerData = drawerClient ? consolidatedRows.find((c) => c.cliente_id === drawerClient) : null;

  return (
    <>
      <Pulse weekFin={weekFin} totalClientes={portfolioCounts.total} />

      <KpiBanner counts={portfolioCounts} />

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
      />

      <TableSection
        open={tableOpen}
        onToggle={() => setTableOpen((o) => !o)}
        rows={consolidatedRows}
        csmByEmail={csmByEmail}
        onClickClient={(id) => setDrawerClient(id)}
      />

      <AnimatePresence>
        {drawerData && (
          <ClientDrawer
            data={drawerData}
            history={historyByClientProduct}
            csmByEmail={csmByEmail}
            onClose={() => setDrawerClient(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
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
   PULSE — header con periodo y rangos
   ========================================================================= */
function Pulse({ weekFin, totalClientes }: { weekFin: string; totalClientes: number }) {
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
        margin: 0, marginBottom: 8,
      }}>
        Semana del {fechaTitulo}
      </h1>

      <p style={{ fontSize: 13, color: S.muted, margin: 0, lineHeight: 1.5 }}>
        Comparativo MTD vs PMTD · {totalClientes} clientes con datos esta semana.
      </p>
    </motion.div>
  );
}

/* =========================================================================
   KPI BANNER — En riesgo / Creciendo / Estables / Cobertura
   ========================================================================= */
function KpiBanner({
  counts,
}: {
  counts: { riesgo: number; creciendo: number; estables: number; total: number };
}) {
  const items: { key: string; label: string; value: number; sub?: string; color: string; icon: typeof TrendingDown }[] = [
    { key: "riesgo",    label: "En riesgo",    value: counts.riesgo,    sub: "críticas + fuertes", color: "#EF4444", icon: TrendingDown },
    { key: "creciendo", label: "Creciendo",    value: counts.creciendo, sub: ">+30% MoM",          color: "#10B981", icon: TrendingUp },
    { key: "estables",  label: "Estables",     value: counts.estables,                              color: "#94A3B8", icon: Minus },
    { key: "total",     label: "Cartera",      value: counts.total,     sub: "clientes con datos", color: "#7DD3FC", icon: Minus },
  ];
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 12, marginBottom: 18,
    }}>
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <motion.div
            key={it.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08 + i * 0.05, ease: "easeOut" }}
            style={{
              position: "relative", overflow: "hidden",
              background: S.surface, border: `1px solid ${S.border}`,
              borderRadius: 14, padding: "16px 18px 16px 22px",
            }}
          >
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: it.color }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Icon size={11} color={it.color} strokeWidth={2.4} />
              <span style={{ fontSize: 10, color: S.muted, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 600 }}>
                {it.label}
              </span>
            </div>
            <div style={{ fontSize: 32, fontWeight: 800, color: S.text, lineHeight: 1, letterSpacing: "-0.02em" }}>
              {it.value}
            </div>
            {it.sub && (
              <div style={{ fontSize: 11, color: S.dim, marginTop: 6, fontWeight: 500 }}>
                {it.sub}
              </div>
            )}
          </motion.div>
        );
      })}
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
  portfolioCounts: { riesgo: number; creciendo: number; estables: number; total: number };
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
    lines.push(`• En riesgo:    ${portfolioCounts.riesgo} clientes (críticas + fuertes)`);
    lines.push(`• Creciendo:    ${portfolioCounts.creciendo}`);
    lines.push(`• Estables:     ${portfolioCounts.estables}`);
    lines.push(`• Cobertura:    ${portfolioCounts.total} clientes con datos`);
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
}: {
  aggs: Record<Producto, { valor_actual: number; valor_anterior: number; variacion_pct: number | null; variacion_abs: number; counts: Record<Severidad, number> }>;
  expanded: Producto | null;
  onToggle: (p: Producto) => void;
  topMovers: Record<Producto, { caidas: Alerta[]; crecimientos: Alerta[] }>;
  csmByEmail: Record<string, { nombre: string }>;
  onClickClient: (cliente_id: string) => void;
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

      {/* header */}
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

      {/* numbers */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: S.text, letterSpacing: "-0.02em", lineHeight: 1 }}>
          {fmtNum(agg.valor_actual)}
        </div>
        <div style={{ fontSize: 12, color: S.muted }}>
          vs <span style={{ color: S.text, fontWeight: 600 }}>{fmtNum(agg.valor_anterior)}</span>
        </div>
      </div>

      {/* delta */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 700, color: deltaColor }}>
          <TrendIcon size={14} strokeWidth={2.6} />
          {fmtPct(agg.variacion_pct)}
        </span>
        <span style={{ fontSize: 11, color: S.muted, fontWeight: 500 }}>
          ({fmtNumSigned(agg.variacion_abs)})
        </span>
      </div>

      {/* severity badges */}
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
   PRODUCT DETAIL — top 5 caídas + top 5 crecimientos
   ========================================================================= */
function ProductDetail({
  producto, caidas, crecimientos, csmByEmail, onClickClient,
}: {
  producto: Producto;
  caidas: Alerta[];
  crecimientos: Alerta[];
  csmByEmail: Record<string, { nombre: string }>;
  onClickClient: (cliente_id: string) => void;
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16 }}>
        <MoversTable
          title="⚠ Top 5 caídas"
          subtitle="ordenadas por impacto absoluto"
          rows={caidas}
          accent="#EF4444"
          csmByEmail={csmByEmail}
          onClickClient={onClickClient}
          emptyText="Sin caídas relevantes esta semana."
        />
        <MoversTable
          title="📈 Top 5 crecimientos"
          subtitle="ordenadas por impacto absoluto"
          rows={crecimientos}
          accent="#10B981"
          csmByEmail={csmByEmail}
          onClickClient={onClickClient}
          emptyText="Sin crecimientos relevantes esta semana."
        />
      </div>
    </div>
  );
}

function MoversTable({
  title, subtitle, rows, accent, csmByEmail, onClickClient, emptyText,
}: {
  title: string;
  subtitle: string;
  rows: Alerta[];
  accent: string;
  csmByEmail: Record<string, { nombre: string }>;
  onClickClient: (cliente_id: string) => void;
  emptyText: string;
}) {
  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: S.text }}>{title}</div>
        <div style={{ fontSize: 10.5, color: S.muted, marginTop: 2 }}>{subtitle}</div>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: S.dim, padding: "10px 0" }}>{emptyText}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {rows.map((r) => {
            const csm = r.cliente?.csm_email ? csmByEmail[r.cliente.csm_email]?.nombre : null;
            return (
              <button
                key={r.id}
                onClick={() => onClickClient(r.cliente_id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto",
                  gap: 10, alignItems: "center",
                  background: "transparent",
                  border: `1px solid ${S.border}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${accent}50`;
                  e.currentTarget.style.background = `${accent}08`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = S.border;
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: S.text, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.cliente?.nombre ?? r.client_id_externo}
                  </div>
                  {csm && (
                    <div style={{ fontSize: 10, color: S.dim, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {csm}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: S.muted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {fmtNum(r.valor_anterior)} → {fmtNum(r.valor_actual)}
                </div>
                <div style={{ fontSize: 11, color: accent, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {fmtNumSigned(r.variacion_abs)}
                </div>
                <div style={{ fontSize: 12, color: accent, fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", minWidth: 56, textAlign: "right" }}>
                  {fmtPct(r.variacion_pct)}
                </div>
              </button>
            );
          })}
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
   TABLE SECTION — vista consolidada cliente × producto
   ========================================================================= */
function TableSection({
  open, onToggle, rows, csmByEmail, onClickClient,
}: {
  open: boolean;
  onToggle: () => void;
  rows: { cliente_id: string; nombre: string; csm_email: string | null; cells: Partial<Record<Producto, Alerta>> }[];
  csmByEmail: Record<string, { nombre: string }>;
  onClickClient: (cliente_id: string) => void;
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
            <ConsolidatedTable rows={rows} csmByEmail={csmByEmail} onClickClient={onClickClient} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ConsolidatedTable({
  rows, csmByEmail, onClickClient,
}: {
  rows: { cliente_id: string; nombre: string; csm_email: string | null; cells: Partial<Record<Producto, Alerta>> }[];
  csmByEmail: Record<string, { nombre: string }>;
  onClickClient: (cliente_id: string) => void;
}) {
  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`,
      borderRadius: 14, overflow: "hidden",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(180px, 2fr) repeat(3, minmax(160px, 1fr)) minmax(120px, 0.8fr)",
        background: S.surfaceLo,
        borderBottom: `1px solid ${S.border}`,
        fontSize: 10, fontWeight: 700, color: S.muted,
        letterSpacing: "0.10em", textTransform: "uppercase",
      }}>
        <div style={{ padding: "12px 14px" }}>Cliente</div>
        {PROD_LIST.map((p) => (
          <div key={p} style={{ padding: "12px 14px", color: PROD_META[p].color }}>
            {PROD_META[p].sigla} · {PROD_META[p].label}
          </div>
        ))}
        <div style={{ padding: "12px 14px" }}>CSM</div>
      </div>

      <div>
        {rows.map((r, i) => {
          const csm = r.csm_email ? csmByEmail[r.csm_email]?.nombre || r.csm_email : "—";
          return (
            <button
              key={r.cliente_id}
              onClick={() => onClickClient(r.cliente_id)}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(180px, 2fr) repeat(3, minmax(160px, 1fr)) minmax(120px, 0.8fr)",
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
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProductCell({ alerta }: { alerta?: Alerta }) {
  if (!alerta) return <span style={{ fontSize: 12, color: S.dim }}>—</span>;
  const sev = SEV_META[alerta.severidad];
  const isImportant = ["critica", "fuerte", "crecimiento"].includes(alerta.severidad);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 12, fontWeight: 700,
        color: isImportant ? sev.color : S.text,
        fontVariantNumeric: "tabular-nums",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, background: sev.color, opacity: isImportant ? 1 : 0.5 }} />
        {fmtPct(alerta.variacion_pct)}
      </div>
      <div style={{ fontSize: 10.5, color: S.muted, fontVariantNumeric: "tabular-nums" }}>
        {fmtNum(alerta.valor_anterior)} → {fmtNum(alerta.valor_actual)}
      </div>
    </div>
  );
}

/* =========================================================================
   CLIENT DRAWER — sparkline + 3 productos detalle
   ========================================================================= */
function ClientDrawer({
  data, history, csmByEmail, onClose,
}: {
  data: { cliente_id: string; nombre: string; csm_email: string | null; cells: Partial<Record<Producto, Alerta>> };
  history: Record<string, Alerta[]>;
  csmByEmail: Record<string, { nombre: string }>;
  onClose: () => void;
}) {
  // ESC para cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const csm = data.csm_email ? csmByEmail[data.csm_email]?.nombre || data.csm_email : "Sin CSM asignado";
  const tci = Object.values(data.cells).find(Boolean)?.client_id_externo ?? "";

  return (
    <>
      {/* backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.55)", zIndex: 50,
        }}
      />

      {/* panel */}
      <motion.div
        initial={{ x: 480, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 480, opacity: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(480px, 100vw)",
          background: S.surfaceLo,
          borderLeft: `1px solid ${S.borderHi}`,
          padding: "24px 24px 32px", overflowY: "auto",
          zIndex: 51,
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
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

        {/* products */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {PROD_LIST.map((p) => {
            const a = data.cells[p];
            if (!a) return <ProductSection key={p} producto={p} alerta={null} history={[]} />;
            const hist = history[`${data.cliente_id}|${p}`] ?? [];
            return <ProductSection key={p} producto={p} alerta={a} history={hist} />;
          })}
        </div>
      </motion.div>
    </>
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
      <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, padding: "12px 14px", opacity: 0.6 }}>
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

      {/* extras */}
      <ExtrasBlock producto={producto} alerta={alerta} />

      {/* sparkline */}
      {history.length >= 2 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, color: S.muted, fontWeight: 600, letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
            Histórico ({history.length} semana{history.length === 1 ? "" : "s"})
          </div>
          <Sparkline points={history.map((r) => Number(r.valor_actual ?? 0))} color={m.color} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: S.dim, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
            <span>{new Date(history[0].periodo_actual_fin).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}</span>
            <span>{new Date(history[history.length - 1].periodo_actual_fin).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}</span>
          </div>
        </div>
      )}

      {/* periodo footer */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${S.border}`, fontSize: 10.5, color: S.dim }}>
        {fmtRange(alerta.periodo_anterior_inicio, alerta.periodo_anterior_fin)}
        {" → "}
        {fmtRange(alerta.periodo_actual_inicio, alerta.periodo_actual_fin)}
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
   SPARKLINE — SVG chart simple
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

  const height = 48;
  const padding = 6;
  if (points.length < 2) {
    return <div ref={ref} style={{ height, fontSize: 10, color: S.dim }}>No hay suficientes datos.</div>;
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = (width - padding * 2) / (points.length - 1);
  const scaleY = (v: number) => height - padding - ((v - min) / range) * (height - padding * 2);

  const linePath = points
    .map((v, i) => {
      const x = padding + i * stepX;
      const y = scaleY(v);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPath =
    linePath +
    ` L${(padding + (points.length - 1) * stepX).toFixed(1)} ${height - padding} L${padding} ${height - padding} Z`;

  return (
    <div ref={ref} style={{ width: "100%", overflow: "hidden" }}>
      <svg width={width} height={height} style={{ display: "block" }}>
        <defs>
          <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
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

