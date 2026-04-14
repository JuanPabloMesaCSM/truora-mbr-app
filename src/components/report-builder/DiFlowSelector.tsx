import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";

export interface DiFlowRow {
  FLOW_ID: string;
  FLOW_NAME?: string | null;
  TOTAL_PROCESOS: number;
  USUARIOS_UNICOS: number;
  ULTIMO_USO: string;
}

interface DiFlowSelectorProps {
  flows: DiFlowRow[];
  selectedFlows: Set<string>;
  setSelectedFlows: (s: Set<string>) => void;
  loading: boolean;
  error: boolean;
  dark?: boolean;
}

function formatNumber(n: number) {
  return n.toLocaleString("es-CL");
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function DiFlowSelector({
  flows, selectedFlows, setSelectedFlows, loading, error, dark = false,
}: DiFlowSelectorProps) {
  const tc = dark ? '#8892B8' : undefined;
  const bc = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  const bg = dark ? '#161C38' : 'transparent';
  const activeBg = dark ? '#00C9A712' : '#00C9A708';
  const activeBorder = dark ? '#00C9A750' : '#00C9A740';

  if (loading) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: dark ? '#4A5580' : undefined }}>
          Flujos
        </p>
        <Skeleton className="h-8 w-full rounded-md" style={{ background: dark ? '#161C38' : undefined } as any} />
        <Skeleton className="h-8 w-full rounded-md" style={{ background: dark ? '#161C38' : undefined } as any} />
      </div>
    );
  }

  if (error && flows.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: dark ? '#4A5580' : undefined }}>
          Flujos
        </p>
        <p className="text-[10px] text-yellow-500">
          No se pudieron cargar los flujos — se incluirán todos.
        </p>
      </div>
    );
  }

  if (flows.length === 0) return null;

  const allSelected = selectedFlows.size === flows.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedFlows(new Set());
    } else {
      setSelectedFlows(new Set(flows.map(f => f.FLOW_ID)));
    }
  };

  const toggle = (id: string) => {
    const next = new Set(selectedFlows);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedFlows(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: tc ?? undefined, ...(tc ? {} : { color: undefined }) }} {...(!tc ? { className: 'text-[10px] font-semibold text-muted-foreground uppercase tracking-widest' } : {})}>
        Flujos
      </p>

      <div className="space-y-1">
        {flows.map(f => {
          const checked = selectedFlows.has(f.FLOW_ID);
          return (
            <label
              key={f.FLOW_ID}
              className="flex items-start gap-2.5 p-2 rounded-md cursor-pointer transition-all duration-150"
              style={{
                border: `0.5px solid ${checked ? activeBorder : bc}`,
                background: checked ? activeBg : bg,
              }}
            >
              <div className="pt-0.5">
                <AnimatedCheckbox
                  checked={checked}
                  onCheckedChange={() => toggle(f.FLOW_ID)}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] truncate leading-tight" style={{ color: dark ? '#EEF0FF' : undefined }}>
                  {f.FLOW_NAME ? f.FLOW_NAME : f.FLOW_ID.length > 12 ? f.FLOW_ID.slice(0, 12) + '…' : f.FLOW_ID}
                </p>
                <p className="text-[11px] leading-snug mt-0.5" style={{ color: '#8892B8' }}>
                  {formatNumber(f.TOTAL_PROCESOS)} procesos en el período
                </p>
              </div>
            </label>
          );
        })}
      </div>

      <button
        onClick={toggleAll}
        className="text-[10px] transition-colors pl-1"
        style={{ color: dark ? '#4A5580' : undefined }}
      >
        {allSelected ? "Deseleccionar todos" : "Seleccionar todos"}
      </button>

      <p className="text-[10px] text-muted-foreground pl-1">
        Desmarca los flujos de prueba para excluirlos del reporte.
      </p>
    </div>
  );
}
