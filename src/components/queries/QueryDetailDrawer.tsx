/**
 * Drawer lateral que muestra el detalle de una query del catálogo.
 * Slide desde la derecha. Cierra con ESC o click en backdrop.
 *
 * Contenido:
 *   - Nombre + producto/fuente pills
 *   - Descripción CSM (highlighted, lo que más importa al lector)
 *   - Descripción técnica (collapsible)
 *   - Parámetros (lista)
 *   - SQL template (monospace, copy button)
 *   - Ejemplos de uso (cards)
 *   - Skills referenciadas (chips)
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check, ExternalLink, Hash, AlertTriangle, ArrowRight } from "lucide-react";
import {
  S,
  FUENTE_LABEL,
  FUENTE_COLOR,
  PRODUCTO_COLOR,
  STATUS_COLOR,
  STATUS_LABEL,
} from "@/components/queries/types";
import type { QueryRow } from "@/components/queries/types";
import { n8nToSnowflake } from "@/utils/n8nToSnowflake";

const DRIFT_AMBER = "#F59E0B";

interface Props {
  row: QueryRow | null;
  rows?: QueryRow[];
  onClose: () => void;
  onSelectRelated?: (row: QueryRow) => void;
  isAdmin: boolean;
}

type CopyMode = "n8n" | "sf";

export default function QueryDetailDrawer({ row, rows = [], onClose, onSelectRelated, isAdmin }: Props) {
  const [copied, setCopied] = useState<CopyMode | null>(null);
  const [showTechDesc, setShowTechDesc] = useState(false);

  const relatedRows = useMemo(() => {
    if (!row || row.queries_relacionadas.length === 0) return [];
    const set = new Set(row.queries_relacionadas);
    return rows.filter((r) => set.has(r.id));
  }, [row, rows]);

  /* ESC para cerrar */
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  /* Reset copied indicator al cambiar row */
  useEffect(() => {
    setCopied(null);
    setShowTechDesc(false);
  }, [row?.id]);

  const handleCopy = async (mode: CopyMode) => {
    if (!row) return;
    const text = mode === "sf" ? n8nToSnowflake(row.sql_template) : row.sql_template;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(mode);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <AnimatePresence>
      {row && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(8,12,31,0.6)",
              backdropFilter: "blur(2px)",
              zIndex: 50,
            }}
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 280 }}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "min(720px, 92vw)",
              background: "#0F1B2D",
              borderLeft: `1px solid ${S.border}`,
              zIndex: 51,
              display: "flex",
              flexDirection: "column",
              color: S.text,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "20px 24px",
                borderBottom: `1px solid ${S.border}`,
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: S.muted,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    marginBottom: 4,
                  }}
                >
                  <Hash size={10} style={{ display: "inline", marginRight: 2 }} />
                  {row.slug}
                </div>
                <h2
                  style={{
                    fontSize: 17,
                    fontWeight: 600,
                    margin: 0,
                    lineHeight: 1.3,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {row.nombre}
                </h2>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  <MiniPill color={PRODUCTO_COLOR[row.producto]} label={row.producto} />
                  <MiniPill color={FUENTE_COLOR[row.fuente]} label={FUENTE_LABEL[row.fuente]} />
                  {row.drift_detected_at && (
                    <MiniPill color={DRIFT_AMBER} label="⚠ Pendiente de validar" />
                  )}
                  {isAdmin && (
                    <MiniPill color={STATUS_COLOR[row.status]} label={STATUS_LABEL[row.status]} />
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: "transparent",
                  border: `1px solid ${S.border}`,
                  borderRadius: 8,
                  color: S.muted,
                  cursor: "pointer",
                  padding: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Cerrar (Esc)"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body scroll */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px 24px 28px",
                display: "flex",
                flexDirection: "column",
                gap: 22,
              }}
            >
              {/* Banner drift (pendiente de validar) */}
              {row.drift_detected_at && (
                <div
                  style={{
                    background: "rgba(245,158,11,0.10)",
                    border: `1px solid ${DRIFT_AMBER}50`,
                    borderRadius: 12,
                    padding: "14px 16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                      color: DRIFT_AMBER,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    <AlertTriangle size={13} />
                    Esta query está pendiente de validar
                  </div>
                  <p
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.5,
                      color: S.text,
                      margin: 0,
                      marginBottom: 8,
                    }}
                  >
                    Alguien actualizó este query en n8n. Antes de copiarlo, revisá los cambios
                    para asegurarte que lo que vas a usar refleja lo que esperás.
                  </p>
                  <div style={{ fontSize: 11, color: S.muted, marginBottom: 10 }}>
                    Detectado el{" "}
                    {new Date(row.drift_detected_at).toLocaleString("es-CO", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        disabled
                        title="Disponible en la próxima tanda"
                        style={{
                          background: "transparent",
                          border: `1px solid ${S.border}`,
                          color: S.muted,
                          borderRadius: 8,
                          padding: "5px 11px",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "not-allowed",
                          fontFamily: "inherit",
                          opacity: 0.6,
                        }}
                      >
                        Ver cambios
                      </button>
                      <button
                        disabled
                        title="Disponible en la próxima tanda"
                        style={{
                          background: `${DRIFT_AMBER}1A`,
                          border: `1px solid ${DRIFT_AMBER}50`,
                          color: DRIFT_AMBER,
                          borderRadius: 8,
                          padding: "5px 11px",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "not-allowed",
                          fontFamily: "inherit",
                          opacity: 0.6,
                        }}
                      >
                        Marcar como validado
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Nota importante (warning destacado del Modelo D) */}
              {row.nota_importante && (
                <div
                  style={{
                    background: "rgba(245,158,11,0.06)",
                    border: `1px solid ${DRIFT_AMBER}30`,
                    borderRadius: 12,
                    padding: "14px 16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 6,
                      color: DRIFT_AMBER,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    <AlertTriangle size={13} />
                    Nota importante
                  </div>
                  <p
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.55,
                      color: S.text,
                      margin: 0,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {row.nota_importante}
                  </p>
                </div>
              )}

              {/* Descripción CSM (destacada) */}
              {row.descripcion_csm && (
                <Section title="Para qué sirve">
                  <p
                    style={{
                      fontSize: 13.5,
                      lineHeight: 1.55,
                      color: S.text,
                      margin: 0,
                    }}
                  >
                    {row.descripcion_csm}
                  </p>
                </Section>
              )}

              {/* Descripción técnica (collapsible) */}
              <Section
                title="Detalle técnico"
                action={
                  <button
                    onClick={() => setShowTechDesc((v) => !v)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#7C4DFF",
                      cursor: "pointer",
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: "inherit",
                    }}
                  >
                    {showTechDesc ? "ocultar" : "ver"}
                  </button>
                }
              >
                {showTechDesc && (
                  <p
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.55,
                      color: S.muted,
                      margin: 0,
                    }}
                  >
                    {row.descripcion}
                  </p>
                )}
              </Section>

              {/* Parámetros */}
              {row.parametros.length > 0 && (
                <Section title={`Parámetros (${row.parametros.length})`}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {row.parametros.map((p) => (
                      <div
                        key={p.name}
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          border: `1px solid ${S.border}`,
                          borderRadius: 10,
                          padding: "10px 12px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 4,
                            flexWrap: "wrap",
                          }}
                        >
                          <code
                            style={{
                              fontSize: 12,
                              color: "#FBBF24",
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, monospace",
                              fontWeight: 600,
                            }}
                          >
                            {p.name}
                          </code>
                          <span
                            style={{
                              fontSize: 10,
                              color: S.muted,
                              background: "rgba(255,255,255,0.04)",
                              padding: "1px 6px",
                              borderRadius: 4,
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, monospace",
                            }}
                          >
                            {p.type}
                          </span>
                          {p.required && (
                            <span
                              style={{
                                fontSize: 10,
                                color: "#F87171",
                                fontWeight: 600,
                                letterSpacing: "0.02em",
                              }}
                            >
                              REQUERIDO
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <div style={{ fontSize: 11.5, color: S.muted, lineHeight: 1.45 }}>
                            {p.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* SQL template */}
              <Section
                title="SQL"
                action={
                  <div style={{ display: "flex", gap: 6 }}>
                    <CopyBtn
                      mode="n8n"
                      copied={copied === "n8n"}
                      onClick={() => handleCopy("n8n")}
                      label="Copiar n8n"
                    />
                    <CopyBtn
                      mode="sf"
                      copied={copied === "sf"}
                      onClick={() => handleCopy("sf")}
                      label="→ Snowflake"
                    />
                  </div>
                }
              >
                <pre
                  style={{
                    background: "#080C1F",
                    border: `1px solid ${S.border}`,
                    borderRadius: 10,
                    padding: 14,
                    fontSize: 11.5,
                    color: "#CBD5E1",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    margin: 0,
                    overflow: "auto",
                    maxHeight: 360,
                    whiteSpace: "pre",
                    lineHeight: 1.55,
                  }}
                >
                  {row.sql_template}
                </pre>
              </Section>

              {/* Ejemplos de uso */}
              {row.ejemplos_uso.length > 0 && (
                <Section title="Cuándo usarla">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {row.ejemplos_uso.map((ej, i) => (
                      <div
                        key={i}
                        style={{
                          background: "rgba(124,77,255,0.06)",
                          border: "1px solid rgba(124,77,255,0.25)",
                          borderRadius: 10,
                          padding: "10px 14px",
                          fontSize: 12.5,
                          color: S.text,
                          lineHeight: 1.5,
                          fontStyle: "italic",
                        }}
                      >
                        “{ej}”
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Queries relacionadas */}
              {relatedRows.length > 0 && (
                <Section title="Queries relacionadas">
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {relatedRows.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSelectRelated?.(r)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          textAlign: "left",
                          background: "rgba(124,77,255,0.06)",
                          border: "1px solid rgba(124,77,255,0.25)",
                          borderRadius: 10,
                          padding: "9px 12px",
                          color: S.text,
                          fontSize: 12.5,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(124,77,255,0.12)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(124,77,255,0.06)";
                        }}
                      >
                        <ArrowRight size={12} color="#A78BFA" />
                        <span style={{ flex: 1 }}>{r.nombre}</span>
                        <MiniPill color={PRODUCTO_COLOR[r.producto]} label={r.producto} />
                      </button>
                    ))}
                  </div>
                </Section>
              )}

              {/* Skills referenciadas */}
              {row.skill_referencias.length > 0 && (
                <Section title="Referencias en skills">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {row.skill_referencias.map((s) => (
                      <span
                        key={s}
                        style={{
                          fontSize: 11,
                          color: S.muted,
                          background: "rgba(255,255,255,0.04)",
                          border: `1px solid ${S.border}`,
                          borderRadius: 999,
                          padding: "4px 11px",
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, monospace",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <ExternalLink size={10} />
                        {s}
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: 11, color: S.muted, marginTop: 8, fontStyle: "italic" }}>
                    El SQL completo y los caveats viven en estas skills.
                  </p>
                </Section>
              )}

              {/* Metadatos */}
              <div
                style={{
                  fontSize: 10.5,
                  color: S.muted,
                  borderTop: `1px solid ${S.border}`,
                  paddingTop: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {row.workflow && (
                  <span>
                    De: <span style={{ color: "#A78BFA" }}>{row.workflow.workflow_name}</span>
                  </span>
                )}
                {row.workflow?.last_synced_at && (
                  <span>
                    Última sync: {new Date(row.workflow.last_synced_at).toLocaleString("es-CO", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                <span>
                  Creada por {row.creado_por} · {new Date(row.creado_en).toLocaleDateString("es-CO")}
                </span>
                <span>Usos: {row.veces_usado}</span>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─────────────── Subcomponentes ─────────────── */

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <h3
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: S.muted,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: 0,
          }}
        >
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function MiniPill({ color, label }: { color: string; label: string }) {
  return (
    <span
      style={{
        background: `${color}1F`,
        border: `1px solid ${color}50`,
        color,
        borderRadius: 999,
        padding: "2px 9px",
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </span>
  );
}

function CopyBtn({
  mode,
  copied,
  onClick,
  label,
}: {
  mode: CopyMode;
  copied: boolean;
  onClick: () => void;
  label: string;
}) {
  const accent = mode === "sf" ? "#F59E0B" : "#7C4DFF";
  return (
    <button
      onClick={onClick}
      title={
        mode === "sf"
          ? "Copia el SQL con los placeholders {{ }} de n8n reemplazados por literales editables"
          : "Copia el SQL tal cual está en n8n, con los placeholders {{ }} intactos"
      }
      style={{
        background: copied ? "rgba(34,197,94,0.10)" : `${accent}10`,
        border: `1px solid ${copied ? "#22C55E50" : `${accent}40`}`,
        color: copied ? "#22C55E" : accent,
        borderRadius: 8,
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 5,
        fontFamily: "inherit",
        transition: "all 0.15s",
      }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "Copiado" : label}
    </button>
  );
}
