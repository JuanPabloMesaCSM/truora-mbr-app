import { Button } from "@/components/ui/button";
import { Code, Loader2, CheckCircle, AlertCircle, Sparkles } from "lucide-react";

interface SummaryPanelProps {
  cliente: string;
  periodo: string;
  nombreCsm: string;
  baseSlideCount: number;
  extraSlideCount: number;
  insightsAi: boolean;
  canGenerate: boolean;
  sendStatus: "idle" | "sending" | "success" | "error";
  onGenerate: () => void;
  onRetry: () => void;
  showJson: boolean;
  setShowJson: (v: boolean) => void;
  payload: object;
}

export function SummaryPanel({
  cliente, periodo, nombreCsm,
  baseSlideCount, extraSlideCount, insightsAi,
  canGenerate, sendStatus,
  onGenerate, onRetry,
  showJson, setShowJson, payload,
}: SummaryPanelProps) {
  return (
    <div className="lg:sticky lg:top-6 space-y-4">
      <div className="bg-card rounded-lg border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Resumen</h2>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cliente</span>
            <span className="text-foreground font-medium truncate ml-2 max-w-[100px]">{cliente || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Periodo</span>
            <span className="text-foreground font-medium">{periodo || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">CSM</span>
            <span className="text-foreground font-medium truncate ml-2 max-w-[100px]">{nombreCsm || "—"}</span>
          </div>
          <div className="h-px bg-border my-2" />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Slides base</span>
            <span className="text-primary font-bold">{baseSlideCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Módulos extra</span>
            <span className="text-secondary font-bold">{extraSlideCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">AI Insights</span>
            <span className={`font-bold ${insightsAi ? "text-secondary" : "text-muted-foreground"}`}>
              {insightsAi ? (
                <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> ON</span>
              ) : "OFF"}
            </span>
          </div>
        </div>
      </div>

      {/* Generate button */}
      <div className="space-y-2">
        {sendStatus === "error" ? (
          <button
            onClick={onRetry}
            className="w-full py-3 rounded-lg text-sm font-semibold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            <span className="flex items-center justify-center gap-2">
              <AlertCircle className="h-4 w-4" /> Error — reintentar
            </span>
          </button>
        ) : sendStatus === "success" ? (
          <div className="space-y-1">
            <div className="w-full py-3 rounded-lg text-sm font-semibold bg-primary/20 text-primary text-center">
              <span className="flex items-center justify-center gap-2">
                <CheckCircle className="h-4 w-4" /> Reporte generado ✓
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground text-center">Revisa tu Google Drive</p>
          </div>
        ) : (
          <>
            <button
              onClick={onGenerate}
              disabled={!canGenerate || sendStatus === "sending"}
              className="w-full py-3 rounded-lg text-sm font-bold text-foreground gradient-generate transition-all duration-300 disabled:cursor-not-allowed"
            >
              {sendStatus === "sending" ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Generando...
                </span>
              ) : (
                "Generar Reporte"
              )}
            </button>
            {!canGenerate && (
              <p className="text-[11px] text-muted-foreground text-center">Completa cliente, periodo y URL válida</p>
            )}
          </>
        )}
      </div>

      {/* JSON toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowJson(!showJson)}
        className="w-full text-xs text-muted-foreground"
      >
        <Code className="h-3 w-3 mr-1" /> {showJson ? "Ocultar JSON" : "Ver JSON"}
      </Button>

      {showJson && (
        <pre className="bg-muted rounded-lg p-3 text-[10px] text-muted-foreground overflow-auto max-h-64 border border-border">
          {JSON.stringify(payload, null, 2)}
        </pre>
      )}
    </div>
  );
}
