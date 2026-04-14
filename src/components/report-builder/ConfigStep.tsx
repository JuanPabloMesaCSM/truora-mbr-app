/* ─────────────────────────────────────────────────────────
   ConfigStep — Paso 2
   Selección de cliente y periodo. Los flujos/types se
   cargan en background automáticamente al completar ambos.
───────────────────────────────────────────────────────── */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Loader2, ArrowLeft, ChevronUp } from "lucide-react";
import {
  PRODUCT_COLORS, PRODUCT_LABELS, PRODUCT_CLIENT_FIELD,
  generatePeriods,
  type Product, type CsmRow, type ClienteRow,
} from "./moduleDefinitions";

const S = {
  bg:       '#080C1F',
  surface:  '#0F1428',
  surface2: '#161C38',
  surface3: '#1E2548',
  border:   'rgba(255,255,255,0.07)',
  borderHov:'rgba(255,255,255,0.14)',
  text:     '#EEF0FF',
  muted:    '#8892B8',
  dim:      '#4A5580',
};

const PERIODS = generatePeriods();

/* ── Custom dropdown ── */
function DarkSelect({
  value, onChange, placeholder, options, color,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { label: string; value: string; group?: string }[];
  color: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedLabel = options.find(o => o.value === value)?.label ?? '';

  // Group options by group key
  const groups: { label: string | null; items: typeof options }[] = [];
  const seenGroups = new Set<string>();
  for (const opt of options) {
    const g = opt.group ?? '';
    if (!seenGroups.has(g)) {
      seenGroups.add(g);
      groups.push({ label: g || null, items: options.filter(o => (o.group ?? '') === g) });
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 14px',
          background: open ? S.surface3 : S.surface2,
          border: `1px solid ${open ? color + '50' : S.border}`,
          borderRadius: 10, cursor: 'pointer',
          fontSize: 13, color: value ? S.text : S.dim,
          transition: 'all 0.15s',
          outline: 'none',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>
          {selectedLabel || placeholder}
        </span>
        {open ? <ChevronUp size={14} color={S.muted} /> : <ChevronDown size={14} color={S.muted} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
              zIndex: 50, background: '#12183A',
              border: `1px solid ${S.border}`,
              borderRadius: 12, overflow: 'hidden',
              maxHeight: 260, overflowY: 'auto',
              boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
            }}
          >
            {groups.map(({ label: groupLabel, items }) => (
              <div key={groupLabel ?? '__nogroup'}>
                {groupLabel && (
                  <div style={{
                    padding: '8px 14px 4px',
                    fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                    color: S.dim, textTransform: 'uppercase',
                  }}>
                    {groupLabel}
                  </div>
                )}
                {items.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    style={{
                      width: '100%', textAlign: 'left',
                      padding: '9px 14px',
                      fontSize: 13,
                      color: opt.value === value ? color : S.text,
                      background: opt.value === value ? `${color}15` : 'transparent',
                      border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { if (opt.value !== value) e.currentTarget.style.background = S.surface3; }}
                    onMouseLeave={e => { if (opt.value !== value) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {opt.label}
                    </span>
                    {opt.value === value && (
                      <span style={{ color: color, fontSize: 14, flexShrink: 0 }}>✓</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Props ── */
interface ConfigStepProps {
  product: Product;
  csmProfile: CsmRow | null;
  userEmail: string;
  clients: ClienteRow[];
  selectedClientId: string | null;
  setSelectedClientId: (id: string | null) => void;
  periodValue: string;
  setPeriodValue: (v: string) => void;
  /* loading state from parent (flujos/types being fetched) */
  isLoading: boolean;
  canContinue: boolean;
  isAdmin: boolean;
  onBack: () => void;
  onContinue: () => void;
  onReloadClients: () => void;
  onConfigureClientId: () => void;
}

export function ConfigStep({
  product, csmProfile, userEmail,
  clients, selectedClientId, setSelectedClientId,
  periodValue, setPeriodValue,
  isLoading, canContinue, isAdmin,
  onBack, onContinue, onReloadClients, onConfigureClientId,
}: ConfigStepProps) {
  const color = PRODUCT_COLORS[product];

  /* Filter clients by CSM unless admin */
  const visibleClients = isAdmin
    ? clients
    : clients.filter(c => c.csm_email?.toLowerCase() === userEmail.toLowerCase());

  /* Build options for client dropdown */
  const clientOptions = isAdmin
    ? (() => {
        // Group by CSM email
        const groups: Record<string, ClienteRow[]> = {};
        for (const c of clients) {
          (groups[c.csm_email] = groups[c.csm_email] || []).push(c);
        }
        return Object.entries(groups).flatMap(([email, cs]) =>
          cs.map(c => ({ label: c.nombre, value: c.id, group: email }))
        );
      })()
    : visibleClients.map(c => ({ label: c.nombre, value: c.id }));

  const periodOptions = PERIODS.map(p => ({ label: p.label, value: p.value }));

  const selectedClient = clients.find(c => c.id === selectedClientId) ?? null;
  const clientHasProduct = selectedClient
    ? !!selectedClient[PRODUCT_CLIENT_FIELD[product]]
    : true; // no client → don't show warning yet

  const showMissingClientId = selectedClientId && !clientHasProduct;

  const bothSelected = !!selectedClientId && !!periodValue;

  return (
    <div
      style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px 40px',
      }}
    >
      {/* ── Back link ── */}
      <motion.button
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
        onClick={onBack}
        style={{
          position: 'fixed', top: 18, left: 20,
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, color: S.muted,
          background: 'transparent', border: 'none',
          cursor: 'pointer', padding: '6px 10px', borderRadius: 8,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = S.text)}
        onMouseLeave={e => (e.currentTarget.style.color = S.muted)}
      >
        <ArrowLeft size={14} />
        Cambiar producto
      </motion.button>

      {/* ── Product badge (top center) ── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          fontSize: 12, fontWeight: 700,
          padding: '5px 12px', borderRadius: 20,
          background: `${color}18`, border: `1px solid ${color}40`,
          color: color,
        }}>
          <span style={{ fontWeight: 800, letterSpacing: '0.06em' }}>{product}</span>
          <span style={{ color: S.muted, fontWeight: 400 }}>·</span>
          <span style={{ color: S.muted, fontWeight: 500 }}>{PRODUCT_LABELS[product]}</span>
        </span>
      </motion.div>

      {/* ── Config card ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: '100%', maxWidth: 460,
          background: S.surface,
          border: `1px solid ${S.border}`,
          borderRadius: 20,
          padding: '36px 32px 32px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: S.dim, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
            Configurar reporte
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: S.text, lineHeight: 1.2, margin: 0 }}>
            ¿Para quién y cuándo?
          </h2>
        </div>

        {/* Client selector */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: S.muted, marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Cliente
          </label>
          {clients.length === 0 ? (
            <button
              onClick={onReloadClients}
              style={{
                width: '100%', padding: '11px 14px',
                background: S.surface2, border: `1px solid ${S.border}`,
                borderRadius: 10, cursor: 'pointer',
                fontSize: 13, color: '#F59E0B',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <Loader2 size={14} className="animate-spin" /> Recargar clientes...
            </button>
          ) : (
            <DarkSelect
              value={selectedClientId ?? ''}
              onChange={v => setSelectedClientId(v || null)}
              placeholder="Seleccionar cliente"
              options={clientOptions}
              color={color}
            />
          )}
        </div>

        {/* Period selector */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: S.muted, marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Periodo
          </label>
          <DarkSelect
            value={periodValue}
            onChange={setPeriodValue}
            placeholder="Seleccionar mes"
            options={periodOptions}
            color={color}
          />
        </div>

        {/* Missing CLIENT_ID warning */}
        <AnimatePresence>
          {showMissingClientId && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: 'auto', marginBottom: 16 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.25)',
                fontSize: 12, color: '#FCA5A5', lineHeight: 1.5,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}
            >
              <span>
                <strong>{selectedClient?.nombre}</strong> no tiene CLIENT_ID para {product}.
              </span>
              <button
                onClick={onConfigureClientId}
                style={{
                  flexShrink: 0,
                  fontSize: 11, fontWeight: 700,
                  padding: '5px 12px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#FCA5A5', cursor: 'pointer',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; }}
              >
                Configurar →
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading indicator while fetching flows/types */}
        <AnimatePresence>
          {bothSelected && !showMissingClientId && isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12, color: S.muted, marginBottom: 16,
              }}
            >
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite', color }} />
              Cargando configuración del cliente...
            </motion.div>
          )}
        </AnimatePresence>

        {/* Continue button */}
        <button
          disabled={!canContinue}
          onClick={onContinue}
          style={{
            width: '100%', padding: '13px 20px',
            borderRadius: 12, border: 'none', cursor: canContinue ? 'pointer' : 'not-allowed',
            background: canContinue
              ? `linear-gradient(135deg, ${color}, ${color}CC)`
              : S.surface2,
            color: canContinue ? '#fff' : S.dim,
            fontSize: 14, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.2s',
            boxShadow: canContinue ? `0 4px 20px ${color}30` : 'none',
          }}
          onMouseEnter={e => { if (canContinue) e.currentTarget.style.opacity = '0.9'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          Continuar al constructor
          <span style={{ fontSize: 16 }}>→</span>
        </button>

        {/* CSM info */}
        {csmProfile && (
          <p style={{ marginTop: 14, fontSize: 11, color: S.dim, textAlign: 'center' }}>
            CSM: {csmProfile.nombre}
          </p>
        )}
      </motion.div>
    </div>
  );
}
