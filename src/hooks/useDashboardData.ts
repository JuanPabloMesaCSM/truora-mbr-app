import { useCallback, useEffect, useRef, useState } from "react";
import {
  DASHBOARD_DETAIL_WEBHOOK_URL,
  type DashboardResponse,
  type Producto,
} from "@/components/dashboard/types";

/**
 * Hook que dispara el webhook /dashboard-metrics-detail con los parámetros
 * elegidos por el CSM y maneja loading/error/data.
 *
 * El fetch se cancela con AbortController si los parámetros cambian antes
 * de que termine (evita race conditions cuando el user cambia cliente o
 * periodo mientras una request previa estaba en vuelo).
 *
 * Latencia esperada del backend: 30-60 s para los 3 productos en paralelo.
 *
 * Uso:
 *   const { data, loading, error, refetch } = useDashboardData(params);
 *   // params puede ser null cuando todavía no hay cliente seleccionado.
 */

export interface DashboardParams {
  clientIdDi: string | null;
  clientIdBgc: string | null;
  clientIdCe: string | null;
  fechaInicio: string;
  fechaFin: string;
  productos: Producto[];
  email: string;
}

interface State {
  data: DashboardResponse | null;
  loading: boolean;
  error: string | null;
}

export function useDashboardData(params: DashboardParams | null) {
  const [state, setState] = useState<State>({
    data: null,
    loading: false,
    error: null,
  });
  // ID del último fetch lanzado, para ignorar respuestas tardías.
  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (p: DashboardParams) => {
    // Cancelar fetch anterior si existe.
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const ac = new AbortController();
    abortRef.current = ac;
    const myId = ++reqIdRef.current;

    setState({ data: null, loading: true, error: null });

    try {
      const res = await fetch(DASHBOARD_DETAIL_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id_di: p.clientIdDi,
          client_id_bgc: p.clientIdBgc,
          client_id_ce: p.clientIdCe,
          fecha_inicio: p.fechaInicio,
          fecha_fin: p.fechaFin,
          productos: p.productos,
          email: p.email,
        }),
        signal: ac.signal,
      });

      if (!res.ok) {
        throw new Error(`Webhook respondió ${res.status}: ${res.statusText}`);
      }

      const json = (await res.json()) as DashboardResponse;

      // Si hubo otro fetch más reciente, descartar este resultado.
      if (myId !== reqIdRef.current) return;

      if (!json.ok) {
        throw new Error("El backend respondió ok=false");
      }

      setState({ data: json, loading: false, error: null });
    } catch (e) {
      if (myId !== reqIdRef.current) return;
      // Aborts no son errores reales — los ignoramos en silencio.
      if ((e as Error).name === "AbortError") return;
      setState({
        data: null,
        loading: false,
        error: (e as Error).message ?? "Error desconocido",
      });
    }
  }, []);

  // Disparar fetch cuando cambien los parámetros relevantes.
  useEffect(() => {
    if (!params) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    // Solo disparar si hay AL MENOS un client_id válido entre los productos pedidos.
    const hasAny =
      (params.productos.indexOf("DI") !== -1 && !!params.clientIdDi) ||
      (params.productos.indexOf("BGC") !== -1 && !!params.clientIdBgc) ||
      (params.productos.indexOf("CE") !== -1 && !!params.clientIdCe);
    if (!hasAny) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    run(params);
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    params?.clientIdDi,
    params?.clientIdBgc,
    params?.clientIdCe,
    params?.fechaInicio,
    params?.fechaFin,
    params && params.productos.join(","),
    params?.email,
  ]);

  const refetch = useCallback(() => {
    if (params) run(params);
  }, [params, run]);

  return { ...state, refetch };
}
