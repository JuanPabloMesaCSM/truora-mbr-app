import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { PeriodoSeleccion } from "@/components/dashboard/types";

/**
 * Lee public.portfolio_consumption (snapshot escrito por el cron LMV 6AM
 * "Portfolio Consumption Sync") y agrega por (client_id, product) sumando
 * el `usage` de todos los meses dentro del rango elegido.
 *
 * Resultado: una fila por (cliente, producto) con el consumo total del rango.
 * Sin charts: sirve la vista panorámica del Dashboard de Cartera.
 *
 * RLS team-wide: cualquier email en `public.csm` puede leer la tabla.
 */
export interface PortfolioRow {
  client_id:   string;
  client_name: string | null;
  csm_owner:   string | null;
  product:     string;
  usage:       number;
}

export interface PortfolioMeta {
  ultimaActualizacion: string | null; // ISO timestamp del MAX(fecha_actualizado)
  filasOrigen:         number;        // filas crudas leídas antes de agregar
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

        const { data, error: dbError } = await supabase
          .from("portfolio_consumption")
          .select("client_id, client_name, csm_owner, product, usage, periodo_mes, fecha_actualizado")
          .gte("periodo_mes", inicioMes)
          .lte("periodo_mes", finMes);

        if (cancelled) return;

        if (dbError) {
          setError(dbError.message);
          setRows([]);
          setMeta({ ultimaActualizacion: null, filasOrigen: 0 });
          setLoading(false);
          return;
        }

        const raw = data ?? [];

        // Agregar por (client_id, product). Usamos client_name más reciente
        // (el cron lo refresca igual cada corrida; en práctica no varía dentro
        // del mismo cliente para el mismo rango).
        const aggMap = new Map<string, PortfolioRow>();
        let ultActISO: string | null = null;

        for (const r of raw) {
          const key = `${r.client_id}|${r.product}`;
          const existing = aggMap.get(key);
          if (existing) {
            existing.usage += Number(r.usage);
          } else {
            aggMap.set(key, {
              client_id:   r.client_id,
              client_name: r.client_name,
              csm_owner:   r.csm_owner,
              product:     r.product,
              usage:       Number(r.usage),
            });
          }
          if (r.fecha_actualizado && (!ultActISO || r.fecha_actualizado > ultActISO)) {
            ultActISO = r.fecha_actualizado;
          }
        }

        const aggRows = Array.from(aggMap.values()).sort((a, b) => b.usage - a.usage);
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
