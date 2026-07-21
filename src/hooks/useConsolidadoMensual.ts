import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ADMIN_EMAILS } from "@/components/botialertas/types";
import type { Alerta, Producto, Severidad } from "@/components/botialertas/types";

/**
 * Hook para la vista "Consolidado mensual" (admin-only) de /botialertas.
 *
 * Lee public.portfolio_consumption (snapshot billable escrito por el cron LMV
 * "Portfolio Consumption Sync") y, para un rango de meses [desde, hasta],
 * construye filas SINTÉTICAS con la MISMA forma que las alertas semanales
 * (Alerta) para poder reutilizar DashboardView sin duplicar el render.
 *
 * Métrica = TOTAL del período vs TOTAL del período anterior igual
 * (decisión de producto 2026-07-17, revisada):
 *   - valor_actual   = SUMA de todos los meses del rango [desde, hasta]
 *   - valor_anterior = SUMA del rango anterior de igual duración (justo antes)
 *   - variacion / severidad = classify(valor_actual, valor_anterior)  ← umbrales del cron
 *   - metricas_extra.trend = serie mensual [{mes, usage}] del rango (sparkline)
 *
 * Por qué TOTAL y no primer-vs-último mes: (1) es el consumo REAL del período
 * que el CSM valida (PEXTO ~2,17M en el semestre, no 706k de junio suelto);
 * (2) es robusto a los huecos históricos de portfolio_consumption — un mes
 * incompleto es despreciable dentro de una suma, pero destruía una razón
 * primer/último mes (enero 936 → +75.000% fake).
 *
 * Si el rango anterior cae ANTES del primer mes con datos, no hay base
 * comparable → valor_anterior=null, variacion=null (se muestra "sin base").
 *
 * Mapeo producto: validations→DI · checks→BGC · truconnect→CE
 * ('premium checks' se EXCLUYE: informativa, no aditiva. 'forms' fuera del v1.)
 *
 * Nombre/CSM se resuelven desde `clientes` (canónico), no del csm_owner.
 */

export type ClienteLite = {
  id: string;
  nombre: string;
  csm_email: string;
  client_id_di: string | null;
  client_id_bgc: string | null;
  client_id_ce: string | null;
};

export interface Rango {
  /** primer mes del rango, formato 'YYYY-MM-01' */
  desde: string;
  /** último mes del rango, formato 'YYYY-MM-01' */
  hasta: string;
}

/** Cómo se mide el crecimiento en el consolidado:
 *  - 'trayectoria': primer mes del rango vs último mes (¿cómo empezó vs terminó?).
 *    Ambos extremos están dentro del rango → nunca hay "sin base" global.
 *  - 'periodo-anterior': total del rango vs total del rango anterior de igual
 *    duración (reproduce el reporte trimestral: Q2 total vs Q1 total). */
export type ConsolidadoMode = "trayectoria" | "periodo-anterior";

interface PortfolioDbRow {
  client_id: string;
  client_name: string | null;
  product: string;
  usage: number | string;
  periodo_mes: string | null;
}

const PRODUCT_MAP: Record<string, Producto> = {
  validations: "DI",
  checks: "BGC",
  truconnect: "CE",
};

const VOLUME_FLOOR_CLASSIFY = 50;
const MESES_ABBR = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Espejo EXACTO de botialertas_classify_v6.js (cron) para bandas consistentes. */
function classify(curr: number, prev: number): {
  severidad: Severidad;
  variacion_pct: number | null;
  variacion_abs: number;
} {
  const c = Number.isFinite(curr) ? curr : 0;
  const p = Number.isFinite(prev) ? prev : 0;

  if (c < VOLUME_FLOOR_CLASSIFY && p < VOLUME_FLOOR_CLASSIFY) {
    return { severidad: "estable", variacion_pct: null, variacion_abs: c - p };
  }
  if (p === 0) return { severidad: "crecimiento", variacion_pct: null, variacion_abs: c };
  if (c === 0) return { severidad: "critica", variacion_pct: -100, variacion_abs: -p };

  const variacion = ((c - p) / p) * 100;
  let severidad: Severidad;
  if (variacion <= -50) severidad = "critica";
  else if (variacion <= -30) severidad = "fuerte";
  else if (variacion <= -10) severidad = "leve";
  else if (variacion < 30) severidad = "estable";
  else severidad = "crecimiento";

  return { severidad, variacion_pct: Math.round(variacion * 10) / 10, variacion_abs: c - p };
}

/** 'YYYY-MM-01' → 'YYYY-MM-DD' (último día del mes, sin corrimiento de TZ) */
function lastDayOfMonth(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

/** Secuencia de meses 'YYYY-MM-01' entre desde y hasta (inclusive). */
function monthRange(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let [y, m] = desde.split("-").map(Number);
  const [hy, hm] = hasta.split("-").map(Number);
  for (let i = 0; i < 60; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    if (y === hy && m === hm) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Desplaza un mes 'YYYY-MM-01' por `delta` meses (puede ser negativo). */
function addMonths(mes: string, delta: number): string {
  let [y, m] = mes.split("-").map(Number);
  m += delta;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** "Ene–Jun 2026" o "Jul 2025–Jun 2026" */
function fmtRangoCorto(desde: string, hasta: string): string {
  const [dy, dm] = desde.split("-").map(Number);
  const [hy, hm] = hasta.split("-").map(Number);
  if (dy === hy) return `${MESES_ABBR[dm - 1]}–${MESES_ABBR[hm - 1]} ${hy}`;
  return `${MESES_ABBR[dm - 1]} ${dy}–${MESES_ABBR[hm - 1]} ${hy}`;
}

/** "Ago 2025" — un solo mes. */
function fmtMesCorto(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES_ABBR[m - 1]} ${y}`;
}

/** TCI → cliente canónico (excluye admins para que gane el CSM real). */
function buildTciMap(clientes: ClienteLite[]) {
  const map: Record<string, { id: string; nombre: string; csm_email: string; isAdmin: boolean }> = {};
  for (const c of clientes) {
    const isAdmin = ADMIN_EMAILS.has((c.csm_email ?? "").toLowerCase());
    for (const tci of [c.client_id_di, c.client_id_bgc, c.client_id_ce]) {
      if (!tci) continue;
      const existing = map[tci];
      if (!existing || (existing.isAdmin && !isAdmin)) {
        map[tci] = { id: c.id, nombre: c.nombre, csm_email: c.csm_email, isAdmin };
      }
    }
  }
  return map;
}

/** Total COMBINADO por cliente (suma de todos sus productos) — reproduce las
 *  tablas de top crecimiento/decrecimiento del reporte trimestral. */
export interface ClientTotal {
  cliente_id: string;
  nombre: string;
  csm_email: string | null;
  /** suma de todos los productos en el período actual */
  total_actual: number;
  /** suma en el período anterior (null si no hay base comparable) */
  total_anterior: number | null;
  variacion_pct: number | null;
  variacion_abs: number | null;
  severidad: Severidad;
  /** true = cliente nuevo / sin consumo comparable en el período anterior */
  sin_base: boolean;
  /** volumen mensual combinado del período actual (sparkline) */
  trend: { mes: string; usage: number }[];
  /** productos que consume (DI/BGC/CE) */
  productos: Producto[];
}

export interface ConsolidadoResult {
  /** Una fila sintética por (cliente × producto) — total del rango vs rango anterior. */
  rows: Alerta[];
  /** Una fila por (cliente × producto × mes) — trend para el sparkline. */
  allWeeksRows: Alerta[];
  /** Total combinado por cliente (todos los productos) — para las tablas del reporte. */
  clientTotals: ClientTotal[];
  meses: string[];
  /** Rango anterior de igual duración (para etiquetas). */
  prevRange: Rango;
  /** true si el rango anterior está dentro de los datos disponibles. */
  prevComparable: boolean;
  loading: boolean;
  error: string | null;
}

export function useConsolidadoMensual(
  rango: Rango,
  clientes: ClienteLite[],
  enabled: boolean,
  /** todos los meses con datos (ascendente) — para saber el piso de historia. */
  allMonths: string[],
  mode: ConsolidadoMode = "trayectoria"
): ConsolidadoResult {
  const [raw, setRaw] = useState<PortfolioDbRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rango anterior de igual duración, justo antes del actual.
  const meses = useMemo(() => monthRange(rango.desde, rango.hasta), [rango.desde, rango.hasta]);
  const prevRange = useMemo<Rango>(() => {
    const n = meses.length;
    const prevHasta = addMonths(rango.desde, -1);
    const prevDesde = addMonths(prevHasta, -(n - 1));
    return { desde: prevDesde, hasta: prevHasta };
  }, [rango.desde, meses.length]);
  const floor = allMonths.length ? allMonths[0] : rango.desde;
  const prevComparable = prevRange.desde >= floor;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Traemos desde el inicio del rango ANTERIOR (solo si el modo lo usa y es
    // comparable) hasta el fin del actual, en un solo fetch paginado.
    const fetchDesde = (mode === "periodo-anterior" && prevComparable) ? prevRange.desde : rango.desde;

    (async () => {
      try {
        const PAGE = 1000;
        const acc: PortfolioDbRow[] = [];
        let fromIdx = 0;
        let dbError: { message: string } | null = null;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await supabase
            .from("portfolio_consumption")
            .select("client_id, client_name, product, usage, periodo_mes")
            .gte("periodo_mes", fetchDesde)
            .lte("periodo_mes", rango.hasta)
            .in("product", ["validations", "checks", "truconnect"])
            .order("periodo_mes", { ascending: true })
            .order("client_id", { ascending: true })
            .order("product", { ascending: true })
            .range(fromIdx, fromIdx + PAGE - 1);

          if (cancelled) return;
          if (error) { dbError = error; break; }
          const batch = (data ?? []) as PortfolioDbRow[];
          for (const b of batch) acc.push(b);
          if (batch.length < PAGE) break;
          fromIdx += PAGE;
        }

        if (dbError) { setError(dbError.message); setRaw([]); setLoading(false); return; }
        setRaw(acc);
        setLoading(false);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setRaw([]);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [rango.desde, rango.hasta, prevRange.desde, prevComparable, enabled, mode]);

  const built = useMemo<Pick<ConsolidadoResult, "rows" | "allWeeksRows" | "clientTotals">>(() => {
    if (raw.length === 0) return { rows: [], allWeeksRows: [], clientTotals: [] };

    const tciMap = buildTciMap(clientes);
    const prevMeses = monthRange(prevRange.desde, prevRange.hasta);
    const mesDesde = meses[0];
    const mesHasta = meses[meses.length - 1];
    const labelActual = mode === "trayectoria" ? fmtMesCorto(mesHasta) : fmtRangoCorto(rango.desde, rango.hasta);
    const labelPrev = mode === "trayectoria"
      ? fmtMesCorto(mesDesde)
      : (prevComparable ? fmtRangoCorto(prevRange.desde, prevRange.hasta) : "sin base comparable");

    // (tci|prod) → { name, byMes }
    type Cell = { name: string; byMes: Record<string, number> };
    const cells = new Map<string, Cell>();
    for (const r of raw) {
      const prod = PRODUCT_MAP[r.product];
      if (!prod) continue;
      const mes = (r.periodo_mes ?? "").slice(0, 7) + "-01";
      const key = `${r.client_id}|${prod}`;
      let cell = cells.get(key);
      if (!cell) { cell = { name: r.client_name ?? r.client_id, byMes: {} }; cells.set(key, cell); }
      cell.byMes[mes] = (cell.byMes[mes] ?? 0) + Number(r.usage ?? 0);
    }

    const iniActual = mode === "trayectoria" ? `${mesHasta.slice(0, 7)}-01` : `${rango.desde.slice(0, 7)}-01`;
    const finActual = mode === "trayectoria" ? lastDayOfMonth(mesHasta) : lastDayOfMonth(rango.hasta);
    const iniPrevRow = mode === "trayectoria" ? `${mesDesde.slice(0, 7)}-01` : `${prevRange.desde.slice(0, 7)}-01`;
    const finPrevRow = mode === "trayectoria" ? lastDayOfMonth(mesDesde) : lastDayOfMonth(prevRange.hasta);

    const rows: Alerta[] = [];
    const allWeeksRows: Alerta[] = [];

    // Agregador COMBINADO por cliente (suma de todos sus productos).
    type ClientAgg = {
      cliente_id: string; nombre: string; csm_email: string | null;
      ta: number; tp: number; byMes: Record<string, number>; productos: Set<Producto>;
    };
    const clientAgg = new Map<string, ClientAgg>();

    for (const [key, cell] of cells) {
      const [tci, prodStr] = key.split("|");
      const prod = prodStr as Producto;

      const rangeTotal = meses.reduce((s, m) => s + (cell.byMes[m] ?? 0), 0);
      if (rangeTotal <= 0) continue; // sin actividad en el rango → fuera

      // Métrica según modo:
      //  - trayectoria: último mes vs primer mes del rango (cómo empezó vs terminó).
      //  - periodo-anterior: total del rango vs total del rango anterior.
      let totalActual: number;
      let totalAnterior: number;
      let sinBase: boolean;
      if (mode === "trayectoria") {
        totalActual = cell.byMes[mesHasta] ?? 0;    // último mes
        totalAnterior = cell.byMes[mesDesde] ?? 0;  // primer mes
        sinBase = totalAnterior === 0;              // sin consumo al inicio del rango
      } else {
        totalActual = rangeTotal;
        totalAnterior = prevComparable ? prevMeses.reduce((s, m) => s + (cell.byMes[m] ?? 0), 0) : 0;
        sinBase = !prevComparable || totalAnterior === 0;
      }

      const canon = tciMap[tci];
      const cliente_id = canon?.id ?? tci;
      const nombre = canon?.nombre ?? cell.name;
      const csm_email = canon?.csm_email ?? null;

      // Acumular en el combinado por cliente (misma métrica que la fila).
      let ca = clientAgg.get(cliente_id);
      if (!ca) { ca = { cliente_id, nombre, csm_email, ta: 0, tp: 0, byMes: {}, productos: new Set() }; clientAgg.set(cliente_id, ca); }
      ca.ta += totalActual;
      ca.tp += totalAnterior;
      ca.productos.add(prod);
      for (const m of meses) ca.byMes[m] = (ca.byMes[m] ?? 0) + (cell.byMes[m] ?? 0);

      const cls = sinBase
        ? { severidad: "estable" as Severidad, variacion_pct: null as number | null, variacion_abs: null as number | null }
        : classify(totalActual, totalAnterior);

      const trend = meses.map((m) => ({ mes: m, usage: cell.byMes[m] ?? 0 }));

      rows.push({
        id: `${tci}|${prod}|consolidado`,
        cliente_id,
        client_id_externo: tci,
        producto: prod,
        periodo_actual_inicio: iniActual,
        periodo_actual_fin: finActual,
        periodo_anterior_inicio: iniPrevRow,
        periodo_anterior_fin: finPrevRow,
        valor_actual: totalActual,
        valor_anterior: sinBase ? null : totalAnterior,
        variacion_pct: cls.variacion_pct,
        variacion_abs: cls.variacion_abs,
        severidad: cls.severidad,
        metricas_extra: {
          consolidado: true,
          modo: mode,
          prev_comparable: mode === "trayectoria" ? true : prevComparable,
          sin_base: sinBase,
          rango_actual_label: labelActual,
          rango_prev_label: labelPrev,
          promedio_mes: Math.round(rangeTotal / Math.max(1, meses.length)),
        },
        creado_en: "",
        is_adhoc: false,
        cliente: { nombre, csm_email },
      });

      // Historia mes a mes (trend del modal), solo del rango actual.
      let prevUsage = 0;
      meses.forEach((m, idx) => {
        const usage = cell.byMes[m] ?? 0;
        const mcls = idx === 0
          ? { variacion_pct: null as number | null, variacion_abs: usage }
          : classify(usage, prevUsage);
        allWeeksRows.push({
          id: `${tci}|${prod}|${m}`,
          cliente_id,
          client_id_externo: tci,
          producto: prod,
          periodo_actual_inicio: `${m.slice(0, 7)}-01`,
          periodo_actual_fin: lastDayOfMonth(m),
          periodo_anterior_inicio: "",
          periodo_anterior_fin: "",
          valor_actual: usage,
          valor_anterior: prevUsage,
          variacion_pct: mcls.variacion_pct,
          variacion_abs: mcls.variacion_abs,
          severidad: "estable",
          metricas_extra: {},
          creado_en: "",
          is_adhoc: false,
          cliente: { nombre, csm_email },
        });
        prevUsage = usage;
      });
    }

    // Combinado por cliente → ClientTotal[]
    const clientTotals: ClientTotal[] = [];
    for (const ca of clientAgg.values()) {
      const sinBase = mode === "trayectoria" ? ca.tp === 0 : (!prevComparable || ca.tp === 0);
      const cls = sinBase
        ? { severidad: "estable" as Severidad, variacion_pct: null as number | null, variacion_abs: null as number | null }
        : classify(ca.ta, ca.tp);
      clientTotals.push({
        cliente_id: ca.cliente_id,
        nombre: ca.nombre,
        csm_email: ca.csm_email,
        total_actual: ca.ta,
        total_anterior: sinBase ? null : ca.tp,
        variacion_pct: cls.variacion_pct,
        variacion_abs: cls.variacion_abs,
        severidad: cls.severidad,
        sin_base: sinBase,
        trend: meses.map((m) => ({ mes: m, usage: ca.byMes[m] ?? 0 })),
        productos: Array.from(ca.productos),
      });
    }
    clientTotals.sort((a, b) => b.total_actual - a.total_actual);

    return { rows, allWeeksRows, clientTotals };
  }, [raw, clientes, rango.desde, rango.hasta, prevRange.desde, prevRange.hasta, prevComparable, meses, mode]);

  return { ...built, meses, prevRange, prevComparable, loading, error };
}
