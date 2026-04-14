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
import { Presentation, Download, RefreshCw } from "lucide-react";
import {
  SlideCanvas,
  PortadaSlide, AgendaSlide, SeparadorSlide,
  InsightsFinalesSlide, UpdatesSlide, CierreSlide,
  type Theme, type CeFlowData,
} from "./SlideCanvas";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { MODULES, PRODUCT_COLORS, type Product, type ModuleInsight } from "./moduleDefinitions";
import { exportPDF } from "@/utils/exportPDF";

const S = {
  bg:      '#080C1F',
  surface: '#0F1428',
  border:  'rgba(255,255,255,0.07)',
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
      background: '#0D1235',
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
        background: 'linear-gradient(90deg, #161C38 25%, #222A50 50%, #161C38 75%)',
        backgroundSize: '600px 100%',
        animation: 'shimmerSlide 1.8s linear infinite',
      }} />
      <div style={{
        height: 13, width: '30%', borderRadius: 4, marginBottom: 24,
        background: 'linear-gradient(90deg, #161C38 25%, #222A50 50%, #161C38 75%)',
        backgroundSize: '600px 100%',
        animation: 'shimmerSlide 1.8s linear infinite 0.1s',
      }} />
      {/* Body shimmer */}
      <div style={{
        flex: 1, borderRadius: 10,
        background: 'linear-gradient(90deg, #141830 25%, #1E2548 50%, #141830 75%)',
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
  onOverlayClose: () => void;
  onRetry: () => void;
  onViewPresentation: () => void;
  onNewReport: () => void;
}

/* ────────────────────────────────────────────────────────
   ReportCarrete principal
──────────────────────────────────────────────────────── */
export function ReportCarrete({
  product, clientName, periodLabel, csmName,
  activeModuleIds, insightsAi, moduleInsights,
  ceFlows, theme, reportData,
  overlayStatus, onOverlayClose, onRetry,
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

  /* ── build dataSlideIds (same logic as CenterCanvas) ── */
  const dataSlideIds: string[] = [modules.base.id];
  for (const mod of modules.optional) {
    if (activeModuleIds.includes(mod.id)) dataSlideIds.push(mod.id);
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
        background: 'rgba(8,12,31,0.8)', backdropFilter: 'blur(12px)',
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

            return (
              <CarreteItem key={slideId} num={num} label={label} animate={!hasData} animDelay={idx * 0.05}>
                <ScaledSlide>
                  <DataSlide hasData={hasData} revealDelay={idx * 120} shimmerLabel={label}>
                    <SlideCanvas
                      slideId={slideId}
                      product={product}
                      data={data}
                      ceFlows={ceFlowsData}
                      theme={theme}
                      clientName={effectiveClient}
                      periodLabel={effectivePeriod}
                      pageNum={num}
                      totalPages={totalSlides}
                      {...insight}
                    />
                  </DataSlide>
                </ScaledSlide>
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
            onClose={onOverlayClose}
            onRetry={onRetry}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
