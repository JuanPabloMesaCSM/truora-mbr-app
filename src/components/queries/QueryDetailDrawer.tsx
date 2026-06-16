/**
 * QueryDetailDrawer — drawer del catálogo de queries.
 *
 * Foco único: "completa Client ID + fechas → copia SQL listo para correr".
 * El SQL de abajo se actualiza en vivo con los valores del CSM.
 * La metadata de agente/auditoría (slug, detalle técnico, skills, metadatos)
 * vive plegada bajo "Ver detalle técnico".
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Copy,
  Check,
  ChevronDown,
  Info,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import {
  S,
  FUENTE_LABEL,
  FUENTE_COLOR,
  PRODUCTO_COLOR,
} from "@/components/queries/types";
import type { QueryRow, QueryParam } from "@/components/queries/types";
import { fillQueryTemplate, roleOf, type ParamRole } from "@/utils/fillQueryTemplate";

const DRIFT_AMBER = "#F59E0B";
const VIOLET = "#7C4DFF";

interface Props {
  row: QueryRow | null;
  rows?: QueryRow[];
  onClose: () => void;
  onSelectRelated?: (row: QueryRow) => void;
  isAdmin: boolean;
}

const ROLE_ORDER: ParamRole[] = [
  "clientId",
  "fechaInicio",
  "fechaFin",
  "fechaCorte",
  "flow",
  "customTypes",
  "other",
];

const ROLE_LABEL: Record<ParamRole, string> = {
  clientId: "Client ID",
  fechaInicio: "Desde",
  fechaFin: "Hasta",
  fechaCorte: "Fecha de corte",
  flow: "Flow ID (opcional)",
  customTypes: "Tipos (opcional)",
  filter: "",
  other: "Valor",
};

interface Field {
  role: ParamRole;
  param: QueryParam;
  isArray: boolean;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function QueryDetailDrawer({
  row,
  rows = [],
  onClose,
  onSelectRelated,
  isAdmin,
}: Props) {
  const [values, setValues] = useState<Partial<Record<ParamRole, string>>>({});
  const [copied, setCopied] = useState<"ready" | "raw" | null>(null);
  const [showTech, setShowTech] = useState(false);
  const [showNota, setShowNota] = useState(false);

  /* Campos a renderizar, derivados de los parámetros del catálogo */
  const fields = useMemo<Field[]>(() => {
    if (!row) return [];
    const seen = new Set<ParamRole>();
    const list: Field[] = [];
    for (const p of row.parametros) {
      const role = roleOf(p.name);
      if (role === "filter") continue;
      if (seen.has(role)) continue;
      seen.add(role);
      list.push({ role, param: p, isArray: p.type === "array" });
    }
    list.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role));
    return list;
  }, [row]);

  /* Defaults sensatos al abrir: mes cerrado anterior + tipos = ALL */
  useEffect(() => {
    if (!row) return;
    const now = new Date();
    const firstPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastPrev = new Date(now.getFullYear(), now.getMonth(), 0);
    setValues({
      fechaInicio: fmtDate(firstPrev),
      fechaFin: fmtDate(lastPrev),
      fechaCorte: fmtDate(lastPrev),
      customTypes: "ALL",
    });
    setCopied(null);
    setShowTech(false);
    setShowNota(false);
  }, [row?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ESC para cerrar */
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  const filled = useMemo(() => {
    if (!row) return { sql: "", missing: [] as ParamRole[] };
    return fillQueryTemplate(row.sql_template, values);
  }, [row, values]);

  const relatedRows = useMemo(() => {
    if (!row || row.queries_relacionadas.length === 0) return [];
    const set = new Set(row.queries_relacionadas);
    return rows.filter((r) => set.has(r.id));
  }, [row, rows]);

  const handleCopy = async (mode: "ready" | "raw") => {
    if (!row) return;
    const text = mode === "ready" ? filled.sql : row.sql_template;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(mode);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  };

  const setVal = (role: ParamRole, v: string) =>
    setValues((prev) => ({ ...prev, [role]: v }));

  return (
    <AnimatePresence>
      {row && (
        <>
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
              width: "min(680px, 94vw)",
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
                padding: "18px 22px",
                borderBottom: `1px solid ${S.border}`,
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  <MiniPill color={PRODUCTO_COLOR[row.producto]} label={row.producto} />
                  <MiniPill color={FUENTE_COLOR[row.fuente]} label={FUENTE_LABEL[row.fuente]} />
                  {row.drift_detected_at && (
                    <MiniPill color={DRIFT_AMBER} label="⚠ Pendiente de validar" />
                  )}
                </div>
                <h2
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    margin: 0,
                    lineHeight: 1.3,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {row.nombre}
                </h2>
                {row.descripcion_csm && (
                  <p
                    style={{
                      fontSize: 13,
                      color: S.muted,
                      margin: "8px 0 0",
                      lineHeight: 1.5,
                    }}
                  >
                    {row.descripcion_csm}
                  </p>
                )}
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
                  flexShrink: 0,
                }}
                title="Cerrar (Esc)"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px 22px 28px",
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              {/* Nota importante — plegada por defecto */}
              {row.nota_importante && (
                <div
                  style={{
                    background: "rgba(245,158,11,0.06)",
                    border: `1px solid ${DRIFT_AMBER}30`,
                    borderRadius: 10,
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  <button
                    onClick={() => setShowNota((v) => !v)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 14px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: DRIFT_AMBER,
                      fontSize: 12,
                      fontWeight: 600,
                      fontFamily: "inherit",
                    }}
                  >
                    <Info size={14} />
                    <span style={{ flex: 1, textAlign: "left" }}>Antes de usarla — nota importante</span>
                    <ChevronDown
                      size={14}
                      style={{
                        transform: showNota ? "rotate(180deg)" : "none",
                        transition: "transform 0.18s",
                      }}
                    />
                  </button>
                  {showNota && (
                    <p
                      style={{
                        fontSize: 12.5,
                        lineHeight: 1.55,
                        color: S.text,
                        margin: 0,
                        padding: "0 14px 12px",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {row.nota_importante}
                    </p>
                  )}
                </div>
              )}

              {/* ── Completa para correr ── */}
              {fields.length > 0 && (
                <section>
                  <SectionTitle>Completa para correr</SectionTitle>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        fields.length > 1 ? "repeat(2, minmax(0, 1fr))" : "1fr",
                      gap: 10,
                    }}
                  >
                    {fields.map((f) => (
                      <ParamField
                        key={f.role}
                        field={f}
                        value={values[f.role] ?? ""}
                        onChange={(v) => setVal(f.role, v)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* ── Copiar + SQL en vivo ── */}
              <section>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <SectionTitle noMargin>
                    {fields.length > 0 ? "SQL listo (con tus valores)" : "SQL"}
                  </SectionTitle>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      onClick={() => handleCopy("raw")}
                      title="Copia la plantilla original con los placeholders sin reemplazar"
                      style={{
                        background: "transparent",
                        border: `1px solid ${S.border}`,
                        color: S.muted,
                        borderRadius: 8,
                        padding: "5px 10px",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      {copied === "raw" ? <Check size={11} /> : <Copy size={11} />}
                      Plantilla
                    </button>
                    <button
                      onClick={() => handleCopy("ready")}
                      style={{
                        background: copied === "ready" ? "rgba(34,197,94,0.12)" : `${VIOLET}1A`,
                        border: `1px solid ${
                          copied === "ready" ? "#22C55E50" : `${VIOLET}50`
                        }`,
                        color: copied === "ready" ? "#22C55E" : "#C4B3FF",
                        borderRadius: 8,
                        padding: "5px 12px",
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                      }}
                    >
                      {copied === "ready" ? <Check size={12} /> : <Copy size={12} />}
                      {copied === "ready" ? "Copiado" : "Copiar SQL listo"}
                    </button>
                  </div>
                </div>

                {filled.missing.length > 0 && (
                  <div
                    style={{
                      fontSize: 11,
                      color: DRIFT_AMBER,
                      marginBottom: 8,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <AlertTriangle size={11} />
                    Faltan: {filled.missing.map((r) => ROLE_LABEL[r]).join(", ")} — quedan como{" "}
                    <code style={{ fontFamily: "ui-monospace, monospace" }}>{"<<…>>"}</code>
                  </div>
                )}

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
                    maxHeight: 340,
                    whiteSpace: "pre",
                    lineHeight: 1.55,
                  }}
                >
                  {filled.sql}
                </pre>
              </section>

              {/* ── Cuándo usarla ── */}
              {row.ejemplos_uso.length > 0 && (
                <section>
                  <SectionTitle>Cuándo usarla</SectionTitle>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {row.ejemplos_uso.map((ej, i) => (
                      <div
                        key={i}
                        style={{
                          background: "rgba(124,77,255,0.06)",
                          border: "1px solid rgba(124,77,255,0.22)",
                          borderRadius: 9,
                          padding: "9px 13px",
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
                </section>
              )}

              {/* ── Detalle técnico (plegado) ── */}
              <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 14 }}>
                <button
                  onClick={() => setShowTech((v) => !v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    background: "transparent",
                    border: "none",
                    color: S.muted,
                    cursor: "pointer",
                    fontSize: 11.5,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    padding: 0,
                  }}
                >
                  <ChevronDown
                    size={13}
                    style={{
                      transform: showTech ? "rotate(180deg)" : "none",
                      transition: "transform 0.18s",
                    }}
                  />
                  Ver detalle técnico
                </button>

                {showTech && (
                  <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* slug */}
                    <TechRow label="Slug" value={row.slug} mono />

                    {/* descripción técnica */}
                    {row.descripcion && (
                      <div>
                        <SectionTitle>Descripción técnica</SectionTitle>
                        <p style={{ fontSize: 12.5, color: S.muted, lineHeight: 1.55, margin: 0 }}>
                          {row.descripcion}
                        </p>
                      </div>
                    )}

                    {/* parámetros crudos */}
                    {row.parametros.length > 0 && (
                      <div>
                        <SectionTitle>{`Parámetros (${row.parametros.length})`}</SectionTitle>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {row.parametros.map((p) => (
                            <div
                              key={p.name}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                fontSize: 11.5,
                                color: S.muted,
                                flexWrap: "wrap",
                              }}
                            >
                              <code style={{ color: "#FBBF24", fontFamily: "ui-monospace, monospace" }}>
                                {p.name}
                              </code>
                              <span style={{ opacity: 0.6 }}>{p.type}</span>
                              {p.required && <span style={{ color: "#F87171" }}>requerido</span>}
                              {p.description && <span>— {p.description}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* queries relacionadas */}
                    {relatedRows.length > 0 && (
                      <div>
                        <SectionTitle>Queries relacionadas</SectionTitle>
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
                                border: "1px solid rgba(124,77,255,0.22)",
                                borderRadius: 9,
                                padding: "8px 11px",
                                color: S.text,
                                fontSize: 12,
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              <ArrowRight size={12} color="#A78BFA" />
                              <span style={{ flex: 1 }}>{r.nombre}</span>
                              <MiniPill color={PRODUCTO_COLOR[r.producto]} label={r.producto} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* skills */}
                    {row.skill_referencias.length > 0 && (
                      <div>
                        <SectionTitle>Referencias en skills</SectionTitle>
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
                                padding: "3px 10px",
                                fontFamily: "ui-monospace, monospace",
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
                      </div>
                    )}

                    {/* metadatos */}
                    <div
                      style={{
                        fontSize: 10.5,
                        color: S.muted,
                        display: "flex",
                        flexDirection: "column",
                        gap: 3,
                        fontFamily: "ui-monospace, monospace",
                      }}
                    >
                      {row.workflow && <span>De: {row.workflow.workflow_name}</span>}
                      <span>
                        Creada por {row.creado_por} ·{" "}
                        {new Date(row.creado_en).toLocaleDateString("es-CO")}
                      </span>
                      {isAdmin && <span>Estado: {row.status}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─────────────── Subcomponentes ─────────────── */

function ParamField({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
}) {
  const isDate =
    field.role === "fechaInicio" ||
    field.role === "fechaFin" ||
    field.role === "fechaCorte";
  const label = labelFromRole(field.role);
  const placeholder =
    field.role === "clientId"
      ? field.isArray
        ? "TCI001, TCI002…"
        : "TCIxxxxxxxxxxxx"
      : field.role === "flow"
      ? "IPFxxxx (opcional)"
      : field.role === "customTypes"
      ? "ALL"
      : "";

  const fullWidth = field.role === "clientId" && field.isArray;

  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        gridColumn: fullWidth ? "1 / -1" : undefined,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: S.muted }}>{label}</span>
      {field.isArray ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          style={inputStyle}
        />
      ) : (
        <input
          type={isDate ? "date" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
        />
      )}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#0B1426",
  border: `1px solid ${S.border}`,
  borderRadius: 9,
  padding: "9px 11px",
  fontSize: 12.5,
  color: S.text,
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  colorScheme: "dark",
};

function labelFromRole(role: ParamRole): string {
  return ROLE_LABEL[role] || "Valor";
}

function SectionTitle({
  children,
  noMargin,
}: {
  children: React.ReactNode;
  noMargin?: boolean;
}) {
  return (
    <h3
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: S.muted,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        margin: 0,
        marginBottom: noMargin ? 0 : 8,
      }}
    >
      {children}
    </h3>
  );
}

function TechRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 11.5, alignItems: "baseline" }}>
      <span style={{ color: S.muted, minWidth: 60 }}>{label}:</span>
      <span
        style={{
          color: S.text,
          fontFamily: mono ? "ui-monospace, monospace" : "inherit",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
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
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </span>
  );
}
