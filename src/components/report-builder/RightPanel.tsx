import { useState } from "react";
import { Loader2, CheckCircle, Sparkles, Download } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { MODULES, PRODUCT_COLORS, type Product } from "./moduleDefinitions";
import type { Theme } from "./SlideCanvas";
import { exportPDF } from "@/utils/exportPDF";

interface RightPanelProps {
  product: Product;
  clientName: string | null;
  periodLabel: string;
  csmName: string;
  activeModuleIds: string[];
  insightsAi: boolean;
  setInsightsAi: (v: boolean) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  canGenerate: boolean;
  overlayStatus: 'generating' | 'success' | 'error' | null;
  reportUrl?: string;
  hasData?: boolean;
  onGenerate: () => void;
  onClose: () => void;
}

export function RightPanel({
  product, clientName, periodLabel, csmName,
  activeModuleIds, insightsAi, setInsightsAi,
  theme, setTheme,
  canGenerate, overlayStatus, reportUrl, hasData,
  onGenerate, onClose,
}: RightPanelProps) {
  const [exportingPdf, setExportingPdf] = useState(false);
  const color = PRODUCT_COLORS[product];

  const handleExportPDF = () => {
    exportPDF(
      clientName || 'Cliente',
      periodLabel || 'Reporte',
      () => setExportingPdf(true),
      () => setExportingPdf(false),
    );
  };
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

        {/* Theme selector */}
        <div className="pt-3" style={{ borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            Tema del reporte
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setTheme('dark')}
              className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all"
              style={{
                background: theme === 'dark' ? '#0D1137' : 'transparent',
                border: theme === 'dark' ? `1.5px solid ${color}` : '1.5px solid rgba(0,0,0,0.1)',
                color: theme === 'dark' ? '#fff' : 'var(--muted-foreground)',
              }}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: '#0D1137', border: '1px solid rgba(255,255,255,0.2)' }}
              />
              Dark
            </button>
            <button
              onClick={() => setTheme('light')}
              className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all"
              style={{
                background: theme === 'light' ? '#F5F5F7' : 'transparent',
                border: theme === 'light' ? `1.5px solid ${color}` : '1.5px solid rgba(0,0,0,0.1)',
                color: theme === 'light' ? '#0D1137' : 'var(--muted-foreground)',
              }}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ background: '#F5F5F7', border: '1px solid #E2E8F0' }}
              />
              Light
            </button>
          </div>
        </div>

        {/* Status feedback */}
        {overlayStatus === 'success' && (hasData || reportUrl) && (
          <div className="rounded-lg p-3 space-y-2" style={{ background: `${color}10` }}>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" style={{ color }} />
              <span className="text-xs font-medium text-foreground">¡Reporte generado!</span>
            </div>
            {hasData ? (
              <>
                <button
                  onClick={onClose}
                  className="block w-full text-center text-xs font-semibold py-2 rounded-md text-white transition-opacity hover:opacity-90"
                  style={{ background: color }}
                >
                  Ver canvas ↓
                </button>
                <button
                  onClick={handleExportPDF}
                  disabled={exportingPdf}
                  className="flex items-center justify-center gap-2 w-full text-xs font-semibold py-2 rounded-md text-white transition-opacity hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: '#00D4A0' }}
                >
                  {exportingPdf ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Generando PDF...
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5" />
                      Exportar PDF
                    </>
                  )}
                </button>
              </>
            ) : reportUrl ? (
              <a
                href={reportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs font-semibold py-2 rounded-md text-white transition-opacity hover:opacity-90"
                style={{ background: color }}
              >
                Abrir Reporte ↗
              </a>
            ) : null}
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
