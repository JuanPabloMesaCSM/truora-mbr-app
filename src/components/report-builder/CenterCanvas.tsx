import { motion, AnimatePresence } from "framer-motion";
import { MODULES, PRODUCT_COLORS, type Product, type ModuleDef, type ModuleInsight } from "./moduleDefinitions";
import { AnimatedCanvasChart } from "./AnimatedChartPreview";
import { GeneratingOverlay } from "./GeneratingOverlay";
import { SlideCanvas, type Theme, type CeFlowData } from "./SlideCanvas";

interface CenterCanvasProps {
  product: Product;
  clientName: string | null;
  periodLabel: string;
  activeModuleIds: string[];
  insightsAi: boolean;
  moduleInsights?: Record<string, ModuleInsight>;
  overlayStatus: "generating" | "success" | "error" | null;
  reportData?: any;
  theme: Theme;
  onOverlayClose: () => void;
  onRetry: () => void;
}

const cardTransitionEnter = { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] as const };
const cardTransitionExit = { duration: 0.25, ease: "easeIn" as const };

export function CenterCanvas({
  product, clientName, periodLabel, activeModuleIds, insightsAi,
  moduleInsights = {}, overlayStatus, reportData, theme, onOverlayClose, onRetry,
}: CenterCanvasProps) {
  const getSlideInsight = (id: string): { insightText?: string; insightSource?: 'ai' | 'manual' } => {
    const mi = moduleInsights[id];
    if (!mi || !mi.mode) return {};
    if (mi.mode === 'manual' && mi.text) return { insightText: mi.text, insightSource: 'manual' };
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
    const theme: Theme = 'dark';
    const data = reportData.data ?? {};
    const ceFlows: CeFlowData[] = reportData.ceFlows ?? [];
    const meta = reportData.meta ?? {};
    const slideIds: string[] = [modules.base.id];
    for (const mod of modules.optional) {
      if (activeModuleIds.includes(mod.id)) slideIds.push(mod.id);
    }
    if (product === 'CE' && ceFlows.length > 0) {
      for (let i = 0; i < ceFlows.length; i++) {
        slideIds.push(`ce_sep_${i}`);
        slideIds.push(`ce_otb_${i}`);
        slideIds.push(`ce_steps_${i}`);
        if (ceFlows[i].tiene_vrf) slideIds.push(`ce_vrf_${i}`);
      }
    }
    const totalPages = slideIds.length;
    return (
      <div className="flex-1 min-w-0 h-screen flex flex-col overflow-hidden" style={{ background: '#0B0F2E' }}>
        <div className="flex items-center justify-between px-6 py-3 shrink-0" style={{ borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <span className="text-white font-semibold text-sm">{meta.cliente || clientName}</span>
            <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full text-white" style={{ background: color }}>
              {meta.periodo_reporte || periodLabel}
            </span>
            <span className="text-white/30 text-xs">{totalPages} slides</span>
          </div>
          <button onClick={onOverlayClose} className="text-xs text-white/30 hover:text-white/60 transition-colors px-3 py-1.5">
            ← Nuevo reporte
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col items-center gap-6">
            {slideIds.map((slideId, idx) => (
              <div key={slideId} className="rounded-xl overflow-hidden shadow-2xl" style={{ width: 1280, height: 720, flexShrink: 0 }}>
                <SlideCanvas
                  slideId={slideId}
                  product={product}
                  data={data}
                  ceFlows={ceFlows}
                  theme={theme}
                  clientName={meta.cliente || clientName || ''}
                  periodLabel={meta.periodo_reporte || periodLabel}
                  pageNum={idx + 1}
                  totalPages={totalPages}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const fixedOpening = ["Portada", "Agenda", "Separador"];
  const fixedClosing = insightsAi
    ? ["Truora AI", "Updates", "Cierre"]
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
            {insightsAi ? "Truora AI · " : ""}Updates · Cierre — siempre incluidos
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
