import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarRange, ChevronDown, Check } from "lucide-react";
import { S } from "./types";
import type { Rango } from "@/hooks/useConsolidadoMensual";

/* Selector de rango de MESES para la vista "Consolidado mensual" (admin-only).
 * Presets (Últimos 6/12 meses, Q1, Q2) + rango personalizado desde–hasta.
 * Estilo pill/dropdown consistente con AdminCsmDropdown. */

const COLOR = "#7DD3FC"; // cyan BotiAlertas
const MESES_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function mesLabel(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES_ABBR[m - 1]} ${y}`;
}

/** 'YYYY-MM-DD' → primer día de su mes ('YYYY-MM-01'). El consolidado agrupa
 *  por mes, así que cualquier día elegido en el calendario se ancla al mes. */
function snapToMonth(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}

/** 'YYYY-MM-01' → último día del mes ('YYYY-MM-DD'), sin corrimiento de TZ. */
function lastDayOfMonth(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

/** Etiqueta compacta del rango: "Ene – Jun 2026" o "Jul 2025 – Jun 2026". */
export function rangoLabel(r: Rango): string {
  const [dy] = r.desde.split("-").map(Number);
  const [hy] = r.hasta.split("-").map(Number);
  if (dy === hy) {
    const dm = Number(r.desde.split("-")[1]);
    const hm = Number(r.hasta.split("-")[1]);
    return `${MESES_ABBR[dm - 1]} – ${MESES_ABBR[hm - 1]} ${hy}`;
  }
  return `${mesLabel(r.desde)} – ${mesLabel(r.hasta)}`;
}

interface QuarterPreset {
  key: string;
  label: string;
  rango: Rango;
}

/** Trimestres COMPLETOS presentes en los meses cerrados, más reciente primero.
 *  Un trimestre está completo si sus 3 meses están en `closed`. El período-
 *  anterior (auto en el hook) es el trimestre previo → Q2 vs Q1, etc. */
function buildQuarterPresets(closed: string[]): QuarterPreset[] {
  const set = new Set(closed);
  const seen = new Set<string>();
  const out: QuarterPreset[] = [];
  for (const mes of closed) {
    const [y, m] = mes.split("-").map(Number);
    const q = Math.ceil(m / 3);            // 1..4
    const key = `${y}-Q${q}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sm = (q - 1) * 3 + 1;            // mes inicial 1-based
    const m1 = `${y}-${String(sm).padStart(2, "0")}-01`;
    const m2 = `${y}-${String(sm + 1).padStart(2, "0")}-01`;
    const m3 = `${y}-${String(sm + 2).padStart(2, "0")}-01`;
    if (set.has(m1) && set.has(m2) && set.has(m3)) {
      out.push({ key, label: `Q${q} ${y}`, rango: { desde: m1, hasta: m3 } });
    }
  }
  out.sort((a, b) => (a.rango.desde < b.rango.desde ? 1 : -1)); // más reciente primero
  return out.slice(0, 6);
}

export default function RangePicker({
  rango, onChange, months,
}: {
  rango: Rango;
  onChange: (r: Rango) => void;
  /** todos los meses con datos, ascendente 'YYYY-MM-01' */
  months: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // Mes calendario en curso → se excluye de "meses cerrados" (dato parcial MTD).
  const hoyMes = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);
  const closed = useMemo(() => months.filter((m) => m < hoyMes), [months, hoyMes]);

  // Límites del calendario: primer día del primer mes con datos → último día del último.
  const minDay = months.length ? months[0] : undefined;
  const maxDay = months.length ? lastDayOfMonth(months[months.length - 1]) : undefined;

  const quarterPresets = useMemo(() => buildQuarterPresets(closed), [closed]);

  const activeKey = useMemo(() => {
    const p = quarterPresets.find((q) => q.rango.desde === rango.desde && q.rango.hasta === rango.hasta);
    return p ? p.key : "custom";
  }, [quarterPresets, rango]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12, fontWeight: 600, color: COLOR,
          background: `${COLOR}18`, border: `1px solid ${COLOR}40`,
          cursor: "pointer", padding: "7px 14px", borderRadius: 999,
          transition: "all 0.15s", minWidth: 200, justifyContent: "space-between",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarRange size={13} />
          <span>{rangoLabel(rango)}</span>
        </span>
        <ChevronDown size={13} style={{ transition: "transform 0.18s", transform: open ? "rotate(180deg)" : "none" }} />
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: "absolute", right: 0, top: "100%", marginTop: 8, minWidth: 288,
            background: S.surfaceHi, border: `1px solid ${S.borderHi}`, borderRadius: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,0.45)", padding: 8, zIndex: 20,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: S.dim, letterSpacing: "0.1em", textTransform: "uppercase", padding: "4px 8px 4px" }}>
            Trimestres
          </div>
          <div style={{ fontSize: 10, color: S.dim, padding: "0 8px 8px" }}>
            Cada trimestre se compara contra el anterior.
          </div>
          {quarterPresets.length === 0 && (
            <div style={{ fontSize: 11, color: S.muted, padding: "4px 12px 8px" }}>Sin trimestres completos aún.</div>
          )}
          {quarterPresets.map((p) => {
            const isSel = activeKey === p.key;
            return (
              <button
                key={p.key}
                onClick={() => { onChange(p.rango); setOpen(false); }}
                style={{
                  width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 8,
                  background: isSel ? `${COLOR}18` : "transparent", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 12, color: isSel ? COLOR : S.text, fontWeight: isSel ? 600 : 500,
                }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              >
                <span>{p.label}</span>
                {isSel && <Check size={13} color={COLOR} />}
              </button>
            );
          })}

          <div style={{ height: 1, background: S.border, margin: "8px 4px" }} />
          <div style={{ fontSize: 10, fontWeight: 700, color: S.dim, letterSpacing: "0.1em", textTransform: "uppercase", padding: "4px 8px 8px" }}>
            Personalizado
          </div>
          <div style={{ display: "flex", gap: 8, padding: "0 4px 2px", alignItems: "flex-end" }}>
            <DateField
              label="Desde" value={rango.desde} min={minDay} max={rango.hasta}
              onChange={(v) => onChange({ desde: v, hasta: v > rango.hasta ? v : rango.hasta })}
            />
            <DateField
              label="Hasta" value={rango.hasta} min={rango.desde} max={maxDay}
              onChange={(v) => onChange({ desde: v < rango.desde ? v : rango.desde, hasta: v })}
            />
          </div>
          <div style={{ fontSize: 10, color: S.dim, padding: "4px 8px 2px" }}>
            El consolidado agrupa por mes — el día que elijas se toma como el mes completo.
          </div>
        </motion.div>
      )}
    </div>
  );
}

function DateField({
  label, value, min, max, onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, color: S.muted, fontWeight: 600 }}>{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => { if (e.target.value) onChange(snapToMonth(e.target.value)); }}
        style={{
          background: S.surfaceLo, color: S.text, border: `1px solid ${S.border}`,
          borderRadius: 8, padding: "6px 8px", fontSize: 12, fontWeight: 600,
          colorScheme: "dark", cursor: "pointer",
        }}
      />
    </label>
  );
}
