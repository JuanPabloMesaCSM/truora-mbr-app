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
}

function formatNumber(n: number) {
  return n.toLocaleString("es-CL");
}

export function CEFlowSelector({ flows, selectedFlows, setSelectedFlows, loading }: CEFlowSelectorProps) {
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
    <div className="space-y-1.5 pl-10 pr-3 pb-2 pt-1">
      <button
        onClick={toggleAll}
        className="text-[10px] font-medium hover:underline"
        style={{ color: '#0891B2' }}
      >
        {allSelected ? 'Desmarcar todos' : 'Seleccionar todos'}
      </button>

      <div className="space-y-1 max-h-[180px] overflow-y-auto">
        {flows.map(f => (
          <label
            key={f.flow_id}
            className="flex items-start gap-2 cursor-pointer rounded-md p-1.5 hover:bg-muted/40 transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <AnimatedCheckbox
              checked={selectedFlows.has(f.flow_id)}
              onCheckedChange={() => toggle(f.flow_id)}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[12px] text-foreground truncate leading-tight">
                  {f.flow_name || f.flow_id}
                </p>
                {f.tiene_vrf && (
                  <span
                    className="text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: '#0891B215', color: '#0891B2' }}
                  >
                    VRF
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {formatNumber(f.total_procesos)} procesos en el período
              </p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
