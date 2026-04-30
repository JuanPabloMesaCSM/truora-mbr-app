import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Severidad = "critica" | "fuerte" | "leve" | "estable" | "crecimiento";
export type Producto = "DI" | "BGC" | "CE";

export interface Alerta {
  id: string;
  cliente_id: string;
  client_id_externo: string;
  producto: Producto;
  periodo_actual_inicio: string;
  periodo_actual_fin: string;
  periodo_anterior_inicio: string;
  periodo_anterior_fin: string;
  valor_actual: number | null;
  valor_anterior: number | null;
  variacion_pct: number | null;
  variacion_abs: number | null;
  severidad: Severidad;
  metricas_extra: Record<string, unknown>;
  creado_en: string;
  cliente: { nombre: string; csm_email: string | null } | null;
}

/* Shell palette (matches WelcomeStep + canvas-mbr light/dark patterns) */
export const S = {
  surface: "#172840",
  surfaceHi: "#1B2F4D",
  surfaceLo: "#0F1B2D",
  border: "rgba(255,255,255,0.09)",
  borderHi: "rgba(255,255,255,0.16)",
  text: "#EEF0FF",
  muted: "#8892B8",
  dim: "#4A5580",
} as const;

export const SEV_ORDER: Record<Severidad, number> = {
  critica: 0,
  fuerte: 1,
  crecimiento: 2,
  leve: 3,
  estable: 4,
};

export const SEV_META: Record<Severidad, {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: LucideIcon;
}> = {
  critica:     { label: "Crítica",     color: "#EF4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.35)",  icon: TrendingDown },
  fuerte:      { label: "Fuerte",      color: "#F59E0B", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", icon: TrendingDown },
  crecimiento: { label: "Crecimiento", color: "#10B981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)", icon: TrendingUp   },
  leve:        { label: "Leve",        color: "#FBBF24", bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.28)", icon: Minus        },
  estable:     { label: "Estable",     color: "#94A3B8", bg: "rgba(148,163,184,0.10)",border: "rgba(148,163,184,0.25)",icon: Minus        },
};

/* Lenguaje cliente (Truora-domain) */
export const PROD_META: Record<Producto, {
  color: string;
  sigla: string;
  label: string;
  metricaPlural: string;
  emoji: string;
}> = {
  DI:  { color: "#00C9A7", sigla: "DI",  label: "Validaciones", metricaPlural: "validaciones",  emoji: "🛡️" },
  BGC: { color: "#6C3FC5", sigla: "BGC", label: "Checks",       metricaPlural: "checks",        emoji: "🔍" },
  CE:  { color: "#0891B2", sigla: "CE",  label: "WhatsApp",     metricaPlural: "conversaciones",emoji: "💬" },
};

export const SEV_LIST: Severidad[] = ["critica", "fuerte", "crecimiento", "leve", "estable"];
export const PROD_LIST: Producto[] = ["DI", "BGC", "CE"];

/* Formatters */
export function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(Number(n)).toLocaleString("es-CO");
}

export function fmtNumSigned(n: number | null | undefined): string {
  if (n == null) return "—";
  const v = Math.round(Number(n));
  const sign = v > 0 ? "+" : "";
  return sign + v.toLocaleString("es-CO");
}

export function fmtPct(p: number | null | undefined): string {
  if (p == null) return "—";
  const s = p > 0 ? "+" : "";
  return `${s}${Number(p).toFixed(1)}%`;
}

export function fmtRange(inicio: string, fin: string): string {
  const i = new Date(inicio);
  const f = new Date(fin);
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  return `${i.toLocaleDateString("es-CO", opts)} – ${f.toLocaleDateString("es-CO", opts)}`;
}

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

/** "Marzo" / "Abril" — sólo el mes, capitalizado */
export function fmtMonthLong(dateStr: string): string {
  // Parse YYYY-MM-DD to avoid timezone shenanigans (new Date("2026-03-31") en UTC se vuelve 30 marzo en BOG)
  const parts = dateStr.split("-");
  if (parts.length < 3) return "—";
  const m = Number(parts[1]);
  return MESES[m - 1] ?? "—";
}

/** "1–27 Abril 2026" */
export function fmtRangeHumano(inicio: string, fin: string): string {
  const pi = inicio.split("-");
  const pf = fin.split("-");
  if (pi.length < 3 || pf.length < 3) return "—";
  const dI = Number(pi[2]);
  const dF = Number(pf[2]);
  const m = Number(pf[1]);
  const y = pf[0];
  return `${dI}–${dF} ${MESES[m - 1] ?? ""} ${y}`;
}

export function fmtWeek(fin: string): string {
  return new Date(fin).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/* Aggregations helpers */
export function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? null : 0;
  return ((curr - prev) / prev) * 100;
}

/* For top movers: filter min volume to avoid noise (mirrors VOLUME_FLOOR_TELEGRAM=500) */
export const TOP_MOVERS_MIN_VOL = 500;

/* Admin emails: ven toda la cartera y pueden filtrar por CSM. No tienen
 * cartera real (RLS les abre la visibilidad, no csm_email). Centralizado
 * para que todos los componentes consulten esta misma lista. */
export const ADMIN_EMAILS = new Set<string>([
  "amarquez@truora.com",
  "jdiaz@truora.com",
]);
