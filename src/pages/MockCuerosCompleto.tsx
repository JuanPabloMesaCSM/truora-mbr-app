import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  Loader2,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertTriangle,
} from "lucide-react";
import { MeshBackground } from "@/components/report-builder/MeshBackground";
import { S, PROD_META, fmtNum, fmtPct } from "@/components/botialertas/types";
import {
  parseDiMetricasGenerales,
  parseBgcResumen,
  parseBgcAnomalias,
  type DashboardResponse,
} from "@/components/dashboard/types";
import ConsumoMensualChart from "@/components/dashboard/charts/ConsumoMensualChart";
import ConversionChart from "@/components/dashboard/charts/ConversionChart";
import TendenciaRazonesChart from "@/components/dashboard/charts/TendenciaRazonesChart";
import RazonesTablaHeatmap from "@/components/dashboard/charts/RazonesTablaHeatmap";
import BiometricCaptureSlide from "@/components/mbr-cueros/BiometricCaptureSlide";
import { exportDashboardPDF } from "@/utils/exportDashboardPDF";
import { exportDashboardPPTX } from "@/utils/exportDashboardPPTX";
import cuerosDashboardJson from "@/data/cueros_dashboard.json";

/**
 * /mbr-cueros-completo — MBR ad-hoc Cueros Velez Octubre 2025 – Abril 2026.
 *
 * Reusa los componentes EXACTOS del /dashboard (ConsumoMensualChart,
 * ConversionChart, TendenciaRazonesChart, RazonesTablaHeatmap) inyectándoles
 * la data pre-extraída del webhook `dashboard-metrics-detail` que vive en
 * `src/data/cueros_dashboard.json`. Cierra con el slide de captura
 * biométrica importado de mbr-cueros/BiometricCaptureSlide.
 *
 * Export:
 *   - PDF: una página larga (mismo motor que /dashboard) → fidelidad scroll completo.
 *   - PPTX: una slide por sección marcada con `data-pptx-section`. Cada
 *     sección se captura con html2canvas y se mete como imagen centrada en
 *     una slide widescreen 13.33"×7.5".
 */

// El JSON viene como array con 1 objeto (forma del Respond to Webhook de n8n).
const RAW = (Array.isArray(cuerosDashboardJson)
  ? cuerosDashboardJson[0]
  : cuerosDashboardJson) as unknown as DashboardResponse;

const CLIENT = "Cueros Velez";
const PERIOD_LABEL = "Octubre 2025 – Abril 2026";
const TCI = "TCIfb5e5b5843082274ff5da4143e8e8aa0";
const CSM_EMAIL = "jpmesa@truora.com";

export default function MockCuerosCompleto() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);

  const di = parseDiMetricasGenerales(RAW.data.DI);
  const bgc = parseBgcResumen(RAW.data.BGC);
  const bgcAnomalias = parseBgcAnomalias(RAW.data.BGC);

  async function handleExportPdf() {
    if (!rootRef.current || exportingPdf || exportingPptx) return;
    setExportingPdf(true);
    try {
      await exportDashboardPDF({
        rootElement: rootRef.current,
        filename: `${CLIENT.replace(/\s+/g, "_")}_MBR_Oct25-Abr26.pdf`,
      });
    } catch (e) {
      console.error("[MockCuerosCompleto] PDF export failed:", e);
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleExportPptx() {
    if (!rootRef.current || exportingPdf || exportingPptx) return;
    setExportingPptx(true);
    try {
      await exportDashboardPPTX({
        rootElement: rootRef.current,
        filename: `${CLIENT.replace(/\s+/g, "_")}_MBR_Oct25-Abr26.pptx`,
      });
    } catch (e) {
      console.error("[MockCuerosCompleto] PPTX export failed:", e);
    } finally {
      setExportingPptx(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#08111E",
        position: "relative",
        fontFamily: "Inter, system-ui, sans-serif",
        color: S.text,
      }}
    >
      <MeshBackground />

      {/* Top bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(8,17,30,0.7)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${S.border}`,
          padding: "14px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: S.muted,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          MBR Ad-hoc · {CLIENT} · {PERIOD_LABEL}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <ExportButton
            label={exportingPdf ? "Generando PDF…" : "Exportar PDF"}
            loading={exportingPdf}
            disabled={exportingPdf || exportingPptx}
            onClick={handleExportPdf}
            color="#7C4DFF"
          />
          <ExportButton
            label={exportingPptx ? "Generando PPTX…" : "Exportar PPTX"}
            loading={exportingPptx}
            disabled={exportingPdf || exportingPptx}
            onClick={handleExportPptx}
            color="#22D3EE"
          />
        </div>
      </div>

      {/* Root capturable */}
      <div style={{ padding: "28px 32px 60px", position: "relative", zIndex: 1 }}>
        <motion.div
          ref={rootRef}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
            maxWidth: 1280,
            margin: "0 auto",
          }}
        >
          {/* Header cliente */}
          <div
            data-pptx-section="header"
            style={{
              background: S.surface,
              border: `1px solid ${S.border}`,
              borderRadius: 14,
              padding: "18px 22px",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: S.muted,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Cliente
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: S.text, marginBottom: 8 }}>
              {CLIENT}
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 11, color: S.dim, flexWrap: "wrap" }}>
              <span>CSM: {CSM_EMAIL}</span>
              <span>DI: {TCI.slice(0, 16)}…</span>
              <span>BGC: {TCI.slice(0, 16)}…</span>
              <span>Período: {PERIOD_LABEL}</span>
            </div>
          </div>

          {/* KPI DI */}
          {di && (
            <div data-pptx-section="kpi-di">
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
            </div>
          )}

          {/* DI charts */}
          {RAW.data.DI && (
            <ProductBlock
              producto="DI"
              chartConsumo={<ConsumoMensualChart bloques={RAW.data.DI} producto="DI" />}
              chartConversion={<ConversionChart bloques={RAW.data.DI} producto="DI" />}
              chartTendencia={<TendenciaRazonesChart bloques={RAW.data.DI} producto="DI" tipoFallo="ambos" />}
              chartTabla={<RazonesTablaHeatmap bloques={RAW.data.DI} producto="DI" />}
              keyPrefix="di"
            />
          )}

          {/* KPI BGC */}
          {bgc && (
            <div data-pptx-section="kpi-bgc">
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
            </div>
          )}

          {/* BGC charts */}
          {RAW.data.BGC && (
            <ProductBlock
              producto="BGC"
              chartConsumo={<ConsumoMensualChart bloques={RAW.data.BGC} producto="BGC" />}
              chartConversion={<ConversionChart bloques={RAW.data.BGC} producto="BGC" />}
              chartTendencia={<TendenciaRazonesChart bloques={RAW.data.BGC} producto="BGC" tipoFallo="ambos" />}
              chartTabla={<RazonesTablaHeatmap bloques={RAW.data.BGC} producto="BGC" />}
              keyPrefix="bgc"
            />
          )}

          {/* BGC anomalías (si las hay) */}
          {bgcAnomalias.length > 0 && (
            <div data-pptx-section="bgc-anomalies">
              <div
                style={{
                  background: S.surface,
                  border: `1px solid ${S.border}`,
                  borderRadius: 14,
                  padding: "18px 22px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "#F59E0B",
                    fontSize: 13,
                    fontWeight: 700,
                    marginBottom: 12,
                  }}
                >
                  <AlertTriangle size={14} />
                  BGC — Casos con alerta de riesgo alto pero puntaje promedio &gt; 6
                </div>
                <div style={{ fontSize: 11, color: S.muted, marginBottom: 10, lineHeight: 1.5 }}>
                  Estos casos llegaron con alerta de riesgo alto pero el puntaje promedio
                  terminó por encima del umbral típico (6). Puede indicar un umbral mal
                  calibrado del modelo — vale la pena revisarlo con el cliente.
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={anomaliaTh()}>Tipo de alerta</th>
                      <th style={anomaliaTh("right")}>Puntaje</th>
                      <th style={anomaliaTh("right")}>Casos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bgcAnomalias.map((a) => (
                      <tr key={a.label}>
                        <td style={anomaliaTd()}>{a.label}</td>
                        <td style={anomaliaTd("right", a.esAnomalia ? "#F59E0B" : S.text)}>
                          {a.scorePromedio != null ? a.scorePromedio.toFixed(2) : "—"}
                        </td>
                        <td style={anomaliaTd("right", S.muted)}>{fmtNum(a.totalChecks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Captura biométrica */}
          <BiometricCaptureSlide clientName={CLIENT} periodLabel={PERIOD_LABEL} />
        </motion.div>
      </div>
    </div>
  );
}

/* ─────────────────────────── ProductBlock ─────────────────────────── */

function ProductBlock({
  producto,
  chartConsumo,
  chartConversion,
  chartTendencia,
  chartTabla,
  keyPrefix,
}: {
  producto: "DI" | "BGC" | "CE";
  chartConsumo: React.ReactNode;
  chartConversion: React.ReactNode;
  chartTendencia: React.ReactNode;
  chartTabla: React.ReactNode;
  keyPrefix: string;
}) {
  const meta = PROD_META[producto];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header del producto */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
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

      <div data-pptx-section={`${keyPrefix}-consumo`}>{chartConsumo}</div>
      <div data-pptx-section={`${keyPrefix}-conversion`}>{chartConversion}</div>
      <div
        data-pptx-section={`${keyPrefix}-razones`}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: 16,
        }}
      >
        {chartTendencia}
        {chartTabla}
      </div>
    </div>
  );
}

/* ─────────────────────────── KpiCard (clon ClienteView) ─────────────────────────── */

function KpiCard({
  producto,
  metricas,
  breakdown,
}: {
  producto: "DI" | "BGC" | "CE";
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
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: meta.color,
        }}
      />
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
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            paddingTop: 12,
            borderTop: `1px solid ${S.border}`,
            fontSize: 11,
            color: S.muted,
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

function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function deltaPp(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null) return null;
  return curr - prev;
}

/* ─────────────────────────── Anomalia table styles ─────────────────────────── */

function anomaliaTh(align: "left" | "right" = "left"): React.CSSProperties {
  return {
    padding: "8px 10px",
    fontSize: 10,
    color: S.muted,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    textAlign: align,
    borderBottom: `1px solid ${S.border}`,
  };
}

function anomaliaTd(
  align: "left" | "right" = "left",
  color: string = S.text,
): React.CSSProperties {
  return {
    padding: "9px 10px",
    fontSize: 12,
    color,
    fontWeight: align === "right" ? 600 : 500,
    textAlign: align,
    fontVariantNumeric: "tabular-nums",
    borderBottom: `1px solid ${S.border}`,
  };
}

/* ─────────────────────────── ExportButton ─────────────────────────── */

function ExportButton({
  label,
  loading,
  disabled,
  onClick,
  color,
}: {
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 14px",
        borderRadius: 999,
        border: `1px solid ${disabled ? S.border : `${color}80`}`,
        background: disabled ? "rgba(255,255,255,0.04)" : `${color}30`,
        color: disabled ? S.muted : S.text,
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "all 0.18s ease",
      }}
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
      {label}
    </button>
  );
}
