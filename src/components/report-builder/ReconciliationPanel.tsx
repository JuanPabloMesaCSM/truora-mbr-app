/* ─────────────────────────────────────────────────────────
   ReconciliationPanel — Panel de decisión de fuentes de datos
   Aparece después de la generación cuando hay diferencias
   entre Snowflake, ClickHouse y Sheet.
───────────────────────────────────────────────────────── */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Database, Info } from "lucide-react";

const S = {
  bg:      '#0D1B2E',
  surface: '#172840',
  surface2:'#1D3050',
  border:  'rgba(255,255,255,0.09)',
  text:    '#EEF0FF',
  muted:   '#8892B8',
  dim:     '#4A5580',
};

export interface AlertaRecon {
  metrica: string;
  snowflake: number;
  clickhouse_original: number;
  diferencia_ch_pct: number;
  sheet?: number | null;
  diferencia_sheet_pct?: number | null;
  mensaje: string;
}

export interface ReconciliacionData {
  tiene_alertas: boolean;
  total_alertas: number;
  alertas: AlertaRecon[];
  fuentes?: {
    snowflake?: Record<string, any>;
    clickhouse_original?: Record<string, any>;
    sheet?: Record<string, any> | null;
  };
}

interface ReconciliationPanelProps {
  reconciliacion: ReconciliacionData;
  clientName: string;
  periodLabel: string;
  onContinue: () => void;
}

function getSeverity(pct: number): { color: string; label: string } {
  if (Math.abs(pct) >= 20) return { color: '#EF4444', label: 'Alta' };
  if (Math.abs(pct) >= 10) return { color: '#F59E0B', label: 'Media' };
  return { color: '#22C55E', label: 'Baja' };
}

function fmt(n: number) {
  return n.toLocaleString('es-CL');
}

function AlertaRow({ alerta }: { alerta: AlertaRecon }) {
  const [open, setOpen] = useState(false);
  const chSev = getSeverity(alerta.diferencia_ch_pct);
  const shSev = alerta.diferencia_sheet_pct != null ? getSeverity(alerta.diferencia_sheet_pct) : null;
  const maxSev = getSeverity(Math.max(
    Math.abs(alerta.diferencia_ch_pct),
    Math.abs(alerta.diferencia_sheet_pct ?? 0)
  ));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        borderRadius: 12,
        border: `1px solid ${maxSev.color}30`,
        background: `${maxSev.color}06`,
        overflow: 'hidden',
      }}
    >
      {/* Row header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          padding: '12px 16px', gap: 12,
          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{
          flexShrink: 0, width: 8, height: 8, borderRadius: '50%',
          background: maxSev.color, boxShadow: `0 0 6px ${maxSev.color}80`,
        }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: S.text }}>
          {alerta.metrica}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8,
          background: `${maxSev.color}20`, color: maxSev.color, border: `1px solid ${maxSev.color}35`,
          flexShrink: 0,
        }}>
          {maxSev.label}
        </span>
        {open
          ? <ChevronUp size={14} color={S.dim} style={{ flexShrink: 0 }} />
          : <ChevronDown size={14} color={S.dim} style={{ flexShrink: 0 }} />
        }
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 16px 16px' }}>
              {/* Comparison table */}
              <div style={{
                borderRadius: 10, overflow: 'hidden',
                border: `1px solid ${S.border}`,
                marginBottom: 10,
              }}>
                {/* Header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  padding: '8px 14px', gap: 8,
                  background: S.surface2,
                  fontSize: 10, fontWeight: 700, color: S.dim,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  <span>Fuente</span>
                  <span style={{ textAlign: 'right' }}>Valor</span>
                  <span style={{ textAlign: 'right' }}>Diff vs SF</span>
                  <span style={{ textAlign: 'right' }}>Estado</span>
                </div>

                {/* Snowflake row (reference) */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  padding: '10px 14px', gap: 8,
                  borderTop: `1px solid ${S.border}`,
                  fontSize: 13, color: S.text, alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Database size={12} color="#7C4DFF" />
                    <span style={{ fontWeight: 600 }}>Snowflake</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                      background: 'rgba(124,77,255,0.2)', color: '#C4B3FF',
                    }}>OFICIAL</span>
                  </div>
                  <span style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(alerta.snowflake)}</span>
                  <span style={{ textAlign: 'right', color: S.dim }}>—</span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 6,
                      background: 'rgba(34,197,94,0.15)', color: '#22C55E',
                    }}>Referencia</span>
                  </span>
                </div>

                {/* ClickHouse row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  padding: '10px 14px', gap: 8,
                  borderTop: `1px solid ${S.border}`,
                  fontSize: 13, color: S.text, alignItems: 'center',
                  background: chSev.color === '#EF4444' ? 'rgba(239,68,68,0.04)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Database size={12} color={S.muted} />
                    <span>ClickHouse</span>
                  </div>
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(alerta.clickhouse_original)}</span>
                  <span style={{ textAlign: 'right', color: chSev.color, fontWeight: 600 }}>
                    {alerta.diferencia_ch_pct > 0 ? '+' : ''}{alerta.diferencia_ch_pct.toFixed(1)}%
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 6,
                      background: `${chSev.color}20`, color: chSev.color,
                    }}>{chSev.label}</span>
                  </span>
                </div>

                {/* Sheet row (if available) */}
                {alerta.sheet != null && (
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                    padding: '10px 14px', gap: 8,
                    borderTop: `1px solid ${S.border}`,
                    fontSize: 13, color: S.text, alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <Database size={12} color="#22C55E" />
                      <span>Google Sheet</span>
                    </div>
                    <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(alerta.sheet)}</span>
                    <span style={{ textAlign: 'right', color: shSev?.color ?? S.muted, fontWeight: 600 }}>
                      {alerta.diferencia_sheet_pct != null
                        ? `${alerta.diferencia_sheet_pct > 0 ? '+' : ''}${alerta.diferencia_sheet_pct.toFixed(1)}%`
                        : '—'}
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      {shSev && (
                        <span style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 6,
                          background: `${shSev.color}20`, color: shSev.color,
                        }}>{shSev.label}</span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Mensaje */}
              <p style={{ fontSize: 11, color: S.muted, lineHeight: 1.5, margin: 0 }}>
                {alerta.mensaje}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function ReconciliationPanel({ reconciliacion, clientName, periodLabel, onContinue }: ReconciliationPanelProps) {
  const hasSheet = reconciliacion.fuentes?.sheet != null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0, zIndex: 20,
        background: S.bg,
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 680, width: '100%', margin: '0 auto', padding: '40px 24px 60px' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: S.dim,
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>
              Validación de datos
            </span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              background: 'rgba(245,158,11,0.15)', color: '#F59E0B',
              border: '1px solid rgba(245,158,11,0.3)',
            }}>
              {clientName} · {periodLabel}
            </span>
          </div>

          {reconciliacion.tiene_alertas ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <AlertTriangle size={28} color="#F59E0B" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: S.text, margin: '0 0 6px', lineHeight: 1.2 }}>
                  Se encontraron {reconciliacion.total_alertas} diferencia{reconciliacion.total_alertas !== 1 ? 's' : ''} entre fuentes
                </h1>
                <p style={{ fontSize: 13, color: S.muted, margin: 0, lineHeight: 1.5 }}>
                  Revisa las diferencias antes de continuar. El reporte usará <strong style={{ color: '#C4B3FF' }}>Snowflake</strong> como fuente oficial.
                </p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <CheckCircle2 size={28} color="#22C55E" />
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: S.text, margin: '0 0 4px' }}>
                  Datos validados entre fuentes
                </h1>
                <p style={{ fontSize: 13, color: S.muted, margin: 0 }}>
                  Puedes continuar con confianza — las fuentes están alineadas.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Nota contextual ── */}
        <div style={{
          padding: '12px 16px', borderRadius: 12, marginBottom: 28,
          background: 'rgba(124,77,255,0.07)',
          border: '1px solid rgba(124,77,255,0.2)',
          display: 'flex', gap: 10,
        }}>
          <Info size={14} color="#9B7FFF" style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 11, color: '#9B7FFF', margin: 0, lineHeight: 1.6 }}>
            <strong>Nota:</strong> ClickHouse no filtra por flujo ni por IS_USED — las diferencias con Snowflake son esperadas y estructurales. La fuente oficial para el reporte es <strong>Snowflake</strong>.
            {!hasSheet && ' No se recibió data del Google Sheet del cliente.'}
          </p>
        </div>

        {/* ── Alertas ── */}
        {reconciliacion.tiene_alertas && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
            {reconciliacion.alertas.map((alerta, i) => (
              <AlertaRow key={i} alerta={alerta} />
            ))}
          </div>
        )}

        {/* ── CTA ── */}
        <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
          <button
            onClick={onContinue}
            style={{
              width: '100%', padding: '14px 20px',
              borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #7C4DFF, #4B6FFF)',
              color: '#fff', fontSize: 14, fontWeight: 700,
              boxShadow: '0 4px 20px rgba(124,77,255,0.3)',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            {reconciliacion.tiene_alertas ? 'Continuar de todas formas →' : 'Ver reporte →'}
          </button>

          {reconciliacion.tiene_alertas && (
            <p style={{ fontSize: 11, color: S.dim, textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
              Las diferencias en ClickHouse generalmente se explican por el alcance del filtro.
              Snowflake es la fuente más precisa para reportes de cliente.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
