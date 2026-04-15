import { motion, AnimatePresence } from "framer-motion";
import { MODULES, PRODUCT_COLORS, type Product, type ModuleDef, type ModuleInsight } from "./moduleDefinitions";
import { AnimatedCanvasChart } from "./AnimatedChartPreview";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { SlideCanvas, type Theme, type CeFlowData, PortadaSlide, AgendaSlide, SeparadorSlide, InsightsFinalesSlide, UpdatesSlide, CierreSlide } from "./SlideCanvas";
import { exportPDF } from "@/utils/exportPDF";

/* IDs de slides CE que muestran métricas globales de cuenta */
const CE_GLOBAL_IDS = new Set([
  '1_consumo_total', '2_eficiencia_campanas', '3_fallos_outbound',
  '5_flujo_inbound', '6_agentes_general', '7_agentes_top5',
]);

interface CenterCanvasProps {
  product: Product;
  clientName: string | null;
  periodLabel: string;
  activeModuleIds: string[];
  insightsMode: 'ai' | 'manual' | null;
  moduleInsights?: Record<string, ModuleInsight>;
  overlayStatus: "generating" | "success" | "error" | null;
  reportData?: any;
  theme: Theme;
  isCeFlowSpecific?: boolean;
  onOverlayClose: () => void;
  onNewReport: () => void;
  onRetry: () => void;
  onBack?: () => void;
  onModuleInsightChange?: (moduleId: string, text: string) => void;
  generalInsightText?: string;
  onGeneralInsightChange?: (text: string) => void;
}

const cardTransitionEnter = { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] as const };
const cardTransitionExit = { duration: 0.25, ease: "easeIn" as const };

export function CenterCanvas({
  product, clientName, periodLabel, activeModuleIds, insightsMode,
  moduleInsights = {}, overlayStatus, reportData, theme, isCeFlowSpecific, onOverlayClose, onNewReport, onRetry, onBack,
  onModuleInsightChange, generalInsightText, onGeneralInsightChange,
}: CenterCanvasProps) {
  const getSlideInsight = (id: string) => {
    const mi = moduleInsights[id];
    if (!mi || !mi.mode) return {};
    if (mi.mode === 'manual') {
      return {
        insightText: mi.text || '',
        insightSource: 'manual' as const,
        insightEditable: true,
        onInsightChange: onModuleInsightChange ? (text: string) => onModuleInsightChange(id, text) : undefined,
      };
    }
    if (mi.mode === 'ai') {
      const rows = reportData && reportData.data ? reportData.data['insight_' + id] : undefined;
      const text = rows && rows[0] && rows[0].col1 ? rows[0].col1 : undefined;
      if (text) return { insightText: text, insightSource: 'ai' };
    }
    return {};
  };
  const color = PRODUCT_COLORS[product];
  const modules = MODULES[product];

  if (reportData?.status === 'success') {
    const data = reportData.data ?? {};
    const ceFlows: CeFlowData[] = reportData.ceFlows ?? [];
    const meta = reportData.meta ?? {};
    const csmName: string = meta.nombre_csm || '';

    // Build data slide IDs
    // Cuando el CSM elige flujos específicos (no todos), omitir slides globales CE
    const skipCeGlobal = product === 'CE' && (isCeFlowSpecific || meta.modo === 'flujos');

    /* Módulos CE que no son slides propios sino controles de los slides por flujo */
    const CE_FLOW_MODULES = new Set(['4_funnel_generico', '4b_funnel_steps']);

    const dataSlideIds: string[] = [];
    if (!skipCeGlobal) dataSlideIds.push(modules.base.id);
    for (const mod of modules.optional) {
      if (!activeModuleIds.includes(mod.id)) continue;
      if (skipCeGlobal && CE_GLOBAL_IDS.has(mod.id)) continue;
      if (CE_FLOW_MODULES.has(mod.id)) continue; // no tienen renderer propio
      dataSlideIds.push(mod.id);
    }
    if (product === 'CE' && ceFlows.length > 0) {
      const showOtb   = activeModuleIds.includes('4_funnel_generico');
      const showSteps = activeModuleIds.includes('4b_funnel_steps');
      for (let i = 0; i < ceFlows.length; i++) {
        if (showOtb || showSteps) dataSlideIds.push(`ce_sep_${i}`);
        if (showOtb)   dataSlideIds.push(`ce_otb_${i}`);
        if (showSteps) dataSlideIds.push(`ce_steps_${i}`);
        if (ceFlows[i].tiene_vrf) dataSlideIds.push(`ce_vrf_${i}`);
      }
    }

    // portada + agenda + sep-metricas + data + (sep-insights + insights si AI) + sep-updates + updates + cierre
    const hasInsights = insightsMode !== null;
    const totalPages = 3 + dataSlideIds.length + (hasInsights ? 2 : 0) + 3;

    const SlideWrap = ({ children }: { children: React.ReactNode }) => (
      <div className="rounded-xl overflow-hidden shadow-2xl" style={{ width: 1280, height: 720, flexShrink: 0 }}>
        {children}
      </div>
    );

    return (
      <div className="flex-1 min-w-0 h-screen flex flex-col overflow-hidden" style={{ background: '#0B0F2E' }}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <span className="text-white font-semibold text-sm">{meta.cliente || clientName}</span>
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: color }}>
              {meta.periodo_reporte || periodLabel}
            </span>
            <span className="text-white/30 text-xs">{totalPages} slides</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportPDF(meta.cliente || clientName || 'Cliente', meta.periodo_reporte || periodLabel || 'Reporte')}
              className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/90 transition-colors px-3 py-1.5 rounded-lg"
              style={{ border: '0.5px solid rgba(255,255,255,0.1)' }}
            >
              ↓ Exportar PDF
            </button>
            {onBack && (
              <button onClick={onBack} className="text-xs text-white/30 hover:text-white/60 transition-colors px-3 py-1.5">
                ← Volver al constructor
              </button>
            )}
            <button onClick={onNewReport} className="text-xs text-white/30 hover:text-white/60 transition-colors px-3 py-1.5">
              ← Nuevo reporte
            </button>
          </div>
        </div>

        {/* Scroll area — overflow-auto para slides de 1280px */}
        <div className="flex-1 overflow-auto p-6">
          <div id="canvas-mbr-slides" className="flex flex-col items-center gap-6">

            {/* Portada */}
            <SlideWrap><PortadaSlide clientName={meta.cliente || clientName || ''} periodLabel={meta.periodo_reporte || periodLabel} /></SlideWrap>
            {/* Agenda */}
            <SlideWrap><AgendaSlide /></SlideWrap>
            {/* Separador métricas */}
            <SlideWrap><SeparadorSlide src="/assets/mbr/separados-metricas.png" alt="Métricas del mes" /></SlideWrap>

            {/* Data slides */}
            {dataSlideIds.map((slideId, idx) => {
              const insight = getSlideInsight(slideId);
              return (
                <SlideWrap key={slideId}>
                  <SlideCanvas
                    slideId={slideId}
                    product={product}
                    data={data}
                    ceFlows={ceFlows}
                    theme={theme}
                    clientName={meta.cliente || clientName || ''}
                    periodLabel={meta.periodo_reporte || periodLabel}
                    pageNum={4 + idx}
                    totalPages={totalPages}
                    {...insight}
                  />
                </SlideWrap>
              );
            })}

            {/* Separador + Insights IA */}
            {hasInsights && (
              <>
                <SlideWrap><SeparadorSlide src="/assets/mbr/separados-insights.png" alt="Análisis estratégico" /></SlideWrap>
                <SlideWrap>
                  <InsightsFinalesSlide
                    insightsAi={insightsMode === 'ai'}
                    insightText={insightsMode === 'ai' ? (reportData.data && reportData.data['insights_generales'] && reportData.data['insights_generales'][0] ? reportData.data['insights_generales'][0].col1 || '' : '') : (generalInsightText || '')}
                    onInsightChange={onGeneralInsightChange}
                    theme={theme}
                  />
                </SlideWrap>
              </>
            )}

            {/* Separador updates + Updates + Cierre */}
            <SlideWrap><SeparadorSlide src="/assets/mbr/separador-updates.png" alt="Updates de producto" /></SlideWrap>
            <SlideWrap><UpdatesSlide /></SlideWrap>
            <SlideWrap><CierreSlide csmName={csmName} /></SlideWrap>
          </div>
        </div>

        {/* Overlay encima del canvas si está generando/error */}
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

  const fixedOpening = ["Portada", "Agenda", "Separador"];
  const fixedClosing = insightsMode !== null
    ? [insightsMode === 'ai' ? "Truora AI" : "Análisis", "Updates", "Cierre"]
    : ["Updates", "Cierre"];

  let nextSlide = fixedOpening.length + 1;

  return (
    <div className="flex-1 min-w-0 h-screen overflow-y-auto relative" style={{ background: "#0B0F2E" }}>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          {clientName ? (
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white">{clientName}</h1>
              {periodLabel && (
                <span
                  className="text-[10px] font-semibold px-2.5 py-1 rounded-full text-white"
                  style={{ background: color }}
                >
                  {periodLabel}
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/30">Selecciona un cliente para comenzar</p>
          )}
        </div>

        {/* Fixed opening slides */}
        <div className="mb-4">
          <div className="flex gap-3">
            {fixedOpening.map(s => (
              <div
                key={s}
                className="flex-1 rounded-lg border border-dashed p-3 flex items-center justify-center"
                style={{ borderColor: "rgba(255,255,255,0.08)", minHeight: 60 }}
              >
                <span className="text-[10px] text-white/25 font-medium">{s}</span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-white/20 mt-1.5 text-center">
            Portada · Agenda · Separador — siempre incluidos
          </p>
        </div>

        {/* Module slides grid */}
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
          {/* Base module — always active */}
          <SlideCard mod={modules.base} slideNum={nextSlide} color={color} isBase />

          {/* Optional modules */}
          <AnimatePresence mode="popLayout">
            {modules.optional.map(mod => {
              const active = activeModuleIds.includes(mod.id);
              if (active) {
                nextSlide++;
                return (
                  <motion.div
                    key={mod.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={cardTransitionEnter}
                  >
                    <SlideCard mod={mod} slideNum={nextSlide} color={color} />
                  </motion.div>
                );
              }
              return (
                <motion.div
                  key={mod.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -10, transition: cardTransitionExit }}
                  className="rounded-lg border border-dashed p-3 opacity-25 relative overflow-hidden"
                  style={{ borderColor: "rgba(255,255,255,0.06)", minHeight: 100 }}
                >
                  <div className="shimmer-bg absolute inset-0" />
                  <p className="text-[10px] text-white/40 font-medium relative z-10">{mod.label}</p>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Fixed closing slides */}
        <div>
          <div className="flex gap-3">
            {fixedClosing.map(s => (
              <div
                key={s}
                className="flex-1 rounded-lg border border-dashed p-3 flex items-center justify-center"
                style={{ borderColor: "rgba(255,255,255,0.08)", minHeight: 60 }}
              >
                <span className="text-[10px] text-white/25 font-medium">{s}</span>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-white/20 mt-1.5 text-center">
            {insightsMode ? (insightsMode === 'ai' ? "Truora AI · " : "Análisis · ") : ""}Updates · Cierre — siempre incluidos
          </p>
        </div>

      </div>

      {/* Generating overlay */}
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

function SlideCard({ mod, slideNum, color, isBase }: {
  mod: ModuleDef;
  slideNum: number;
  color: string;
  isBase?: boolean;
}) {
  return (
    <div
      className="rounded-lg p-3 relative"
      style={{ border: `0.5px solid ${color}20`, background: `${color}06`, minHeight: 100 }}
    >
      <p className="text-[9px] text-white/20 mb-1">
        Slide {slideNum} · {isBase ? "Base" : "Opcional"}
      </p>
      <p className="text-xs font-medium text-white/90 mb-3">{mod.label}</p>
      <AnimatedCanvasChart chart={mod.chart} color={color} />
    </div>
  );
}
