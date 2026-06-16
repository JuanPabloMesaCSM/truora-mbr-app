/**
 * QueryBrowser — biblioteca visual del catálogo de queries.
 *
 * Aterrizaje = cards (no lista plana):
 *   · Por producto: DI / BGC / CE / Generales
 *   · Por fuente:   Snowflake / ClickHouse
 * Cada card: ícono + color + conteo, hover que levanta+ilumina, y al
 * hacer clic transiciona (framer-motion) a la vista enfocada de esa
 * categoría. La búsqueda es un atajo que muestra resultados directos.
 */

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ChevronRight,
  ArrowLeft,
  Fingerprint,
  ShieldCheck,
  MessageSquare,
  Boxes,
  Snowflake,
  Database,
  AlertTriangle,
} from "lucide-react";
import {
  S,
  FUENTE_LABEL,
  FUENTE_COLOR,
  PRODUCTO_COLOR,
} from "@/components/queries/types";
import type { QueryRow, QueryProducto, QueryFuente } from "@/components/queries/types";

interface Props {
  rows: QueryRow[];
  onSelect: (row: QueryRow) => void;
  isAdmin: boolean;
}

const VIOLET = "#7C4DFF";
const DRIFT_AMBER = "#F59E0B";

/* Categorías de la biblioteca */
type Category =
  | { kind: "producto"; value: QueryProducto }
  | { kind: "fuente"; value: QueryFuente }
  | { kind: "estado"; value: "pending" };

interface CardDef {
  cat: Category;
  name: string;
  sub: string;
  icon: React.ReactNode;
  color: string;
}

const PRODUCT_DEFS: CardDef[] = [
  {
    cat: { kind: "producto", value: "DI" },
    name: "Digital Identity",
    sub: "Validación de identidad",
    icon: <Fingerprint size={26} strokeWidth={1.8} />,
    color: PRODUCTO_COLOR.DI,
  },
  {
    cat: { kind: "producto", value: "BGC" },
    name: "Background Checks",
    sub: "Antecedentes y riesgo",
    icon: <ShieldCheck size={26} strokeWidth={1.8} />,
    color: PRODUCTO_COLOR.BGC,
  },
  {
    cat: { kind: "producto", value: "CE" },
    name: "Customer Engagement",
    sub: "Conversaciones WhatsApp",
    icon: <MessageSquare size={26} strokeWidth={1.8} />,
    color: PRODUCTO_COLOR.CE,
  },
  {
    cat: { kind: "producto", value: "GLOBAL" },
    name: "Generales",
    sub: "Cartera y diagnóstico",
    icon: <Boxes size={26} strokeWidth={1.8} />,
    color: VIOLET,
  },
];

/* Colores de card por fuente — íconos hacen la distinción (SF azul hielo / CH ámbar) */
const SOURCE_DEFS: CardDef[] = [
  {
    cat: { kind: "fuente", value: "snowflake" },
    name: "Snowflake",
    sub: "Análisis y detalle profundo",
    icon: <Snowflake size={26} strokeWidth={1.8} />,
    color: "#56B6E9",
  },
  {
    cat: { kind: "fuente", value: "clickhouse" },
    name: "ClickHouse",
    sub: "Consumo facturable",
    icon: <Database size={26} strokeWidth={1.8} />,
    color: "#FBBF24",
  },
];

function matchCat(r: QueryRow, cat: Category): boolean {
  if (cat.kind === "producto") return r.producto === cat.value;
  if (cat.kind === "fuente") return r.fuente === cat.value;
  return !!r.drift_detected_at;
}

function catLabel(cat: Category): string {
  if (cat.kind === "producto")
    return PRODUCT_DEFS.find((d) => matchCatValue(d.cat, cat))?.name ?? cat.value;
  if (cat.kind === "fuente") return FUENTE_LABEL[cat.value];
  return "Pendientes de validar";
}
function matchCatValue(a: Category, b: Category) {
  return a.kind === b.kind && a.value === b.value;
}
function catColor(cat: Category): string {
  if (cat.kind === "producto")
    return PRODUCT_DEFS.find((d) => matchCatValue(d.cat, cat))?.color ?? VIOLET;
  if (cat.kind === "fuente")
    return SOURCE_DEFS.find((d) => matchCatValue(d.cat, cat))?.color ?? VIOLET;
  return DRIFT_AMBER;
}

export default function QueryBrowser({ rows, onSelect, isAdmin }: Props) {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Category | null>(null);

  const countFor = useMemo(
    () => (cat: Category) => rows.filter((r) => matchCat(r, cat)).length,
    [rows]
  );

  const pendingCount = useMemo(
    () => rows.filter((r) => r.drift_detected_at).length,
    [rows]
  );

  const q = search.trim().toLowerCase();
  const searching = q.length > 0;

  const listRows = useMemo(() => {
    if (searching) {
      return rows.filter((r) =>
        [r.nombre, r.descripcion_csm ?? "", r.descripcion ?? "", r.slug, ...(r.ejemplos_uso ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    if (active) return rows.filter((r) => matchCat(r, active));
    return [];
  }, [rows, searching, q, active]);

  const view: "grid" | "list" = searching || active ? "list" : "grid";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Búsqueda protagonista ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: S.surface,
          border: `1px solid ${S.border}`,
          borderRadius: 14,
          padding: "16px 18px",
        }}
      >
        <Search size={19} color={VIOLET} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Busca una query… ej: consumo CE, rechazos DI por país, score BGC"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: S.text,
            fontSize: 15,
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
              fontSize: 11.5,
            }}
          >
            limpiar
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {view === "grid" ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            style={{ display: "flex", flexDirection: "column", gap: 22 }}
          >
            {/* Por producto */}
            <CardSection label="Por producto">
              {PRODUCT_DEFS.map((d, i) => (
                <LibraryCard
                  key={d.name}
                  def={d}
                  count={countFor(d.cat)}
                  index={i}
                  onClick={() => setActive(d.cat)}
                />
              ))}
            </CardSection>

            {/* Por fuente */}
            <CardSection label="Por fuente de datos">
              {SOURCE_DEFS.map((d, i) => (
                <LibraryCard
                  key={d.name}
                  def={d}
                  count={countFor(d.cat)}
                  index={i}
                  onClick={() => setActive(d.cat)}
                  wide
                />
              ))}
              {isAdmin && pendingCount > 0 && (
                <LibraryCard
                  def={{
                    cat: { kind: "estado", value: "pending" },
                    name: "Pendientes de validar",
                    sub: "Cambiaron en producción",
                    icon: <AlertTriangle size={26} strokeWidth={1.8} />,
                    color: DRIFT_AMBER,
                  }}
                  count={pendingCount}
                  index={2}
                  onClick={() => setActive({ kind: "estado", value: "pending" })}
                  wide
                />
              )}
            </CardSection>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            style={{ display: "flex", flexDirection: "column", gap: 14 }}
          >
            {/* Breadcrumb / header de categoría */}
            {!searching && active && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <button
                  onClick={() => setActive(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: S.muted,
                    background: "transparent",
                    border: `1px solid ${S.border}`,
                    borderRadius: 999,
                    padding: "6px 13px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <ArrowLeft size={13} />
                  Biblioteca
                </button>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 15,
                    fontWeight: 700,
                    color: S.text,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: catColor(active),
                    }}
                  />
                  {catLabel(active)}
                  <span style={{ fontSize: 12, fontWeight: 500, color: S.muted }}>
                    · {listRows.length} {listRows.length === 1 ? "query" : "queries"}
                  </span>
                </div>
              </div>
            )}

            {searching && (
              <div style={{ fontSize: 12, color: S.muted }}>
                {listRows.length} {listRows.length === 1 ? "resultado" : "resultados"} para “{search}”
              </div>
            )}

            <QueryList rows={listRows} onSelect={onSelect} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────── Sección de cards ─────────────── */

function CardSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: S.muted,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          margin: "0 0 12px 2px",
        }}
      >
        {label}
      </h3>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
          gap: 14,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ─────────────── Card individual ─────────────── */

function LibraryCard({
  def,
  count,
  index,
  onClick,
  wide,
}: {
  def: CardDef;
  count: number;
  index: number;
  onClick: () => void;
  wide?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const { color } = def;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.34, 1.4, 0.64, 1] }}
      whileTap={{ scale: 0.98 }}
      style={{
        position: "relative",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
        borderRadius: 16,
        padding: "20px 18px 16px",
        background: hov ? `${color}12` : `${color}07`,
        border: `1px solid ${hov ? `${color}55` : `${color}22`}`,
        boxShadow: hov
          ? `0 0 32px ${color}1F, 0 8px 26px rgba(0,0,0,0.3)`
          : "0 2px 12px rgba(0,0,0,0.18)",
        transform: hov ? "translateY(-4px)" : "translateY(0)",
        transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s, transform 0.2s",
        gridColumn: wide ? "span 1" : undefined,
        display: "flex",
        flexDirection: "column",
        gap: 0,
        color: S.text,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 13,
            background: `${color}18`,
            border: `1px solid ${color}30`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            transform: hov ? "scale(1.06)" : "scale(1)",
            transition: "transform 0.2s",
          }}
        >
          {def.icon}
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color,
            background: `${color}14`,
            border: `1px solid ${color}30`,
            borderRadius: 999,
            padding: "3px 10px",
          }}
        >
          {count}
        </span>
      </div>

      <p style={{ fontSize: 15.5, fontWeight: 700, color: S.text, margin: 0, lineHeight: 1.25 }}>
        {def.name}
      </p>
      <p style={{ fontSize: 12, color: S.muted, margin: "5px 0 0", lineHeight: 1.45 }}>
        {def.sub}
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          marginTop: 16,
          fontSize: 12,
          fontWeight: 600,
          color: hov ? color : S.muted,
          transition: "color 0.2s",
        }}
      >
        Explorar
        <motion.span animate={{ x: hov ? 3 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronRight size={14} />
        </motion.span>
      </div>
    </motion.button>
  );
}

/* ─────────────── Lista compacta enfocada ─────────────── */

function QueryList({ rows, onSelect }: { rows: QueryRow[]; onSelect: (r: QueryRow) => void }) {
  if (rows.length === 0) {
    return (
      <div
        style={{
          background: S.surface,
          border: `1px dashed ${S.border}`,
          borderRadius: 12,
          padding: "36px 20px",
          textAlign: "center",
          color: S.muted,
          fontSize: 13,
        }}
      >
        Sin resultados. Prueba otra palabra o preguntale a Oppy abajo a la derecha.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((row, i) => (
        <motion.button
          key={row.id}
          type="button"
          onClick={() => onSelect(row)}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i * 0.015, 0.25) }}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 13,
            background: S.surface,
            border: `1px solid ${S.border}`,
            borderRadius: 12,
            padding: "12px 16px 12px 18px",
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
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              borderRadius: "12px 0 0 12px",
              background: PRODUCTO_COLOR[row.producto],
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{row.nombre}</span>
              {row.drift_detected_at && (
                <span
                  style={{
                    fontSize: 9.5,
                    color: DRIFT_AMBER,
                    border: `1px solid ${DRIFT_AMBER}50`,
                    background: `${DRIFT_AMBER}15`,
                    borderRadius: 999,
                    padding: "1px 7px",
                    fontWeight: 600,
                  }}
                >
                  ⚠ pendiente
                </span>
              )}
            </div>
            {(row.descripcion_csm || row.descripcion) && (
              <div
                style={{
                  fontSize: 12,
                  color: S.muted,
                  lineHeight: 1.45,
                  marginTop: 3,
                  display: "-webkit-box",
                  WebkitLineClamp: 1,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {row.descripcion_csm || row.descripcion}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
            <Tag color={PRODUCTO_COLOR[row.producto]} label={row.producto} />
            <Tag color={FUENTE_COLOR[row.fuente]} label={FUENTE_LABEL[row.fuente]} subtle />
            <ChevronRight size={15} color={S.muted} />
          </div>
        </motion.button>
      ))}
    </div>
  );
}

function Tag({ color, label, subtle }: { color: string; label: string; subtle?: boolean }) {
  return (
    <span
      style={{
        background: subtle ? "rgba(255,255,255,0.04)" : `${color}1A`,
        border: `1px solid ${subtle ? S.border : `${color}40`}`,
        color: subtle ? S.muted : color,
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
