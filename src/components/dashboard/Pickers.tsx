import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, Check } from "lucide-react";
import { S, PROD_META } from "@/components/botialertas/types";
import {
  PRESET_LABELS,
  buildPreset,
  type Producto,
  type PeriodoPresetId,
  type PeriodoSeleccion,
  type ClienteRow,
} from "./types";

/**
 * Pickers custom (no shadcn) para el top bar de /dashboard. Siguen el
 * patrón pill del CSM Center: borderRadius 999, fontSize 12-13, paleta S,
 * dropdown abosolute con click-outside + ESC.
 *
 * Tres pickers:
 *  - ClientePicker:  autocomplete sobre `clientes` activos
 *  - PeriodoPicker:  presets + custom rango con date inputs
 *  - ProductosPicker: multi-select DI/BGC/CE
 */

/* ─────────────────────────── Hook click-outside + ESC ─────────────────────────── */

function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open, onClose]);
  return ref;
}

/* ─────────────────────────── Pill base ─────────────────────────── */

function pillStyle(active: boolean, accent: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 600,
    color: active ? accent : S.muted,
    background: active ? `${accent}18` : "transparent",
    border: `1px solid ${active ? `${accent}50` : S.border}`,
    cursor: "pointer",
    padding: "7px 14px",
    borderRadius: 999,
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  };
}

/* ═══════════════════════════ ClientePicker ═══════════════════════════ */

export function ClientePicker({
  clientes,
  selectedId,
  onSelect,
}: {
  clientes: ClienteRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useClickOutside(open, () => setOpen(false));

  const selected = clientes.find((c) => c.id === selectedId) ?? null;

  const filtered = query
    ? clientes.filter((c) => c.nombre.toLowerCase().includes(query.toLowerCase()))
    : clientes;

  const accent = "#7C4DFF";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={pillStyle(!!selected, accent)}
      >
        <Search size={12} />
        <span>{selected ? selected.nombre : "Seleccionar cliente"}</span>
        <ChevronDown size={12} style={{ opacity: 0.7 }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0,
              minWidth: 280, maxHeight: 380,
              background: S.surface,
              border: `1px solid ${S.borderHi}`,
              borderRadius: 12,
              boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
              zIndex: 50,
              display: "flex", flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 10, borderBottom: `1px solid ${S.border}` }}>
              <input
                autoFocus
                placeholder="Buscar cliente…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: S.surfaceLo,
                  border: `1px solid ${S.border}`,
                  color: S.text, padding: "7px 10px",
                  borderRadius: 8, fontSize: 12,
                  outline: "none",
                }}
              />
            </div>
            <div style={{ overflowY: "auto", maxHeight: 320 }}>
              {selected && (
                <button
                  onClick={() => {
                    onSelect(null);
                    setOpen(false);
                    setQuery("");
                  }}
                  style={{
                    width: "100%", textAlign: "left",
                    padding: "9px 12px", fontSize: 12,
                    color: S.muted, background: "transparent",
                    border: "none", borderBottom: `1px solid ${S.border}`,
                    cursor: "pointer",
                  }}
                >
                  ✕ Limpiar selección
                </button>
              )}
              {filtered.length === 0 && (
                <div style={{ padding: 14, fontSize: 12, color: S.dim }}>
                  No hay coincidencias.
                </div>
              )}
              {filtered.map((c) => {
                const isSel = c.id === selectedId;
                const productos = [
                  c.client_id_di ? "DI" : null,
                  c.client_id_bgc ? "BGC" : null,
                  c.client_id_ce ? "CE" : null,
                ].filter(Boolean) as Producto[];
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      onSelect(c.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    style={{
                      width: "100%", textAlign: "left",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "9px 12px", fontSize: 12,
                      color: isSel ? accent : S.text,
                      background: isSel ? `${accent}10` : "transparent",
                      border: "none", cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSel) e.currentTarget.style.background = S.surfaceHi;
                    }}
                    onMouseLeave={(e) => {
                      if (!isSel) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.nombre}
                    </span>
                    <span style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 8 }}>
                      {productos.map((p) => (
                        <span
                          key={p}
                          style={{
                            fontSize: 9, fontWeight: 700,
                            color: PROD_META[p].color,
                            background: `${PROD_META[p].color}1A`,
                            padding: "2px 5px", borderRadius: 4,
                          }}
                        >
                          {p}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════ PeriodoPicker ═══════════════════════════ */

const PRESET_ORDER: PeriodoPresetId[] = [
  "mes_actual",
  "mes_pasado",
  "ult_3_meses",
  "ytd",
  "anio_completo",
  "custom",
];

export function PeriodoPicker({
  value,
  onChange,
}: {
  value: PeriodoSeleccion;
  onChange: (v: PeriodoSeleccion) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));
  const accent = "#7DD3FC";

  function buttonLabel(): string {
    if (value.preset !== "custom") return PRESET_LABELS[value.preset];
    return `${value.inicio} → ${value.fin}`;
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={pillStyle(true, accent)}
      >
        <span>{buttonLabel()}</span>
        <ChevronDown size={12} style={{ opacity: 0.7 }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12 }}
            style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0,
              minWidth: 240,
              background: S.surface,
              border: `1px solid ${S.borderHi}`,
              borderRadius: 12,
              boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
              zIndex: 50,
              overflow: "hidden",
            }}
          >
            {PRESET_ORDER.map((id) => {
              const isSel = value.preset === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    if (id === "custom") {
                      onChange({ ...value, preset: "custom" });
                      // dejamos abierto para que el user ajuste fechas
                    } else {
                      onChange(buildPreset(id));
                      setOpen(false);
                    }
                  }}
                  style={{
                    width: "100%", textAlign: "left",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 14px", fontSize: 12,
                    color: isSel ? accent : S.text,
                    background: isSel ? `${accent}10` : "transparent",
                    border: "none", cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSel) e.currentTarget.style.background = S.surfaceHi;
                  }}
                  onMouseLeave={(e) => {
                    if (!isSel) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {PRESET_LABELS[id]}
                  {isSel && <Check size={12} />}
                </button>
              );
            })}

            {value.preset === "custom" && (
              <div style={{ padding: 10, borderTop: `1px solid ${S.border}` }}>
                <label style={{ display: "block", fontSize: 11, color: S.muted, marginBottom: 4 }}>
                  Desde
                </label>
                <input
                  type="date"
                  value={value.inicio}
                  onChange={(e) => onChange({ ...value, inicio: e.target.value })}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: S.surfaceLo,
                    border: `1px solid ${S.border}`,
                    color: S.text, padding: "7px 10px",
                    borderRadius: 8, fontSize: 12, outline: "none",
                    marginBottom: 8,
                    colorScheme: "dark",
                  }}
                />
                <label style={{ display: "block", fontSize: 11, color: S.muted, marginBottom: 4 }}>
                  Hasta
                </label>
                <input
                  type="date"
                  value={value.fin}
                  onChange={(e) => onChange({ ...value, fin: e.target.value })}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: S.surfaceLo,
                    border: `1px solid ${S.border}`,
                    color: S.text, padding: "7px 10px",
                    borderRadius: 8, fontSize: 12, outline: "none",
                    colorScheme: "dark",
                  }}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════ ProductosPicker ═══════════════════════════ */

export function ProductosPicker({
  selected,
  available,
  onChange,
}: {
  selected: Set<Producto>;
  /** Productos para los que el cliente tiene client_id (los demás se deshabilitan) */
  available: Set<Producto>;
  onChange: (s: Set<Producto>) => void;
}) {
  function toggle(p: Producto) {
    const next = new Set(selected);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChange(next);
  }

  return (
    <div style={{ display: "flex", gap: 6 }}>
      {(["DI", "BGC", "CE"] as Producto[]).map((p) => {
        const isSel = selected.has(p);
        const isAvail = available.has(p);
        const meta = PROD_META[p];
        return (
          <button
            key={p}
            disabled={!isAvail}
            onClick={() => isAvail && toggle(p)}
            title={isAvail ? meta.label : `Cliente sin ${meta.label}`}
            style={{
              ...pillStyle(isSel && isAvail, meta.color),
              opacity: isAvail ? 1 : 0.35,
              cursor: isAvail ? "pointer" : "not-allowed",
              padding: "6px 11px",
            }}
          >
            <span style={{ fontSize: 11 }}>{meta.emoji}</span>
            <span>{meta.sigla}</span>
          </button>
        );
      })}
    </div>
  );
}
