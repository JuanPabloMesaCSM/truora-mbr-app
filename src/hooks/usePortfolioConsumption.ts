import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { PeriodoSeleccion } from "@/components/dashboard/types";

/**
 * Lee public.portfolio_consumption (snapshot escrito por el cron LMV 6AM
 * "Portfolio Consumption Sync") y agrega por (client_id, product, sub_product)
 * sumando el `usage` de todos los meses dentro del rango elegido.
 *
 * Desde 2026-06-11 la tabla tiene grano SUB-PRODUCTO (product identifier):
 * cada fila es (mes, cliente, producto, sub_product). El hook devuelve filas
 * agregadas al grano (cliente, producto, sub_product); PortfolioTable las
 * agrupa por (cliente, producto) para la fila-header expandible.
 *
 * El total por producto = suma de sus sub-productos (las filas-total
 * 'checks completos'/'interacciones' NO se persisten — se descartan en el
 * Code node n8n para no doble-contar).
 *
 * `nota` se conserva del mes MÁS RECIENTE del rango (best-effort): es un
 * desglose fino por mes (manual review / message_category / check_type por
 * país) que no se puede sumar entre meses de forma limpia.
 *
 * RLS team-wide: cualquier email en `public.csm` puede leer la tabla.
 */
export interface PortfolioRow {
  client_id:   string;
  client_name: string | null;
  csm_owner:   string | null;
  product:     string;
  sub_product: string;
  usage:       number;
  /** NOTA del mes más reciente del rango (desglose fino, best-effort). */
  nota:        string | null;
}

export interface PortfolioMeta {
  ultimaActualizacion: string | null; // ISO timestamp del MAX(fecha_actualizado)
  filasOrigen:         number;        // filas crudas leídas antes de agregar
}

/** Fila cruda de `portfolio_consumption` (antes de agregar). */
interface PortfolioConsumptionDbRow {
  client_id:         string;
  client_name:       string | null;
  csm_owner:         string | null;
  product:           string;
  sub_product:       string | null;
  usage:             number | string;
  nota:              string | null;
  periodo_mes:       string | null;
  fecha_actualizado: string | null;
}

export function usePortfolioConsumption(periodo: PeriodoSeleccion) {
  const [rows, setRows]     = useState<PortfolioRow[]>([]);
  const [meta, setMeta]     = useState<PortfolioMeta>({ ultimaActualizacion: null, filasOrigen: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const inicioMes = firstOfMonth(periodo.inicio);
        const finMes    = firstOfMonth(periodo.fin);

        // Paginar: Supabase/PostgREST cortan en 1000 filas por request. Con grano
        // sub-producto + rangos largos (ej. "Último año" ≈ 5k filas) un solo fetch
        // dejaba clientes afuera (solo entraban los de las primeras 1000 filas).
        // Traemos TODO en páginas de 1000, ordenando por la PK para que el
        // paginado sea estable (sin huecos ni duplicados en los bordes de página).
        const PAGE = 1000;
        const raw: PortfolioConsumptionDbRow[] = [];
        let fromIdx = 0;
        let dbError: { message: string } | null = null;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await supabase
            .from("portfolio_consumption")
            .select("client_id, client_name, csm_owner, product, sub_product, usage, nota, periodo_mes, fecha_actualizado")
            .gte("periodo_mes", inicioMes)
            .lte("periodo_mes", finMes)
            .order("periodo_mes", { ascending: true })
            .order("client_id", { ascending: true })
            .order("product", { ascending: true })
            .order("sub_product", { ascending: true })
            .range(fromIdx, fromIdx + PAGE - 1);

          if (cancelled) return;
          if (error) { dbError = error; break; }

          const batch = (data ?? []) as PortfolioConsumptionDbRow[];
          for (const b of batch) raw.push(b);
          if (batch.length < PAGE) break;
          fromIdx += PAGE;
        }

        if (dbError) {
          setError(dbError.message);
          setRows([]);
          setMeta({ ultimaActualizacion: null, filasOrigen: 0 });
          setLoading(false);
          return;
        }

        // Agregar por (client_id, product, sub_product). Sumamos usage sobre los
        // meses del rango; para `nota` conservamos la del periodo_mes más reciente.
        type Acc = PortfolioRow & { _notaMes: string };
        const aggMap = new Map<string, Acc>();
        let ultActISO: string | null = null;

        for (const r of raw) {
          const subProduct = (r.sub_product ?? "") as string;
          const key = `${r.client_id}|${r.product}|${subProduct}`;
          const periodoMes = (r.periodo_mes ?? "") as string;
          const existing = aggMap.get(key);
          if (existing) {
            existing.usage += Number(r.usage);
            // nota del mes más reciente
            if (periodoMes > existing._notaMes) {
              existing.nota = (r.nota ?? null) as string | null;
              existing._notaMes = periodoMes;
            }
          } else {
            aggMap.set(key, {
              client_id:   r.client_id as string,
              client_name: (r.client_name ?? null) as string | null,
              csm_owner:   (r.csm_owner ?? null) as string | null,
              product:     r.product as string,
              sub_product: subProduct,
              usage:       Number(r.usage),
              nota:        (r.nota ?? null) as string | null,
              _notaMes:    periodoMes,
            });
          }
          if (r.fecha_actualizado && (!ultActISO || r.fecha_actualizado > ultActISO)) {
            ultActISO = r.fecha_actualizado as string;
          }
        }

        const aggRows: PortfolioRow[] = Array.from(aggMap.values())
          .map(({ _notaMes, ...rest }) => rest)
          .sort((a, b) => b.usage - a.usage);

        setRows(aggRows);
        setMeta({ ultimaActualizacion: ultActISO, filasOrigen: raw.length });
        setLoading(false);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setRows([]);
        setMeta({ ultimaActualizacion: null, filasOrigen: 0 });
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [periodo.inicio, periodo.fin]);

  return { rows, meta, loading, error };
}

/** "2026-03-15" → "2026-03-01" */
function firstOfMonth(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}
