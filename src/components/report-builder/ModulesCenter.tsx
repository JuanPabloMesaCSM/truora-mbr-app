import { Lock, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { AnimatedCheckbox } from "@/components/AnimatedCheckbox";
import { ModuleHoverCard } from "./ModuleHoverCard";
import type { ExtraModule } from "./types";

/* ─── Module definitions ─── */

const BASE_MODULES_DISPLAY = [
  { id: "conversion_general", label: "Conversión General del Proceso" },
];

const OPTIONAL_MODULES = [
  { id: "embudo_conversion", label: "Embudo de Conversión (Funnel)" },
  { id: "usuarios_unicos", label: "Análisis de Usuarios y Reintentos" },
  { id: "conversion_validador", label: "Comparativa: Doc vs. Rostro" },
  { id: "detalle_documento", label: "Top 5 Rechazos: Documento" },
  { id: "detalle_rostro", label: "Top 5 Rechazos: Rostro" },
  { id: "abandono_cancelados", label: "Análisis de Abandono (Expirados vs. Cancelados)" },
  { id: "detalle_declinados", label: "Rechazos por Declinado" },
  { id: "fallos_usuario", label: "Errores por Usuario Único" },
  { id: "historico_conversion", label: "Evolución Histórica (Últimos Meses)" },
  { id: "rendimiento_flujos", label: "Rendimiento Segmentado por Flujos (MoM)" },
];

const DEFAULT_CONFIGS: Record<string, Record<string, string>> = {};

interface ModulesCenterProps {
  extraModules: ExtraModule[];
  addExtraModule: (mod: ExtraModule) => void;
  removeExtraModule: (id: string) => void;
  updateExtraModuleConfig: (id: string, config: Record<string, string>) => void;
  insightsAi: boolean;
  setInsightsAi: (v: boolean) => void;
}

export function ModulesCenter({
  extraModules, addExtraModule, removeExtraModule,
  updateExtraModuleConfig, insightsAi, setInsightsAi,
}: ModulesCenterProps) {
  const selectedIds = new Set(extraModules.map((m) => m.id));

  const toggleOptional = (mod: typeof OPTIONAL_MODULES[number]) => {
    if (selectedIds.has(mod.id)) {
      removeExtraModule(mod.id);
    } else {
      addExtraModule({
        id: mod.id,
        label: mod.label,
        description: "",
        config: DEFAULT_CONFIGS[mod.id] || {},
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Base modules (always included) ─── */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
          Módulos Base <span className="text-muted-foreground font-normal normal-case">(Siempre incluidos)</span>
        </h2>
        <div className="space-y-2">
          {BASE_MODULES_DISPLAY.map((mod) => (
            <div key={mod.id} className="flex items-center justify-between py-2.5 px-3 rounded-md bg-muted/40 border border-border/50">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground font-medium">{mod.label}</span>
                <ModuleHoverCard moduleId={mod.id} />
              </div>
              <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
                <Lock className="h-3 w-3" /> FIJO
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Optional modules ─── */}
      <div className="bg-card rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
          Módulos Específicos <span className="text-muted-foreground font-normal normal-case">(Opcionales)</span>
        </h2>
        <div className="space-y-2">
          {OPTIONAL_MODULES.map((mod) => {
            const isActive = selectedIds.has(mod.id);
            return (
              <div
                key={mod.id}
                className={`flex items-center justify-between py-2.5 px-3 rounded-md border transition-colors duration-200 cursor-pointer ${
                  isActive
                    ? "bg-primary/5 border-primary/30"
                    : "bg-muted/30 border-border/50 hover:bg-muted/50"
                }`}
                onClick={() => toggleOptional(mod)}
              >
                <div className="flex items-center gap-2">
                  <AnimatedCheckbox
                    checked={isActive}
                    onCheckedChange={() => toggleOptional(mod)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-sm text-foreground font-medium">{mod.label}</span>
                  <ModuleHoverCard moduleId={mod.id} />
                </div>
                {isActive && (
                  <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                    ACTIVO
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Insights AI toggle ─── */}
      <div className="bg-card rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Análisis Estratégico Truora AI</span>
            <ModuleHoverCard moduleId="insights_ai" />
          </div>
          <Switch checked={insightsAi} onCheckedChange={setInsightsAi} />
        </div>
        <p className="text-[11px] text-muted-foreground">Gemini generará un análisis ejecutivo de max 110 caracteres</p>
      </div>
    </div>
  );
}
