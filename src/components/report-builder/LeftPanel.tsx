import { useState } from "react";
import { LogOut, Lock, Lightbulb, RefreshCw } from "lucide-react";

import { motion } from "framer-motion";
import { supabase } from "@/lib/supabaseClient";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectGroup, SelectItem,
  SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  MODULES, PRODUCT_COLORS, PRODUCT_CLIENT_FIELD, ADMIN_EMAIL,
  generatePeriods, type Product, type CsmRow, type ClienteRow, type ModuleInsight,
} from "./moduleDefinitions";
import { ChartIcon } from "./ChartIcon";
import { FeedbackModal } from "./FeedbackModal";
import { BgcCustomTypes, type CustomTypeRow } from "./BgcCustomTypes";
import { DiFlowSelector, type DiFlowRow } from "./DiFlowSelector";
import { CEFlowSelector, type CEFlowRow } from "./CEFlowSelector";

const PRODUCTS: Product[] = ['DI', 'BGC', 'CE'];
const PERIODS = generatePeriods();

interface LeftPanelProps {
  product: Product;
  setProduct: (p: Product) => void;
  selectedClientId: string | null;
  setSelectedClientId: (id: string | null) => void;
  periodValue: string;
  setPeriodValue: (v: string) => void;
  activeModuleIds: string[];
  toggleModule: (id: string) => void;
  moduleInsights: Record<string, ModuleInsight>;
  setModuleInsight: (id: string, mode: 'ai' | 'manual' | null, text?: string) => void;
  csmProfile: CsmRow | null;
  clients: ClienteRow[];
  userEmail: string;
  ceFlows: CEFlowRow[];
  selectedCeFlows: Set<string>;
  setSelectedCeFlows: (s: Set<string>) => void;
  ceFlowsLoading: boolean;
  customTypes: CustomTypeRow[];
  selectedTypes: Set<string>;
  setSelectedTypes: (s: Set<string>) => void;
  customTypesLoading: boolean;
  diFlows: DiFlowRow[];
  selectedDiFlows: Set<string>;
  setSelectedDiFlows: (s: Set<string>) => void;
  diFlowsLoading: boolean;
  diFlowsError: boolean;
  onReloadClients: () => void;
}

export function LeftPanel({
  product, setProduct,
  selectedClientId, setSelectedClientId,
  periodValue, setPeriodValue,
  activeModuleIds, toggleModule,
  moduleInsights, setModuleInsight,
  csmProfile, clients, userEmail,
  ceFlows, selectedCeFlows, setSelectedCeFlows, ceFlowsLoading,
  customTypes, selectedTypes, setSelectedTypes, customTypesLoading,
  diFlows, selectedDiFlows, setSelectedDiFlows, diFlowsLoading, diFlowsError,
  onReloadClients,
}: LeftPanelProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const selectedClient = clients.find(c => c.id === selectedClientId) || null;
  const getNickname = (fullName: string) => {
    const nickMap: Record<string, string> = {
      'Juan Pablo': 'Juanpa',
      'Natalia': 'Nata',
    };
    for (const [key, nick] of Object.entries(nickMap)) {
      if (fullName.startsWith(key)) return nick;
    }
    return fullName.split(' ')[0];
  };

  const initials = csmProfile
    ? csmProfile.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : userEmail.slice(0, 2).toUpperCase();
  const greeting = csmProfile ? `¡Hola, ${getNickname(csmProfile.nombre)}! 👋` : userEmail;
  const color = PRODUCT_COLORS[product];
  const modules = MODULES[product];
  const isAdmin = userEmail === ADMIN_EMAIL;

  const clientGroups = isAdmin
    ? clients.reduce<Record<string, ClienteRow[]>>((acc, c) => {
        (acc[c.csm_email] = acc[c.csm_email] || []).push(c);
        return acc;
      }, {})
    : null;

  const isProductDisabled = (p: Product) => {
    if (!selectedClient) return false;
    return !selectedClient[PRODUCT_CLIENT_FIELD[p]];
  };

  const getDisabledTooltip = (p: Product) =>
    `Configura el CLIENT_ID de ${p} para este cliente`;

  
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div
      className="w-[280px] shrink-0 h-screen overflow-y-auto"
      style={{ borderRight: '0.5px solid rgba(0,0,0,0.06)', background: '#F4F6FC' }}
    >
      <div className="p-4 space-y-5">
        {/* ── CSM Header ── */}
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="text-white text-xs font-semibold" style={{ background: color }}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {greeting}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">{userEmail}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* ── Product Tabs ── */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">
            Producto
          </p>
          <div className="flex gap-1">
            {PRODUCTS.map(p => {
              const disabled = isProductDisabled(p);
              const isActive = product === p;
              const tab = (
                <button
                  onClick={() => setProduct(p)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all duration-200 ${
                    disabled
                      ? 'opacity-40 bg-muted text-muted-foreground'
                      : isActive
                        ? 'text-white shadow-sm'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                  }`}
                  style={isActive && !disabled ? { background: PRODUCT_COLORS[p] } : undefined}
                >
                  {p}
                </button>
              );
              if (disabled) {
                return (
                  <Tooltip key={p}>
                    <TooltipTrigger asChild>{tab}</TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {getDisabledTooltip(p)}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return <span key={p} className="flex-1 flex">{tab}</span>;
            })}
          </div>
        </div>

        {/* ── Configuration ── */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Configuración
          </p>

          {/* Client */}
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Cliente</label>
            <Select value={selectedClientId || ''} onValueChange={v => setSelectedClientId(v || null)}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Seleccionar cliente" />
              </SelectTrigger>
              <SelectContent>
                {isAdmin && clientGroups ? (
                  Object.entries(clientGroups).map(([csmEmail, groupClients]) => (
                    <SelectGroup key={csmEmail}>
                      <SelectLabel className="text-[10px] text-muted-foreground">{csmEmail}</SelectLabel>
                      {groupClients.map(c => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">{c.nombre}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))
                ) : (
                  clients.map(c => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.nombre}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {clients.length === 0 && (
              <button
                onClick={onReloadClients}
                className="flex items-center gap-1.5 text-[11px] font-medium mt-1.5 px-2 py-1 rounded-md transition-colors text-amber-600 hover:bg-amber-50"
              >
                <RefreshCw className="h-3 w-3" />
                Recargar clientes
              </button>
            )}
          </div>

          {/* Period */}
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">Periodo</label>
            <Select value={periodValue} onValueChange={setPeriodValue}>
              <SelectTrigger className="text-xs h-9">
                <SelectValue placeholder="Seleccionar periodo" />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map(p => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* CSM (read-only) */}
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">CSM</label>
            <div className="text-xs px-3 py-2 rounded-md bg-muted/50 text-foreground">
              {csmProfile?.nombre || userEmail}
            </div>
          </div>
        </div>

        {/* ── DI Flow Selector ── */}
        {product === 'DI' && (
          <DiFlowSelector
            flows={diFlows}
            selectedFlows={selectedDiFlows}
            setSelectedFlows={setSelectedDiFlows}
            loading={diFlowsLoading}
            error={diFlowsError}
          />
        )}

        {/* ── BGC Custom Types ── */}
        {product === 'BGC' && (
          <BgcCustomTypes
            customTypes={customTypes}
            selectedTypes={selectedTypes}
            setSelectedTypes={setSelectedTypes}
            loading={customTypesLoading}
          />
        )}

        {/* ── Modules ── */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            Módulos
          </p>

          {/* Base module (fixed) */}
          <div
            className="flex items-center gap-3 p-3 rounded-md"
            style={{ border: `0.5px solid ${color}30`, background: `${color}08` }}
          >
            <ChartIcon chart={modules.base.chart} color={color} size={28} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground leading-tight">{modules.base.label}</p>
              <p className="text-[10px] text-muted-foreground leading-snug">{modules.base.description}</p>
            </div>
            <span className="text-[9px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
              <Lock className="h-2.5 w-2.5" /> FIJO
            </span>
          </div>

          {/* Optional modules */}
          {modules.optional.map(mod => {
            const isActive = activeModuleIds.includes(mod.id);
            const insight: ModuleInsight = moduleInsights[mod.id] ?? { mode: null, text: '' };
            return (
              <div key={mod.id}>
                <div
                  className="flex items-center gap-3 p-3 rounded-md transition-all duration-200 cursor-pointer"
                  style={{
                    border: `0.5px solid ${isActive ? `${color}40` : 'rgba(0,0,0,0.06)'}`,
                    background: isActive ? `${color}08` : 'transparent',
                    borderRadius: isActive && insight.mode ? '6px 6px 0 0' : undefined,
                  }}
                  onClick={() => toggleModule(mod.id)}
                >
                  <ChartIcon chart={mod.chart} color={isActive ? color : '#9CA3AF'} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground leading-tight">{mod.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-snug">{mod.description}</p>
                  </div>
                  {isActive && insight.mode && (
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                      style={{
                        background: insight.mode === 'ai' ? `${color}20` : 'rgba(34,197,94,0.15)',
                        color: insight.mode === 'ai' ? color : '#16A34A',
                      }}
                    >
                      ✦ {insight.mode === 'ai' ? 'IA' : 'Manual'}
                    </span>
                  )}
                  <Switch
                    checked={isActive}
                    onCheckedChange={() => toggleModule(mod.id)}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    className="scale-75 shrink-0"
                  />
                </div>

                {/* Insight accordion — only for active optional modules */}
                {isActive && (
                  <div
                    className="px-3 py-2.5"
                    style={{
                      background: `${color}06`,
                      borderLeft: `2px solid ${color}30`,
                      borderRight: `0.5px solid ${color}40`,
                      borderBottom: `0.5px solid ${color}40`,
                      borderRadius: '0 0 6px 6px',
                      marginBottom: 2,
                    }}
                  >
                    <p className="text-[10px] font-semibold mb-2" style={{ color: '#64748B' }}>
                      ✦ ¿Agregar insight a este slide?
                    </p>
                    <div className="flex gap-1">
                      {(['ai', 'manual', null] as const).map(m => {
                        const label = m === 'ai' ? 'Con IA' : m === 'manual' ? 'Escribirlo yo' : 'Sin insight';
                        const active = insight.mode === m;
                        return (
                          <button
                            key={String(m)}
                            onClick={e => { e.stopPropagation(); setModuleInsight(mod.id, m); }}
                            className="flex-1 py-1 text-[10px] font-semibold rounded transition-all"
                            style={{
                              background: active
                                ? m === null ? 'rgba(0,0,0,0.07)' : color
                                : 'rgba(0,0,0,0.04)',
                              color: active
                                ? m === null ? '#64748B' : '#fff'
                                : '#94A3B8',
                              border: `1px solid ${active
                                ? m === null ? 'rgba(0,0,0,0.1)' : color
                                : 'rgba(0,0,0,0.06)'}`,
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    {insight.mode === 'manual' && (
                      <textarea
                        placeholder="Escribe tu análisis de esta métrica..."
                        maxLength={280}
                        value={insight.text}
                        onChange={e => setModuleInsight(mod.id, 'manual', e.target.value)}
                        onClick={e => e.stopPropagation()}
                        className="w-full mt-2 text-[11px] p-2 rounded border resize-none"
                        style={{
                          height: 68, fontFamily: 'inherit',
                          borderColor: '#E2E8F0', color: '#0D1137',
                          background: '#fff', boxSizing: 'border-box',
                        }}
                      />
                    )}
                    {insight.mode === 'ai' && (
                      <p className="text-[10px] mt-1.5" style={{ color: '#94A3B8' }}>
                        El análisis llegará de n8n con el reporte.
                      </p>
                    )}
                  </div>
                )}

                {mod.hasFlowSelector && isActive && (
                  <CEFlowSelector
                    flows={ceFlows}
                    selectedFlows={selectedCeFlows}
                    setSelectedFlows={setSelectedCeFlows}
                    loading={ceFlowsLoading}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Feedback Button ── */}
        <button
          onClick={() => setFeedbackOpen(true)}
          className="flex items-center gap-2 w-full p-3 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
        >
          <Lightbulb className="h-4 w-4" style={{ color }} />
          Feedback
        </button>
      </div>

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        product={product}
        userEmail={userEmail}
      />
    </div>
  );
}
