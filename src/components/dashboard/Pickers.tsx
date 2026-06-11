import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, Check, AlertCircle } from "lucide-react";
import { S, PROD_META } from "@/components/botialertas/types";
import {
  PRESET_LABELS,
  TIPO_FALLO_LABELS,
  buildPreset,
  type Producto,
  type PeriodoPresetId,
  type PeriodoSeleccion,
  type ClienteRow,
  type TipoFallo,
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

/* ═══════════════════════════ ClientePicker (búsqueda por TCI + Enter) ═══════════════════════════ */

/**
 * Variante "search by TCI": el user pega un TCI completo y aprieta Enter.
 * El sistema busca contra `clientes.client_id_di/bgc/ce` y devuelve el cliente
 * canónico (preferiendo CSMs reales sobre admin-duplicates — mismo patrón
 * que el TCI override de BotiAlertas).
 *
 * Se usa en 2 sitios:
 *   - Panel central cuando NO hay cliente seleccionado (variant="hero")
 *   - Top bar cuando ya hay cliente (variant="compact")
 */
export type ClientePickerVariant = "hero" | "compact";

const ADMIN_EMAILS_DASH = new Set<string>(["jdiaz@truora.com"]);

/** Resuelve un TCI a un cliente canónico. Devuelve null si no matchea ningún cliente. */
export function resolveTci(clientes: ClienteRow[], tci: string): ClienteRow | null {
  const trimmed = tci.trim();
  if (!trimmed) return null;
  const matches = clientes.filter(
    (c) => c.client_id_di === trimmed || c.client_id_bgc === trimmed || c.client_id_ce === trimmed,
  );
  if (matches.length === 0) return null;
  // Preferir cliente real sobre admin-duplicate
  const noAdmin = matches.filter((c) => !ADMIN_EMAILS_DASH.has((c.csm_email ?? "").toLowerCase()));
  return noAdmin[0] ?? matches[0];
}

export function ClientePicker({
  clientes,
  selected,
  onSelect,
  variant = "compact",
}: {
  clientes: ClienteRow[];
  selected: ClienteRow | null;
  onSelect: (cliente: ClienteRow | null) => void;
  variant?: ClientePickerVariant;
}) {
  const [tciInput, setTciInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const accent = "#7C4DFF";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = resolveTci(clientes, tciInput);
    if (!found) {
      setError("No encontré ningún cliente con ese TCI.");
      return;
    }
    setError(null);
    setTciInput("");
    onSelect(found);
  }

  function handleClear() {
    setTciInput("");
    setError(null);
    onSelect(null);
  }

  /* ── Variant compact: pill para top bar cuando ya hay cliente ── */
  if (variant === "compact") {
    if (!selected) {
      // Caso edge: si no hay seleccionado pero estamos en compact, mostrar input pequeño
      return (
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 6 }}>
          <input
            placeholder="Pega el TCI + Enter"
            value={tciInput}
            onChange={(e) => { setTciInput(e.target.value); setError(null); }}
            style={{
              background: S.surface,
              border: `1px solid ${error ? "#EF4444" : S.border}`,
              color: S.text, padding: "7px 12px",
              borderRadius: 999, fontSize: 12, outline: "none",
              minWidth: 280,
            }}
          />
        </form>
      );
    }
    return (
      <button
        onClick={handleClear}
        style={pillStyle(true, accent)}
        title="Click para cambiar de cliente"
      >
        <Search size={12} />
        <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected.nombre}
        </span>
        <span style={{ color: S.dim, fontSize: 10, marginLeft: 4 }}>✕</span>
      </button>
    );
  }

  /* ── Variant hero: card central grande para landing del dashboard ── */
  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: 16,
        padding: "28px 32px",
        maxWidth: 620,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: accent,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Buscar cliente
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: S.text, marginBottom: 18 }}>
        Ingresa el CLIENT_ID y presiona Enter
      </div>
      <div style={{ position: "relative" }}>
        <Search
          size={14}
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: S.muted,
          }}
        />
        <input
          autoFocus
          placeholder="TCI..."
          value={tciInput}
          onChange={(e) => {
            setTciInput(e.target.value);
            setError(null);
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            background: S.surfaceLo,
            border: `1px solid ${error ? "#EF4444" : S.borderHi}`,
            color: S.text,
            padding: "13px 14px 13px 38px",
            borderRadius: 12,
            fontSize: 14,
            outline: "none",
            fontFamily: "ui-monospace, SF Mono, Menlo, monospace",
            transition: "border-color 0.15s",
          }}
        />
      </div>
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 10,
            fontSize: 12,
            color: "#FCA5A5",
          }}
        >
          <AlertCircle size={13} />
          {error}
        </div>
      )}
      <div
        style={{
          marginTop: 14,
          fontSize: 12,
          color: S.muted,
          lineHeight: 1.55,
        }}
      >
        El sistema busca el TCI contra DI, BGC y CE. Si lo encuentra, te muestra
        el cliente y todas las métricas del rango seleccionado abajo.
      </div>
    </form>
  );
}

/* ═══════════════════════════ PeriodoPicker ═══════════════════════════ */

const PRESET_ORDER: PeriodoPresetId[] = [
  "mes_actual",
  "mes_pasado",
  "ult_3_meses",
  "ult_12_meses",
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

/* ═══════════════════════════ TipoFalloPicker (filtro global) ═══════════════════════════ */

/** Toggle global declinados / expirados / ambos. Afecta principalmente las
 *  visuales 3 y 4 (razones DI tendencia + heatmap); en BGC y CE el filtro
 *  se ignora (no aplica a su naturaleza). */
export function TipoFalloPicker({
  value,
  onChange,
}: {
  value: TipoFallo;
  onChange: (v: TipoFallo) => void;
}) {
  const options: { id: TipoFallo; label: string; color: string }[] = [
    { id: "ambos",     label: "Todos",       color: "#7DD3FC" },
    { id: "declinado", label: "Rechazados",  color: "#F59E0B" },
    { id: "expirado",  label: "Abandonados", color: "#A78BFA" },
  ];
  return (
    <div style={{ display: "flex", gap: 4 }} title={TIPO_FALLO_LABELS[value]}>
      {options.map((o) => {
        const isSel = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              ...pillStyle(isSel, o.color),
              padding: "6px 11px",
            }}
          >
            <span style={{ fontSize: 11 }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
