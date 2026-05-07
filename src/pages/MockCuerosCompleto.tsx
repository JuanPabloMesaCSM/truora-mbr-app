import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Download, Loader2 } from "lucide-react";
import { MeshBackground } from "@/components/report-builder/MeshBackground";
import { S, PROD_META } from "@/components/botialertas/types";
import { type DashboardResponse } from "@/components/dashboard/types";
import ConsumoMensualChart from "@/components/dashboard/charts/ConsumoMensualChart";
import ConversionChart from "@/components/dashboard/charts/ConversionChart";
import TendenciaRazonesChart from "@/components/dashboard/charts/TendenciaRazonesChart";
import RazonesTablaHeatmap from "@/components/dashboard/charts/RazonesTablaHeatmap";
import BiometricCaptureSlide from "@/components/mbr-cueros/BiometricCaptureSlide";
import FormsAsistidoSlide from "@/components/mbr-cueros/FormsAsistidoSlide";
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
 * Decisiones por feedback del CSM (2026-05-07):
 *   - Sin slides de header / KPIs: solo charts + biométrico.
 *   - chartHeight ≈ 600 para que la card naturalmente quede ≈16:9 — así
 *     cada slide PPTX se llena sin bandas oscuras al ampliar manual.
 *
 * Export:
 *   - PDF: una página larga (mismo motor que /dashboard) → fidelidad scroll completo.
 *   - PPTX: una slide por sección marcada con `data-pptx-section`. Cada
 *     sección se captura con html2canvas en un staging 16:9 y entra
 *     full-bleed en la slide widescreen 13.33"×7.5".
 */

// El JSON viene como array con 1 objeto (forma del Respond to Webhook de n8n).
const RAW = (Array.isArray(cuerosDashboardJson)
  ? cuerosDashboardJson[0]
  : cuerosDashboardJson) as unknown as DashboardResponse;

const CLIENT = "Cueros Velez";
const PERIOD_LABEL = "Octubre 2025 – Abril 2026";

// Alto del chart interno para que la card resulte ≈16:9 con maxWidth 1280.
// 1280/1.7773 ≈ 720 → restamos ~80px de title/subtitle/padding ⇒ chart ≈ 640.
// Para grids 2-col (Tendencia + Tabla razones) cada chart tiene ~625px de ancho
// → height target ≈ 625/1.7773 ≈ 350 (le dejamos un poco más para el contenido).
const CHART_H_FULL = 600;
const CHART_H_GRID = 420;

export default function MockCuerosCompleto() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);

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
          {/* DI charts (sin header ni KPI) */}
          {RAW.data.DI && (
            <ProductBlock
              producto="DI"
              chartConsumo={<ConsumoMensualChart bloques={RAW.data.DI} producto="DI" chartHeight={CHART_H_FULL} />}
              chartConversion={<ConversionChart bloques={RAW.data.DI} producto="DI" chartHeight={CHART_H_FULL} />}
              chartTendencia={<TendenciaRazonesChart bloques={RAW.data.DI} producto="DI" tipoFallo="ambos" chartHeight={CHART_H_GRID} />}
              chartTabla={<RazonesTablaHeatmap bloques={RAW.data.DI} producto="DI" chartHeight={CHART_H_GRID} />}
              keyPrefix="di"
            />
          )}

          {/* BGC charts (sin header ni KPI) */}
          {RAW.data.BGC && (
            <ProductBlock
              producto="BGC"
              chartConsumo={<ConsumoMensualChart bloques={RAW.data.BGC} producto="BGC" chartHeight={CHART_H_FULL} />}
              chartConversion={<ConversionChart bloques={RAW.data.BGC} producto="BGC" chartHeight={CHART_H_FULL} />}
              chartTendencia={<TendenciaRazonesChart bloques={RAW.data.BGC} producto="BGC" tipoFallo="ambos" chartHeight={CHART_H_GRID} />}
              chartTabla={<RazonesTablaHeatmap bloques={RAW.data.BGC} producto="BGC" chartHeight={CHART_H_GRID} />}
              keyPrefix="bgc"
            />
          )}

          {/* Captura biométrica */}
          <BiometricCaptureSlide clientName={CLIENT} periodLabel={PERIOD_LABEL} />

          {/* Forms asistido vs Sin asistir */}
          <FormsAsistidoSlide clientName={CLIENT} periodLabel={PERIOD_LABEL} />
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
