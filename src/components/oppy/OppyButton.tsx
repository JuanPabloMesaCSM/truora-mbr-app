import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Rocket as OppyIcon } from "lucide-react";
import { OppyChatDrawer } from "./OppyChatDrawer";
import { OPPY_COLORS } from "./types";

interface Props {
  userEmail: string;
  currentRoute?: string;
}

/* FAB flotante (abajo a la derecha) + drawer asociado.
   Cada página lo monta una vez; al ser position:fixed da igual dónde en el JSX. */
export function OppyButton({ userEmail, currentRoute }: Props) {
  const [open, setOpen] = useState(false);
  const [hov, setHov] = useState(false);

  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 16 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
            style={{
              position: "fixed",
              right: 24,
              bottom: 24,
              zIndex: 40,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {/* Label al hover */}
            <AnimatePresence>
              {hov && (
                <motion.span
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.16 }}
                  style={{
                    background: "rgba(8,12,31,0.85)",
                    border: `1px solid ${OPPY_COLORS.borderPill}`,
                    color: "#EEF0FF",
                    fontSize: 12.5,
                    fontWeight: 600,
                    padding: "8px 13px",
                    borderRadius: 999,
                    whiteSpace: "nowrap",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                  }}
                >
                  Preguntale a <b style={{ color: OPPY_COLORS.primary }}>Oppy</b>
                </motion.span>
              )}
            </AnimatePresence>

            {/* Botón circular */}
            <button
              onClick={() => setOpen(true)}
              onMouseEnter={() => setHov(true)}
              onMouseLeave={() => setHov(false)}
              title="Preguntale a Oppy sobre el catálogo de queries"
              style={{
                position: "relative",
                width: 58,
                height: 58,
                borderRadius: "50%",
                border: "none",
                cursor: "pointer",
                background: `linear-gradient(135deg, ${OPPY_COLORS.primary}, ${OPPY_COLORS.accent})`,
                boxShadow: `0 10px 30px ${OPPY_COLORS.glow}, 0 2px 8px rgba(0,0,0,0.35)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: hov ? "scale(1.07)" : "scale(1)",
                transition: "transform 0.18s ease",
              }}
            >
              {/* Anillo de pulso (atrae la mirada) */}
              <motion.span
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: `2px solid ${OPPY_COLORS.primary}`,
                }}
                animate={{ scale: [1, 1.4], opacity: [0.55, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
              />
              <OppyIcon size={26} color="#FFFFFF" strokeWidth={2} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <OppyChatDrawer
        open={open}
        onClose={() => setOpen(false)}
        userEmail={userEmail}
        currentRoute={currentRoute}
      />
    </>
  );
}
