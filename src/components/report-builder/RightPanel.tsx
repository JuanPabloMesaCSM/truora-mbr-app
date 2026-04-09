import { Loader2, CheckCircle, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { MODULES, PRODUCT_COLORS, type Product } from "./moduleDefinitions";

interface RightPanelProps {
  product: Product;
  clientName: string | null;
  periodLabel: string;
  csmName: string;
  activeModuleIds: string[];
  insightsAi: boolean;
  setInsightsAi: (v: boolean) => void;
  canGenerate: boolean;
  overlayStatus: 'generating' | 'success' | 'error' | null;
  reportUrl?: string;
  onGenerate: () => void;
  onClose: () => void;
}

export function RightPanel({
  product, clientName, periodLabel, csmName,
  activeModuleIds, insightsAi, setInsightsAi,
  canGenerate, overlayStatus, reportUrl,
  onGenerate, onClose,
}: RightPanelProps) {
  const color = PRODUCT_COLORS[product];
  const modules = MODULES[product];
  const fixedSlides = 5;
  const baseSlides = 1;
  const optionalActive = activeModuleIds.length;
  const aiSlide = insightsAi ? 1 : 0;
  const total = fixedSlides + baseSlides + optionalActive + aiSlide;
  const maxSlides = fixedSlides + baseSlides + modules.optional.length + 1;
  const progress = Math.round((total / maxSlides) * 100);

  return (
    <div
      className="w-[260px] shrink-0 h-screen flex flex-col"
      style={{ borderLeft: '0.5px solid rgba(0,0,0,0.06)', background: '#F4F6FC' }}
    >
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Resumen
        </p>

        <div className="space-y-2.5">
          <SummaryRow label="Cliente" value={clientName || '—'} />
          <SummaryRow label="Producto" value={product} badge badgeColor={color} />
          <SummaryRow label="Periodo" value={periodLabel || '—'} />
          <SummaryRow label="CSM" value={csmName} />
        </div>

        {/* Slide counter */}
        <div className="pt-3" style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
            <span>Slides</span>
            <span className="font-semibold text-foreground">{total}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mb-2">
            Fijas: {fixedSlides} · Base: {baseSlides} · Opcionales: {optionalActive}
            {aiSlide ? ' · AI: 1' : ''}
          </p>
          <Progress value={progress} className="h-1.5" />
        </div>

        {/* Truora AI toggle */}
        <div className="pt-3" style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" style={{ color }} />
              <span className="text-xs font-medium text-foreground">Truora AI</span>
            </div>
            <Switch
              checked={insightsAi}
              onCheckedChange={setInsightsAi}
              className="scale-75"
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Análisis estratégico generado con IA
          </p>
        </div>

        {/* Status feedback */}
        {overlayStatus === 'success' && reportUrl && (
          <div className="rounded-lg p-3 space-y-2" style={{ background: `${color}10` }}>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" style={{ color }} />
              <span className="text-xs font-medium text-foreground">¡Reporte generado!</span>
            </div>
            <a
              href={reportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs font-semibold py-2 rounded-md text-white transition-opacity hover:opacity-90"
              style={{ background: color }}
            >
              Abrir Reporte ↗
            </a>
            <button
              onClick={onClose}
              className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Cerrar
            </button>
          </div>
        )}

        {overlayStatus === 'error' && (
          <div className="rounded-lg p-3 bg-destructive/10 space-y-2">
            <p className="text-xs font-medium text-destructive">Error al generar</p>
            <Button size="sm" variant="outline" onClick={onGenerate} className="w-full text-xs">
              Reintentar
            </Button>
            <button
              onClick={onClose}
              className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>

      {/* Sticky generate button */}
      <div className="p-4" style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
        <button
          disabled={!canGenerate || overlayStatus === 'generating'}
          onClick={onGenerate}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: canGenerate && overlayStatus !== 'generating' ? color : '#9CA3AF' }}
        >
          {overlayStatus === 'generating' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparando tu reporte...
            </>
          ) : (
            'Generar Reporte'
          )}
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, badge, badgeColor }: {
  label: string;
  value: string;
  badge?: boolean;
  badgeColor?: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {badge ? (
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
          style={{ background: badgeColor }}
        >
          {value}
        </span>
      ) : (
        <span className="text-xs font-medium text-foreground text-right max-w-[140px] truncate">
          {value}
        </span>
      )}
    </div>
  );
}
