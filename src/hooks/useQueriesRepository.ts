/**
 * Hook para leer queries_repository de Supabase.
 *
 * Carga 1 vez al mount, expone rows + loading + error + refetch.
 * No usa realtime (el catálogo cambia pocas veces al día).
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { QueryRow } from "@/components/queries/types";

export function useQueriesRepository() {
  const [rows, setRows] = useState<QueryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("queries_repository" as never)
      .select(
        "*, workflow:workflow_snapshots!workflow_id_origen(workflow_id,workflow_name,last_synced_at,drift_detected_at)"
      )
      .order("producto")
      .order("nombre");

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    // Las columnas jsonb/text[] vienen ya parseadas por supabase-js
    const parsed = ((data ?? []) as unknown as QueryRow[]).map((r) => ({
      ...r,
      tags: r.tags ?? [],
      ejemplos_uso: r.ejemplos_uso ?? [],
      skill_referencias: r.skill_referencias ?? [],
      parametros: Array.isArray(r.parametros) ? r.parametros : [],
      queries_relacionadas: Array.isArray(r.queries_relacionadas) ? r.queries_relacionadas : [],
    }));

    setRows(parsed);
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  return { rows, loading, error, refetch: fetchAll };
}
