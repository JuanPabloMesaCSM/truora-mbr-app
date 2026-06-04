/**
 * Reporte DI Diario — página de visualización + descarga de PDF.
 *
 * Destino del link que manda el flujo n8n "Reporte Diario DI 2 Flujos" al final
 * del Telegram. Muestra SOLO las 3 métricas del día por flujo (hoy vs ayer):
 *   1) Conversión del proceso   2) Conversión por usuario único   3) Razones de rechazo
 *
 * Fuente: webhook on-demand `reporte-di-diario` (corre las 2 queries diarias —
 * NO el Report Builder mensual). Defaults baked para Banco W + sus 2 flujos, así
 * el link del Telegram puede venir sin parámetros. Los query params, si llegan,
 * sobreescriben los defaults (rótulos de flujo / cliente / fecha).
 */

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DailyPortadaSlide, DailyCierreSlide, DailyConversionSlide, DailyRazonesSlide,
  type ConvRow, type RazRow,
} from "@/components/report-builder/DailyDISlides";
import { exportPDF, exportPPTX } from "@/utils/exportPDF";

const ONDEMAND_WEBHOOK = "https://n8n.zapsign.com.br/webhook/reporte-di-diario";

// Defaults del cliente fijo (Banco W). Los params de la URL los sobreescriben.
const DEFAULT_CID = "TCId5981cce1073baf2a0bc311dc90220bc";
const DEFAULT_FLUJOS = [
  "IPFd2ce1706f9d0a34ac4699ee9cb5deae2",
  "IPFdbb5de09c089403c0e20b86313abc47b",
];
const DEFAULT_CLIENTE = "Banco W";
const DEFAULT_CSM = "Sebastián Durán";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const TOTAL_PAGES = 5; // Portada + 3 slides + Cierre

function pad2(n: number): string { return n < 10 ? "0" + n : "" + n; }
function todayYmd(): string {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
function fechaLabel(ymd: string): string {
  const p = (ymd || "").split("-");
  if (p.length < 3) return ymd || "";
  return p[2] + " " + (MESES[Number(p[1]) - 1] || "") + " " + p[0]; // "04 Junio 2026"
}
function abbrFlujo(id: string): string {
  return id.length > 18 ? id.slice(0, 11) + "..." + id.slice(-5) : id;
}

export default function ReporteDiarioDI() {
  const [searchParams] = useSearchParams();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [conversion, setConversion] = useState<ConvRow[]>([]);
  const [razones, setRazones] = useState<RazRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);

  const cfg = useMemo(() => {
    const fecha = searchParams.get("fecha") || searchParams.get("to") || todayYmd();
    const paramFlujos = (searchParams.get("flujos") || "")
      .split(",").map(s => s.trim()).filter(Boolean);
    const flujos = paramFlujos.length ? paramFlujos : DEFAULT_FLUJOS;
    const flujoLabels: Record<string, string> = {};
    flujos.forEach(id => { flujoLabels[id] = abbrFlujo(id); });
    return {
      cid: searchParams.get("cid") || DEFAULT_CID,
      cliente: searchParams.get("cliente") || DEFAULT_CLIENTE,
      csm: searchParams.get("csm") || DEFAULT_CSM,
      fecha, flujos, flujoLabels,
      periodoLabel: fechaLabel(fecha),
    };
  }, [searchParams]);

  useEffect(() => {
    let cancel = false;
    async function run() {
      setStatus("loading");
      try {
        const resp = await fetch(ONDEMAND_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cid: cfg.cid, flujos: cfg.flujos, fecha: cfg.fecha }),
        });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        let json: any = await resp.json();
        if (Array.isArray(json)) json = json[0];
        const conv = json && Array.isArray(json.conversion) ? json.conversion : [];
        const raz = json && Array.isArray(json.razones) ? json.razones : [];
        if (!cancel) { setConversion(conv); setRazones(raz); setStatus("ok"); }
      } catch (e: any) {
        if (!cancel) { setErrorMsg(e && e.message ? e.message : "Error desconocido"); setStatus("error"); }
      }
    }
    run();
    return () => { cancel = true; };
  }, [cfg]);

  const filePeriod = cfg.periodoLabel.replace(/\s+/g, "_");
  const ready = status === "ok";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a12", padding: "24px 32px" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", gap: 12, marginBottom: 28, alignItems: "center", flexWrap: "wrap",
        position: "sticky", top: 0, zIndex: 10, background: "#0a0a12", padding: "8px 0",
      }}>
        <span style={{ color: "#94A3B8", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Reporte DI Diario · {cfg.cliente} · {cfg.periodoLabel}
        </span>

        {(["dark", "light"] as const).map(t => (
          <button key={t} onClick={() => setTheme(t)} style={{
            padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer",
            background: theme === t ? (t === "dark" ? "#4B6FFF" : "#6B4EFF") : "#1e2040",
            color: "#fff", fontSize: 12, fontWeight: 600, textTransform: "capitalize",
          }}>{t}</button>
        ))}

        <button
          onClick={() => exportPDF(cfg.cliente, filePeriod, () => setExportingPdf(true), () => setExportingPdf(false))}
          disabled={!ready || exportingPdf || exportingPptx}
          style={{
            padding: "6px 16px", borderRadius: 6, border: "none",
            cursor: (!ready || exportingPdf) ? "not-allowed" : "pointer",
            background: exportingPdf ? "#475569" : "#00D4A0",
            color: "#fff", fontSize: 12, fontWeight: 700, opacity: ready ? 1 : 0.5,
          }}
        >
          {exportingPdf ? "⏳ Generando PDF..." : "⬇ Descargar PDF"}
        </button>

        <button
          onClick={() => exportPPTX(cfg.cliente, filePeriod, () => setExportingPptx(true), () => setExportingPptx(false))}
          disabled={!ready || exportingPdf || exportingPptx}
          style={{
            padding: "6px 16px", borderRadius: 6, border: "none",
            cursor: (!ready || exportingPptx) ? "not-allowed" : "pointer",
            background: exportingPptx ? "#475569" : "#7C4DFF",
            color: "#fff", fontSize: 12, fontWeight: 700, opacity: ready ? 1 : 0.5,
          }}
        >
          {exportingPptx ? "⏳ Generando PPTX..." : "⬇ PPTX"}
        </button>

        <span style={{ color: "#475569", fontSize: 11 }}>
          {cfg.fecha} (hoy vs ayer) · {cfg.flujos.length} flujos
        </span>
      </div>

      {status === "loading" && (
        <div style={{ color: "#94A3B8", fontSize: 14, padding: "80px 0", textAlign: "center" }}>
          ⏳ Generando reporte… (puede tardar ~10-30s)
        </div>
      )}
      {status === "error" && (
        <div style={{ color: "#EF4444", fontSize: 14, padding: "80px 0", textAlign: "center" }}>
          ⚠️ No se pudo generar el reporte: {errorMsg}
        </div>
      )}

      {ready && (
        <div id="canvas-mbr-slides" style={{ display: "flex", flexDirection: "column", gap: 24, overflowX: "auto" }}>
          <DailyPortadaSlide clientName={cfg.cliente} periodLabel={cfg.periodoLabel} />
          <DailyConversionSlide theme={theme} mode="proceso" rows={conversion} flujoLabels={cfg.flujoLabels}
            clientName={cfg.cliente} periodLabel={cfg.periodoLabel} pageNum={2} totalPages={TOTAL_PAGES} />
          <DailyConversionSlide theme={theme} mode="usuario" rows={conversion} flujoLabels={cfg.flujoLabels}
            clientName={cfg.cliente} periodLabel={cfg.periodoLabel} pageNum={3} totalPages={TOTAL_PAGES} />
          <DailyRazonesSlide theme={theme} rows={razones}
            clientName={cfg.cliente} periodLabel={cfg.periodoLabel} pageNum={4} totalPages={TOTAL_PAGES} />
          <DailyCierreSlide csmName={cfg.csm} />
        </div>
      )}
    </div>
  );
}
