import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { PeriodoSeleccion } from "@/components/dashboard/types";

/**
 * Agrega `public.portfolio_consumption` (snapshot del cron LMV 6AM
 * "Portfolio Consumption Sync") sobre TODA la cartera Oppy para la vista
 * "Oppy · Toda la cartera".
 *
 * A diferencia de `usePortfolioConsumption` (que colapsa los meses y agrupa
 * por cliente), este hook:
 *   - suma el `usage` de TODOS los clientes por (producto, sub_producto, mes)
 *   - conserva el grano mensual (para la tendencia de cada producto)
 *
 * `portfolio_consumption` YA ES la cartera Oppy (la whitelist del cron es la
 * unión dedup de los TCIs de `clientes`; los lookups efímeros de TCIs externos
 * NO se persisten). Por eso sumar todas las filas = total de la cartera, sin
 * doble conteo: cada TCI aparece una sola vez aunque lo compartan admins (RLS).
 *
 * Criterio de verdad (JP, 2026-06-11): cada producto/sub-producto debe COINCIDIR
 * con la suma del front Truora de cada cliente — es facturable (CH), no procesos.
 * Las filas-total ('checks completos'/'interacciones') no se persisten, así que
 * el total de un producto = suma de sus sub-productos.
 *
 * `enabled=false` evita el fetch cuando la vista Oppy no está activa.
 */

export interface OppySubAgg {
  sub_product: string;
  usage: number;
}

export interface OppyMonthRow {
  periodo: string;                 // YYYY-MM-01
  bySub: Record<string, number>;   // sub_product → usage del mes (toda la cartera)
  total: number;                   // suma de sub-productos del mes
}

export interface OppyProductAgg {
  product: string;                 // raw de portfolio_consumption (validations, checks, …)
  total: number;                   // suma del rango (todos los meses + sub-productos)
  subs: OppySubAgg[];              // sub-productos ordenados por usage desc
  monthly: OppyMonthRow[];         // tendencia mensual ordenada por periodo
}

export interface OppyCarteraMeta {
  ultimaActualizacion: string | null;
  filasOrigen: number;
  clientesCount: number;           // clientes distintos con consumo en el rango
}

interface DbRow {
  client_id:         string;
  product:           string;
  sub_product:       string | null;
  usage:             number | string;
  periodo_mes:       string | null;
  fecha_actualizado: string | null;
}

/** Orden canónico de productos: DI → BGC (base/premium/continuous) → CE → resto. */
const PRODUCT_ORDER = [
  "validations",
  "checks",
  "premium checks",
  "continuous checks",
  "truconnect",
  "zapsign",
  "document recognition",
  "forms",
];
function orderWeight(product: string): number {
  const i = PRODUCT_ORDER.indexOf(product.toLowerCase());
  return i === -1 ? 99 : i;
}

const EMPTY_META: OppyCarteraMeta = {
  ultimaActualizacion: null,
  filasOrigen: 0,
  clientesCount: 0,
};

export function useOppyCartera(periodo: PeriodoSeleccion, enabled: boolean) {
  const [products, setProducts] = useState<OppyProductAgg[]>([]);
  const [meta, setMeta]         = useState<OppyCarteraMeta>(EMPTY_META);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setProducts([]);
      setMeta(EMPTY_META);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const inicioMes = firstOfMonth(periodo.inicio);
        const finMes    = firstOfMonth(periodo.fin);

        // Paginar (PostgREST corta en 1000). Rangos largos × sub-producto ≈ 5k filas.
        const PAGE = 1000;
        const raw: DbRow[] = [];
        let fromIdx = 0;
        let dbError: { message: string } | null = null;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await supabase
            .from("portfolio_consumption")
            .select("client_id, product, sub_product, usage, periodo_mes, fecha_actualizado")
            .gte("periodo_mes", inicioMes)
            .lte("periodo_mes", finMes)
            .order("periodo_mes", { ascending: true })
            .order("client_id", { ascending: true })
            .order("product", { ascending: true })
            .order("sub_product", { ascending: true })
            .range(fromIdx, fromIdx + PAGE - 1);

          if (cancelled) return;
          if (error) { dbError = error; break; }

          const batch = (data ?? []) as DbRow[];
          for (const b of batch) raw.push(b);
          if (batch.length < PAGE) break;
          fromIdx += PAGE;
        }

        if (dbError) {
          setError(dbError.message);
          setProducts([]);
          setMeta(EMPTY_META);
          setLoading(false);
          return;
        }

        // Agregar por (producto, sub_producto, mes) sumando todos los clientes.
        const prodMap = new Map<string, {
          total: number;
          subTotals: Map<string, number>;
          monthMap: Map<string, Map<string, number>>; // mes → (sub → usage)
        }>();
        const clients = new Set<string>();
        let ultActISO: string | null = null;

        for (const r of raw) {
          const product = r.product;
          const sub = ((r.sub_product ?? "").trim()) || "—";
          const mes = (r.periodo_mes ?? "").slice(0, 10);
          const usage = Number(r.usage) || 0;
          if (r.client_id) clients.add(r.client_id);

          let pe = prodMap.get(product);
          if (!pe) {
            pe = { total: 0, subTotals: new Map(), monthMap: new Map() };
            prodMap.set(product, pe);
          }
          pe.total += usage;
          pe.subTotals.set(sub, (pe.subTotals.get(sub) ?? 0) + usage);

          let mm = pe.monthMap.get(mes);
          if (!mm) { mm = new Map(); pe.monthMap.set(mes, mm); }
          mm.set(sub, (mm.get(sub) ?? 0) + usage);

          if (r.fecha_actualizado && (!ultActISO || r.fecha_actualizado > ultActISO)) {
            ultActISO = r.fecha_actualizado;
          }
        }

        const productsAgg: OppyProductAgg[] = Array.from(prodMap.entries()).map(([product, pe]) => {
          const subs = Array.from(pe.subTotals.entries())
            .map(([sub_product, usage]) => ({ sub_product, usage }))
            .sort((a, b) => b.usage - a.usage);
          const months = Array.from(pe.monthMap.keys()).sort();
          const monthly: OppyMonthRow[] = months.map((mes) => {
            const mm = pe.monthMap.get(mes)!;
            const bySub: Record<string, number> = {};
            let total = 0;
            for (const [sub, u] of mm.entries()) { bySub[sub] = u; total += u; }
            return { periodo: mes, bySub, total };
          });
          return { product, total: pe.total, subs, monthly };
        });

        productsAgg.sort((a, b) => {
          const w = orderWeight(a.product) - orderWeight(b.product);
          return w !== 0 ? w : b.total - a.total;
        });

        setProducts(productsAgg);
        setMeta({
          ultimaActualizacion: ultActISO,
          filasOrigen: raw.length,
          clientesCount: clients.size,
        });
        setLoading(false);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setProducts([]);
        setMeta(EMPTY_META);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, periodo.inicio, periodo.fin]);

  return { products, meta, loading, error };
}

/** "2026-03-15" → "2026-03-01" */
function firstOfMonth(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}
