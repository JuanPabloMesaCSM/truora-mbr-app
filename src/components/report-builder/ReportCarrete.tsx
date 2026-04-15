/* ─────────────────────────────────────────────────────────
   ReportCarrete — Paso 3: panel derecho del constructor

   • Muestra los slides en escala reducida conforme el CSM
     activa módulos (aparecen con animación spring desde abajo)
   • Slides fijos (Portada, Agenda, Cierre…) se renderizan
     en tiempo real con los datos disponibles
   • Slides de datos muestran shimmer hasta que llega el
     reportData; cuando llega cada slide hace una animación
     de reveal (fade + subida) con stagger de 120ms
   • GeneratingOverlay se muestra encima del carrete
───────────────────────────────────────────────────────── */

import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Presentation, Download, Lightbulb } from "lucide-react";
import {
  SlideCanvas,
  PortadaSlide, AgendaSlide, SeparadorSlide,
  InsightsFinalesSlide, UpdatesSlide, CierreSlide,
  AnalisisEstrategicoSlide,
  type Theme, type CeFlowData,
} from "./SlideCanvas";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { ReconciliationPanel } from "./ReconciliationPanel";
import { MODULES, PRODUCT_COLORS, type Product, type ModuleInsight } from "./moduleDefinitions";
import { exportPDF } from "@/utils/exportPDF";

const S = {
  bg:      '#0D1B2E',
  surface: '#172840',
  border:  'rgba(255,255,255,0.09)',
  text:    '#EEF0FF',
  muted:   '#8892B8',
  dim:     '#4A5580',
};

/* ── Mapping: metric key → slide IDs que reciben ese insight ── */
const INSIGHT_TO_SLIDES: Record<string, string[]> = {
  volumen:                    ['1_metricas_generales', '1_resumen_general', '1_consumo_total'],
  conversion_global:          ['1_metricas_generales'],
  conversion_promedio_flujos: ['1_metricas_generales', '5_flujos'],
  reintentos:                 ['2_usuarios_reintentos'],
  declinados:                 ['10_declinados'],
  rechazados:                 ['7_razones_doc', '8_razones_rostro'],
  distribucion_labels:        ['5_labels'],
  custom_types:               ['3_por_tipo'],
  eficiencia_campanas:        ['2_eficiencia_campanas'],
  fallos_outbound:            ['3_fallos_outbound'],
  inbound:                    ['5_flujo_inbound'],
  agentes:                    ['6_agentes_general'],
  consumo_total:              ['1_consumo_total'],
};

/* ────────────────────────────────────────────────────────
   ScaledSlide — contenedor con ResizeObserver para escalar
   automáticamente el slide de 1280×720 al ancho disponible
──────────────────────────────────────────────────────── */
function ScaledSlide({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setScale(w / 1280);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const height = Math.round(720 * scale);

  return (
    <div ref={containerRef} style={{
      width: '100%', height, position: 'relative',
      overflow: 'hidden', borderRadius: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
    }}>
      <div style={{
        width: 1280, height: 720,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        position: 'absolute', top: 0, left: 0,
      }}>
        {children}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   ShimmerSlide — placeholder animado para slides sin datos
──────────────────────────────────────────────────────── */
function ShimmerSlide() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#111E30',
      display: 'flex', flexDirection: 'column',
      padding: '28px 32px',
    }}>
      <style>{`
        @keyframes shimmerSlide {
          0%   { background-position: -600px 0; }
          100% { background-position: 600px 0; }
        }
      `}</style>
      {/* Header shimmer */}
      <div style={{
        height: 20, width: '50%', borderRadius: 5, marginBottom: 8,
        background: 'linear-gradient(90deg, #1C2D42 25%, #253C60 50%, #1C2D42 75%)',
        backgroundSize: '600px 100%',
        animation: 'shimmerSlide 1.8s linear infinite',
      }} />
      <div style={{
        height: 13, width: '30%', borderRadius: 4, marginBottom: 24,
        background: 'linear-gradient(90deg, #1C2D42 25%, #253C60 50%, #1C2D42 75%)',
        backgroundSize: '600px 100%',
        animation: 'shimmerSlide 1.8s linear infinite 0.1s',
      }} />
      {/* Body shimmer */}
      <div style={{
        flex: 1, borderRadius: 10,
        background: 'linear-gradient(90deg, #172840 25%, #1D3050 50%, #172840 75%)',
        backgroundSize: '600px 100%',
        animation: 'shimmerSlide 2s linear infinite 0.2s',
      }} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   CarreteItem — envuelve un slide con label + número
──────────────────────────────────────────────────────── */
function CarreteItem({
  num, label, children, animate: doAnimate = false, animDelay = 0,
}: {
  num: number;
  label: string;
  children: React.ReactNode;
  animate?: boolean;
  animDelay?: number;
}) {
  return (
    <motion.div
      initial={doAnimate ? { opacity: 0, y: 20 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, scale: 0.97 }}
      transition={{ duration: 0.4, delay: animDelay, ease: [0.34, 1.56, 0.64, 1] }}
      style={{ width: '100%', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}
    >
      {/* Slide metadata */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        marginBottom: 8,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: S.dim,
          background: S.surface, border: `1px solid ${S.border}`,
          padding: '2px 7px', borderRadius: 6,
        }}>
          {num}
        </span>
        <span style={{ fontSize: 11, color: S.muted }}>{label}</span>
      </div>

      <ScaledSlide>{children}</ScaledSlide>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────
   DataSlide — shimmer antes de datos, reveal animado después
──────────────────────────────────────────────────────── */
function DataSlide({
  hasData, revealDelay, shimmerLabel, children,
}: {
  hasData: boolean;
  revealDelay: number;
  shimmerLabel: string;
  children: React.ReactNode;
}) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (hasData && !revealed) {
      const t = setTimeout(() => setRevealed(true), revealDelay);
      return () => clearTimeout(t);
    }
  }, [hasData, revealed, revealDelay]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <AnimatePresence mode="wait">
        {!revealed ? (
          <motion.div
            key="shimmer"
            style={{ position: 'absolute', inset: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.25 }}
          >
            <ShimmerSlide />
          </motion.div>
        ) : (
          <motion.div
            key="real"
            style={{ position: 'absolute', inset: 0 }}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   MetricInsightPanel — toggleable insight under a slide
──────────────────────────────────────────────────────── */
function MetricInsightPanel({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 600,
          color: open ? '#C4B3FF' : S.dim,
          background: open ? 'rgba(124,77,255,0.12)' : 'transparent',
          border: `1px solid ${open ? 'rgba(124,77,255,0.3)' : S.border}`,
          borderRadius: 8, padding: '5px 10px',
          cursor: 'pointer', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.color = S.muted; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.color = S.dim; }}
      >
        <Lightbulb size={12} />
        {open ? 'Ocultar insight' : '💡 Ver insight IA'}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              marginTop: 6, padding: '12px 14px', borderRadius: 10,
              background: 'rgba(124,77,255,0.08)',
              border: '1px solid rgba(124,77,255,0.22)',
              fontSize: 12, color: '#C4B3FF', lineHeight: 1.6,
            }}>
              ✦ {text}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   Props del carrete
──────────────────────────────────────────────────────── */
interface ReportCarreteProps {
  product: Product;
  clientName: string;
  periodLabel: string;
  csmName: string;
  activeModuleIds: string[];
  insightsAi: boolean;
  moduleInsights: Record<string, ModuleInsight>;
  ceFlows: CeFlowData[];
  theme: Theme;
  reportData: any | null;
  overlayStatus: 'generating' | 'success' | 'error' | null;
  isCeFlowSpecific?: boolean;
  onOverlayClose: () => void;
  onRetry: () => void;
  onViewPresentation: () => void;
  onNewReport: () => void;
}

/* ────────────────────────────────────────────────────────
   ReportCarrete principal
──────────────────────────────────────────────────────── */
/* IDs de slides CE que muestran métricas globales de cuenta */
const CE_GLOBAL_IDS = new Set([
  '1_consumo_total', '2_eficiencia_campanas', '3_fallos_outbound',
  '5_flujo_inbound', '6_agentes_general', '7_agentes_top5',
]);

export function ReportCarrete({
  product, clientName, periodLabel, csmName,
  activeModuleIds, insightsAi, moduleInsights,
  ceFlows, theme, reportData,
  overlayStatus, isCeFlowSpecific, onOverlayClose, onRetry,
  onViewPresentation, onNewReport,
}: ReportCarreteProps) {
  const color   = PRODUCT_COLORS[product];
  const modules = MODULES[product];
  const hasData = reportData?.status === 'success';
  const data    = hasData ? (reportData.data ?? {}) : {};
  const ceFlowsData: CeFlowData[] = hasData ? (reportData.ceFlows ?? []) : ceFlows;
  const meta    = hasData ? (reportData.meta ?? {}) : {};
  const effectiveClient = meta.cliente || clientName;
  const effectivePeriod = meta.periodo_reporte || periodLabel;
  const effectiveCsm    = meta.nombre_csm || csmName;

  const [exportingPdf, setExportingPdf] = useState(false);
  const [showRecon, setShowRecon] = useState(false);

  /* ── build dataSlideIds (same logic as CenterCanvas) ── */
  /* Cuando el CSM elige flujos específicos (no todos), omitir slides globales CE */
  const skipCeGlobal = product === 'CE' && (isCeFlowSpecific || meta.modo === 'flujos');

  const dataSlideIds: string[] = [];
  if (!skipCeGlobal) dataSlideIds.push(modules.base.id);
  for (const mod of modules.optional) {
    if (!activeModuleIds.includes(mod.id)) continue;
    if (skipCeGlobal && CE_GLOBAL_IDS.has(mod.id)) continue;
    dataSlideIds.push(mod.id);
  }
  if (product === 'CE' && ceFlowsData.length > 0) {
    for (let i = 0; i < ceFlowsData.length; i++) {
      dataSlideIds.push(`ce_sep_${i}`);
      dataSlideIds.push(`ce_otb_${i}`);
      dataSlideIds.push(`ce_steps_${i}`);
      if (ceFlowsData[i].tiene_vrf) dataSlideIds.push(`ce_vrf_${i}`);
    }
  }

  const totalSlides = 3 + dataSlideIds.length + (insightsAi ? 2 : 0) + 3;

  /* ── insight helper ── */
  const getSlideInsight = (id: string) => {
    const mi = moduleInsights[id];
    if (!mi || !mi.mode) return {};
    if (mi.mode === 'manual' && mi.text) return { insightText: mi.text, insightSource: 'manual' as const };
    if (mi.mode === 'ai') {
      const rows = data['insight_' + id];
      const text = rows && rows[0] && rows[0].col1 ? rows[0].col1 : undefined;
      if (text) return { insightText: text, insightSource: 'ai' as const };
    }
    return {};
  };

  /* ── per-metric insight helper (insights_por_metrica from response) ── */
  const insightsPorMetrica: Record<string, string> = hasData ? (reportData.insights_por_metrica ?? {}) : {};
  const getMetricInsight = (slideId: string): string | null => {
    for (const [metrica, texto] of Object.entries(insightsPorMetrica)) {
      const slides = INSIGHT_TO_SLIDES[metrica] ?? [];
      if (slides.includes(slideId)) return texto as string;
    }
    return null;
  };

  /* ── reconciliation ── */
  const reconciliacion = hasData ? reportData.reconciliacion : null;
  const analisisEstrategico = hasData ? reportData.analisis_estrategico : null;

  /* Intercept overlay close to show recon panel if needed */
  const handleOverlayClose = () => {
    if (overlayStatus === 'success' && reconciliacion?.tiene_alertas) {
      setShowRecon(true);
    }
    onOverlayClose();
  };

  const handleExportPDF = () => {
    exportPDF(effectiveClient, effectivePeriod, () => setExportingPdf(true), () => setExportingPdf(false));
  };

  /* ── slide number counter ── */
  let slideNum = 0;
  const nextNum = () => { slideNum++; return slideNum; };

  return (
    <div style={{
      flex: 1, minWidth: 0, height: '100vh',
      display: 'flex', flexDirection: 'column',
      background: S.bg, position: 'relative',
    }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', flexShrink: 0,
        borderBottom: `0.5px solid ${S.border}`,
        background: 'rgba(13,27,46,0.85)', backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: S.text }}>
            {effectiveClient || '—'}
          </span>
          {effectivePeriod && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 12,
              background: `${color}20`, color: color, border: `1px solid ${color}35`,
            }}>
              {effectivePeriod}
            </span>
          )}
          <span style={{ fontSize: 11, color: S.dim }}>{totalSlides} slides</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {hasData && (
            <>
              <button
                onClick={onViewPresentation}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600, color: '#fff',
                  background: color, border: 'none', cursor: 'pointer',
                  padding: '6px 13px', borderRadius: 8,
                  boxShadow: `0 2px 12px ${color}35`,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <Presentation size={13} />
                Presentación completa
              </button>

              <button
                onClick={handleExportPDF}
                disabled={exportingPdf}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 12, color: S.muted,
                  background: 'transparent',
                  border: `1px solid ${S.border}`, cursor: 'pointer',
                  padding: '6px 12px', borderRadius: 8,
                  transition: 'all 0.15s',
                  opacity: exportingPdf ? 0.6 : 1,
                }}
                onMouseEnter={e => e.currentTarget.style.color = S.text}
                onMouseLeave={e => e.currentTarget.style.color = S.muted}
              >
                <Download size={13} />
                {exportingPdf ? 'Exportando...' : 'PDF'}
              </button>
            </>
          )}

          <button
            onClick={onNewReport}
            style={{
              fontSize: 12, color: S.dim,
              background: 'transparent', border: 'none',
              cursor: 'pointer', padding: '6px 10px', borderRadius: 8,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = S.muted}
            onMouseLeave={e => e.currentTarget.style.color = S.dim}
          >
            ← Nuevo
          </button>
        </div>
      </div>

      {/* ── Slides scroll ── */}
      <div
        id="canvas-mbr-slides"
        style={{
          flex: 1, overflowY: 'auto',
          padding: '28px 32px',
          display: 'flex', flexDirection: 'column', gap: 24,
        }}
      >
        {/* 1 — Portada (siempre real) */}
        <CarreteItem num={nextNum()} label="Portada">
          <PortadaSlide clientName={effectiveClient || '—'} periodLabel={effectivePeriod || '—'} />
        </CarreteItem>

        {/* 2 — Agenda */}
        <CarreteItem num={nextNum()} label="Agenda">
          <AgendaSlide />
        </CarreteItem>

        {/* 3 — Separador métricas */}
        <CarreteItem num={nextNum()} label="Separador — Métricas del mes">
          <SeparadorSlide src="/assets/mbr/separados-metricas.png" alt="Métricas del mes" />
        </CarreteItem>

        {/* Data slides */}
        <AnimatePresence mode="popLayout">
          {dataSlideIds.map((slideId, idx) => {
            const mod = [modules.base, ...modules.optional].find(m => m.id === slideId);
            const isCeSep = slideId.startsWith('ce_sep_');
            const isCeData = slideId.startsWith('ce_otb_') || slideId.startsWith('ce_steps_') || slideId.startsWith('ce_vrf_');
            const label = mod
              ? mod.label
              : isCeSep
                ? 'Separador de flujo'
                : isCeData
                  ? slideId.startsWith('ce_otb_') ? 'Funnel OTB' : slideId.startsWith('ce_steps_') ? 'Funnel Steps' : 'VRF'
                  : slideId;
            const num = nextNum();
            const insight = getSlideInsight(slideId);
            const metricInsightText = hasData ? getMetricInsight(slideId) : null;

            return (
              <CarreteItem key={slideId} num={num} label={label} animate={!hasData} animDelay={idx * 0.05}>
                <ScaledSlide>
                  <DataSlide hasData={hasData} revealDelay={idx * 120} shimmerLabel={label}>
                    <SlideCanvas
                      slideId={slideId}
                      product={product}
                      data={data}
                      ceFlows={ceFlowsData}
                      meta={meta}
                      theme={theme}
                      clientName={effectiveClient}
                      periodLabel={effectivePeriod}
                      pageNum={num}
                      totalPages={totalSlides}
                      {...insight}
                    />
                  </DataSlide>
                </ScaledSlide>
                {/* Per-metric insight toggle */}
                {metricInsightText && insightsAi && (
                  <MetricInsightPanel text={metricInsightText} />
                )}
              </CarreteItem>
            );
          })}
        </AnimatePresence>

        {/* Separador + Insights AI */}
        {insightsAi && (
          <>
            <CarreteItem num={nextNum()} label="Separador — Análisis estratégico">
              <SeparadorSlide src="/assets/mbr/separados-insights.png" alt="Análisis estratégico" />
            </CarreteItem>
            <CarreteItem num={nextNum()} label="Insights Truora AI">
              <DataSlide hasData={hasData} revealDelay={dataSlideIds.length * 120 + 120} shimmerLabel="Insights AI">
                <InsightsFinalesSlide
                  insightsAi={insightsAi}
                  insightText={data['insights_generales']?.[0]?.col1 || ''}
                  onInsightChange={() => {}}
                />
              </DataSlide>
            </CarreteItem>

            {/* Análisis Estratégico IA */}
            {analisisEstrategico && (
              <CarreteItem num={nextNum()} label="Análisis Estratégico IA">
                <DataSlide hasData={hasData} revealDelay={dataSlideIds.length * 120 + 240} shimmerLabel="Análisis IA">
                  <AnalisisEstrategicoSlide
                    analisis={analisisEstrategico}
                    theme={theme}
                    clientName={effectiveClient}
                    periodLabel={effectivePeriod}
                    pageNum={slideNum}
                    totalPages={totalSlides}
                  />
                </DataSlide>
              </CarreteItem>
            )}
          </>
        )}

        {/* Separador updates */}
        <CarreteItem num={nextNum()} label="Separador — Updates de producto">
          <SeparadorSlide src="/assets/mbr/separador-updates.png" alt="Updates de producto" />
        </CarreteItem>

        {/* Updates */}
        <CarreteItem num={nextNum()} label="Updates">
          <UpdatesSlide />
        </CarreteItem>

        {/* Cierre (siempre real — usa csmName) */}
        <CarreteItem num={nextNum()} label="Cierre">
          <CierreSlide csmName={effectiveCsm} />
        </CarreteItem>

        {/* Bottom padding */}
        <div style={{ height: 40 }} />
      </div>

      {/* ── Overlay de generación ── */}
      <AnimatePresence>
        {overlayStatus && (
          <GeneratingOverlay
            status={overlayStatus}
            onClose={handleOverlayClose}
            onRetry={onRetry}
          />
        )}
      </AnimatePresence>

      {/* ── Panel de reconciliación ── */}
      <AnimatePresence>
        {showRecon && reconciliacion && (
          <ReconciliationPanel
            reconciliacion={reconciliacion}
            clientName={effectiveClient}
            periodLabel={effectivePeriod}
            onContinue={() => setShowRecon(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
