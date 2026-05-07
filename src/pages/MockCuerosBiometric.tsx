import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Download, Loader2 } from "lucide-react";
import { MeshBackground } from "@/components/report-builder/MeshBackground";
import { S } from "@/components/botialertas/types";
import BiometricCaptureSlide from "@/components/mbr-cueros/BiometricCaptureSlide";
import { exportDashboardPDF } from "@/utils/exportDashboardPDF";

/**
 * /mbr-cueros-biometric — slide standalone de captura biométrica para Cueros.
 *
 * Lo único que hace esta página es montar el shell + botón de export PDF y
 * renderizar `<BiometricCaptureSlide />`. La data, los charts y el layout
 * viven en el componente reutilizable (también lo usa /mbr-cueros-completo).
 */

const CLIENT = "Cueros Velez";
const PERIOD = "Octubre 2025 – Abril 2026";

export default function MockCuerosBiometric() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (!rootRef.current || exporting) return;
    setExporting(true);
    try {
      await exportDashboardPDF({
        rootElement: rootRef.current,
        filename: `${CLIENT.replace(/\s+/g, "_")}_Captura_Biometrica.pdf`,
      });
    } catch (e) {
      console.error("[MockCuerosBiometric] export failed:", e);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#08111E",
        position: "relative",
        fontFamily: "Inter, system-ui, sans-serif",
        color: S.text,
      }}
    >
      <MeshBackground />

      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(8,17,30,0.7)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${S.border}`,
          padding: "14px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: S.muted,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          MBR Ad-hoc · {CLIENT} · {PERIOD}
        </span>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 14px",
            borderRadius: 999,
            border: `1px solid ${exporting ? S.border : "rgba(124,77,255,0.5)"}`,
            background: exporting ? "rgba(255,255,255,0.04)" : "rgba(124,77,255,0.18)",
            color: exporting ? S.muted : S.text,
            fontSize: 12,
            fontWeight: 600,
            cursor: exporting ? "not-allowed" : "pointer",
            transition: "all 0.18s ease",
          }}
        >
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {exporting ? "Generando…" : "Exportar PDF"}
        </button>
      </div>

      <div style={{ padding: "32px 40px 60px", position: "relative", zIndex: 1 }}>
        <motion.div
          ref={rootRef}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{ maxWidth: 1240, margin: "0 auto" }}
        >
          <BiometricCaptureSlide clientName={CLIENT} periodLabel={PERIOD} />
        </motion.div>
      </div>
    </div>
  );
}
