/**
 * Tabla principal del Query Repository.
 * - Búsqueda libre (nombre + descripción + tags + slug)
 * - Filtros pill por producto y fuente
 * - Click en fila → abre QueryDetailDrawer
 *
 * Shell: paleta S (dark) + framer-motion entradas escalonadas.
 */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Database, FileCode, ChevronRight, AlertTriangle } from "lucide-react";
import {
  S,
  FUENTE_LABEL,
  FUENTE_COLOR,
  PRODUCTO_COLOR,
  STATUS_COLOR,
  STATUS_LABEL,
} from "@/components/queries/types";
import type { QueryRow, QueryProducto, QueryFuente } from "@/components/queries/types";

type ProductoFilter = QueryProducto | "ALL";
type FuenteFilter = QueryFuente | "ALL";
type EstadoFilter = "ALL" | "pendiente" | "validada";

interface Props {
  rows: QueryRow[];
  onSelect: (row: QueryRow) => void;
  isAdmin: boolean;
}

const DRIFT_AMBER = "#F59E0B";

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} d`;
}

export default function QueryLibraryTable({ rows, onSelect, isAdmin }: Props) {
  const [search, setSearch] = useState("");
  const [productoFilter, setProductoFilter] = useState<ProductoFilter>("ALL");
  const [fuenteFilter, setFuenteFilter] = useState<FuenteFilter>("ALL");
  const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("ALL");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (productoFilter !== "ALL" && r.producto !== productoFilter) return false;
      if (fuenteFilter !== "ALL" && r.fuente !== fuenteFilter) return false;
      if (estadoFilter === "pendiente" && !r.drift_detected_at) return false;
      if (estadoFilter === "validada" && r.drift_detected_at) return false;
      if (q.length === 0) return true;

      const hay = [r.nombre, r.descripcion_csm ?? r.descripcion].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, productoFilter, fuenteFilter, estadoFilter]);

  const productos: ProductoFilter[] = ["ALL", "DI", "BGC", "CE", "GLOBAL"];
  const fuentes: FuenteFilter[] = ["ALL", "snowflake", "clickhouse"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── Filtros ───────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Search */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: S.surface,
            border: `1px solid ${S.border}`,
            borderRadius: 12,
            padding: "10px 14px",
          }}
        >
          <Search size={15} color={S.muted} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o descripción…"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: S.text,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                background: "transparent",
                border: "none",
                color: S.muted,
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              limpiar
            </button>
          )}
        </div>

        {/* Pills de filtro */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: S.muted, marginRight: 4 }}>Producto:</span>
          {productos.map((p) => (
            <Pill
              key={p}
              active={productoFilter === p}
              onClick={() => setProductoFilter(p)}
              color={p === "ALL" ? "#7C4DFF" : PRODUCTO_COLOR[p]}
              label={p === "ALL" ? "Todos" : p}
            />
          ))}
          <span style={{ fontSize: 11, color: S.muted, marginLeft: 12, marginRight: 4 }}>
            Fuente:
          </span>
          {fuentes.map((f) => (
            <Pill
              key={f}
              active={fuenteFilter === f}
              onClick={() => setFuenteFilter(f)}
              color={f === "ALL" ? "#7C4DFF" : FUENTE_COLOR[f]}
              label={f === "ALL" ? "Todas" : FUENTE_LABEL[f]}
            />
          ))}

          {isAdmin && (
            <>
              <span style={{ fontSize: 11, color: S.muted, marginLeft: 12, marginRight: 4 }}>
                Estado:
              </span>
              <Pill
                active={estadoFilter === "ALL"}
                onClick={() => setEstadoFilter("ALL")}
                color="#7C4DFF"
                label="Todos"
              />
              <Pill
                active={estadoFilter === "pendiente"}
                onClick={() => setEstadoFilter("pendiente")}
                color={DRIFT_AMBER}
                label="⚠ Pendiente de validar"
              />
              <Pill
                active={estadoFilter === "validada"}
                onClick={() => setEstadoFilter("validada")}
                color="#22C55E"
                label="✓ Validada"
              />
            </>
          )}
        </div>
      </div>

      {/* ── Tabla ────────────────────────────────────────────── */}
      <div
        style={{
          fontSize: 11,
          color: S.muted,
          textAlign: "right",
          paddingRight: 4,
        }}
      >
        {filtered.length} {filtered.length === 1 ? "query" : "queries"}
        {filtered.length !== rows.length && ` (de ${rows.length} totales)`}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((row, i) => (
          <motion.button
            key={row.id}
            type="button"
            onClick={() => onSelect(row)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.3) }}
            whileHover={{ y: -2 }}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 14,
              background: S.surface,
              border: `1px solid ${S.border}`,
              borderRadius: 14,
              padding: "14px 18px",
              textAlign: "left",
              cursor: "pointer",
              color: S.text,
              fontFamily: "inherit",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#1B2F4D";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = S.surface;
              e.currentTarget.style.borderColor = S.border;
            }}
          >
            {/* Barra vertical de acento por producto */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                borderRadius: "14px 0 0 14px",
                background: PRODUCTO_COLOR[row.producto],
              }}
            />

            {/* Icono fuente */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: `${FUENTE_COLOR[row.fuente]}1A`,
                border: `1px solid ${FUENTE_COLOR[row.fuente]}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {row.fuente === "supabase" ? (
                <Database size={16} color={FUENTE_COLOR[row.fuente]} />
              ) : (
                <FileCode size={16} color={FUENTE_COLOR[row.fuente]} />
              )}
            </div>

            {/* Contenido */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{row.nombre}</span>
                <MiniPill color={PRODUCTO_COLOR[row.producto]} label={row.producto} />
                <MiniPill color={FUENTE_COLOR[row.fuente]} label={FUENTE_LABEL[row.fuente]} />
                {row.drift_detected_at && (
                  <MiniPill
                    color={DRIFT_AMBER}
                    label="⚠ Pendiente de validar"
                    icon={<AlertTriangle size={9} />}
                  />
                )}
                {isAdmin && row.status !== "approved" && (
                  <MiniPill color={STATUS_COLOR[row.status]} label={STATUS_LABEL[row.status]} />
                )}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: S.muted,
                  lineHeight: 1.45,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {row.descripcion_csm || row.descripcion}
              </div>
              {row.workflow && (
                <div
                  style={{
                    marginTop: 7,
                    fontSize: 10.5,
                    color: S.muted,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  }}
                >
                  De: <span style={{ color: "#A78BFA" }}>{row.workflow.workflow_name}</span>
                  <span style={{ margin: "0 6px", opacity: 0.5 }}>·</span>
                  Última sync {timeAgo(row.workflow.last_synced_at)}
                </div>
              )}
            </div>

            <ChevronRight size={16} color={S.muted} style={{ flexShrink: 0 }} />
          </motion.button>
        ))}

        {filtered.length === 0 && (
          <div
            style={{
              background: S.surface,
              border: `1px dashed ${S.border}`,
              borderRadius: 14,
              padding: "40px 20px",
              textAlign: "center",
              color: S.muted,
              fontSize: 13,
            }}
          >
            Sin resultados para los filtros actuales.
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────── Pills internos ─────────────── */

function Pill({
  active,
  onClick,
  color,
  label,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? `${color}1F` : "transparent",
        border: `1px solid ${active ? `${color}50` : S.border}`,
        color: active ? S.text : S.muted,
        borderRadius: 999,
        padding: "6px 13px",
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
        letterSpacing: "0.02em",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

function MiniPill({
  color,
  label,
  icon,
}: {
  color: string;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <span
      style={{
        background: `${color}1F`,
        border: `1px solid ${color}50`,
        color,
        borderRadius: 999,
        padding: "1px 8px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {icon}
      {label}
    </span>
  );
}
