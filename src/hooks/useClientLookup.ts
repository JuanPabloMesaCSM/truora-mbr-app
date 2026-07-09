import { useCallback, useMemo, useState } from "react";
import { PORTFOLIO_LOOKUP_WEBHOOK_URL } from "@/components/dashboard/types";
import type { PortfolioRow } from "./usePortfolioConsumption";

/**
 * Consulta EFÍMERA de cualquier Client ID (TCI), aunque NO esté en la cartera
 * del CSM. A diferencia de usePortfolioConsumption (que lee el snapshot
 * `portfolio_consumption` de Supabase escrito por el cron), este hook hace
 * una llamada on-demand al webhook n8n "Portfolio Client Lookup", que a su vez
 * pega al endpoint CH `81ef4b77` (query maestra de counters) con un solo
 * client_id y devuelve las filas SIN persistir nada.
 *
 * Finalidad: cuando preguntan por un cliente fuera de cartera, ver rápido qué
 * consume = qué hace. No se guarda en la base; es una sola consulta.
 *
 * Ventana: el endpoint trae los últimos 3 meses (desde marzo con la fecha
 * actual). El hook AGREGA todas las filas devueltas — NO filtra por el period
 * picker del Dashboard (ese picker es solo para la cartera). Así el lookup
 * cubre siempre todo el rango disponible (desde marzo en adelante). El rango
 * real cubierto se expone en `coveredFrom`/`coveredTo` para el subtítulo.
 */

/** Fila cruda por (mes, producto, sub-producto) que devuelve el webhook. */
interface RawLookupRow {
  periodo_mes: string;
  client_id: string;
  product: string;
  sub_product: string;
  usage: number | string;
  nota: string | null;
}

export function useClientLookup() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<RawLookupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const query = useCallback(async (tci: string) => {
    const id = tci.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setFetched(false);
    setClientId(id);
    setRawRows([]);
    try {
      const res = await fetch(PORTFOLIO_LOOKUP_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: id }),
      });
      if (!res.ok) throw new Error(`El webhook respondió HTTP ${res.status}`);
      const json = await res.json();
      // El nodo Respond to Webhook devuelve { rows: [...] } (o el array pelado
      // si se configuró distinto). Aceptamos ambas formas.
      const rows: RawLookupRow[] = Array.isArray(json?.rows)
        ? json.rows
        : Array.isArray(json)
        ? json
        : [];
      setRawRows(rows);
      setFetched(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setRawRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setClientId(null);
    setRawRows([]);
    setError(null);
    setFetched(false);
    setLoading(false);
  }, []);

  // Agrega TODAS las filas devueltas (todo el rango del endpoint) por
  // (client_id, product, sub_product), sumando usage y conservando la `nota`
  // del mes más reciente. Las filas-total ('checks completos'/'interacciones')
  // ya las descarta el Code node de n8n.
  const rows = useMemo<PortfolioRow[]>(() => {
    if (rawRows.length === 0) return [];

    type Acc = PortfolioRow & { _notaMes: string };
    const m = new Map<string, Acc>();

    for (const r of rawRows) {
      const periodoMes = String(r.periodo_mes ?? "").slice(0, 10);
      const sub = String(r.sub_product ?? "");
      const key = `${r.client_id}|${r.product}|${sub}`;
      const ex = m.get(key);
      const usageNum = Number(r.usage);
      const usageSafe = isFinite(usageNum) ? usageNum : 0;
      if (ex) {
        ex.usage += usageSafe;
        if (periodoMes > ex._notaMes) {
          ex.nota = (r.nota ?? null) as string | null;
          ex._notaMes = periodoMes;
        }
      } else {
        m.set(key, {
          client_id: String(r.client_id),
          client_name: null,
          csm_owner: null,
          product: String(r.product),
          sub_product: sub,
          usage: usageSafe,
          nota: (r.nota ?? null) as string | null,
          _notaMes: periodoMes,
        });
      }
    }

    return Array.from(m.values())
      .map(({ _notaMes, ...rest }) => rest)
      .sort((a, b) => b.usage - a.usage);
  }, [rawRows]);

  // Rango real cubierto por la data (min/max periodo_mes), para el subtítulo.
  const { coveredFrom, coveredTo } = useMemo(() => {
    let lo: string | null = null;
    let hi: string | null = null;
    for (const r of rawRows) {
      const pm = String(r.periodo_mes ?? "").slice(0, 10);
      if (!pm) continue;
      if (lo === null || pm < lo) lo = pm;
      if (hi === null || pm > hi) hi = pm;
    }
    return { coveredFrom: lo, coveredTo: hi };
  }, [rawRows]);

  // fetched + sin filas = TCI sin consumo / inválido.
  const notFound = fetched && !loading && !error && rows.length === 0;

  return {
    clientId,
    rows,
    loading,
    error,
    notFound,
    coveredFrom,
    coveredTo,
    query,
    clear,
    active: clientId !== null,
  };
}
