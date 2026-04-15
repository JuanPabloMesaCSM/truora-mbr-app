/* ─────────────────────────────────────────────────────────
   LeftPanel (ModulePanel) — Paso 3: Constructor
   Panel izquierdo oscuro con módulos, insights, tema,
   Truora AI, flujos/types y botón generar.
   Producto, cliente y periodo ya fueron seleccionados.
───────────────────────────────────────────────────────── */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Lightbulb, ArrowLeft, Sparkles, Moon, Sun, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  MODULES, PRODUCT_COLORS, PRODUCT_LABELS,
  type Product, type CsmRow, type ClienteRow, type ModuleInsight,
} from "./moduleDefinitions";
import { FeedbackModal } from "./FeedbackModal";
import { BgcCustomTypes, type CustomTypeRow } from "./BgcCustomTypes";
import { DiFlowSelector, type DiFlowRow } from "./DiFlowSelector";
import { CEFlowSelector, type CEFlowRow } from "./CEFlowSelector";
import type { Theme } from "./SlideCanvas";

/* ── dark shell palette ── */
const S = {
  bg:       '#0D1B2E',
  panel:    '#112030',
  surface:  '#172840',
  surface2: '#1D3050',
  surface3: '#253C60',
  border:   'rgba(255,255,255,0.09)',
  borderAct:'rgba(255,255,255,0.16)',
  text:     '#EEF0FF',
  muted:    '#8892B8',
  dim:      '#4A5580',
};

/* ── custom toggle ── */
function DarkSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: checked ? '#7C4DFF' : S.surface3,
        border: `1px solid ${checked ? '#7C4DFF' : S.border}`,
        position: 'relative', cursor: 'pointer',
        transition: 'all 0.2s', flexShrink: 0,
        outline: 'none',
      }}
    >
      <motion.div
        animate={{ x: checked ? 18 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          position: 'absolute', top: 2,
          width: 14, height: 14, borderRadius: 7,
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );
}

const AI_METRICAS: Record<Product, { id: string; label: string }[]> = {
  DI: [
    { id: 'volumen',                    label: 'Volumen de procesos' },
    { id: 'conversion_global',          label: 'Conversión global' },
    { id: 'conversion_promedio_flujos', label: 'Promedio de conversión por flujo' },
    { id: 'declinados',                 label: 'Declinados' },
    { id: 'rechazados',                 label: 'Rechazos doc / rostro' },
    { id: 'reintentos',                 label: 'Reintentos' },
  ],
  BGC: [
    { id: 'volumen',              label: 'Volumen de checks' },
    { id: 'distribucion_labels',  label: 'Distribución de labels' },
    { id: 'custom_types',         label: 'Custom types' },
  ],
  CE: [
    { id: 'consumo_total',        label: 'Consumo total' },
    { id: 'eficiencia_campanas',  label: 'Eficiencia de campañas' },
    { id: 'fallos_outbound',      label: 'Fallos outbound' },
    { id: 'inbound',              label: 'Flujo inbound' },
    { id: 'agentes',              label: 'Agentes' },
  ],
};

interface LeftPanelProps {
  product: Product;
  clientName: string;
  periodLabel: string;
  csmProfile: CsmRow | null;
  userEmail: string;
  activeModuleIds: string[];
  toggleModule: (id: string) => void;
  moduleInsights: Record<string, ModuleInsight>;
  setModuleInsight: (id: string, mode: 'ai' | 'manual' | null, text?: string) => void;
  insightsMode: 'ai' | 'manual' | null;
  setInsightsMode: (v: 'ai' | 'manual' | null) => void;
  insightsActivos: Record<string, boolean>;
  setInsightsActivos: (v: Record<string, boolean>) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
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
  showUpdates: boolean;
  setShowUpdates: (v: boolean) => void;
  canGenerate: boolean;
  overlayStatus: 'generating' | 'success' | 'error' | null;
  onGenerate: () => void;
  onBack: () => void;
}

export function LeftPanel({
  product, clientName, periodLabel,
  csmProfile, userEmail,
  activeModuleIds, toggleModule,
  moduleInsights, setModuleInsight,
  insightsMode, setInsightsMode,
  insightsActivos, setInsightsActivos,
  theme, setTheme,
  ceFlows, selectedCeFlows, setSelectedCeFlows, ceFlowsLoading,
  customTypes, selectedTypes, setSelectedTypes, customTypesLoading,
  diFlows, selectedDiFlows, setSelectedDiFlows, diFlowsLoading, diFlowsError,
  showUpdates, setShowUpdates,
  canGenerate, overlayStatus,
  onGenerate, onBack,
}: LeftPanelProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const color  = PRODUCT_COLORS[product];
  const modules = MODULES[product];
  const isGenerating = overlayStatus === 'generating';

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  /* ── Divider ── */
  const Divider = () => (
    <div style={{ height: 0.5, background: S.border, margin: '4px 0' }} />
  );

  return (
    <div
      style={{
        width: 360, flexShrink: 0,
        height: '100vh', display: 'flex', flexDirection: 'column',
        background: S.panel,
        borderRight: `0.5px solid ${S.border}`,
        overflow: 'hidden',
      }}
    >
      {/* ── Header ── */}
      <div style={{
        padding: '14px 16px',
        borderBottom: `0.5px solid ${S.border}`,
        flexShrink: 0,
      }}>
        {/* Back + product */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button
            onClick={onBack}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 11, color: S.dim, background: 'transparent',
              border: 'none', cursor: 'pointer', padding: '3px 0',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = S.muted)}
            onMouseLeave={e => (e.currentTarget.style.color = S.dim)}
          >
            <ArrowLeft size={12} />
            Configuración
          </button>

          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            padding: '3px 9px', borderRadius: 12,
            background: `${color}18`, color: color,
            border: `1px solid ${color}30`,
          }}>
            {product} · {PRODUCT_LABELS[product]}
          </span>
        </div>

        {/* Client + period */}
        <p style={{ fontSize: 14, fontWeight: 700, color: S.text, margin: '0 0 2px', lineHeight: 1.2 }}>
          {clientName}
        </p>
        <p style={{ fontSize: 11, color: S.muted, margin: 0 }}>
          {periodLabel} · {csmProfile?.nombre || userEmail}
        </p>
      </div>

      {/* ── Scrollable body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>

        {/* ── DI Flow Selector ── */}
        {product === 'DI' && (
          <>
            <div style={{ padding: '0 16px 8px' }}>
              <DiFlowSelector
                flows={diFlows}
                selectedFlows={selectedDiFlows}
                setSelectedFlows={setSelectedDiFlows}
                loading={diFlowsLoading}
                error={diFlowsError}
                dark
              />
            </div>
            <Divider />
          </>
        )}

        {/* ── BGC Custom Types ── */}
        {product === 'BGC' && customTypes.length >= 2 && (
          <>
            <div style={{ padding: '0 16px 8px' }}>
              <BgcCustomTypes
                customTypes={customTypes}
                selectedTypes={selectedTypes}
                setSelectedTypes={setSelectedTypes}
                loading={customTypesLoading}
                dark
              />
            </div>
            <Divider />
          </>
        )}

        {/* ── Modules ── */}
        <div style={{ padding: '8px 16px' }}>
          <p style={{
            fontSize: 10, fontWeight: 600, color: S.dim,
            letterSpacing: '0.12em', textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Módulos del reporte
          </p>

          {/* Base module (fixed) */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 10, marginBottom: 4,
            background: `${color}10`, border: `1px solid ${color}25`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: S.text, margin: '0 0 1px', lineHeight: 1.2 }}>
                {modules.base.label}
              </p>
              <p style={{ fontSize: 10, color: S.muted, margin: 0, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {modules.base.description}
              </p>
            </div>
            <div style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 9, fontWeight: 700, color: S.dim,
              background: S.surface3, padding: '2px 6px', borderRadius: 6,
            }}>
              <Lock size={8} /> FIJO
            </div>
          </div>

          {/* Optional modules */}
          {modules.optional.map(mod => {
            const isActive = activeModuleIds.includes(mod.id);
            const insight: ModuleInsight = moduleInsights[mod.id] ?? { mode: null, text: '' };

            return (
              <div key={mod.id} style={{ marginBottom: 4 }}>
                {/* Module row */}
                <div
                  onClick={() => toggleModule(mod.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px',
                    borderRadius: isActive && insight.mode ? '10px 10px 0 0' : 10,
                    background: isActive ? `${color}10` : 'transparent',
                    border: `1px solid ${isActive ? `${color}30` : S.border}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: isActive ? S.text : S.muted, margin: 0, lineHeight: 1.2 }}>
                        {mod.label}
                      </p>
                      {isActive && insight.mode && (
                        <span style={{
                          fontSize: 9, fontWeight: 700,
                          padding: '1px 5px', borderRadius: 4,
                          background: insight.mode === 'ai' ? `${color}25` : 'rgba(34,197,94,0.15)',
                          color: insight.mode === 'ai' ? color : '#22C55E',
                        }}>
                          ✦ {insight.mode === 'ai' ? 'IA' : 'Manual'}
                        </span>
                      )}
                    </div>
                    {isActive && (
                      <p style={{ fontSize: 10, color: S.muted, margin: 0, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {mod.description}
                      </p>
                    )}
                  </div>
                  <DarkSwitch checked={isActive} onChange={() => toggleModule(mod.id)} />
                </div>

                {/* Insight accordion */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{
                        padding: '10px 12px',
                        background: `${color}06`,
                        borderLeft: `2px solid ${color}30`,
                        borderRight: `1px solid ${color}30`,
                        borderBottom: `1px solid ${color}30`,
                        borderRadius: '0 0 10px 10px',
                        marginBottom: 2,
                      }}>
                        <p style={{ fontSize: 10, fontWeight: 600, color: S.muted, marginBottom: 7 }}>
                          ✦ ¿Agregar insight a este slide?
                        </p>
                        <div style={{ display: 'flex', gap: 5 }}>
                          {(['ai', 'manual', null] as const).map(m => {
                            const label = m === 'ai' ? 'Con IA' : m === 'manual' ? 'Escribirlo' : 'Sin insight';
                            const active = insight.mode === m;
                            return (
                              <button
                                key={String(m)}
                                onClick={e => { e.stopPropagation(); setModuleInsight(mod.id, m); }}
                                style={{
                                  flex: 1, padding: '5px 0', borderRadius: 6,
                                  fontSize: 10, fontWeight: 600, cursor: 'pointer',
                                  background: active ? (m === null ? S.surface3 : color) : S.surface2,
                                  color: active ? (m === null ? S.muted : '#fff') : S.dim,
                                  border: `1px solid ${active ? (m === null ? S.border : color) : S.border}`,
                                  transition: 'all 0.12s',
                                }}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        {insight.mode === 'manual' && (
                          <p style={{ fontSize: 10, marginTop: 6, color: S.dim, lineHeight: 1.4 }}>
                            ✎ Escríbelo directamente en el slide una vez generes el reporte.
                          </p>
                        )}
                        {insight.mode === 'ai' && (
                          <p style={{ fontSize: 10, marginTop: 6, color: S.dim }}>
                            El análisis llegará de n8n con el reporte.
                          </p>
                        )}
                      </div>

                      {/* CE Flow Selector inline */}
                      {mod.hasFlowSelector && (
                        <div style={{
                          paddingLeft: 12, paddingRight: 12, paddingBottom: 4,
                          borderLeft: `2px solid ${color}20`,
                          marginLeft: 0,
                          background: S.surface,
                          borderRight: `1px solid ${color}20`,
                          borderBottom: `1px solid ${color}20`,
                          borderRadius: '0 0 8px 8px',
                        }}>
                          <CEFlowSelector
                            flows={ceFlows}
                            selectedFlows={selectedCeFlows}
                            setSelectedFlows={setSelectedCeFlows}
                            loading={ceFlowsLoading}
                            dark
                          />
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <Divider />

        {/* ── Truora AI ── */}
        <div style={{ padding: '10px 16px' }}>
          {/* General insights mode selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <Sparkles size={14} color={color} />
            <span style={{ fontSize: 12, fontWeight: 600, color: S.text }}>Análisis estratégico</span>
          </div>
          <p style={{ fontSize: 10, color: S.dim, marginBottom: 8, lineHeight: 1.4 }}>
            Slide de conclusiones al final del reporte
          </p>
          <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
            {(['ai', 'manual', null] as const).map(m => {
              const label = m === 'ai' ? 'Con IA' : m === 'manual' ? 'Escribirlo' : 'Sin análisis';
              const active = insightsMode === m;
              return (
                <button
                  key={String(m)}
                  onClick={() => setInsightsMode(m)}
                  style={{
                    flex: 1, padding: '5px 0', borderRadius: 6,
                    fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    background: active ? (m === null ? S.surface3 : color) : S.surface2,
                    color: active ? (m === null ? S.muted : '#fff') : S.dim,
                    border: `1px solid ${active ? (m === null ? S.border : color) : S.border}`,
                    transition: 'all 0.12s',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {insightsMode === 'manual' && (
            <p style={{ fontSize: 10, color: S.dim, lineHeight: 1.4 }}>
              ✎ Escríbelo directamente en el slide una vez generes el reporte.
            </p>
          )}

          {/* Per-metric checkboxes (only for AI mode) */}
          <AnimatePresence>
            {insightsMode === 'ai' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{
                  padding: '10px 12px', borderRadius: 10,
                  background: `${color}08`, border: `1px solid ${color}25`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: S.muted, margin: 0 }}>
                      ¿Qué métricas analizar?
                    </p>
                    <button
                      onClick={() => {
                        const all = AI_METRICAS[product];
                        const allActive = all.every(m => insightsActivos[m.id]);
                        const next: Record<string, boolean> = {};
                        all.forEach(m => { next[m.id] = !allActive; });
                        setInsightsActivos(next);
                      }}
                      style={{
                        fontSize: 9, fontWeight: 600, color: S.dim,
                        background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = S.muted)}
                      onMouseLeave={e => (e.currentTarget.style.color = S.dim)}
                    >
                      {AI_METRICAS[product].every(m => insightsActivos[m.id]) ? 'Quitar todos' : 'Seleccionar todos'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {AI_METRICAS[product].map(m => {
                      const checked = !!insightsActivos[m.id];
                      return (
                        <label
                          key={m.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            cursor: 'pointer', padding: '5px 6px', borderRadius: 7,
                            background: checked ? `${color}12` : 'transparent',
                            border: `1px solid ${checked ? `${color}30` : 'transparent'}`,
                            transition: 'all 0.12s',
                          }}
                          onClick={() => setInsightsActivos({ ...insightsActivos, [m.id]: !checked })}
                        >
                          <div style={{
                            width: 14, height: 14, borderRadius: 4, flexShrink: 0,
                            background: checked ? color : S.surface2,
                            border: `1px solid ${checked ? color : S.border}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.12s',
                          }}>
                            {checked && (
                              <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                                <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: checked ? S.text : S.muted, lineHeight: 1.3 }}>
                            {m.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Divider />

        {/* ── Theme ── */}
        <div style={{ padding: '10px 16px' }}>
          <button
            onClick={() => setThemeOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {theme === 'dark' ? <Moon size={14} color={S.muted} /> : <Sun size={14} color={S.muted} />}
              <span style={{ fontSize: 12, fontWeight: 600, color: S.text }}>
                Tema: {theme === 'dark' ? 'Dark' : 'Light'}
              </span>
            </div>
            {themeOpen ? <ChevronUp size={13} color={S.dim} /> : <ChevronDown size={13} color={S.dim} />}
          </button>

          <AnimatePresence>
            {themeOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.18 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  {(['dark', 'light'] as Theme[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: 7,
                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                        border: `1px solid ${theme === t ? color : S.border}`,
                        background: theme === t ? `${color}15` : S.surface2,
                        color: theme === t ? color : S.muted,
                        fontSize: 12, fontWeight: 600,
                        transition: 'all 0.12s',
                      }}
                    >
                      <span style={{
                        width: 12, height: 12, borderRadius: 3, flexShrink: 0,
                        background: t === 'dark' ? '#0D1137' : '#F5F5F7',
                        border: t === 'dark' ? '1px solid rgba(255,255,255,0.15)' : '1px solid #E2E8F0',
                      }} />
                      {t === 'dark' ? 'Dark' : 'Light'}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Divider />

        {/* ── Updates de producto toggle ── */}
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: S.text }}>Updates de producto</span>
          </div>
          <DarkSwitch checked={showUpdates} onChange={() => setShowUpdates(!showUpdates)} />
        </div>

        <Divider />

        {/* ── Feedback ── */}
        <button
          onClick={() => setFeedbackOpen(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', background: 'transparent', border: 'none',
            cursor: 'pointer', fontSize: 12, color: S.dim,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = S.muted)}
          onMouseLeave={e => (e.currentTarget.style.color = S.dim)}
        >
          <Lightbulb size={14} color={color} />
          Metrics Lab · Feedback
        </button>

        <Divider />

        {/* Dev mock spacer */}
        <div style={{ height: 8 }} />
      </div>

      {/* ── Sticky generate button ── */}
      <div style={{
        padding: '12px 16px',
        borderTop: `0.5px solid ${S.border}`,
        flexShrink: 0,
        background: S.panel,
      }}>
        <button
          disabled={!canGenerate || isGenerating}
          onClick={onGenerate}
          style={{
            width: '100%', padding: '13px 20px',
            borderRadius: 12, border: 'none',
            cursor: canGenerate && !isGenerating ? 'pointer' : 'not-allowed',
            background: canGenerate && !isGenerating
              ? 'linear-gradient(135deg, #7C4DFF, #4B6FFF)'
              : S.surface2,
            color: canGenerate && !isGenerating ? '#fff' : S.dim,
            fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.2s',
            boxShadow: canGenerate && !isGenerating ? '0 4px 20px rgba(124,77,255,0.35)' : 'none',
            opacity: !canGenerate && !isGenerating ? 0.5 : 1,
          }}
          onMouseEnter={e => { if (canGenerate && !isGenerating) e.currentTarget.style.opacity = '0.9'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          {isGenerating ? (
            <>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }}
              />
              Generando...
            </>
          ) : (
            <>Generar Reporte ✦</>
          )}
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
