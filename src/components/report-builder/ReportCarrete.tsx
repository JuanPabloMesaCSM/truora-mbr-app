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

import { useRef, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { Presentation, Download, Lightbulb, GripVertical } from "lucide-react";
import {
  SlideCanvas,
  PortadaSlide, AgendaSlide, SeparadorSlide,
  InsightsFinalesSlide, UpdatesSlide, CierreSlide,
  AnalisisEstrategicoSlide,
  type Theme, type CeFlowData,
} from "./SlideCanvas";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { ReconciliationPanel } from "./ReconciliationPanel";
import { MODULES, PRODUCT_COLORS, INSIGHT_TO_SLIDES, type Product, type ModuleInsight } from "./moduleDefinitions";
import { exportPDF, exportPPTX } from "@/utils/exportPDF";

const S = {
  bg:      '#0D1B2E',
  surface: '#172840',
  border:  'rgba(255,255,255,0.09)',
  text:    '#EEF0FF',
  muted:   '#8892B8',
  dim:     '#4A5580',
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
  insightsMode: 'ai' | 'manual' | null;
  moduleInsights: Record<string, ModuleInsight>;
  ceFlows: CeFlowData[];
  theme: Theme;
  reportData: any | null;
  overlayStatus: 'generating' | 'success' | 'error' | null;
  isCeFlowSpecific?: boolean;
  showUpdates?: boolean;
  onOverlayClose: () => void;
  onRetry: () => void;
  onViewPresentation: () => void;
  onNewReport: () => void;
  onModuleInsightChange?: (moduleId: string, text: string) => void;
  generalInsightText?: string;
  onGeneralInsightChange?: (text: string) => void;
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
  activeModuleIds, insightsMode, moduleInsights,
  ceFlows, theme, reportData,
  overlayStatus, isCeFlowSpecific, showUpdates = true, onOverlayClose, onRetry,
  onViewPresentation, onNewReport,
  onModuleInsightChange, generalInsightText, onGeneralInsightChange,
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

  const [exporting, setExporting] = useState<'pdf' | 'pptx' | null>(null);
  const [showRecon, setShowRecon] = useState(false);

  /* ── build dataSlideIds (same logic as CenterCanvas) ── */
  /* Cuando el CSM elige flujos específicos (no todos), omitir slides globales CE */
  const skipCeGlobal = product === 'CE' && (isCeFlowSpecific || meta.modo === 'flujos');

  /* Módulos CE que no son slides propios sino controles de los slides por flujo */
  const CE_FLOW_MODULES = new Set(['4_funnel_generico', '4b_funnel_steps', '4c_vrf', '4d_vrf_arbol']);

  const dataSlideIds: string[] = [];
  if (!skipCeGlobal) dataSlideIds.push(modules.base.id);
  for (const mod of modules.optional) {
    if (!activeModuleIds.includes(mod.id)) continue;
    if (skipCeGlobal && CE_GLOBAL_IDS.has(mod.id)) continue;
    if (CE_FLOW_MODULES.has(mod.id)) continue;
    dataSlideIds.push(mod.id);
  }
  if (product === 'CE' && ceFlowsData.length > 0) {
    const showOtb      = activeModuleIds.includes('4_funnel_generico');
    const showSteps    = activeModuleIds.includes('4b_funnel_steps');
    const showVrf      = activeModuleIds.includes('4c_vrf');
    const showVrfArbol = activeModuleIds.includes('4d_vrf_arbol');
    for (let i = 0; i < ceFlowsData.length; i++) {
      if (showOtb || showSteps || showVrf || showVrfArbol) dataSlideIds.push(`ce_sep_${i}`);
      if (showOtb)   dataSlideIds.push(`ce_otb_${i}`);
      if (showSteps) dataSlideIds.push(`ce_steps_${i}`);
      if (showVrf && ceFlowsData[i].tiene_vrf) dataSlideIds.push(`ce_vrf_${i}`);
      if (showVrfArbol && ceFlowsData[i].tiene_vrf) dataSlideIds.push(`ce_vrfarbol_${i}`);
    }
  }

  const hasInsights = insightsMode !== null;
  const totalSlides = 3 + dataSlideIds.length + (hasInsights ? 2 : 0) + (showUpdates ? 2 : 0) + 1;

  /* ── per-metric insight helper (insights_por_metrica from response) ── */
  const insightsPorMetrica: Record<string, string> = hasData ? (reportData.insights_por_metrica ?? {}) : {};
  const getMetricInsight = (slideId: string): string | null => {
    for (const [metrica, texto] of Object.entries(insightsPorMetrica)) {
      const slides = INSIGHT_TO_SLIDES[metrica] ?? [];
      if (slides.includes(slideId)) return texto as string;
    }
    return null;
  };

  /* ── insight helper ── */
  const getSlideInsight = (id: string) => {
    const mi = moduleInsights[id];

    if (mi && mi.mode === 'manual') {
      return {
        insightText: mi.text || '',
        insightSource: 'manual' as const,
        insightEditable: hasData,
        onInsightChange: onModuleInsightChange ? (text: string) => onModuleInsightChange(id, text) : undefined,
      };
    }

    // AI: explicit per-slide data first, then fallback to insights_por_metrica
    // Applies when: module has mode=ai explicitly, OR global insightsMode=ai with no override
    if ((mi && mi.mode === 'ai') || (!(mi && mi.mode) && insightsMode === 'ai')) {
      const rows = data['insight_' + id];
      const explicitText = rows && rows[0] && rows[0].col1 ? rows[0].col1 : undefined;
      if (explicitText) return { insightText: explicitText, insightSource: 'ai' as const };

      const metricText = getMetricInsight(id);
      if (metricText) return { insightText: metricText, insightSource: 'ai' as const };
    }

    return {};
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
    exportPDF(effectiveClient, effectivePeriod, () => setExporting('pdf'), () => setExporting(null));
  };
  const handleExportPPTX = () => {
    exportPPTX(effectiveClient, effectivePeriod, () => setExporting('pptx'), () => setExporting(null));
  };

  /* ── Build ordered slide entries ── */
  type SlideEntry = { key: string; label: string; render: (num: number) => React.ReactNode };

  const slideEntries = useMemo<SlideEntry[]>(() => {
    const entries: SlideEntry[] = [];

    // Portada
    entries.push({
      key: '__portada',
      label: 'Portada',
      render: () => <PortadaSlide clientName={effectiveClient || '—'} periodLabel={effectivePeriod || '—'} />,
    });
    // Agenda
    entries.push({
      key: '__agenda',
      label: 'Agenda',
      render: () => <AgendaSlide />,
    });
    // Separador métricas
    entries.push({
      key: '__sep_metricas',
      label: 'Separador — Métricas del mes',
      render: () => <SeparadorSlide src="/assets/mbr/separados-metricas.png" alt="Métricas del mes" />,
    });

    // Data slides
    dataSlideIds.forEach((slideId, idx) => {
      const mod = [modules.base, ...modules.optional].find(m => m.id === slideId);
      const isCeSep = slideId.startsWith('ce_sep_');
      const isCeData = slideId.startsWith('ce_otb_') || slideId.startsWith('ce_steps_') || slideId.startsWith('ce_vrf_') || slideId.startsWith('ce_vrfarbol_');
      const label = mod
        ? mod.label
        : isCeSep
          ? 'Separador de flujo'
          : isCeData
            ? slideId.startsWith('ce_otb_') ? 'Funnel OTB' : slideId.startsWith('ce_steps_') ? 'Funnel Steps' : slideId.startsWith('ce_vrfarbol_') ? 'VRF Árbol' : 'VRF'
            : slideId;

      entries.push({
        key: slideId,
        label,
        render: (num: number) => {
          const insight = getSlideInsight(slideId);
          return (
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
          );
        },
      });
    });

    // Insights
    if (hasInsights) {
      entries.push({
        key: '__sep_insights',
        label: 'Separador — Análisis estratégico',
        render: () => <SeparadorSlide src="/assets/mbr/separados-insights.png" alt="Análisis estratégico" />,
      });
      entries.push({
        key: '__insights_finales',
        label: insightsMode === 'ai' ? 'Insights Truora AI' : 'Análisis estratégico',
        render: (num: number) => (
          <DataSlide hasData={hasData} revealDelay={dataSlideIds.length * 120 + 120} shimmerLabel={insightsMode === 'ai' ? 'Insights AI' : 'Análisis manual'}>
            <InsightsFinalesSlide
              insightsAi={insightsMode === 'ai'}
              insightText={insightsMode === 'ai' ? (data['insights_generales']?.[0]?.col1 || '') : (generalInsightText || '')}
              onInsightChange={onGeneralInsightChange}
              theme={theme}
              pageNum={num}
            />
          </DataSlide>
        ),
      });
      if (analisisEstrategico) {
        entries.push({
          key: '__analisis_estrategico',
          label: 'Análisis Estratégico IA',
          render: (num: number) => (
            <DataSlide hasData={hasData} revealDelay={dataSlideIds.length * 120 + 240} shimmerLabel="Análisis IA">
              <AnalisisEstrategicoSlide
                analisis={analisisEstrategico}
                theme={theme}
                clientName={effectiveClient}
                periodLabel={effectivePeriod}
                pageNum={num}
                totalPages={totalSlides}
              />
            </DataSlide>
          ),
        });
      }
    }

    // Updates (optional)
    if (showUpdates) {
      entries.push({
        key: '__sep_updates',
        label: 'Separador — Updates de producto',
        render: () => <SeparadorSlide src="/assets/mbr/separador-updates.png" alt="Updates de producto" />,
      });
      entries.push({
        key: '__updates',
        label: 'Updates',
        render: () => <UpdatesSlide />,
      });
    }

    // Cierre
    entries.push({
      key: '__cierre',
      label: 'Cierre',
      render: () => <CierreSlide csmName={effectiveCsm} />,
    });

    return entries;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataSlideIds.join(','), product, hasData, hasInsights, insightsMode, showUpdates,
    effectiveClient, effectivePeriod, effectiveCsm, theme, totalSlides,
    generalInsightText, !!analisisEstrategico,
  ]);

  /* ── Reorderable keys ── */
  const [slideOrder, setSlideOrder] = useState<string[]>(() => slideEntries.map(e => e.key));

  // Sync order when entries change (module toggled, insights toggled, etc.)
  useEffect(() => {
    const newKeys = slideEntries.map(e => e.key);
    setSlideOrder(prev => {
      // Keep existing order for slides that still exist, append new ones at the end
      const kept = prev.filter(k => newKeys.includes(k));
      const added = newKeys.filter(k => !kept.includes(k));
      // If nothing changed structurally, keep current order
      if (kept.length === newKeys.length && added.length === 0) return prev;
      return [...kept, ...added];
    });
  }, [slideEntries]);

  const orderedEntries = slideOrder
    .map(key => slideEntries.find(e => e.key === key))
    .filter((e): e is SlideEntry => !!e);

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
                disabled={!!exporting}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 12, color: S.muted,
                  background: 'transparent',
                  border: `1px solid ${S.border}`, cursor: 'pointer',
                  padding: '6px 12px', borderRadius: 8,
                  transition: 'all 0.15s',
                  opacity: exporting ? 0.6 : 1,
                }}
                onMouseEnter={e => e.currentTarget.style.color = S.text}
                onMouseLeave={e => e.currentTarget.style.color = S.muted}
              >
                <Download size={13} />
                {exporting === 'pdf' ? 'Exportando...' : 'PDF'}
              </button>

              <button
                onClick={handleExportPPTX}
                disabled={!!exporting}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 12, color: S.muted,
                  background: 'transparent',
                  border: `1px solid ${S.border}`, cursor: 'pointer',
                  padding: '6px 12px', borderRadius: 8,
                  transition: 'all 0.15s',
                  opacity: exporting ? 0.6 : 1,
                }}
                onMouseEnter={e => e.currentTarget.style.color = S.text}
                onMouseLeave={e => e.currentTarget.style.color = S.muted}
              >
                <Presentation size={13} />
                {exporting === 'pptx' ? 'Exportando...' : 'PPTX'}
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

      {/* ── Slides scroll (reorderable) ── */}
      <Reorder.Group
        id="canvas-mbr-slides"
        axis="y"
        values={slideOrder}
        onReorder={setSlideOrder}
        style={{
          flex: 1, overflowY: 'auto',
          padding: '28px 32px',
          display: 'flex', flexDirection: 'column', gap: 24,
          listStyle: 'none', margin: 0,
        }}
      >
        {orderedEntries.map((entry, idx) => (
          <Reorder.Item
            key={entry.key}
            value={entry.key}
            style={{ listStyle: 'none' }}
            whileDrag={{ scale: 1.02, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 50, borderRadius: 12 }}
          >
            <div style={{ width: '100%', maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
              {/* Slide metadata + drag handle */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 8,
              }}>
                <div
                  style={{ cursor: 'grab', display: 'flex', alignItems: 'center', color: S.dim, flexShrink: 0 }}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <GripVertical size={14} />
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: S.dim,
                  background: S.surface, border: `1px solid ${S.border}`,
                  padding: '2px 7px', borderRadius: 6,
                }}>
                  {idx + 1}
                </span>
                <span style={{ fontSize: 11, color: S.muted }}>{entry.label}</span>
              </div>
              <ScaledSlide>
                {entry.render(idx + 1)}
              </ScaledSlide>
            </div>
          </Reorder.Item>
        ))}

        {/* Bottom padding */}
        <div style={{ height: 40 }} />
      </Reorder.Group>

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
