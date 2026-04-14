/* ─────────────────────────────────────────────────────────
   MeshBackground
   Fixed animated gradient mesh — navy/purple/teal Truora palette
   Renders behind every step via position:fixed
───────────────────────────────────────────────────────── */

export function MeshBackground() {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 0,
        overflow: 'hidden', background: '#0D1B2E',
        pointerEvents: 'none',
      }}
    >
      <style>{`
        @keyframes meshOrb1 {
          0%,100% { transform: translate(0%,0%) scale(1); }
          25%     { transform: translate(4%,-6%) scale(1.09); }
          50%     { transform: translate(-3%,4%) scale(0.94); }
          75%     { transform: translate(-5%,-2%) scale(1.04); }
        }
        @keyframes meshOrb2 {
          0%,100% { transform: translate(0%,0%) scale(1); }
          25%     { transform: translate(-6%,5%) scale(0.91); }
          50%     { transform: translate(4%,-6%) scale(1.07); }
          75%     { transform: translate(6%,3%) scale(0.96); }
        }
        @keyframes meshOrb3 {
          0%,100% { transform: translate(0%,0%) scale(1); }
          33%     { transform: translate(6%,6%) scale(1.06); }
          66%     { transform: translate(-4%,-5%) scale(0.93); }
        }
        @keyframes meshOrb4 {
          0%,100% { transform: translate(0%,0%) scale(1); }
          40%     { transform: translate(-5%,4%) scale(1.08); }
          70%     { transform: translate(5%,-3%) scale(0.95); }
        }
      `}</style>

      {/* Orb 1 — Truora purple, top-left */}
      <div style={{
        position: 'absolute', top: '-22%', left: '-18%',
        width: '60%', height: '60%', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(124,77,255,0.24) 0%, transparent 68%)',
        animation: 'meshOrb1 20s ease-in-out infinite',
        filter: 'blur(48px)',
      }} />

      {/* Orb 2 — electric blue, top-right */}
      <div style={{
        position: 'absolute', top: '-12%', right: '-22%',
        width: '55%', height: '55%', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(75,111,255,0.20) 0%, transparent 68%)',
        animation: 'meshOrb2 24s ease-in-out infinite',
        filter: 'blur(56px)',
      }} />

      {/* Orb 3 — teal, bottom-center-left */}
      <div style={{
        position: 'absolute', bottom: '-22%', left: '15%',
        width: '50%', height: '50%', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,201,167,0.13) 0%, transparent 68%)',
        animation: 'meshOrb3 28s ease-in-out infinite',
        filter: 'blur(64px)',
      }} />

      {/* Orb 4 — deep indigo, bottom-right */}
      <div style={{
        position: 'absolute', bottom: '-18%', right: '-12%',
        width: '45%', height: '45%', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(108,63,197,0.18) 0%, transparent 68%)',
        animation: 'meshOrb4 22s ease-in-out infinite',
        filter: 'blur(52px)',
      }} />

      {/* Noise grain overlay */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.035 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="csm-mesh-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.68" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#csm-mesh-noise)" />
      </svg>
    </div>
  );
}
