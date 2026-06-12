/* ─────────────────────────────────────────────────────────
   Validador — "Clientes por Validador" (scope B)
   4ta entrada del Report Builder (junto a DI/BGC/CE). Lista los clientes
   medidos POR VALIDACIÓN (standalone: generan validations sin process_id →
   el Report Builder DI estándar les da 0). Genera un MBR CH-powered con las
   métricas que SÍ aplican: consumo facturable por tipo + razones por
   validación + histórico facturable. NO embudo/usuarios/reintentos/abandono
   (no existen como modelo para standalone — ver project_di_report_builder_ch_migration).

   Estado: MOCK-FIRST. La lista de clientes y la data del MBR son mock; el
   cableado real (Supabase clientes standalone + webhook CH Endpoints 1/2/3)
   es el próximo incremento.
───────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Fingerprint, ChevronDown, Search, FileBarChart, Download, Presentation } from "lucide-react";
import { MeshBackground } from "@/components/report-builder/MeshBackground";
import {
  SlideCanvas, PortadaSlide, AgendaSlide, SeparadorSlide, UpdatesSlide, CierreSlide,
  type Theme,
} from "@/components/report-builder/SlideCanvas";
import { GeneratingOverlay } from "@/components/report-builder/GeneratingOverlay";
import { generatePeriods, parsePeriod } from "@/components/report-builder/moduleDefinitions";
import { exportPDF, exportPPTX } from "@/utils/exportPDF";

/* Nombres completos de CSM (tabla `csm` de Supabase) — para no mostrar el alias del correo. */
const CSM_NAMES: Record<string, string> = {
  "jpmesa@truora.com": "Juan Pablo Mesa",
  "nagutierrez@truora.com": "Natalia Gutierrez",
  "jpotoya@truora.com": "Juan Pablo Otoya",
  "sduran@truora.com": "Sebastian Duran",
  "dtibaquira@truora.com": "Daniela Tibaquirá",
  "evarela@truora.com": "Elisa Varela",
  "vlopez@truora.com": "Valeria Lopez",
  "varango@truora.com": "Valentina Arango",
};
const csmName = (email: string) => CSM_NAMES[email] || email.split("@")[0];

/* ── paleta shell (igual que WelcomeStep / BotiAlertas) ── */
const S = {
  surface: "#172840",
  surfaceHi: "#1B2F4D",
  border: "rgba(255,255,255,0.09)",
  text: "#EEF0FF",
  muted: "#8892B8",
  dim: "#4A5580",
};
const ACCENT = "#34D399"; // teal — emparentado con DI (#00C9A7) pero distinto

/* ── Clientes que consumen por validador — datos REALES de Supabase `clientes`
   (nombre + TCI exactos). Curado a mano por ahora; el cableado real cargará de
   Supabase + clasificará por validación dinámicamente. `grado`: '100%' = el
   Report Builder DI estándar les da 0 (puro por validación); 'alto' = mayormente
   por validación pero con algunos procesos. Fuente: skill standalone-validations-mbr. ── */
interface ValidadorClient { tci: string; nombre: string; csm: string; grado: "100%" | "alto"; }
const VALIDADOR_CLIENTS: ValidadorClient[] = [
  { tci: "TCIdc09a6d69109eb5d3b3fe7787783c6d5", nombre: "Confiamos",   csm: "jpmesa@truora.com",      grado: "100%" },
  { tci: "5rk9eemgdj4ngsc3ucq0l196vr",          nombre: "Trii",        csm: "nagutierrez@truora.com", grado: "100%" },
  { tci: "TCI83d4b49da224c317d08d3c71015db4f4", nombre: "Indrive",     csm: "dtibaquira@truora.com",  grado: "100%" }, // solo Documento vía API (desde mayo 2026); RB DI estándar = 0
  { tci: "TCIefe7d18036f5a8be4016ce1df2553957", nombre: "Sicrea",      csm: "varango@truora.com",     grado: "100%" }, // DI vía API (rostro + doc + e-signature); RB DI estándar = 0
  { tci: "TCIc931783f045952c3ef1da79fbbdf90e4", nombre: "MejorCDT",    csm: "jpotoya@truora.com",    grado: "alto" },
  { tci: "TCIb1afd2ba9d47d0aab336955d539a7713", nombre: "Agricapital", csm: "sduran@truora.com",     grado: "alto" },
  { tci: "TCIdb1b7314c47c7d0b175640f4d1680a0c", nombre: "Ban100",      csm: "nagutierrez@truora.com", grado: "alto" },
];

/* ── MOCK del MBR CH-powered (Confiamos abril, validado: total 5.357).
   Forma de los 3 bloques que devolverán los Endpoints CH 1/2/3. ── */
const MOCK_MBR_DATA: Record<string, any[]> = {
  consumo_facturable: [
    { bloque: "consumo_facturable", col1: "validations_document_validation",               col2: "3184", col3: "2591", col4: "593", col5: "6162" },
    { bloque: "consumo_facturable", col1: "validations_face_recognition_passive_liveness", col2: "1091", col3: "843",  col4: "248" },
    { bloque: "consumo_facturable", col1: "validations_face_search",                       col2: "1082", col3: "1082", col4: "0"   },
  ],
  // col2 = TYPE de SF DOCUMENT_VALIDATION_HISTORY (document-validation / face-recognition).
  // Números reales Confiamos abril 2026 (validados vs SF).
  razones_validacion: [
    { bloque: "razones_validacion", col1: "missing_text",                            col2: "document-validation", col3: "132" },
    { bloque: "razones_validacion", col1: "image_face_validation_not_passed",        col2: "document-validation", col3: "95" },
    { bloque: "razones_validacion", col1: "production_data_inconsistency",           col2: "document-validation", col3: "74" },
    { bloque: "razones_validacion", col1: "document_is_a_photo_of_photo",            col2: "document-validation", col3: "64" },
    { bloque: "razones_validacion", col1: "document_is_a_photocopy",                 col2: "document-validation", col3: "31" },
    { bloque: "razones_validacion", col1: "invalid_issue_date",                      col2: "document-validation", col3: "25" },
    { bloque: "razones_validacion", col1: "similarity_threshold_not_passed",         col2: "face-recognition",    col3: "165" },
    { bloque: "razones_validacion", col1: "passive_liveness_verification_not_passed",col2: "face-recognition",    col3: "74" },
    { bloque: "razones_validacion", col1: "no_face_detected",                        col2: "face-recognition",    col3: "7" },
  ],
  historico_facturable: [
    { bloque: "historico_facturable", periodo: "2026-01-01", col1: "5937", col2: "4945" },
    { bloque: "historico_facturable", periodo: "2026-02-01", col1: "6109", col2: "4965" },
    { bloque: "historico_facturable", periodo: "2026-03-01", col1: "6161", col2: "5183" },
    { bloque: "historico_facturable", periodo: "2026-04-01", col1: "5357", col2: "4516" },
  ],
};

// "desempeno_validacion" combina doc-vs-rostro (POR_TIPO de consumo_facturable) + top-5
// razones (razones_validacion) en un solo slide gráfico → reemplaza el slide textual de razones.
const VALIDADOR_SLIDES = ["consumo_facturable", "desempeno_validacion", "historico_facturable"];

// Webhook del flujo n8n "Report Builder Validador" (CH consumo/histórico + SF razones).
const VALIDADOR_WEBHOOK = "https://n8n.zapsign.com.br/webhook/report-builder-validador";
// true = usa MOCK_MBR_DATA (preview offline, sin webhook); false = pega al webhook real.
const MOCK_MODE = false;

export default function Validador() {
  const navigate = useNavigate();
  const periods = useMemo(() => generatePeriods(), []);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ValidadorClient | null>(null);
  // Default = último mes CERRADO (mes anterior al actual). La lista incluye meses
  // futuros de 2026, así que NO se puede usar el último de la lista (daría diciembre vacío).
  const [periodValue, setPeriodValue] = useState(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const cerrados = periods.filter(p => p.value < ym); // estrictamente antes del mes actual
    return (cerrados.length ? cerrados[cerrados.length - 1] : periods[periods.length - 1])?.value || "";
  });
  const [periodOpen, setPeriodOpen] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [genStatus, setGenStatus] = useState<"generating" | "success" | "error" | null>(null);
  const [theme] = useState<Theme>("dark");
  const [mbrData, setMbrData] = useState<Record<string, any[]>>(MOCK_MBR_DATA);
  const [exporting, setExporting] = useState<"pdf" | "pptx" | null>(null);

  const filtered = VALIDADOR_CLIENTS.filter(c =>
    c.nombre.toLowerCase().includes(query.toLowerCase()));
  const periodLabel = periodValue ? parsePeriod(periodValue).periodoReporte : "";
  const canGenerate = !!selected && !!periodValue;

  /* Genera el MBR: pega al webhook n8n (CH consumo/histórico + SF razones) y muestra
     el overlay mientras llega la respuesta. MOCK_MODE=true → datos de ejemplo offline. */
  const startGenerate = async () => {
    if (!canGenerate || !selected) return;
    setGenStatus("generating");
    if (MOCK_MODE) {
      setMbrData(MOCK_MBR_DATA);
      setTimeout(() => setGenStatus("success"), 1500);
      return;
    }
    try {
      const { fechaInicio, fechaFin } = parsePeriod(periodValue);
      const resp = await fetch(VALIDADOR_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          CLIENT_ID: selected.tci,
          from: fechaInicio,
          to: fechaFin,
          cliente: selected.nombre,
          periodo_reporte: periodLabel,
        }),
      });
      let json: any = await resp.json();
      if (Array.isArray(json)) json = json[0] ?? {};
      if (json && json.status === "success" && json.data) {
        setMbrData(json.data);
        setGenStatus("success");
      } else {
        setGenStatus("error");
      }
    } catch (e) {
      console.error("[Validador] webhook error:", e);
      setGenStatus("error");
    }
  };

  /* Export — reusa el mismo pipeline del Report Builder (off-screen clone de los
     #canvas-mbr-slides). Mismos nombres de archivo MBR_<cliente>_<periodo>. */
  const handleExportPDF = () =>
    exportPDF(selected?.nombre || "Cliente", periodLabel, () => setExporting("pdf"), () => setExporting(null));
  const handleExportPPTX = () =>
    exportPPTX(selected?.nombre || "Cliente", periodLabel, () => setExporting("pptx"), () => setExporting(null));

  return (
    <div style={{ position: "relative", minHeight: "100vh", overflow: "hidden" }}>
      <MeshBackground />

      {/* Top bar */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 10,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px", borderBottom: `0.5px solid ${S.border}`,
        background: "rgba(8,12,31,0.7)", backdropFilter: "blur(12px)",
      }}>
        <button onClick={() => navigate("/")} style={{
          display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600,
          color: S.muted, background: "transparent", border: "none", cursor: "pointer", padding: "6px 10px",
        }}>
          <ArrowLeft size={15} /> Report Builder
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Fingerprint size={16} color={ACCENT} />
          <span style={{ fontSize: 13, fontWeight: 700, color: S.text }}>Clientes por Validador</span>
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 1, paddingTop: 80, paddingBottom: 60,
        maxWidth: 1340, margin: "0 auto", padding: "80px 24px 60px" }}>

        {!generated ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            {/* Header */}
            <div style={{ marginBottom: 8, display: "inline-flex", alignItems: "center", gap: 8,
              fontSize: 12, fontWeight: 600, color: ACCENT, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              <div style={{ width: 20, height: 1, background: ACCENT, opacity: 0.6 }} />
              Medición por validación
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: S.text, letterSpacing: "-0.02em", margin: "0 0 8px" }}>
              Clientes por Validador
            </h1>
            <p style={{ fontSize: 14, color: S.muted, lineHeight: 1.5, maxWidth: 720, margin: "0 0 28px" }}>
              Estos clientes consumen por validación: generan validaciones que no se atan a un proceso de
              identidad, por eso el Report Builder DI estándar les da 0. Su MBR se arma desde ClickHouse con
              lo que aplica a una medición por validador: consumo por tipo de validación, razones de rechazo e
              histórico — sin embudo ni conversión por proceso.
            </p>

            {/* Controles: buscador + período */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 240,
                background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, padding: "8px 14px" }}>
                <Search size={15} color={S.muted} />
                <input value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar cliente…"
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none",
                    color: S.text, fontSize: 13 }} />
              </div>

              {/* Period dropdown (custom, no shadcn) */}
              <div style={{ position: "relative" }}>
                <button onClick={() => setPeriodOpen(o => !o)} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 999,
                  background: `${ACCENT}18`, border: `1px solid ${ACCENT}50`, color: S.text,
                  fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {periodLabel || "Período"} <ChevronDown size={14} />
                </button>
                {periodOpen && (
                  <>
                    <div onClick={() => setPeriodOpen(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 20 }} />
                    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                      style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 21,
                        background: S.surfaceHi, border: `1px solid ${S.border}`, borderRadius: 12,
                        padding: 6, maxHeight: 280, overflowY: "auto", minWidth: 180,
                        boxShadow: "0 12px 40px rgba(0,0,0,0.4)" }}>
                      {periods.slice().reverse().map(p => (
                        <button key={p.value} onClick={() => { setPeriodValue(p.value); setPeriodOpen(false); }}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
                            borderRadius: 8, background: p.value === periodValue ? `${ACCENT}20` : "transparent",
                            border: "none", color: p.value === periodValue ? ACCENT : S.text,
                            fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          {p.label}
                        </button>
                      ))}
                    </motion.div>
                  </>
                )}
              </div>
            </div>

            {/* Lista de clientes */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {filtered.map((c, i) => {
                const isSel = selected?.tci === c.tci;
                return (
                  <motion.button key={c.tci}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.3) }}
                    onClick={() => setSelected(c)}
                    style={{ position: "relative", textAlign: "left", cursor: "pointer",
                      background: isSel ? S.surfaceHi : S.surface,
                      border: `1px solid ${isSel ? `${ACCENT}60` : S.border}`,
                      borderRadius: 14, padding: "16px 18px",
                      boxShadow: isSel ? `0 0 24px ${ACCENT}20` : "none",
                      transform: isSel ? "translateY(-2px)" : "none", transition: "all 0.18s" }}>
                    <div style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 3,
                      borderRadius: 3, background: isSel ? ACCENT : "transparent" }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: S.text }}>{c.nombre}</p>
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
                        color: c.grado === "100%" ? ACCENT : "#FBBF24",
                        background: c.grado === "100%" ? `${ACCENT}1A` : "rgba(251,191,36,0.14)",
                        border: `1px solid ${c.grado === "100%" ? `${ACCENT}40` : "rgba(251,191,36,0.35)"}`,
                        borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
                        {c.grado === "100%" ? "100% por validación" : "mayormente"}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: S.muted }}>
                      {csmName(c.csm)}
                    </p>
                  </motion.button>
                );
              })}
            </div>

            {/* CTA generar */}
            <div style={{ marginTop: 28, display: "flex", justifyContent: "flex-end" }}>
              <button disabled={!canGenerate} onClick={startGenerate}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 22px", borderRadius: 999,
                  background: canGenerate ? ACCENT : "rgba(255,255,255,0.06)",
                  color: canGenerate ? "#062A24" : S.dim, border: "none",
                  fontSize: 13, fontWeight: 700, cursor: canGenerate ? "pointer" : "not-allowed" }}>
                <FileBarChart size={16} />
                {selected ? `Generar MBR — ${selected.nombre}` : "Seleccioná un cliente"}
              </button>
            </div>
          </motion.div>
        ) : (
          /* ── Canvas del MBR generado ── */
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: S.text, margin: 0 }}>
                  {selected?.nombre} · {periodLabel}
                </h2>
                <p style={{ fontSize: 12, color: S.muted, margin: "4px 0 0" }}>
                  MBR por validación · consumo por validador (ClickHouse) + razones (Snowflake)
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={handleExportPDF} disabled={!!exporting} style={{
                  display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
                  color: S.muted, background: S.surface, border: `1px solid ${S.border}`,
                  borderRadius: 999, padding: "8px 14px", cursor: exporting ? "default" : "pointer",
                  opacity: exporting ? 0.6 : 1 }}>
                  <Download size={14} /> {exporting === "pdf" ? "Exportando…" : "PDF"}
                </button>
                <button onClick={handleExportPPTX} disabled={!!exporting} style={{
                  display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600,
                  color: S.muted, background: S.surface, border: `1px solid ${S.border}`,
                  borderRadius: 999, padding: "8px 14px", cursor: exporting ? "default" : "pointer",
                  opacity: exporting ? 0.6 : 1 }}>
                  <Presentation size={14} /> {exporting === "pptx" ? "Exportando…" : "PPTX"}
                </button>
                <button onClick={() => setGenerated(false)} style={{
                  display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600,
                  color: S.muted, background: S.surface, border: `1px solid ${S.border}`,
                  borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}>
                  <ArrowLeft size={14} /> Cambiar cliente
                </button>
              </div>
            </div>
            <div id="canvas-mbr-slides" style={{ display: "flex", flexDirection: "column", gap: 24, overflowX: "auto" }}>
              {/* Apertura (assets de marca Truora, igual que el Report Builder) */}
              <PortadaSlide clientName={selected?.nombre || "Cliente"} periodLabel={periodLabel} />
              <AgendaSlide />
              <SeparadorSlide src="/assets/mbr/separados-metricas.png" alt="Métricas del mes" />
              {/* Slides CH por validación */}
              {VALIDADOR_SLIDES.map((slideId, idx) => (
                <SlideCanvas key={slideId} slideId={slideId} product="DI"
                  data={mbrData} theme={theme}
                  clientName={selected?.nombre || "Cliente"} periodLabel={periodLabel}
                  pageNum={idx + 1} totalPages={VALIDADOR_SLIDES.length} />
              ))}
              {/* Updates de producto + cierre */}
              <SeparadorSlide src="/assets/mbr/separador-updates.png" alt="Updates de producto" />
              <UpdatesSlide />
              <CierreSlide csmName={csmName(selected?.csm || "")} />
            </div>
          </div>
        )}
      </div>

      {/* Overlay de generación (igual que el Report Builder) */}
      {genStatus && (
        <GeneratingOverlay
          status={genStatus}
          onClose={() => { const ok = genStatus === "success"; setGenStatus(null); if (ok) setGenerated(true); }}
          onRetry={startGenerate}
        />
      )}
    </div>
  );
}
