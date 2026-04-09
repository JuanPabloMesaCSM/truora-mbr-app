import { Info } from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";

interface ModuleInfo {
  title: string;
  description: string;
  visual: React.ReactNode;
}

const MODULE_INFO: Record<string, ModuleInfo> = {
  conversion_general: {
    title: "Conversión General del Proceso",
    description: "Mide el volumen total, la tasa de éxito global y el desglose principal de fallas.",
    visual: <DoughnutChart />,
  },
  embudo_conversion: {
    title: "Embudo de Conversión (Funnel)",
    description: "Mide cuántos usuarios inician, cuántos usuarios llegan a Doc y cuántos usuarios llegan a face.",
    visual: <FunnelVisual />,
  },
  usuarios_unicos: {
    title: "Análisis de Usuarios y Reintentos",
    description: "Mide conversión por usuario único y reintentos.",
    visual: <RetryBars />,
  },
  conversion_validador: {
    title: "Comparativa: Doc vs. Rostro",
    description: "Mide la efectividad técnica en la lectura de Doc y Face.",
    visual: <DocVsFaceVisual />,
  },
  detalle_documento: {
    title: "Top 5 Rechazos: Documento",
    description: "Los 5 motivos principales por los que el motor OCR falló.",
    visual: <DocListVisual />,
  },
  detalle_rostro: {
    title: "Top 5 Rechazos: Rostro",
    description: "Los 5 motivos principales por los que falló la prueba de vida facial.",
    visual: <FaceListVisual />,
  },
  abandono_cancelados: {
    title: "Análisis de Abandono (Expirados vs. Cancelados)",
    description: "Compara usuarios que abandonan pasivamente (expirados) vs. los que abortan activamente (cancelados).",
    visual: <ComparativeBars />,
  },
  detalle_declinados: {
    title: "Rechazos por Declinado",
    description: "Mide la cantidad de procesos declinados y su motivo.",
    visual: <ParetoChart />,
  },
  fallos_usuario: {
    title: "Errores por Usuario Único",
    description: "Descripción del error y cantidad de usuarios únicos afectados.",
    visual: <RankingTable />,
  },
  historico_conversion: {
    title: "Evolución Histórica (Últimos Meses)",
    description: "Tendencia de volumen y conversión. (Requiere data histórica en el Google Sheets).",
    visual: <TrendLine />,
  },
  rendimiento_flujos: {
    title: "Rendimiento Segmentado por Flujos (MoM)",
    description: "Aísla la conversión por ID de flujo y la compara con el mes anterior.",
    visual: <FlowTable />,
  },
  insights_ai: {
    title: "Análisis Estratégico Truora AI",
    description: "Gemini analiza la data y redacta un resumen ejecutivo destacando las mayores fricciones.",
    visual: <AISparkle />,
  },
};

export function ModuleHoverCard({ moduleId }: { moduleId: string }) {
  const info = MODULE_INFO[moduleId];
  if (!info) return null;

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button className="inline-flex items-center justify-center rounded-full hover:bg-muted/60 p-0.5 transition-colors">
          <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-primary transition-colors" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-72 p-0 z-[60]"
        style={{ overflow: "visible" }}
      >
        <div className="p-4 space-y-3">
          <h4 className="text-sm font-bold text-foreground">{info.title}</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">{info.description}</p>
          <div className="rounded-md bg-muted/50 border border-border p-3 flex items-center justify-center">
            {info.visual}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

/* ─── Mini Visualizations ─── */

function DoughnutChart() {
  return (
    <div className="relative w-16 h-16">
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--destructive))" strokeWidth="4" />
        <circle cx="18" cy="18" r="14" fill="none" stroke="hsl(var(--primary))" strokeWidth="4"
          strokeDasharray="56 88" strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-primary">64%</span>
    </div>
  );
}

function FunnelVisual() {
  const levels = [
    { label: "Inicio", w: "100%", color: "bg-primary" },
    { label: "Doc", w: "68%", color: "bg-secondary" },
    { label: "Rostro", w: "42%", color: "bg-primary/60" },
  ];
  return (
    <div className="w-full space-y-1">
      {levels.map((l) => (
        <div key={l.label} className="flex items-center gap-2">
          <span className="text-[8px] text-muted-foreground w-8 text-right">{l.label}</span>
          <div className="flex-1 flex justify-center">
            <div className={`h-3 rounded ${l.color}`} style={{ width: l.w }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function RetryBars() {
  const bars = [
    { label: "1-3", w: "85%", color: "bg-primary" },
    { label: "4-6", w: "45%", color: "bg-secondary" },
    { label: "7+", w: "15%", color: "bg-destructive" },
  ];
  return (
    <div className="w-full space-y-1.5">
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground w-6 text-right font-mono">{b.label}</span>
          <div className="flex-1 h-2.5 rounded-full bg-muted">
            <div className={`h-full rounded-full ${b.color}`} style={{ width: b.w }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DocVsFaceVisual() {
  return (
    <div className="flex items-end gap-6">
      <div className="flex flex-col items-center gap-1">
        <div className="w-8 h-8 rounded-md bg-muted border border-border flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="10" x2="14" y2="10"/><line x1="6" y1="14" x2="10" y2="14"/></svg>
        </div>
        <span className="text-[10px] font-bold text-primary">92%</span>
        <span className="text-[8px] text-muted-foreground">Doc</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="w-8 h-8 rounded-md bg-muted border border-border flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--secondary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
        </div>
        <span className="text-[10px] font-bold text-secondary">78%</span>
        <span className="text-[8px] text-muted-foreground">Rostro</span>
      </div>
    </div>
  );
}

function DocListVisual() {
  return (
    <div className="flex items-start gap-3">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>
      <div className="space-y-1">
        {[80, 60, 45, 30, 15].map((w, i) => (
          <div key={i} className="h-1.5 rounded-full bg-primary/60" style={{ width: `${w}px` }} />
        ))}
      </div>
    </div>
  );
}

function FaceListVisual() {
  return (
    <div className="flex items-start gap-3">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--secondary))" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
      <div className="space-y-1">
        {[80, 60, 45, 30, 15].map((w, i) => (
          <div key={i} className="h-1.5 rounded-full bg-secondary/60" style={{ width: `${w}px` }} />
        ))}
      </div>
    </div>
  );
}

function ComparativeBars() {
  return (
    <div className="flex items-end gap-2 h-10">
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-5 rounded-t bg-primary/70" style={{ height: "80%" }} />
        <span className="text-[7px] text-muted-foreground">Exp</span>
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <div className="w-5 rounded-t bg-destructive/70" style={{ height: "50%" }} />
        <span className="text-[7px] text-muted-foreground">Canc</span>
      </div>
    </div>
  );
}

function ParetoChart() {
  const bars = [70, 55, 40, 28, 18, 10];
  return (
    <div className="flex items-end gap-1 h-10">
      {bars.map((h, i) => (
        <div key={i} className="w-3 rounded-t bg-destructive" style={{ height: `${h}%`, opacity: 1 - i * 0.1 }} />
      ))}
    </div>
  );
}

function RankingTable() {
  return (
    <div className="w-full text-[8px] font-mono">
      <div className="grid grid-cols-[20px_1fr_32px] gap-1 text-muted-foreground border-b border-border pb-1 mb-1">
        <span>#</span><span>Error</span><span className="text-right">Users</span>
      </div>
      {[
        { r: 1, e: "Blur detected", u: "842" },
        { r: 2, e: "Face mismatch", u: "631" },
        { r: 3, e: "Doc expired", u: "419" },
      ].map((row) => (
        <div key={row.r} className="grid grid-cols-[20px_1fr_32px] gap-1 text-foreground/80 py-0.5">
          <span className="text-primary font-bold">{row.r}</span>
          <span className="truncate">{row.e}</span>
          <span className="text-right">{row.u}</span>
        </div>
      ))}
    </div>
  );
}

function TrendLine() {
  const points = "5,28 15,22 25,25 35,18 45,12 55,15";
  return (
    <svg width="64" height="36" viewBox="0 0 60 36" className="w-16 h-9">
      <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.split(" ").map((p, i) => {
        const [x, y] = p.split(",");
        return <circle key={i} cx={x} cy={y} r="1.5" fill="hsl(var(--primary))" />;
      })}
    </svg>
  );
}

function FlowTable() {
  return (
    <div className="w-full text-[8px] font-mono">
      <div className="grid grid-cols-[1fr_28px_20px] gap-1 text-muted-foreground border-b border-border pb-1 mb-1">
        <span>Flujo</span><span className="text-right">Conv</span><span className="text-right">Δ</span>
      </div>
      {[
        { f: "flow_onb", c: "72%", d: "↑3%" },
        { f: "flow_kyc", c: "65%", d: "↓1%" },
        { f: "flow_re", c: "81%", d: "↑5%" },
      ].map((row) => (
        <div key={row.f} className="grid grid-cols-[1fr_28px_20px] gap-1 text-foreground/80 py-0.5">
          <span className="truncate">{row.f}</span>
          <span className="text-right text-primary">{row.c}</span>
          <span className={`text-right ${row.d.startsWith("↑") ? "text-primary" : "text-destructive"}`}>{row.d}</span>
        </div>
      ))}
    </div>
  );
}

function AISparkle() {
  return (
    <div className="flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
        <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" opacity="0.6" />
      </svg>
      <span className="text-[9px] text-muted-foreground leading-tight">Resumen<br/>ejecutivo AI</span>
    </div>
  );
}
