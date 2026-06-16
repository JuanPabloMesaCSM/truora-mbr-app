import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, RotateCcw, BotMessageSquare as OppyIcon } from "lucide-react";
import { useOppyChat } from "@/hooks/useOppyChat";
import { MessageBubble } from "./MessageBubble";
import { OPPY_COLORS, SHELL } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  userEmail: string;
  currentRoute?: string;
}

export function OppyChatDrawer({ open, onClose, userEmail, currentRoute }: Props) {
  const { messages, loading, send, reset, isMock } = useOppyChat({ userEmail, currentRoute });
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Autofocus on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  // Auto-scroll on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Auto-grow del textarea según el contenido (hasta un tope)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const onSubmit = () => {
    if (!input.trim() || loading) return;
    send(input);
    setInput("");
  };

  const SUGGESTIONS = [
    "¿Tienes una query del funnel DI?",
    "Quiero ver el SQL de sf_di_funnel",
    "¿Cómo calculo el consumo facturable?",
    "Queries BGC del Report Builder",
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop (clickeable para cerrar) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0,
              background: "rgba(8,12,31,0.5)",
              backdropFilter: "blur(2px)",
              zIndex: 50,
            }}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0,
              width: "clamp(440px, 50vw, 920px)",
              maxWidth: "96vw",
              background: "linear-gradient(180deg, #0E1830 0%, #0A1226 100%)",
              borderLeft: `1px solid ${SHELL.border}`,
              boxShadow: `0 0 60px ${OPPY_COLORS.glow}`,
              display: "flex", flexDirection: "column",
              zIndex: 51,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px",
                borderBottom: `1px solid ${SHELL.border}`,
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9,
                  background: `linear-gradient(135deg, ${OPPY_COLORS.primary}, ${OPPY_COLORS.accent})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 4px 12px ${OPPY_COLORS.glow}`,
                }}>
                  <OppyIcon size={16} color="#FFFFFF" />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: SHELL.text }}>
                      Oppy
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, color: "#FBBF24",
                      background: "rgba(251,191,36,0.15)",
                      border: "1px solid rgba(251,191,36,0.35)",
                      borderRadius: 999, padding: "0 6px",
                      letterSpacing: "0.04em",
                    }}>BETA</span>
                    {isMock && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: "#7DD3FC",
                        background: "rgba(56,189,248,0.15)",
                        border: "1px solid rgba(56,189,248,0.35)",
                        borderRadius: 999, padding: "0 6px",
                        letterSpacing: "0.04em",
                      }}>DEMO</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: SHELL.muted, marginTop: 1 }}>
                    Asistente del catálogo de queries
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  onClick={reset}
                  title="Nueva conversación"
                  disabled={messages.length === 0}
                  style={{
                    background: "transparent", border: "none",
                    cursor: messages.length === 0 ? "not-allowed" : "pointer",
                    opacity: messages.length === 0 ? 0.4 : 1,
                    color: SHELL.muted, padding: 6, borderRadius: 6,
                    display: "flex", alignItems: "center",
                  }}
                >
                  <RotateCcw size={15} />
                </button>
                <button
                  onClick={onClose}
                  title="Cerrar (Esc)"
                  style={{
                    background: "transparent", border: "none", cursor: "pointer",
                    color: SHELL.muted, padding: 6, borderRadius: 6,
                    display: "flex", alignItems: "center",
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Mensajes */}
            <div
              ref={scrollRef}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "18px 18px 8px",
              }}
            >
              {messages.length === 0 && (
                <EmptyState onPick={t => { setInput(t); inputRef.current?.focus(); }} suggestions={SUGGESTIONS} />
              )}

              {messages.map(m => <MessageBubble key={m.id} message={m} />)}

              {loading && <TypingIndicator />}
            </div>

            {/* Input */}
            <div
              style={{
                padding: "12px 14px 14px",
                borderTop: `1px solid ${SHELL.border}`,
                flexShrink: 0,
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div
                style={{
                  display: "flex", alignItems: "flex-end", gap: 8,
                  background: SHELL.surface,
                  border: `1px solid ${SHELL.border}`,
                  borderRadius: 12,
                  padding: "8px 10px",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => (e.currentTarget.style.borderColor = OPPY_COLORS.borderPill)}
                onBlur={e => (e.currentTarget.style.borderColor = SHELL.border)}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      onSubmit();
                    }
                  }}
                  placeholder="Escribe tu pregunta sobre el catálogo..."
                  rows={1}
                  style={{
                    flex: 1,
                    background: "transparent", border: "none", outline: "none",
                    color: SHELL.text, fontSize: 13.5, lineHeight: 1.4,
                    resize: "none",
                    fontFamily: "inherit",
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                />
                <button
                  onClick={onSubmit}
                  disabled={!input.trim() || loading}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: input.trim() && !loading
                      ? `linear-gradient(135deg, ${OPPY_COLORS.primary}, ${OPPY_COLORS.accent})`
                      : "rgba(255,255,255,0.05)",
                    border: "none",
                    cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: input.trim() && !loading ? "#FFFFFF" : SHELL.dim,
                    flexShrink: 0,
                    transition: "all 0.15s",
                  }}
                >
                  <Send size={14} />
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: SHELL.dim, marginTop: 6, paddingLeft: 4 }}>
                Enter para enviar · Shift+Enter para nueva línea {isMock && "· DEMO: respuestas hardcoded"}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function EmptyState({ suggestions, onPick }: { suggestions: string[]; onPick: (s: string) => void }) {
  return (
    <div style={{ padding: "20px 4px", textAlign: "center" }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: `linear-gradient(135deg, ${OPPY_COLORS.primary}, ${OPPY_COLORS.accent})`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 10px 30px ${OPPY_COLORS.glow}`,
        marginBottom: 14,
      }}>
        <OppyIcon size={22} color="#FFFFFF" />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: SHELL.text, marginBottom: 6 }}>
        ¿En qué te ayudo?
      </div>
      <div style={{ fontSize: 12.5, color: SHELL.muted, marginBottom: 18, lineHeight: 1.5 }}>
        Busco y explico queries del catálogo (Report Builder, Dashboard,<br/>BotiAlertas y endpoints ClickHouse).
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onPick(s)}
            style={{
              padding: "9px 12px",
              background: SHELL.surface,
              border: `1px solid ${SHELL.border}`,
              borderRadius: 10,
              fontSize: 12.5, color: SHELL.text,
              cursor: "pointer", textAlign: "left",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "#1B2F4D";
              e.currentTarget.style.borderColor = OPPY_COLORS.borderPill;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = SHELL.surface;
              e.currentTarget.style.borderColor = SHELL.border;
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `linear-gradient(135deg, ${OPPY_COLORS.primary}, ${OPPY_COLORS.accent})`,
        color: "#FFFFFF",
      }}>
        <OppyIcon size={14} />
      </div>
      <div style={{
        padding: "12px 14px",
        background: SHELL.surface,
        border: `1px solid ${SHELL.border}`,
        borderRadius: 12,
        display: "flex", gap: 4, alignItems: "center",
      }}>
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
            style={{
              width: 6, height: 6, borderRadius: 999,
              background: OPPY_COLORS.primary,
            }}
          />
        ))}
      </div>
    </div>
  );
}
