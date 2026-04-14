/* ─────────────────────────────────────────────────────────
   WelcomeStep — Paso 1
   Greeting animado + elección de producto (DI / BGC / CE)
───────────────────────────────────────────────────────── */

import { useState } from "react";
import { motion } from "framer-motion";
import { UserCheck, ShieldCheck, MessageSquare, LogOut, Lightbulb } from "lucide-react";
import { type Product, type CsmRow, PRODUCT_COLORS } from "./moduleDefinitions";
import { FeedbackModal } from "./FeedbackModal";

/* ── paleta shell ── */
const S = {
  surface: '#172840',
  border:  'rgba(255,255,255,0.09)',
  text:    '#EEF0FF',
  muted:   '#8892B8',
  dim:     '#4A5580',
};

const PRODUCT_META: Record<Product, {
  icon: React.ReactNode;
  name: string;
  tagline: string;
  desc: string;
}> = {
  DI: {
    icon: <UserCheck size={28} strokeWidth={1.8} />,
    name: 'Digital Identity',
    tagline: 'Identidad Digital',
    desc: 'Verifica que el documento y la persona que lo envía sean legítimos y la misma.',
  },
  BGC: {
    icon: <ShieldCheck size={28} strokeWidth={1.8} />,
    name: 'Background Checks',
    tagline: 'Verificación de Antecedentes',
    desc: 'Consulta bases de datos para dar un nivel de confianza de tus usuarios.',
  },
  CE: {
    icon: <MessageSquare size={28} strokeWidth={1.8} />,
    name: 'Customer Engagement',
    tagline: 'Conversaciones WhatsApp',
    desc: 'Flujos de conversación automatizados para que tus usuarios se autogestionen.',
  },
};

const PRODUCTS: Product[] = ['DI', 'BGC', 'CE'];

function getNickname(nombre: string): string {
  const map: Record<string, string> = { 'Juan Pablo': 'Juanpa', 'Natalia': 'Nata' };
  for (const [k, v] of Object.entries(map)) {
    if (nombre.startsWith(k)) return v;
  }
  return nombre.split(' ')[0];
}

interface WelcomeStepProps {
  csmProfile: CsmRow | null;
  userEmail: string;
  onSelectProduct: (p: Product) => void;
  onLogout: () => void;
}

export function WelcomeStep({ csmProfile, userEmail, onSelectProduct, onLogout }: WelcomeStepProps) {
  const [hovered, setHovered] = useState<Product | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackProduct, setFeedbackProduct] = useState<Product>('DI');

  const nick = csmProfile ? getNickname(csmProfile.nombre) : userEmail.split('@')[0];
  const initials = csmProfile
    ? csmProfile.nombre.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : userEmail.slice(0, 2).toUpperCase();

  return (
    <div
      style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 24px',
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 24px',
          borderBottom: `0.5px solid ${S.border}`,
          background: 'rgba(8,12,31,0.7)',
          backdropFilter: 'blur(12px)',
          zIndex: 10,
        }}
      >
        {/* Logo / brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #7C4DFF, #4B6FFF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="12" height="12" rx="2" stroke="white" strokeWidth="1.2" opacity="0.9"/>
              <path d="M3.5 7h2l1-2 1 4 1-2h2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: S.text, letterSpacing: '-0.01em' }}>
            CSM Center
          </span>
        </div>

        {/* User info + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Feedback */}
          <button
            onClick={() => { setFeedbackProduct('DI'); setFeedbackOpen(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, color: S.muted, background: 'transparent',
              border: 'none', cursor: 'pointer', padding: '6px 10px',
              borderRadius: 8, transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = S.text)}
            onMouseLeave={e => (e.currentTarget.style.color = S.muted)}
          >
            <Lightbulb size={14} />
            <span>Feedback</span>
          </button>

          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'rgba(124,77,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#C4B3FF',
          }}>
            {initials}
          </div>
          <span style={{ fontSize: 12, color: S.muted, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {userEmail}
          </span>
          <button
            onClick={onLogout}
            title="Cerrar sesión"
            style={{
              background: 'transparent', border: 'none',
              cursor: 'pointer', color: S.dim, padding: '4px',
              borderRadius: 6, display: 'flex', alignItems: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = S.muted)}
            onMouseLeave={e => (e.currentTarget.style.color = S.dim)}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* ── Center content ── */}
      <div style={{ textAlign: 'center', maxWidth: 860, width: '100%' }}>

        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 12, fontWeight: 600, color: '#7C4DFF',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            marginBottom: 16,
          }}>
            <div style={{ width: 20, height: 1, background: '#7C4DFF', opacity: 0.6 }} />
            Report Builder
            <div style={{ width: 20, height: 1, background: '#7C4DFF', opacity: 0.6 }} />
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
          style={{
            fontSize: 42, fontWeight: 800, color: S.text,
            lineHeight: 1.15, letterSpacing: '-0.02em',
            marginBottom: 10,
          }}
        >
          ¡Hola, {nick}!
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
          style={{ fontSize: 16, color: S.muted, marginBottom: 52, lineHeight: 1.5 }}
        >
          ¿Qué reporte MBR vas a crear hoy?
        </motion.p>

        {/* ── Product cards ── */}
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
          {PRODUCTS.map((p, i) => {
            const color = PRODUCT_COLORS[p];
            const meta  = PRODUCT_META[p];
            const isHov = hovered === p;

            return (
              <motion.button
                key={p}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.45 + i * 0.12,
                  ease: [0.34, 1.56, 0.64, 1],
                }}
                onClick={() => onSelectProduct(p)}
                onMouseEnter={() => setHovered(p)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  width: 240,
                  padding: '28px 24px 24px',
                  borderRadius: 18,
                  background: isHov ? `${color}12` : `${color}06`,
                  border: `1px solid ${isHov ? `${color}60` : `${color}22`}`,
                  boxShadow: isHov ? `0 0 40px ${color}18, 0 8px 32px rgba(0,0,0,0.3)` : '0 4px 20px rgba(0,0,0,0.2)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex', flexDirection: 'column', gap: 0,
                  transform: isHov ? 'translateY(-4px)' : 'translateY(0)',
                  transition: 'all 0.22s ease',
                  outline: 'none',
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: `${color}18`,
                  border: `1px solid ${color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: color,
                  marginBottom: 20,
                }}>
                  {meta.icon}
                </div>

                {/* Badge */}
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: color,
                  marginBottom: 6,
                }}>
                  {p}
                </span>

                {/* Name */}
                <p style={{
                  fontSize: 17, fontWeight: 700, color: S.text,
                  lineHeight: 1.25, marginBottom: 10,
                }}>
                  {meta.name}
                </p>

                {/* Desc */}
                <p style={{
                  fontSize: 12.5, color: S.muted, lineHeight: 1.55,
                  flexGrow: 1, marginBottom: 22,
                }}>
                  {meta.desc}
                </p>

                {/* CTA */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600,
                  color: isHov ? color : S.dim,
                  transition: 'color 0.18s',
                }}>
                  Crear reporte
                  <motion.span animate={{ x: isHov ? 3 : 0 }} transition={{ duration: 0.18 }}>
                    →
                  </motion.span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Bottom hint ── */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1 }}
        style={{
          position: 'fixed', bottom: 20,
          fontSize: 11, color: S.dim,
        }}
      >
        Solo usuarios @truora.com · {userEmail}
      </motion.p>

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        product={feedbackProduct}
        userEmail={userEmail}
      />
    </div>
  );
}
