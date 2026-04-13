import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  "Conectando con Snowflake",
  "Calculando métricas",
  "Generando gráficos",
  "Construyendo presentación",
  "Finalizando...",
];

interface GeneratingOverlayProps {
  status: "generating" | "success" | "error";
  onClose: () => void;
  onRetry: () => void;
}

export function GeneratingOverlay({ status, onClose, onRetry }: GeneratingOverlayProps) {
  const [progress, setProgress] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(0);

  // Animate progress bar to 85% while generating
  useEffect(() => {
    if (status !== "generating") return;
    setProgress(0);
    setCompletedSteps(0);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 85) { clearInterval(interval); return 85; }
        return prev + 0.5;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [status]);

  // Step-by-step checkmarks every 3s
  useEffect(() => {
    if (status !== "generating") return;
    const timer = setInterval(() => {
      setCompletedSteps(prev => {
        if (prev >= 3) { clearInterval(timer); return 3; } // stop at 4th, last one waits for success
        return prev + 1;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [status]);

  // On success, complete everything
  useEffect(() => {
    if (status === "success") {
      setProgress(100);
      setCompletedSteps(5);
    }
  }, [status]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 z-40 flex items-center justify-center"
      style={{ background: "rgba(11, 15, 46, 0.97)" }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="max-w-sm w-full mx-6 text-center"
      >
        <AnimatePresence mode="wait">
          {status === "generating" && (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              {/* Pulsing logo */}
              <motion.div
                animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <rect x="4" y="4" width="24" height="24" rx="4" stroke="white" strokeWidth="1.5" opacity="0.6" />
                  <path d="M10 16h4l2-4 2 8 2-4h4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
                </svg>
              </motion.div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold text-white">Generando tu reporte...</h2>
                <p className="text-sm text-white/40">Esto puede tomar hasta 60 segundos</p>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg, #00C9A7, #6C3FC5)" }}
                    initial={{ width: "0%" }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3, ease: "linear" }}
                  />
                </div>
                <p className="text-[10px] text-white/30 font-medium">{Math.round(progress)}%</p>
              </div>

              {/* Steps */}
              <div className="space-y-2.5 text-left mx-auto max-w-[240px]">
                {STEPS.map((step, i) => {
                  const done = i < completedSteps;
                  const current = i === completedSteps;
                  return (
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-2.5"
                    >
                      {done ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", damping: 15 }}
                        >
                          <AnimatedCheck />
                        </motion.div>
                      ) : (
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            current ? "border-white/40" : "border-white/10"
                          }`}
                        >
                          {current && (
                            <motion.div
                              className="w-2 h-2 rounded-full bg-white/50"
                              animate={{ scale: [1, 1.3, 1] }}
                              transition={{ duration: 1.2, repeat: Infinity }}
                            />
                          )}
                        </div>
                      )}
                      <span
                        className={`text-xs ${
                          done ? "text-white/70" : current ? "text-white/50" : "text-white/20"
                        }`}
                      >
                        {step}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {status === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.1 }}
                className="mx-auto"
              >
                <SuccessCheck />
              </motion.div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold text-white">¡Reporte generado!</h2>
                <p className="text-sm text-white/40">Los slides están listos en el canvas</p>
              </div>

              <div className="space-y-3">
                <Button
                  size="lg"
                  className="w-full font-semibold bg-white text-[#0B0F2E] hover:bg-white/90"
                  onClick={onClose}
                >
                  Ver slides →
                </Button>
              </div>
            </motion.div>
          )}

          {status === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              <motion.div
                initial={{ scale: 0, rotate: -90 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", damping: 12, stiffness: 200, delay: 0.1 }}
                className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "rgba(239, 68, 68, 0.15)" }}
              >
                <X className="h-8 w-8 text-red-400" strokeWidth={2.5} />
              </motion.div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold text-white">Ocurrió un error al generar el reporte</h2>
                <p className="text-sm text-white/40">
                  Verifica tu conexión e intenta de nuevo
                </p>
              </div>

              <div className="space-y-3">
                <Button
                  size="lg"
                  className="w-full gap-2"
                  variant="destructive"
                  onClick={onRetry}
                >
                  <RefreshCw className="h-4 w-4" /> Intentar de nuevo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="w-full text-white/40 hover:text-white/70 hover:bg-white/5"
                >
                  Cerrar
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

/* ── Animated SVG Checkmark ── */
function AnimatedCheck() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" fill="#00C9A7" fillOpacity="0.2" />
      <motion.path
        d="M6 10l3 3 5-6"
        stroke="#00C9A7"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
    </svg>
  );
}

function SuccessCheck() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
      <motion.circle
        cx="36"
        cy="36"
        r="32"
        stroke="#00C9A7"
        strokeWidth="3"
        fill="none"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
      <motion.path
        d="M22 36l10 10 18-20"
        stroke="#00C9A7"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.4, ease: "easeOut" }}
      />
    </svg>
  );
}
