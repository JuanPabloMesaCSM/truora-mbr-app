import { Loader2 } from "lucide-react";
import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";

export interface CEFlowRow {
  flow_id: string;
  flow_name: string;
  total_procesos: number;
  tiene_vrf: boolean;
  tiene_outbound: boolean;
}

interface CEFlowSelectorProps {
  flows: CEFlowRow[];
  selectedFlows: Set<string>;
  setSelectedFlows: (s: Set<string>) => void;
  loading: boolean;
  dark?: boolean;
}

function formatNumber(n: number) {
  return n.toLocaleString("es-CL");
}

export function CEFlowSelector({ flows, selectedFlows, setSelectedFlows, loading, dark = false }: CEFlowSelectorProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Cargando flujos…
      </div>
    );
  }

  if (flows.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground px-3 py-2">
        No se encontraron flujos para este periodo
      </p>
    );
  }

  const allSelected = flows.every(f => selectedFlows.has(f.flow_id));

  const toggleAll = () => {
    setSelectedFlows(allSelected ? new Set() : new Set(flows.map(f => f.flow_id)));
  };

  const toggle = (id: string) => {
    const next = new Set(selectedFlows);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedFlows(next);
  };

  return (
    <div style={{ paddingTop: 8, paddingBottom: 4 }}>
      <button
        onClick={toggleAll}
        className="text-[10px] font-medium hover:underline"
        style={{ color: dark ? '#8892B8' : '#0891B2', marginBottom: 6, display: 'block' }}
      >
        {allSelected ? 'Desmarcar todos' : 'Seleccionar todos'}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
        {flows.map(f => (
          <label
            key={f.flow_id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              cursor: 'pointer', padding: '7px 8px', borderRadius: 8,
              background: selectedFlows.has(f.flow_id)
                ? (dark ? '#0891B215' : '#0891B20A')
                : 'transparent',
              border: `1px solid ${selectedFlows.has(f.flow_id)
                ? (dark ? '#0891B240' : '#0891B225')
                : (dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)')}`,
              transition: 'all 0.12s',
            }}
            onClick={e => e.stopPropagation()}
          >
            <AnimatedCheckbox
              checked={selectedFlows.has(f.flow_id)}
              onCheckedChange={() => toggle(f.flow_id)}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ fontSize: 12, color: dark ? '#EEF0FF' : undefined, margin: 0, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.flow_name || f.flow_id}
                </p>
                {f.tiene_vrf && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#0891B215', color: '#0891B2', flexShrink: 0 }}>
                    VRF
                  </span>
                )}
              </div>
              <p style={{ fontSize: 10, color: dark ? '#8892B8' : '#94A3B8', margin: 0, lineHeight: 1.3 }}>
                {formatNumber(f.total_procesos)} procesos en el período
              </p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
