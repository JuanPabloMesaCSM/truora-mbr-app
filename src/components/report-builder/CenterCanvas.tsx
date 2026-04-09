import { motion, AnimatePresence } from "framer-motion";
import { MODULES, PRODUCT_COLORS, type Product, type ModuleDef } from "./moduleDefinitions";
import { AnimatedCanvasChart } from "./AnimatedChartPreview";
import { GeneratingOverlay } from "./GeneratingOverlay";

interface CenterCanvasProps {
  product: Product;
  clientName: string | null;
  periodLabel: string;
  activeModuleIds: string[];
  insightsAi: boolean;
  overlayStatus: "generating" | "success" | "error" | null;
  reportUrl?: string;
  onOverlayClose: () => void;
  onRetry: () => void;
}

const cardTransitionEnter = { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] as const };
const cardTransitionExit = { duration: 0.25, ease: "easeIn" as const };

export function CenterCanvas({
  product, clientName, periodLabel, activeModuleIds, insightsAi,
  overlayStatus, reportUrl, onOverlayClose, onRetry,
}: CenterCanvasProps) {
  const color = PRODUCT_COLORS[product];
  const modules = MODULES[product];

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
            reportUrl={reportUrl}
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
