import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";

export interface CustomTypeRow {
  custom_type: string;
  total_checks: number;
  pct_total: number;
}

interface BgcCustomTypesProps {
  customTypes: CustomTypeRow[];
  selectedTypes: Set<string>;
  setSelectedTypes: (s: Set<string>) => void;
  loading: boolean;
}

function formatNumber(n: number) {
  return n.toLocaleString("es-CL");
}

export function BgcCustomTypes({
  customTypes, selectedTypes, setSelectedTypes, loading,
}: BgcCustomTypesProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Custom Types
        </p>
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
    );
  }

  if (customTypes.length < 2) return null;

  const allSelected = selectedTypes.size === customTypes.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedTypes(new Set());
    } else {
      setSelectedTypes(new Set(customTypes.map(t => t.custom_type)));
    }
  };

  const toggle = (ct: string) => {
    const next = new Set(selectedTypes);
    if (next.has(ct)) next.delete(ct); else next.add(ct);
    setSelectedTypes(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
        Custom Types
      </p>

      <div className="space-y-1">
        {customTypes.map(t => {
          const checked = selectedTypes.has(t.custom_type);
          return (
            <label
              key={t.custom_type}
              className="flex items-center gap-2.5 p-2 rounded-md cursor-pointer transition-all duration-150"
              style={{
                border: `0.5px solid ${checked ? '#6C3FC540' : 'rgba(0,0,0,0.06)'}`,
                background: checked ? '#6C3FC508' : 'transparent',
              }}
            >
              <AnimatedCheckbox
                checked={checked}
                onCheckedChange={() => toggle(t.custom_type)}
              />
              <span className="flex-1 text-xs font-medium text-foreground truncate">
                {t.custom_type}
              </span>
              <span className="text-xs tabular-nums text-foreground">
                {formatNumber(t.total_checks)}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground w-[42px] text-right">
                ({t.pct_total.toFixed(1)}%)
              </span>
            </label>
          );
        })}
      </div>

      <button
        onClick={toggleAll}
        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors pl-1"
      >
        {allSelected ? "Deseleccionar todos" : "Seleccionar todos"}
      </button>
    </div>
  );
}
