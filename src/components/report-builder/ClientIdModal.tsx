import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Key, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { type Product, PRODUCT_COLORS, PRODUCT_LABELS } from "./moduleDefinitions";

const CLIENT_ID_FIELDS = {
  DI:  "client_id_di",
  BGC: "client_id_bgc",
  CE:  "client_id_ce",
} as const;

type ClientIdField = (typeof CLIENT_ID_FIELDS)[keyof typeof CLIENT_ID_FIELDS];

interface ClientIdModalProps {
  open: boolean;
  onClose: () => void;
  product: Product;
  clientId: string;
  clientName: string;
  onSuccess: (clienteId: string, campo: ClientIdField, nuevoId: string) => void;
}

const S = {
  overlay:  'rgba(0,0,0,0.7)',
  surface:  '#0F1428',
  surface2: '#161C38',
  surface3: '#1E2548',
  border:   'rgba(255,255,255,0.08)',
  text:     '#EEF0FF',
  muted:    '#8892B8',
  dim:      '#4A5580',
};

export function ClientIdModal({
  open, onClose, product, clientId, clientName, onSuccess,
}: ClientIdModalProps) {
  const [value, setValue]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const color = PRODUCT_COLORS[product];

  const handleSave = async () => {
    const nuevoId = value.trim();
    if (!nuevoId) return;

    setSaving(true);
    setError('');

    try {
      const campo = CLIENT_ID_FIELDS[product];
      const { error: sbError } = await supabase
        .from('clientes')
        .update({ [campo]: nuevoId })
        .eq('id', clientId);

      if (sbError) throw new Error(sbError.message);

      onSuccess(clientId, campo, nuevoId);
      setValue('');
      onClose();
      toast.success(`CLIENT_ID de ${product} guardado para ${clientName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error inesperado';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleKey_enter();
    if (e.key === 'Escape') onClose();
  };

  const handleKey_enter = () => {
    if (value.trim() && !saving) handleSave();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: S.overlay, backdropFilter: 'blur(4px)',
            }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 101,
              width: 420, maxWidth: 'calc(100vw - 32px)',
              background: S.surface,
              border: `1px solid ${S.border}`,
              borderRadius: 20,
              padding: '32px 28px 28px',
              boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
            }}
          >
            {/* Close */}
            <button
              onClick={onClose}
              style={{
                position: 'absolute', top: 16, right: 16,
                background: 'transparent', border: 'none',
                cursor: 'pointer', color: S.dim, padding: 4,
                borderRadius: 6, display: 'flex', alignItems: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = S.muted)}
              onMouseLeave={e => (e.currentTarget.style.color = S.dim)}
            >
              <X size={16} />
            </button>

            {/* Icon + header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 24 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${color}18`, border: `1px solid ${color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: color,
              }}>
                <Key size={20} strokeWidth={1.8} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 800, color: S.text, margin: 0 }}>
                    Configurar CLIENT_ID
                  </h2>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: `${color}18`, border: `1px solid ${color}30`, color,
                  }}>
                    {product}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: S.muted, margin: 0, lineHeight: 1.5 }}>
                  <strong style={{ color: S.text }}>{clientName}</strong> no tiene un ID
                  configurado para {PRODUCT_LABELS[product]}.
                </p>
              </div>
            </div>

            {/* Input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                display: 'block', fontSize: 10, fontWeight: 600,
                color: S.muted, letterSpacing: '0.08em', textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                CLIENT_ID de {product}
              </label>
              <input
                autoFocus
                value={value}
                onChange={e => { setValue(e.target.value); setError(''); }}
                onKeyDown={handleKey}
                placeholder={`Ej: cli_${product.toLowerCase()}_abc123`}
                style={{
                  width: '100%', padding: '11px 14px',
                  background: S.surface2,
                  border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : value ? `${color}50` : S.border}`,
                  borderRadius: 10, fontSize: 13,
                  color: S.text, outline: 'none',
                  fontFamily: 'monospace',
                  transition: 'border-color 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={e => { if (!error) e.target.style.borderColor = `${color}70`; }}
                onBlur={e => { if (!error && !value) e.target.style.borderColor = S.border; }}
              />
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: 'auto', marginBottom: 14 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  style={{
                    fontSize: 11, color: '#FCA5A5', lineHeight: 1.5,
                    padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                  }}
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Hint */}
            <p style={{ fontSize: 11, color: S.dim, marginBottom: 20, lineHeight: 1.5 }}>
              Este ID se guarda en Supabase y queda disponible para todos los reportes futuros de este cliente.
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1, padding: '11px 16px', borderRadius: 10,
                  background: S.surface2, border: `1px solid ${S.border}`,
                  fontSize: 13, fontWeight: 600, color: S.muted,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = S.text; }}
                onMouseLeave={e => { e.currentTarget.style.color = S.muted; }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!value.trim() || saving}
                style={{
                  flex: 2, padding: '11px 16px', borderRadius: 10,
                  background: value.trim() && !saving
                    ? `linear-gradient(135deg, ${color}, ${color}CC)`
                    : S.surface2,
                  border: 'none',
                  fontSize: 13, fontWeight: 700,
                  color: value.trim() && !saving ? '#fff' : S.dim,
                  cursor: value.trim() && !saving ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s',
                  boxShadow: value.trim() && !saving ? `0 4px 16px ${color}30` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                {saving
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</>
                  : error ? 'Reintentar' : 'Guardar y continuar'
                }
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
