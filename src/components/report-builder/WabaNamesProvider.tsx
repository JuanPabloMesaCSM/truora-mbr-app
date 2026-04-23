import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type WabaMap = Map<string, string>;

const WabaNamesContext = createContext<WabaMap>(new Map());

export function WabaNamesProvider({
  clientId,
  children,
}: {
  clientId?: string | null;
  children: React.ReactNode;
}) {
  const [map, setMap] = useState<WabaMap>(new Map());

  useEffect(() => {
    if (!clientId) {
      setMap(new Map());
      return;
    }
    let cancelled = false;
    supabase
      .from('waba_phone_names')
      .select('phone_number, friendly_name')
      .eq('client_id', clientId)
      .eq('activo', true)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setMap(new Map());
          return;
        }
        const next: WabaMap = new Map();
        for (const row of data) next.set(row.phone_number, row.friendly_name);
        setMap(next);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return <WabaNamesContext.Provider value={map}>{children}</WabaNamesContext.Provider>;
}

export function useWabaName(phone: string | undefined | null): string {
  const map = useContext(WabaNamesContext);
  if (!phone) return '—';
  return map.get(phone) || phone;
}

export function useWabaNamesMap(): WabaMap {
  return useContext(WabaNamesContext);
}
