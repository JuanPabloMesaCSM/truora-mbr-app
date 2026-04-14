/* ─────────────────────────────────────────────────────────
   LoginPage — pantalla de autenticación
   Dark theme con mesh background de Truora
───────────────────────────────────────────────────────── */

import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { MeshBackground } from "@/components/report-builder/MeshBackground";

const S = {
  surface: '#0F1428',
  border:  'rgba(255,255,255,0.08)',
  text:    '#EEF0FF',
  muted:   '#8892B8',
  dim:     '#4A5580',
};

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.44 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

/* Animated data nodes — decorative */
function DataNodes() {
  const nodes = [
    { x: '15%', y: '20%', delay: 0,    size: 6 },
    { x: '80%', y: '15%', delay: 0.6,  size: 4 },
    { x: '10%', y: '70%', delay: 1.0,  size: 5 },
    { x: '85%', y: '65%', delay: 0.3,  size: 4 },
    { x: '50%', y: '88%', delay: 0.8,  size: 3 },
    { x: '25%', y: '45%', delay: 1.4,  size: 3 },
    { x: '72%', y: '40%', delay: 0.5,  size: 5 },
  ];

  return (
    <>
      {nodes.map((n, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.5, 0.2, 0.5, 0],
            scale: [0, 1, 0.9, 1, 0],
          }}
          transition={{
            duration: 4,
            delay: n.delay,
            repeat: Infinity,
            repeatDelay: 2 + i * 0.5,
            ease: 'easeInOut',
          }}
          style={{
            position: 'fixed',
            left: n.x, top: n.y,
            width: n.size, height: n.size,
            borderRadius: '50%',
            background: '#7C4DFF',
            boxShadow: `0 0 ${n.size * 3}px rgba(124,77,255,0.6)`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  );
}

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          hd: "truora.com",
          prompt: "select_account",
        },
      },
    });

    if (error) {
      toast.error("Acceso denegado");
    }
  };

  return (
    <div style={{
      minHeight: '100vh', position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <MeshBackground />
      <DataNodes />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 0,
          background: S.surface,
          border: `1px solid ${S.border}`,
          borderRadius: 24,
          padding: '48px 44px 40px',
          width: 360,
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* Logo mark */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.34, 1.56, 0.64, 1] }}
          style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #7C4DFF 0%, #4B6FFF 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24,
            boxShadow: '0 8px 32px rgba(124,77,255,0.4)',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <rect x="2" y="2" width="22" height="22" rx="4" stroke="white" strokeWidth="1.5" opacity="0.9"/>
            <path d="M6 13h4l2-4 2 8 2-4h4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </motion.div>

        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ textAlign: 'center', marginBottom: 8 }}
        >
          <h1 style={{
            fontSize: 22, fontWeight: 800, color: S.text,
            letterSpacing: '-0.02em', margin: '0 0 6px',
          }}>
            CSM Center
          </h1>
          <p style={{ fontSize: 13, color: S.muted, margin: 0 }}>
            Generador de reportes MBR
          </p>
        </motion.div>

        {/* Divider */}
        <div style={{
          width: '100%', height: 0.5,
          background: S.border,
          margin: '24px 0',
        }} />

        {/* Domain notice */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          style={{ fontSize: 11, color: S.dim, textAlign: 'center', marginBottom: 16 }}
        >
          Solo para equipos <strong style={{ color: S.muted }}>@truora.com</strong>
        </motion.p>

        {/* Google button */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
          onClick={handleGoogleLogin}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 12, padding: '13px 20px', borderRadius: 12,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
            cursor: 'pointer', fontSize: 14, fontWeight: 600,
            color: S.text,
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.11)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
          }}
        >
          <GoogleLogo />
          Continuar con Google
        </motion.button>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          style={{ fontSize: 10, color: S.dim, marginTop: 20, textAlign: 'center' }}
        >
          Truora Customer Success · Uso interno
        </motion.p>
      </motion.div>
    </div>
  );
}
