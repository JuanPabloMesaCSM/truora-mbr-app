import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

/* =========================================================================
   Tipos
   ========================================================================= */

export type Categoria = "motivo" | "accion" | "contexto" | "seguimiento";

export interface ClienteNota {
  id: string;
  client_id_externo: string;
  cliente_id: string | null;
  boti_alerta_id: string | null;
  autor_email: string;
  categoria: Categoria;
  contenido: string;
  hubspot_engagement_id: string | null;
  creado_en: string;
  editado_en: string | null;
}

interface UseClienteNotasResult {
  notas: ClienteNota[];
  loading: boolean;
  error: string | null;
  addNota: (input: { contenido: string; cliente_id?: string | null; boti_alerta_id?: string | null }) => Promise<ClienteNota | null>;
  updateNota: (id: string, contenido: string) => Promise<boolean>;
  deleteNota: (id: string) => Promise<boolean>;
}

/* =========================================================================
   useClienteNotas — fetch + Realtime para UN cliente (modal 360)
   ========================================================================= */

/**
 * Carga las notas de un cliente por TCI y se suscribe a Realtime para que
 * cualquier cambio (otro CSM agrega/edita/borra) aparezca sin refresh.
 *
 * El TCI es la autoridad porque `cliente_id` está duplicado por el patrón
 * admin (Ana, JD) — usar TCI evita inconsistencias.
 */
export function useClienteNotas(tci: string | null): UseClienteNotasResult {
  const [notas, setNotas] = useState<ClienteNota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userEmailRef = useRef<string | null>(null);

  // Cargar email del usuario una vez para usarlo en INSERT.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) userEmailRef.current = data.session?.user?.email ?? null;
    });
    return () => { mounted = false; };
  }, []);

  // Fetch inicial + suscripción Realtime.
  useEffect(() => {
    if (!tci) {
      setNotas([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetchNotas = async () => {
      const { data, error } = await supabase
        .from("cliente_notas" as never)
        .select("*")
        .eq("client_id_externo", tci)
        .order("creado_en", { ascending: false });

      if (cancelled) return;
      if (error) {
        setError(error.message);
        setNotas([]);
      } else {
        setNotas((data ?? []) as ClienteNota[]);
      }
      setLoading(false);
    };

    fetchNotas();

    // Realtime — reaccionar a INSERT/UPDATE/DELETE filtrado por TCI.
    const channel = supabase
      .channel(`cliente_notas:${tci}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cliente_notas", filter: `client_id_externo=eq.${tci}` },
        (payload) => {
          if (cancelled) return;
          if (payload.eventType === "INSERT") {
            setNotas((prev) => {
              if (prev.find((n) => n.id === (payload.new as ClienteNota).id)) return prev;
              return [payload.new as ClienteNota, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            setNotas((prev) => prev.map((n) => (n.id === (payload.new as ClienteNota).id ? (payload.new as ClienteNota) : n)));
          } else if (payload.eventType === "DELETE") {
            setNotas((prev) => prev.filter((n) => n.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tci]);

  const addNota = useCallback<UseClienteNotasResult["addNota"]>(async ({ contenido, cliente_id, boti_alerta_id }) => {
    if (!tci) return null;
    const autor_email = userEmailRef.current;
    if (!autor_email) {
      setError("Sesión no disponible — recargá la página.");
      return null;
    }
    const { data, error } = await supabase
      .from("cliente_notas" as never)
      .insert({
        client_id_externo: tci,
        cliente_id: cliente_id ?? null,
        boti_alerta_id: boti_alerta_id ?? null,
        autor_email,
        contenido: contenido.trim(),
      } as never)
      .select()
      .single();

    if (error) {
      setError(error.message);
      return null;
    }
    const nueva = data as unknown as ClienteNota;
    // Realtime ya hace el setNotas pero por si llega lento dejamos el optimistic-ish:
    setNotas((prev) => {
      if (prev.find((n) => n.id === nueva.id)) return prev;
      return [nueva, ...prev];
    });
    return nueva;
  }, [tci]);

  const updateNota = useCallback<UseClienteNotasResult["updateNota"]>(async (id, contenido) => {
    const { error } = await supabase
      .from("cliente_notas" as never)
      .update({ contenido: contenido.trim() } as never)
      .eq("id", id);
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  }, []);

  const deleteNota = useCallback<UseClienteNotasResult["deleteNota"]>(async (id) => {
    const { error } = await supabase.from("cliente_notas" as never).delete().eq("id", id);
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  }, []);

  return { notas, loading, error, addNota, updateNota, deleteNota };
}

/* =========================================================================
   useNotasCounts — counts por TCI para badges en la tabla consolidada
   ========================================================================= */

/**
 * Devuelve un Record<tci, count> con la cantidad de notas que tiene cada TCI.
 * Suscrito a Realtime — si alguien agrega/borra una nota, los badges se
 * actualizan sin refresh.
 *
 * Pasa la lista de TCIs como dependencia: si cambia (filtro, nueva semana),
 * el hook re-fetcha.
 */
export function useNotasCounts(tcis: string[]): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const tcisKey = tcis.join(",");

  useEffect(() => {
    if (tcis.length === 0) {
      setCounts({});
      return;
    }

    let cancelled = false;

    const fetchCounts = async () => {
      const { data, error } = await supabase
        .from("cliente_notas" as never)
        .select("client_id_externo")
        .in("client_id_externo", tcis);

      if (cancelled || error) {
        if (error) console.warn("[useNotasCounts]", error.message);
        return;
      }
      const c: Record<string, number> = {};
      ((data ?? []) as unknown as Array<{ client_id_externo: string }>).forEach((row) => {
        c[row.client_id_externo] = (c[row.client_id_externo] ?? 0) + 1;
      });
      setCounts(c);
    };

    fetchCounts();

    // Realtime — escuchar TODOS los cambios de cliente_notas y actualizar
    // counts incrementalmente. No filtramos por TCI porque la lista puede
    // ser larga; dejamos que el `if (!tcis.includes...)` se encargue.
    const tciSet = new Set(tcis);
    const channel = supabase
      .channel(`cliente_notas:counts:${tcisKey.length}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cliente_notas" },
        (payload) => {
          if (cancelled) return;
          const newRow = payload.new as { client_id_externo?: string } | null;
          const oldRow = payload.old as { client_id_externo?: string } | null;
          const tci = newRow?.client_id_externo ?? oldRow?.client_id_externo;
          if (!tci || !tciSet.has(tci)) return;
          setCounts((prev) => {
            const next = { ...prev };
            if (payload.eventType === "INSERT") {
              next[tci] = (next[tci] ?? 0) + 1;
            } else if (payload.eventType === "DELETE") {
              const c = (next[tci] ?? 0) - 1;
              if (c <= 0) delete next[tci];
              else next[tci] = c;
            }
            // UPDATE no afecta counts.
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tcisKey]);

  return counts;
}
