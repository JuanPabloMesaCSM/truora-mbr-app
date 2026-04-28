import { Loader2 } from "lucide-react";
import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";

export interface CEWabaRow {
  waba: string;
  total_mensajes: number;
  ultimo_uso?: string | null;
}

interface CEWabaSelectorProps {
  wabas: CEWabaRow[];
  selectedWabas: Set<string>;
  setSelectedWabas: (s: Set<string>) => void;
  loading: boolean;
  dark?: boolean;
}

function formatNumber(n: number) {
  return (n ?? 0).toLocaleString("es-CL");
}

export function CEWabaSelector({ wabas, selectedWabas, setSelectedWabas, loading, dark = false }: CEWabaSelectorProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Cargando líneas…
      </div>
    );
  }

  if (wabas.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground px-3 py-2">
        No se encontraron líneas WhatsApp para este periodo
      </p>
    );
  }

  const allSelected = wabas.every(w => selectedWabas.has(w.waba));

  const toggleAll = () => {
    setSelectedWabas(allSelected ? new Set() : new Set(wabas.map(w => w.waba)));
  };

  const toggle = (waba: string) => {
    const next = new Set(selectedWabas);
    if (next.has(waba)) next.delete(waba); else next.add(waba);
    setSelectedWabas(next);
  };

  return (
    <div style={{ paddingTop: 8, paddingBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span
          style={{ fontSize: 10, fontWeight: 600, color: dark ? '#C4B3FF' : '#7C4DFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}
        >
          Líneas WhatsApp
        </span>
        <button
          onClick={toggleAll}
          className="text-[10px] font-medium hover:underline"
          style={{ color: dark ? '#8892B8' : '#0891B2' }}
        >
          {allSelected ? 'Desmarcar todas' : 'Seleccionar todas'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
        {wabas.map(w => (
          <label
            key={w.waba}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              cursor: 'pointer', padding: '7px 8px', borderRadius: 8,
              background: selectedWabas.has(w.waba)
                ? (dark ? '#7C4DFF18' : '#7C4DFF0A')
                : 'transparent',
              border: `1px solid ${selectedWabas.has(w.waba)
                ? (dark ? '#7C4DFF40' : '#7C4DFF25')
                : (dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)')}`,
              transition: 'all 0.12s',
            }}
            onClick={e => e.stopPropagation()}
          >
            <AnimatedCheckbox
              checked={selectedWabas.has(w.waba)}
              onCheckedChange={() => toggle(w.waba)}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: dark ? '#EEF0FF' : undefined, margin: 0, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {w.waba}
              </p>
              <p style={{ fontSize: 10, color: dark ? '#8892B8' : '#94A3B8', margin: 0, lineHeight: 1.3 }}>
                {formatNumber(w.total_mensajes)} mensajes
                {w.ultimo_uso ? ` · último ${w.ultimo_uso}` : ''}
              </p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
