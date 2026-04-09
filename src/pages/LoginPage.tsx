import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

/* Google "G" logo SVG */
function GoogleLogo() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.44 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

/* Identity verification animation */
function VerificationAnimation() {
  return (
    <div className="relative w-64 h-80">
      {/* Document card */}
      <motion.div
        className="absolute inset-x-8 inset-y-8 rounded-xl border-2 border-primary/20 bg-card shadow-lg overflow-hidden"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        {/* Header bar */}
        <div className="h-10 bg-secondary flex items-center px-4 gap-2">
          <div className="w-2 h-2 rounded-full bg-primary/60" />
          <div className="w-2 h-2 rounded-full bg-primary/40" />
          <div className="w-2 h-2 rounded-full bg-primary/20" />
        </div>

        {/* Content skeleton */}
        <div className="p-5 space-y-3">
          {/* Photo placeholder */}
          <div className="flex gap-3">
            <div className="w-14 h-16 rounded-md bg-muted border border-border" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-2.5 bg-muted rounded-full w-3/4" />
              <div className="h-2 bg-muted rounded-full w-1/2" />
              <div className="h-2 bg-muted rounded-full w-2/3" />
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Data rows */}
          {[0.8, 0.6, 0.9, 0.5].map((w, i) => (
            <motion.div
              key={i}
              className="flex items-center gap-2"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.15 }}
            >
              <div className="h-2 bg-muted rounded-full" style={{ width: `${w * 100}%` }} />
              <motion.div
                className="w-3.5 h-3.5 rounded-full border-2 border-primary/30"
                animate={{ borderColor: ["hsl(256 100% 50% / 0.3)", "hsl(256 100% 50% / 0.8)", "hsl(256 100% 50% / 0.3)"] }}
                transition={{ duration: 2, delay: 1 + i * 0.3, repeat: Infinity }}
              />
            </motion.div>
          ))}
        </div>

        {/* Scanner line */}
        <div className="absolute inset-x-0 top-10 bottom-0 pointer-events-none overflow-hidden">
          <div className="animate-scan-line absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent shadow-[0_0_12px_hsl(256_100%_50%/0.6)]" />
        </div>
      </motion.div>

      {/* Floating nodes */}
      {[
        { x: 0, y: 20, delay: 0 },
        { x: 220, y: 60, delay: 0.5 },
        { x: 30, y: 260, delay: 1 },
        { x: 200, y: 240, delay: 1.5 },
      ].map((node, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full bg-primary/40 animate-float"
          style={{ left: node.x, top: node.y, animationDelay: `${node.delay}s` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 + i * 0.2 }}
        />
      ))}

      {/* Connecting lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
        <motion.line
          x1="10" y1="24" x2="40" y2="40"
          stroke="hsl(256 100% 50% / 0.15)" strokeWidth="1"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
        />
        <motion.line
          x1="230" y1="64" x2="208" y2="80"
          stroke="hsl(256 100% 50% / 0.15)" strokeWidth="1"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ delay: 1.4, duration: 0.5 }}
        />
      </svg>
    </div>
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-muted via-background to-muted/50 pointer-events-none" />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Logo & branding */}
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Report Builder</h1>
          <p className="text-sm text-muted-foreground">Generador de reportes MBR</p>
        </div>

        {/* Animation */}
        <VerificationAnimation />

        {/* Google button - icon only */}
        <motion.button
          onClick={handleGoogleLogin}
          className="w-14 h-14 rounded-full bg-card border border-border shadow-md flex items-center justify-center hover:shadow-lg hover:border-primary/30 transition-all duration-200"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <GoogleLogo />
        </motion.button>
      </motion.div>
    </div>
  );
}
