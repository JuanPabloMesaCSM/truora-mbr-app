import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { S, PROD_META, fmtNum, fmtPct } from "@/components/botialertas/types";
import {
  parseDiMetricasGenerales,
  parseBgcResumen,
  parseBgcAnomalias,
  parseCeConsumo,
  parseCeFallos,
  type DashboardResponse,
  type ClienteRow,
  type Producto,
  type TipoFallo,
} from "./types";
import ConsumoMensualChart from "./charts/ConsumoMensualChart";
import ConversionChart from "./charts/ConversionChart";
import TendenciaRazonesChart from "./charts/TendenciaRazonesChart";
import RazonesTablaHeatmap from "./charts/RazonesTablaHeatmap";

/**
 * Vista cliente individual del dashboard.
 *
 * Render:
 *   1. Header: nombre cliente + TCIs + CSM dueño
 *   2. KPIs por producto (cards horizontales — 1 por producto activo)
 *   3. Tendencia mensual (placeholder text por ahora; charts en fase 2)
 *   4. Top razones de rechazo / fallos (cards con barras horizontales)
 *
 * Recibe ya-parseado el `DashboardResponse` que devolvió el webhook + el
 * cliente para mostrar su nombre/CSM en el header.
 */

export default function ClienteView({
  cliente,
  data,
  tipoFallo,
}: {
  cliente: ClienteRow;
  data: DashboardResponse;
  tipoFallo: TipoFallo;
}) {
  const di = parseDiMetricasGenerales(data.data.DI);
  const bgc = parseBgcResumen(data.data.BGC);
  const bgcAnomalias = parseBgcAnomalias(data.data.BGC);
  const ce = parseCeConsumo(data.data.CE);
  const ceFallos = parseCeFallos(data.data.CE);

  const ranEjecutados = data.productos_ejecutados;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{ display: "flex", flexDirection: "column", gap: 24 }}
    >
      {/* Header */}
      <div
        style={{
          background: S.surface,
          border: `1px solid ${S.border}`,
          borderRadius: 14,
          padding: "18px 22px",
        }}
      >
        <div style={{ fontSize: 11, color: S.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
          Cliente
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: S.text, marginBottom: 8 }}>
          {cliente.nombre}
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: 11, color: S.dim, flexWrap: "wrap" }}>
          <span>CSM: {cliente.csm_email}</span>
          {cliente.client_id_di && <span>DI: {cliente.client_id_di.slice(0, 16)}…</span>}
          {cliente.client_id_bgc && <span>BGC: {cliente.client_id_bgc.slice(0, 16)}…</span>}
          {cliente.client_id_ce && <span>CE: {cliente.client_id_ce.slice(0, 16)}…</span>}
        </div>
      </div>

      {/* KPIs por producto */}
      {ranEjecutados.DI && di && (
        <KpiCard
          producto="DI"
          metricas={[
            { label: "Validaciones", valor: fmtNum(di.totalProcesos), prev: fmtNum(di.totalProcesosPrev), variacionPct: di.variacionProcesosPct },
            { label: "% Conversión", valor: di.conversionPct != null ? `${di.conversionPct.toFixed(1)}%` : "—", prev: di.conversionPctPrev != null ? `${di.conversionPctPrev.toFixed(1)}%` : "—", variacionPct: deltaPp(di.conversionPct, di.conversionPctPrev) },
            { label: "Exitosas", valor: fmtNum(di.exitosos), prev: fmtNum(di.exitososPrev), variacionPct: deltaPct(di.exitosos, di.exitososPrev) },
          ]}
          breakdown={[
            { label: "Abandonadas", valor: fmtNum(di.expirados) },
            { label: "Rechazadas", valor: fmtNum(di.declinados) },
            { label: "Canceladas", valor: fmtNum(di.cancelados) },
            { label: "Errores técnicos", valor: fmtNum(di.erroresTecnicos) },
          ]}
        />
      )}
      {ranEjecutados.BGC && bgc && (
        <KpiCard
          producto="BGC"
          metricas={[
            { label: "Checks", valor: fmtNum(bgc.totalChecks), prev: fmtNum(bgc.totalChecksPrev), variacionPct: bgc.variacionChecksPct },
            { label: "% Checks exitosos", valor: bgc.passRatePct != null ? `${bgc.passRatePct.toFixed(1)}%` : "—", prev: bgc.passRatePctPrev != null ? `${bgc.passRatePctPrev.toFixed(1)}%` : "—", variacionPct: deltaPp(bgc.passRatePct, bgc.passRatePctPrev) },
            { label: "Puntaje promedio", valor: bgc.scorePromedio != null ? bgc.scorePromedio.toFixed(2) : "—", prev: bgc.scorePromedioPrev != null ? bgc.scorePromedioPrev.toFixed(2) : "—", variacionPct: null },
          ]}
          breakdown={[
            { label: "Completados", valor: fmtNum(bgc.completados) },
            { label: "Errores", valor: fmtNum(bgc.errores) },
            { label: "% Rechazados", valor: bgc.rejectionRatePct != null ? `${bgc.rejectionRatePct.toFixed(1)}%` : "—" },
          ]}
        />
      )}
      {ranEjecutados.CE && ce && (
        <KpiCard
          producto="CE"
          metricas={[
            { label: "Total mensajes", valor: fmtNum(ce.total), prev: fmtNum(ce.totalPrev), variacionPct: ce.variacionTotalPct },
            { label: "Conversaciones entrantes", valor: fmtNum(ce.inbound), prev: fmtNum(ce.inboundPrev), variacionPct: ce.variacionInboundPct },
            { label: "Mensajes salientes", valor: fmtNum(ce.outbound), prev: fmtNum(ce.outboundPrev), variacionPct: ce.variacionOutboundPct },
          ]}
          breakdown={[
            { label: "Notificaciones", valor: fmtNum(ce.notif) },
            { label: "% éxito salientes", valor: ceFallos.pctExito != null ? `${ceFallos.pctExito.toFixed(0)}%` : "—" },
          ]}
        />
      )}

      {/* DI charts */}
      {ranEjecutados.DI && data.data.DI && (
        <ProductCharts
          producto="DI"
          bloques={data.data.DI}
          tipoFallo={tipoFallo}
        />
      )}

      {/* BGC charts */}
      {ranEjecutados.BGC && data.data.BGC && (
        <ProductCharts
          producto="BGC"
          bloques={data.data.BGC}
          tipoFallo={tipoFallo}
        />
      )}

      {/* CE charts */}
      {ranEjecutados.CE && data.data.CE && (
        <ProductCharts
          producto="CE"
          bloques={data.data.CE}
          tipoFallo={tipoFallo}
        />
      )}

      {/* BGC: alertas de riesgo alto (anomalías) */}
      {ranEjecutados.BGC && bgcAnomalias.length > 0 && (
        <Section title="BGC — alertas de riesgo alto">
          <div style={cardStyle()}>
            <div style={cardHeaderStyle("#F59E0B", <AlertTriangle size={12} />)}>
              Casos con alerta de riesgo alto pero puntaje promedio &gt; 6
            </div>
            <div style={{ fontSize: 11, color: S.muted, marginBottom: 10, lineHeight: 1.5 }}>
              Estos casos llegaron con alerta de riesgo alto pero el puntaje promedio
              terminó por encima del umbral típico (6). Puede indicar un umbral mal
              calibrado del modelo — vale la pena revisarlo con el cliente.
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={thStyle()}>Tipo de alerta</th>
                  <th style={thStyle("right")}>Puntaje</th>
                  <th style={thStyle("right")}>Casos</th>
                </tr>
              </thead>
              <tbody>
                {bgcAnomalias.map((a) => (
                  <tr key={a.label}>
                    <td style={tdStyle()}>{a.label}</td>
                    <td style={tdStyle("right", a.esAnomalia ? "#F59E0B" : S.text)}>
                      {a.scorePromedio != null ? a.scorePromedio.toFixed(2) : "—"}
                    </td>
                    <td style={tdStyle("right", S.muted)}>{fmtNum(a.totalChecks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* CE: % éxito de mensajes salientes como dato suelto */}
      {ranEjecutados.CE && ceFallos.items.length > 0 && ceFallos.pctExito != null && (
        <div
          style={{
            background: S.surface,
            border: `1px solid ${S.border}`,
            borderRadius: 14,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            fontSize: 13,
          }}
        >
          <span style={{ color: S.muted }}>
            % de mensajes salientes entregados con éxito
          </span>
          <span style={{ fontWeight: 700, fontSize: 18, color: PROD_META.CE.color }}>
            {ceFallos.pctExito.toFixed(1)}%
          </span>
        </div>
      )}
    </motion.div>
  );
}

/* ─────────────────────────── ProductCharts: 4 charts por producto ─────────────────────────── */

function ProductCharts({
  producto,
  bloques,
  tipoFallo,
}: {
  producto: Producto;
  bloques: import("./types").BloqueMap;
  tipoFallo: TipoFallo;
}) {
  const meta = PROD_META[producto];
  return (
    <div>
      {/* Header del producto */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
          paddingLeft: 4,
        }}
      >
        <span style={{ fontSize: 18 }}>{meta.emoji}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: S.text }}>{meta.label}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: meta.color,
            background: `${meta.color}1A`,
            padding: "3px 8px",
            borderRadius: 4,
            letterSpacing: "0.04em",
          }}
        >
          {meta.sigla}
        </span>
      </div>

      {/* Grid de 4 charts: 2 columnas en pantallas anchas, 1 en mobile */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: 16,
        }}
      >
        <ConsumoMensualChart bloques={bloques} producto={producto} />
        <ConversionChart bloques={bloques} producto={producto} />
        <TendenciaRazonesChart bloques={bloques} producto={producto} tipoFallo={tipoFallo} />
        <RazonesTablaHeatmap bloques={bloques} producto={producto} />
      </div>
    </div>
  );
}

/* ─────────────────────────── KpiCard ─────────────────────────── */

function KpiCard({
  producto,
  metricas,
  breakdown,
}: {
  producto: Producto;
  metricas: { label: string; valor: string; prev: string; variacionPct: number | null }[];
  breakdown: { label: string; valor: string }[];
}) {
  const meta = PROD_META[producto];
  return (
    <div
      style={{
        position: "relative",
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: 14,
        padding: "18px 22px",
        overflow: "hidden",
      }}
    >
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: 3, background: meta.color,
      }} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>{meta.emoji}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: S.text }}>{meta.label}</span>
        <span style={{ fontSize: 11, color: meta.color, fontWeight: 600, letterSpacing: "0.04em" }}>
          {meta.sigla}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${metricas.length}, 1fr)`, gap: 18, marginBottom: 14 }}>
        {metricas.map((m) => (
          <div key={m.label}>
            <div style={{ fontSize: 11, color: S.muted, marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: S.text, lineHeight: 1.1 }}>
              {m.valor}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11 }}>
              <span style={{ color: S.dim }}>vs {m.prev}</span>
              {m.variacionPct != null && <DeltaBadge value={m.variacionPct} />}
            </div>
          </div>
        ))}
      </div>
      {breakdown.length > 0 && (
        <div
          style={{
            display: "flex", flexWrap: "wrap", gap: 14,
            paddingTop: 12,
            borderTop: `1px solid ${S.border}`,
            fontSize: 11, color: S.muted,
          }}
        >
          {breakdown.map((b) => (
            <span key={b.label}>
              <span style={{ color: S.dim }}>{b.label}: </span>
              <span style={{ color: S.text, fontWeight: 600 }}>{b.valor}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── DeltaBadge ─────────────────────────── */

function DeltaBadge({ value }: { value: number }) {
  const isPos = value > 0.5;
  const isNeg = value < -0.5;
  const color = isPos ? "#10B981" : isNeg ? "#EF4444" : S.muted;
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color }}>
      <Icon size={11} />
      {fmtPct(value)}
    </span>
  );
}

/* ─────────────────────────── RazonesCard ─────────────────────────── */

function RazonesCard({
  titulo,
  items,
  color,
  useLabelMap = true,
}: {
  titulo: string;
  items: { motivo: string; total: number }[];
  color: string;
  useLabelMap?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div style={cardStyle()}>
        <div style={cardHeaderStyle(color)}>{titulo}</div>
        <div style={{ fontSize: 12, color: S.dim, padding: "10px 0" }}>Sin datos en el rango.</div>
      </div>
    );
  }
  const max = Math.max(...items.map((i) => i.total));
  return (
    <div style={cardStyle()}>
      <div style={cardHeaderStyle(color)}>{titulo}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it) => {
          const pct = (it.total / max) * 100;
          const label = useLabelMap ? labelRazon(it.motivo) : it.motivo;
          return (
            <div key={it.motivo}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 11 }}>
                <span style={{ color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                  {label}
                </span>
                <span style={{ color: S.muted, fontWeight: 600 }}>{fmtNum(it.total)}</span>
              </div>
              <div style={{ height: 5, background: S.surfaceLo, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: color, opacity: 0.7 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── TendenciaTable ─────────────────────────── */

function TendenciaTable({
  producto,
  rows,
}: {
  producto: Producto;
  rows: { periodo: string; metrica: string; extra: string }[];
}) {
  const meta = PROD_META[producto];
  return (
    <div style={cardStyle()}>
      <div style={cardHeaderStyle(meta.color)}>{meta.label}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <tbody>
          {rows.map((r) => (
            <tr key={r.periodo}>
              <td style={tdStyle("left", S.muted)}>{fmtMonth(r.periodo)}</td>
              <td style={tdStyle("right")}>{r.metrica}</td>
              <td style={tdStyle("right", S.dim)}>{r.extra}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────── Section wrapper ─────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 13, fontWeight: 700, color: S.text,
          letterSpacing: "-0.005em", marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

/* ─────────────────────────── Style helpers ─────────────────────────── */

function cardStyle(): React.CSSProperties {
  return {
    background: S.surface,
    border: `1px solid ${S.border}`,
    borderRadius: 14,
    padding: "16px 18px",
  };
}

function cardHeaderStyle(color: string, icon?: React.ReactNode): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 12, fontWeight: 700, color,
    letterSpacing: "0.04em", textTransform: "uppercase",
    marginBottom: 12,
  } as React.CSSProperties;
  // (icon se renderiza desde el caller si lo necesita; lo dejo para ampliar)
}

function thStyle(align: "left" | "right" = "left"): React.CSSProperties {
  return {
    textAlign: align,
    fontSize: 10, fontWeight: 600,
    color: S.dim,
    letterSpacing: "0.04em", textTransform: "uppercase",
    padding: "6px 4px",
    borderBottom: `1px solid ${S.border}`,
  };
}

function tdStyle(align: "left" | "right" = "left", color: string = S.text): React.CSSProperties {
  return {
    textAlign: align, fontSize: 12,
    color, padding: "6px 4px",
  };
}

/* ─────────────────────────── Helpers de cálculo ─────────────────────────── */

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? null : 0;
  return ((curr - prev) / prev) * 100;
}

function deltaPp(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null) return null;
  return curr - prev;
}

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtMonth(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  const y = parts[0];
  const m = Number(parts[1]);
  return `${MESES[m - 1] ?? ""} ${y}`;
}
