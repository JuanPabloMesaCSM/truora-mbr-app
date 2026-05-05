/**
 * MBR ad-hoc para Confiamos Abril 2026.
 *
 * Confiamos genera validaciones DI standalone (sin identity_process_id), por
 * eso el Report Builder estandar da 0 al consultar IDENTITY_PROCESSES. Este
 * mock inyecta los datos pre-procesados desde el CSV exportado del dashboard
 * de Truora (HRP09b8bc329cd86360575934b327e1ea1f.csv) y renderiza solo los
 * slides DI que tienen sentido para el modelo standalone:
 *   - DI-1 Metricas Generales
 *   - DI-3 Doc vs Rostro
 *   - DI-4 Historico (2 meses: marzo + abril)
 *   - DI-7 Top Razones Doc
 *   - DI-8 Top Razones Rostro
 *   - DI-10 Top Declinados (global)
 *
 * Slides omitidos (no aplican al modelo standalone):
 *   - DI-2 Usuarios y Reintentos (Confiamos llama desde backend, IP unica)
 *   - DI-5 Flujos (no usa flujos)
 *   - DI-6 Funnel (no hay pasos secuenciales)
 *   - DI-9 Abandono (no hay flujo)
 *   - DI-11 Friccion Usuario (mismo motivo que DI-2)
 *
 * Diagnostico tecnico completo: ver feedback memoria + skill botialertas-v2
 * (seccion "Standalone validations").
 *
 * Acceso: /mbr-confiamos-abril (sin guard DEV — solo accesible si se conoce
 * la URL; auth Google @truora.com sigue como barrera).
 */

import { useState } from "react";
import { SlideCanvas, type Theme, PortadaSlide, CierreSlide } from "@/components/report-builder/SlideCanvas";
import { exportPDF, exportPPTX } from "@/utils/exportPDF";

const CLIENT_NAME = "Confiamos";
const PERIOD_LABEL = "Abril 2026";

const CONFIAMOS_DI_DATA = {
  status: "success" as const,
  data: {
    "1_metricas_generales": [{
      bloque: "1_metricas_generales",
      col1: "5360",  // total
      col2: "4516",  // exitosos
      col3: "844",   // fallidos
      col4: "844",   // declinados (= fallidos en standalone)
      col5: "0",     // expirados
      col6: "0",     // errores tecnicos
      col7: "0",     // cancelados
      col8: "84.3",  // % conversion
      col9: "6162",  // total marzo
      col10: "5183", // exitosos marzo
      col11: "84.1", // % conversion marzo
      col_extra1: "-13.0", // variacion volumen abril vs marzo
    }],
    "3_validaciones_doc_rostro": [{
      bloque: "3_validaciones_doc_rostro",
      col1: "3187",  // doc total abril
      col2: "2591",  // doc exitosos
      col3: "81.3",  // doc tasa exito
      col4: "3509",  // doc total marzo
      col5: "81.6",  // doc tasa marzo
      col6: "1091",  // rostro total abril (face-recognition)
      col7: "843",   // rostro exitosos
      col8: "77.3",  // rostro tasa exito
      col9: "1329",  // rostro total marzo
      col10: "75.1", // rostro tasa marzo
      col11: "596",  // doc rechazados abril
      col_extra1: "645", // doc rechazados marzo
      col_extra2: "248", // rostro rechazados abril
      col_extra3: "331", // rostro rechazados marzo
    }],
    "4_historico_3meses": [
      {
        bloque: "4_historico_3meses",
        periodo: "2026-03-01",
        col1: "6162", col2: "5183", col3: "84.1",
        col4: "0", col5: "0",
      },
      {
        bloque: "4_historico_3meses",
        periodo: "2026-04-01",
        col1: "5360", col2: "4516", col3: "84.3",
        col4: "0", col5: "0",
      },
    ],
    "7_razones_doc": [
      { bloque: "7_razones_doc", col1: "campos_no_encontrados", col2: "132" },
      { bloque: "7_razones_doc", col1: "rostro_en_documento_rechazado", col2: "95" },
      { bloque: "7_razones_doc", col1: "datos_inconsistentes_con_produccion", col2: "74" },
      { bloque: "7_razones_doc", col1: "documento_es_foto_de_foto", col2: "64" },
      { bloque: "7_razones_doc", col1: "documento_es_fotocopia", col2: "31" },
      { bloque: "7_razones_doc", col1: "datos_no_coinciden_con_base", col2: "25" },
      { bloque: "7_razones_doc", col1: "fecha_expedicion_invalida", col2: "25" },
      { bloque: "7_razones_doc", col1: "documento_frontal_no_identificado", col2: "21" },
    ],
    "8_razones_rostro": [
      { bloque: "8_razones_rostro", col1: "similitud_rostros_bajo_umbral", col2: "165" },
      { bloque: "8_razones_rostro", col1: "prueba_vida_pasiva_no_aprobada", col2: "74" },
      { bloque: "8_razones_rostro", col1: "rostro_no_detectado", col2: "7" },
      { bloque: "8_razones_rostro", col1: "expirado_o_abandonado", col2: "2" },
    ],
    "10_declinados": [
      { bloque: "10_declinados", col1: "similitud_rostros_bajo_umbral", col2: "165" },
      { bloque: "10_declinados", col1: "campos_no_encontrados", col2: "132" },
      { bloque: "10_declinados", col1: "rostro_en_documento_rechazado", col2: "95" },
      { bloque: "10_declinados", col1: "prueba_vida_pasiva_no_aprobada", col2: "74" },
      { bloque: "10_declinados", col1: "datos_inconsistentes_con_produccion", col2: "74" },
      { bloque: "10_declinados", col1: "documento_es_foto_de_foto", col2: "64" },
      { bloque: "10_declinados", col1: "documento_es_fotocopia", col2: "31" },
      { bloque: "10_declinados", col1: "datos_no_coinciden_con_base", col2: "25" },
      { bloque: "10_declinados", col1: "fecha_expedicion_invalida", col2: "25" },
      { bloque: "10_declinados", col1: "documento_frontal_no_identificado", col2: "21" },
    ],
  },
  warnings: [],
};

const DI_SLIDES = [
  "1_metricas_generales",
  "3_validaciones_doc_rostro",
  "4_historico_3meses",
  "7_razones_doc",
  "8_razones_rostro",
  "10_declinados",
];

const TOTAL_PAGES = DI_SLIDES.length + 2; // + Portada + Cierre

export default function MockConfiamosAbril() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);

  const fileBaseName = `${CLIENT_NAME}`;
  const filePeriod = PERIOD_LABEL.replace(/\s+/g, "_");

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a12", padding: "24px 32px" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", gap: 12, marginBottom: 28, alignItems: "center",
        position: "sticky", top: 0, zIndex: 10, background: "#0a0a12", padding: "8px 0",
      }}>
        <span style={{
          color: "#94A3B8", fontSize: 12, fontWeight: 600,
          letterSpacing: "0.1em", textTransform: "uppercase",
        }}>
          MBR Ad-hoc · Confiamos · Abril 2026
        </span>

        {(["dark", "light"] as Theme[]).map(t => (
          <button key={t} onClick={() => setTheme(t)} style={{
            padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer",
            background: theme === t ? (t === "dark" ? "#4B6FFF" : "#6B4EFF") : "#1e2040",
            color: "#fff", fontSize: 12, fontWeight: 600, textTransform: "capitalize",
          }}>
            {t}
          </button>
        ))}

        <button
          onClick={() => exportPDF(fileBaseName, filePeriod, () => setExportingPdf(true), () => setExportingPdf(false))}
          disabled={exportingPdf || exportingPptx}
          style={{
            padding: "6px 16px", borderRadius: 6, border: "none",
            cursor: exportingPdf ? "not-allowed" : "pointer",
            background: exportingPdf ? "#475569" : "#00D4A0",
            color: "#fff", fontSize: 12, fontWeight: 700,
            opacity: exportingPdf ? 0.7 : 1,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          {exportingPdf ? "⏳ Generando PDF..." : "⬇ Exportar PDF"}
        </button>

        <button
          onClick={() => exportPPTX(fileBaseName, filePeriod, () => setExportingPptx(true), () => setExportingPptx(false))}
          disabled={exportingPdf || exportingPptx}
          style={{
            padding: "6px 16px", borderRadius: 6, border: "none",
            cursor: exportingPptx ? "not-allowed" : "pointer",
            background: exportingPptx ? "#475569" : "#7C4DFF",
            color: "#fff", fontSize: 12, fontWeight: 700,
            opacity: exportingPptx ? 0.7 : 1,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          {exportingPptx ? "⏳ Generando PPTX..." : "⬇ Exportar PPTX"}
        </button>

        <span style={{ color: "#475569", fontSize: 11 }}>
          {TOTAL_PAGES} slides · scroll para ver todos
        </span>
      </div>

      {/* Slides */}
      <div id="canvas-mbr-slides" style={{
        display: "flex", flexDirection: "column", gap: 24, overflowX: "auto",
      }}>
        <PortadaSlide clientName={CLIENT_NAME} periodLabel={PERIOD_LABEL} />

        {DI_SLIDES.map((slideId, idx) => (
          <SlideCanvas
            key={slideId}
            slideId={slideId}
            product="DI"
            data={CONFIAMOS_DI_DATA.data}
            theme={theme}
            clientName={CLIENT_NAME}
            periodLabel={PERIOD_LABEL}
            pageNum={idx + 2}
            totalPages={TOTAL_PAGES}
          />
        ))}

        <CierreSlide csmName="Juan Pablo Mesa" />
      </div>
    </div>
  );
}
