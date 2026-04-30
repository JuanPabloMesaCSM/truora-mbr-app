/**
 * AdhocModal — modal para que admins (Ana / JD) disparen una corrida ad-hoc
 * de BotiAlertas para una fecha custom.
 *
 * Flujo:
 *   1. Admin elige fecha de corte
 *   2. POST al webhook n8n (BOTIALERTAS_ADHOC_WEBHOOK_URL)
 *   3. n8n corre las 3 queries SF, hace classify, upsert con is_adhoc=true
 *   4. Responde 200 cuando termina (~30-60s)
 *   5. Frontend refresca y selecciona la nueva fecha
 *
 * Mientras corre: loading state "Calculando alertas para [fecha]…"
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar as CalendarIcon, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { S, BOTIALERTAS_ADHOC_WEBHOOK_URL } from "./types";

type Status = "idle" | "loading" | "success" | "error";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Email del admin logueado, va al body del webhook como auditoria */
  userEmail: string;
  /** Callback al terminar exitosamente. Recibe la fecha de corte (YYYY-MM-DD)
   *  para que la página refetch + setSelectedWeek a esa fecha. */
  onSuccess: (fechaCorte: string) => void;
}

export default function AdhocModal({ open, onClose, userEmail, onSuccess }: Props) {
  const [fechaCorte, setFechaCorte] = useState<string>(() => todayBog());
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Reset state al abrir/cerrar
  useEffect(() => {
    if (open) {
      setFechaCorte(todayBog());
      setStatus("idle");
      setErrorMsg(null);
    }
  }, [open]);

  // ESC para cerrar (solo si no está cargando)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && status !== "loading") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, status, onClose]);

  // Body lock mientras está abierto
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  const minDate = "2026-03-01";
  const maxDate = todayBog();

  const fechaValida =
    fechaCorte >= minDate && fechaCorte <= maxDate;

  async function handleGenerar() {
    if (!fechaValida || status === "loading") return;
    setStatus("loading");
    setErrorMsg(null);

    try {
      const resp = await fetch(BOTIALERTAS_ADHOC_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha_corte: fechaCorte,
          email: userEmail,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}${text ? ` — ${text.slice(0, 200)}` : ""}`);
      }

      // Algunas configuraciones de n8n responden vacío; otras devuelven JSON.
      // No requerimos un shape específico — basta con el 2xx.
      setStatus("success");

      // Esperamos un breve momento para que el usuario vea el "Listo" antes
      // de cerrar y refrescar.
      setTimeout(() => {
        onSuccess(fechaCorte);
        onClose();
      }, 800);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setStatus("error");
      setErrorMsg(msg);
    }
  }

  if (!open) return null;

  return (
    <AnimatePresence>
      {/* Backdrop centrado con flex container exterior — patrón aprendido en
          BotiAlertas modal 360°. NO usar transform translate(-50%,-50%) con
          framer-motion porque se sobreescribe al animar scale/y. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={status !== "loading" ? onClose : undefined}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(8, 12, 31, 0.7)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50,
          padding: 20,
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: S.surface,
            border: `1px solid ${S.borderHi}`,
            borderRadius: 18,
            width: "100%",
            maxWidth: 460,
            padding: 28,
            boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
            color: S.text,
            fontFamily: "Inter, system-ui, sans-serif",
            position: "relative",
          }}
        >
          {/* Close button */}
          <button
            onClick={status !== "loading" ? onClose : undefined}
            disabled={status === "loading"}
            aria-label="Cerrar"
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 8,
              background: "transparent",
              border: "none",
              color: S.muted,
              cursor: status === "loading" ? "not-allowed" : "pointer",
              opacity: status === "loading" ? 0.4 : 1,
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (status !== "loading") {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                e.currentTarget.style.color = S.text;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = S.muted;
            }}
          >
            <X size={16} />
          </button>

          {/* Date input section */}
          <div style={{ marginTop: 8 }}>
            <label
              htmlFor="fecha-corte"
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: S.muted,
                marginBottom: 10,
              }}
            >
              Fecha de corte
            </label>

            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                background: S.surfaceLo,
                border: `1px solid ${S.border}`,
                borderRadius: 12,
                padding: "0 14px",
                transition: "border-color 0.15s",
              }}
            >
              <CalendarIcon size={16} color={S.muted} style={{ marginRight: 10 }} />
              <input
                id="fecha-corte"
                type="date"
                value={fechaCorte}
                min={minDate}
                max={maxDate}
                disabled={status === "loading" || status === "success"}
                onChange={(e) => setFechaCorte(e.target.value)}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: S.text,
                  fontSize: 15,
                  fontWeight: 500,
                  fontFamily: "inherit",
                  padding: "14px 0",
                  colorScheme: "dark",
                }}
              />
            </div>
          </div>

          {/* Action button */}
          <button
            onClick={handleGenerar}
            disabled={!fechaValida || status === "loading" || status === "success"}
            style={{
              width: "100%",
              marginTop: 24,
              padding: "13px 18px",
              background:
                status === "success"
                  ? "rgba(16,185,129,0.18)"
                  : status === "loading"
                  ? "rgba(124,77,255,0.30)"
                  : !fechaValida
                  ? "rgba(124,77,255,0.20)"
                  : "#7C4DFF",
              color:
                status === "success"
                  ? "#10B981"
                  : !fechaValida && status !== "loading"
                  ? "rgba(255,255,255,0.4)"
                  : "#FFFFFF",
              border: status === "success" ? "1px solid rgba(16,185,129,0.40)" : "none",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "inherit",
              cursor:
                status === "loading" || status === "success" || !fechaValida
                  ? "not-allowed"
                  : "pointer",
              transition: "all 0.18s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {status === "loading" ? (
              <>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                <span>Calculando alertas para {fmtFechaHumano(fechaCorte)}…</span>
              </>
            ) : status === "success" ? (
              <>
                <CheckCircle2 size={16} />
                <span>Listo</span>
              </>
            ) : (
              <span>Generar reporte</span>
            )}
          </button>

          {/* Error */}
          {status === "error" && errorMsg && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 12px",
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.30)",
                borderRadius: 10,
                fontSize: 12,
                color: "#FCA5A5",
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ lineHeight: 1.4 }}>
                <strong style={{ fontWeight: 600 }}>No se pudo generar.</strong>{" "}
                {errorMsg}
              </span>
            </div>
          )}

          {/* Loading hint para que el admin no piense que se colgó */}
          {status === "loading" && (
            <p
              style={{
                marginTop: 14,
                fontSize: 11,
                color: S.dim,
                textAlign: "center",
                lineHeight: 1.5,
              }}
            >
              Las queries Snowflake suelen tardar 30–60 segundos. No cierres esta ventana.
            </p>
          )}
        </motion.div>
      </motion.div>

      {/* Inline keyframes para el spinner del Loader2 */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </AnimatePresence>
  );
}

/* ─────────── Helpers ─────────── */

/** Devuelve la fecha de hoy en zona Bogotá (YYYY-MM-DD).
 *  Importante: NO usar new Date().toISOString() porque devuelve UTC y
 *  puede dar el día anterior en BOG (UTC-5). */
function todayBog(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

/** "16 de abril de 2026" para mostrar al admin durante el loading */
function fmtFechaHumano(yyyymmdd: string): string {
  const parts = yyyymmdd.split("-");
  if (parts.length < 3) return yyyymmdd;
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const d = Number(parts[2]);
  const m = Number(parts[1]);
  const y = parts[0];
  return `${d} de ${meses[m - 1] ?? "?"} de ${y}`;
}
