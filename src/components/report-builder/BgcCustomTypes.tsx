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
  dark?: boolean;
}

function formatNumber(n: number) {
  return n.toLocaleString("es-CL");
}

export function BgcCustomTypes({
  customTypes, selectedTypes, setSelectedTypes, loading, dark = false,
}: BgcCustomTypesProps) {
  const activeBg     = dark ? '#6C3FC512' : '#6C3FC508';
  const activeBorder = dark ? '#6C3FC550' : '#6C3FC540';
  const inactiveBg   = dark ? 'transparent' : 'transparent';
  const inactiveBorder = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';

  if (loading) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: dark ? '#4A5580' : undefined }}>
          Custom Types
        </p>
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
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: dark ? '#4A5580' : undefined }}>
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
                border: `0.5px solid ${checked ? activeBorder : inactiveBorder}`,
                background: checked ? activeBg : inactiveBg,
              }}
            >
              <AnimatedCheckbox
                checked={checked}
                onCheckedChange={() => toggle(t.custom_type)}
              />
              <span className="flex-1 text-xs font-medium truncate" style={{ color: dark ? '#EEF0FF' : undefined }}>
                {t.custom_type}
              </span>
              <span className="text-xs tabular-nums" style={{ color: dark ? '#EEF0FF' : undefined }}>
                {formatNumber(t.total_checks)}
              </span>
              <span className="text-[10px] tabular-nums w-[42px] text-right" style={{ color: dark ? '#8892B8' : undefined }}>
                ({t.pct_total.toFixed(1)}%)
              </span>
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
    </div>
  );
}
