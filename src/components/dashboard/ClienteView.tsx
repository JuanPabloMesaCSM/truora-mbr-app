import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { S, PROD_META, fmtNum, fmtPct } from "@/components/botialertas/types";
import {
  parseDiMetricasGenerales,
  parseDiHistorico,
  parseRazonesGenerico,
  parseBgcResumen,
  parseBgcPorPais,
  parseBgcAnomalias,
  parseBgcHistorico,
  parseCeConsumo,
  parseCeFallos,
  parseCeHistorico,
  labelRazon,
  type DashboardResponse,
  type ClienteRow,
  type Producto,
} from "./types";

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
}: {
  cliente: ClienteRow;
  data: DashboardResponse;
}) {
  const di = parseDiMetricasGenerales(data.data.DI);
  const diHist = parseDiHistorico(data.data.DI);
  const bgc = parseBgcResumen(data.data.BGC);
  const bgcPaises = parseBgcPorPais(data.data.BGC);
  const bgcAnomalias = parseBgcAnomalias(data.data.BGC);
  const bgcHist = parseBgcHistorico(data.data.BGC);
  const ce = parseCeConsumo(data.data.CE);
  const ceFallos = parseCeFallos(data.data.CE);
  const ceHist = parseCeHistorico(data.data.CE);

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
            { label: "Procesos", valor: fmtNum(di.totalProcesos), prev: fmtNum(di.totalProcesosPrev), variacionPct: di.variacionProcesosPct },
            { label: "Conversión", valor: di.conversionPct != null ? `${di.conversionPct.toFixed(1)}%` : "—", prev: di.conversionPctPrev != null ? `${di.conversionPctPrev.toFixed(1)}%` : "—", variacionPct: deltaPp(di.conversionPct, di.conversionPctPrev) },
            { label: "Exitosos", valor: fmtNum(di.exitosos), prev: fmtNum(di.exitososPrev), variacionPct: deltaPct(di.exitosos, di.exitososPrev) },
          ]}
          breakdown={[
            { label: "Expirados", valor: fmtNum(di.expirados) },
            { label: "Declinados", valor: fmtNum(di.declinados) },
            { label: "Cancelados", valor: fmtNum(di.cancelados) },
            { label: "Errores técn.", valor: fmtNum(di.erroresTecnicos) },
          ]}
        />
      )}
      {ranEjecutados.BGC && bgc && (
        <KpiCard
          producto="BGC"
          metricas={[
            { label: "Checks", valor: fmtNum(bgc.totalChecks), prev: fmtNum(bgc.totalChecksPrev), variacionPct: bgc.variacionChecksPct },
            { label: "Pass rate", valor: bgc.passRatePct != null ? `${bgc.passRatePct.toFixed(1)}%` : "—", prev: bgc.passRatePctPrev != null ? `${bgc.passRatePctPrev.toFixed(1)}%` : "—", variacionPct: deltaPp(bgc.passRatePct, bgc.passRatePctPrev) },
            { label: "Score promedio", valor: bgc.scorePromedio != null ? bgc.scorePromedio.toFixed(2) : "—", prev: bgc.scorePromedioPrev != null ? bgc.scorePromedioPrev.toFixed(2) : "—", variacionPct: null },
          ]}
          breakdown={[
            { label: "Completados", valor: fmtNum(bgc.completados) },
            { label: "Errores", valor: fmtNum(bgc.errores) },
            { label: "Rechazo", valor: bgc.rejectionRatePct != null ? `${bgc.rejectionRatePct.toFixed(1)}%` : "—" },
          ]}
        />
      )}
      {ranEjecutados.CE && ce && (
        <KpiCard
          producto="CE"
          metricas={[
            { label: "Total mensajes", valor: fmtNum(ce.total), prev: fmtNum(ce.totalPrev), variacionPct: ce.variacionTotalPct },
            { label: "Inbound", valor: fmtNum(ce.inbound), prev: fmtNum(ce.inboundPrev), variacionPct: ce.variacionInboundPct },
            { label: "Outbound", valor: fmtNum(ce.outbound), prev: fmtNum(ce.outboundPrev), variacionPct: ce.variacionOutboundPct },
          ]}
          breakdown={[
            { label: "Notificaciones", valor: fmtNum(ce.notif) },
            { label: "Outbound éxito", valor: ceFallos.pctExito != null ? `${ceFallos.pctExito.toFixed(0)}%` : "—" },
          ]}
        />
      )}

      {/* Tendencia mensual — placeholder hasta charts (Fase 2) */}
      {(diHist.length > 0 || bgcHist.length > 0 || ceHist.length > 0) && (
        <Section title="Tendencia mensual">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {ranEjecutados.DI && diHist.length > 0 && (
              <TendenciaTable
                producto="DI"
                rows={diHist.map((m) => ({
                  periodo: m.periodo,
                  metrica: fmtNum(m.totalProcesos),
                  extra: m.conversionPct != null ? `${m.conversionPct.toFixed(1)}% conv.` : "",
                }))}
              />
            )}
            {ranEjecutados.BGC && bgcHist.length > 0 && (
              <TendenciaTable
                producto="BGC"
                rows={bgcHist.map((m) => ({
                  periodo: m.periodo,
                  metrica: fmtNum(m.totalChecks),
                  extra: m.passRatePct != null ? `${m.passRatePct.toFixed(1)}% pass` : "",
                }))}
              />
            )}
            {ranEjecutados.CE && ceHist.length > 0 && (
              <TendenciaTable
                producto="CE"
                rows={ceHist.map((m) => ({
                  periodo: m.periodo,
                  metrica: fmtNum(m.total),
                  extra: `${fmtNum(m.inbound)} in · ${fmtNum(m.outbound)} out`,
                }))}
              />
            )}
          </div>
        </Section>
      )}

      {/* Razones DI */}
      {ranEjecutados.DI && data.data.DI && (
        <Section title="Principales razones — DI">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
            <RazonesCard
              titulo="Rechazo documento"
              items={parseRazonesGenerico(data.data.DI, "7_razones_doc")}
              color={PROD_META.DI.color}
            />
            <RazonesCard
              titulo="Rechazo rostro"
              items={parseRazonesGenerico(data.data.DI, "8_razones_rostro")}
              color={PROD_META.DI.color}
            />
            <RazonesCard
              titulo="Abandono / cancelación"
              items={parseRazonesGenerico(data.data.DI, "9_abandono")}
              color={PROD_META.DI.color}
            />
            <RazonesCard
              titulo="Modelo declinó"
              items={parseRazonesGenerico(data.data.DI, "10_declinados")}
              color={PROD_META.DI.color}
            />
          </div>
        </Section>
      )}

      {/* BGC: por país + anomalías */}
      {ranEjecutados.BGC && data.data.BGC && (
        <Section title="BGC — desglose">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
            {bgcPaises.length > 0 && (
              <div style={cardStyle()}>
                <div style={cardHeaderStyle(PROD_META.BGC.color)}>Por país</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={thStyle()}>País</th>
                      <th style={thStyle("right")}>Checks</th>
                      <th style={thStyle("right")}>Pass</th>
                      <th style={thStyle("right")}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bgcPaises.map((p) => (
                      <tr key={p.pais}>
                        <td style={tdStyle()}>{p.pais}</td>
                        <td style={tdStyle("right")}>{fmtNum(p.totalChecks)}</td>
                        <td style={tdStyle("right")}>{p.passRatePct != null ? `${p.passRatePct.toFixed(1)}%` : "—"}</td>
                        <td style={tdStyle("right", S.muted)}>{p.pctSobreTotal != null ? `${p.pctSobreTotal.toFixed(1)}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {bgcAnomalias.length > 0 && (
              <div style={cardStyle()}>
                <div style={cardHeaderStyle("#F59E0B", <AlertTriangle size={12} />)}>
                  Anomalías labels High
                </div>
                <div style={{ fontSize: 11, color: S.muted, marginBottom: 10, lineHeight: 1.5 }}>
                  Labels que dicen "High" pero el score promedio quedó arriba de 6.
                  Puede indicar umbral mal calibrado.
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={thStyle()}>Label</th>
                      <th style={thStyle("right")}>Score</th>
                      <th style={thStyle("right")}>N</th>
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
            )}
          </div>
        </Section>
      )}

      {/* CE: fallos outbound */}
      {ranEjecutados.CE && ceFallos.items.length > 0 && (
        <Section title="CE — fallos outbound">
          <RazonesCard
            titulo={`Total fallos: ${fmtNum(ceFallos.items.reduce((s, x) => s + x.totalFallos, 0))} (${ceFallos.pctExito != null ? `${ceFallos.pctExito.toFixed(0)}% éxito` : "—"})`}
            items={ceFallos.items.map((f) => ({ motivo: f.categoria, total: f.totalFallos }))}
            color={PROD_META.CE.color}
            useLabelMap={false}
          />
        </Section>
      )}
    </motion.div>
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
