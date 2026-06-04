/**
 * Slides a medida para el Reporte DI Diario (página /reporte-di-diario).
 *
 * Renderizan SOLO las 3 métricas del flujo diario, hoy vs ayer, por flujo + total:
 *   1) Conversión del proceso        → DailyConversionSlide mode="proceso"
 *   2) Conversión por usuario único  → DailyConversionSlide mode="usuario"
 *   3) Razones de rechazo doc/rostro → DailyRazonesSlide
 * + Portada (Daily Business Review) y Cierre (¡Gracias!) propios.
 *
 * Estilo Truora (1280×720, Inter, verde DI #00C9A7), independiente de SlideCanvas
 * para no arrastrar su semántica mensual. Cada slide raíz lleva class "slide-page"
 * y mide 1280×720 para que exportPDF (#canvas-mbr-slides) lo capture igual que el MBR.
 * Charts con devicePixelRatio 2 → nítidos en pantalla y en el PDF.
 */

import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import ChartDataLabels from "chartjs-plugin-datalabels";

export type DailyTheme = "dark" | "light";

export interface ConvRow {
  flujo: string;
  procesos_iniciados_hoy?: number | string; procesos_iniciados_ayer?: number | string;
  procesos_exitosos_hoy?: number | string; procesos_exitosos_ayer?: number | string;
  conversion_proc_hoy_pct?: number | string; conversion_proc_ayer_pct?: number | string; conv_proc_delta_pp?: number | string;
  usuarios_unicos_hoy?: number | string; usuarios_unicos_ayer?: number | string;
  usuarios_exitosos_hoy?: number | string; usuarios_exitosos_ayer?: number | string;
  conversion_usuario_hoy_pct?: number | string; conversion_usuario_ayer_pct?: number | string; conv_usuario_delta_pp?: number | string;
  [k: string]: any;
}
export interface RazRow {
  tipo?: string; flujo?: string; razon?: string;
  rechazos_hoy?: number | string; rechazos_ayer?: number | string;
  [k: string]: any;
}

const DI = "#00C9A7";
const AYER = "#94A3B8";
const DOC = "#0891B2";
const ROSTRO = "#F59E0B";
const TOTAL_KEY = "TOTAL (ambos)";
const DPR = 2;

const RAZONES: Record<string, string> = {
  blurry_image: "Foto del documento borrosa o mal iluminada",
  expired_document: "Documento vencido",
  document_has_expired: "Documento vencido",
  document_is_a_photocopy: "Subió una fotocopia, no el original",
  document_is_a_photo_of_photo: "Tomó foto a una foto del documento",
  document_does_not_match_account_id: "El documento no coincide con la cuenta",
  document_validation_not_started: "No inició la validación de documento",
  damaged_document: "Documento dañado",
  invalid_document_emission_date: "Fecha de emisión inválida",
  document_data_does_not_match_government_data: "Datos no coinciden con la fuente oficial",
  document_image_no_text_detected: "No se detectó texto en la imagen del documento",
  document_front_not_identified: "No se identificó el frente del documento",
  no_face_detected: "La cámara no detectó un rostro válido",
  similarity_threshold_not_passed: "El rostro no coincide con el documento",
  risky_face_detected: "Posible suplantación de identidad",
  passive_liveness_verification_not_passed: "No superó la prueba de vida",
  user_face_match_in_client_collection: "El rostro coincide con otro usuario registrado",
  user_face_match_in_fraud_collection: "El rostro coincide con la lista de fraude",
  face_validation_not_started: "Llegó a la selfie pero no la completó",
  invalid_video_file: "Archivo de video inválido",
};
function razonHumana(code: string): string {
  if (RAZONES[code]) return RAZONES[code];
  return String(code || "").replace(/_/g, " ");
}

function tok(theme: DailyTheme) {
  const dark = theme === "dark";
  return {
    slideBg: dark ? "#0D1137" : "#F5F5F7",
    cardBg: dark ? "rgba(255,255,255,0.045)" : "#FFFFFF",
    cardBorder: dark ? "1px solid rgba(255,255,255,0.09)" : "1px solid rgba(13,17,55,0.08)",
    cardShadow: dark ? "none" : "0 1px 3px rgba(13,17,55,0.06)",
    text: dark ? "#EEF0FF" : "#0D1137",
    muted: dark ? "#8892B8" : "#64748B",
    grid: dark ? "rgba(255,255,255,0.08)" : "rgba(13,17,55,0.08)",
    border: dark ? "rgba(255,255,255,0.08)" : "rgba(13,17,55,0.08)",
  };
}

function n(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return isNaN(x) ? null : x;
}
function fmtInt(v: any): string {
  const x = n(v);
  return x === null ? "—" : Math.round(x).toLocaleString("es-CO");
}
function fmtPct(v: any): string {
  const x = n(v);
  return x === null ? "s/d" : x.toFixed(1) + "%";
}
function deltaInfo(v: any, t: ReturnType<typeof tok>) {
  const x = n(v);
  if (x === null) return { text: "—", color: t.muted };
  const sign = x >= 0 ? "+" : "";
  let color = t.muted;
  if (x <= -10) color = "#EF4444";
  else if (x < 0) color = "#F59E0B";
  else if (x > 0) color = DI;
  return { text: sign + x.toFixed(1) + " pp vs ayer", color };
}

function labelFlujo(flujo: string, flujoLabels: Record<string, string>): string {
  if (flujo === TOTAL_KEY) return "Total";
  if (flujoLabels[flujo]) return flujoLabels[flujo];
  if (flujo && flujo.length > 18) return flujo.slice(0, 11) + "..." + flujo.slice(-5);
  return flujo;
}

const ASSET_SHELL: React.CSSProperties = { position: "relative", width: 1280, height: 720, flexShrink: 0, overflow: "hidden" };
const ASSET_IMG: React.CSSProperties = { width: 1280, height: 720, display: "block", objectFit: "fill" };

/* ── Portada Daily ── */
export function DailyPortadaSlide({ clientName, periodLabel }: { clientName: string; periodLabel: string }) {
  return (
    <div className="slide-page" style={ASSET_SHELL}>
      <img src="/assets/mbr/portada-daily.png" alt="Portada" style={ASSET_IMG} />
      {/* Overlay periodo + cliente, debajo del logo Truora (mismo lugar que el MBR mensual). */}
      <div style={{ position: "absolute", top: 500, left: 65, width: 520, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800, color: "#00D4A0", lineHeight: 1.2, letterSpacing: "-0.01em" }}>
          {periodLabel}
        </span>
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.2, letterSpacing: "-0.01em" }}>
          {clientName}
        </span>
      </div>
    </div>
  );
}

/* ── Cierre (¡Gracias!) — nombre centrado encima de "Customer Success Manager" ── */
export function DailyCierreSlide({ csmName }: { csmName: string }) {
  return (
    <div className="slide-page" style={ASSET_SHELL}>
      <img src="/assets/mbr/cierre.png" alt="Cierre" style={ASSET_IMG} />
      {/* "Customer Success Manager" quemado ~x=864–1140, y~535. El nombre va centrado
          sobre ese bloque, con aire arriba para que no se monte encima. */}
      <div style={{ position: "absolute", top: 496, left: 864, width: 276, textAlign: "center" }}>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 19, fontWeight: 600, color: "#FFFFFF", margin: 0, lineHeight: 1.3, letterSpacing: "0.01em", whiteSpace: "nowrap" }}>
          {csmName}
        </p>
      </div>
    </div>
  );
}

/* ── Frame común de los slides de datos (1280×720, class slide-page) ── */
function SlideFrame({ theme, title, subtitle, slideLabel, pageNum, totalPages, children }: {
  theme: DailyTheme; title: string; subtitle: string; slideLabel: string;
  pageNum: number; totalPages: number; children: React.ReactNode;
}) {
  const t = tok(theme);
  return (
    <div className="slide-page" style={{
      width: 1280, height: 720, background: t.slideBg, color: t.text,
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      padding: "44px 56px", boxSizing: "border-box", display: "flex",
      flexDirection: "column", flexShrink: 0,
    }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: t.muted, fontWeight: 500 }}>{subtitle}</p>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 22 }}>{children}</div>
      <div style={{
        marginTop: 16, paddingTop: 12, borderTop: `1px solid ${t.border}`,
        display: "flex", justifyContent: "space-between", fontSize: 11, color: t.muted,
      }}>
        <span style={{ fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: DI }}>{slideLabel}</span>
        <span>{pageNum} / {totalPages}</span>
      </div>
    </div>
  );
}

function Kpi({ theme, label, value, sub, valueColor }: {
  theme: DailyTheme; label: string; value: string; sub?: { text: string; color: string }; valueColor?: string;
}) {
  const t = tok(theme);
  return (
    <div style={{ background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow, borderRadius: 14, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: valueColor || t.text, lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: sub.color, marginTop: 4, fontWeight: 600 }}>{sub.text}</div> : null}
    </div>
  );
}

/* ---------- Barras agrupadas Hoy/Ayer: % conversión + cantidad por flujo ---------- */
function GroupedBar({ theme, labels, hoyPct, ayerPct, hoyCount, ayerCount, unit }: {
  theme: DailyTheme; labels: string[];
  hoyPct: (number | null)[]; ayerPct: (number | null)[];
  hoyCount: (number | null)[]; ayerCount: (number | null)[]; unit: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const inst = useRef<Chart | null>(null);
  const t = tok(theme);
  useEffect(() => {
    if (!ref.current) return;
    if (inst.current) inst.current.destroy();
    inst.current = new Chart(ref.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Hoy", data: hoyPct as any, backgroundColor: DI, borderRadius: 6, maxBarThickness: 80 },
          { label: "Ayer", data: ayerPct as any, backgroundColor: AYER, borderRadius: 6, maxBarThickness: 80 },
        ],
      },
      options: {
        devicePixelRatio: DPR,
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", align: "end", labels: { color: t.text, font: { size: 12, weight: 600 }, usePointStyle: true, pointStyleWidth: 9 } },
          tooltip: { enabled: true, callbacks: { label: (c: any) => c.dataset.label + ": " + (c.raw === null ? "s/d" : Number(c.raw).toFixed(1) + "%") } },
          datalabels: {
            anchor: "end", align: "top", textAlign: "center", color: t.text, font: { size: 11, weight: 700 },
            formatter: (v: any, ctx: any) => {
              if (v === null || v === undefined) return "";
              const counts = ctx.datasetIndex === 0 ? hoyCount : ayerCount;
              const c = counts[ctx.dataIndex];
              return [Number(v).toFixed(1) + "%", (c === null || c === undefined ? "—" : Math.round(Number(c)).toLocaleString("es-CO")) + " " + unit];
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: t.text, font: { size: 12, weight: 600 } } },
          y: { beginAtZero: true, max: 100, grid: { color: t.grid }, ticks: { color: t.muted, callback: (v: any) => v + "%" } },
        },
        layout: { padding: { top: 34 } },
      },
      plugins: [ChartDataLabels],
    } as any);
    return () => { if (inst.current) { inst.current.destroy(); inst.current = null; } };
  }, [JSON.stringify(labels), JSON.stringify(hoyPct), JSON.stringify(ayerPct), JSON.stringify(hoyCount), JSON.stringify(ayerCount), unit, theme]);
  return <canvas ref={ref} />;
}

/* ════════════════════════════════════════════════════════════
   Slide 1 y 2 — Conversión (proceso / usuario único)
══════════════════════════════════════════════════════════════ */
export function DailyConversionSlide({ theme, mode, rows, flujoLabels, clientName, periodLabel, pageNum, totalPages }: {
  theme: DailyTheme; mode: "proceso" | "usuario"; rows: ConvRow[];
  flujoLabels: Record<string, string>; clientName: string; periodLabel: string;
  pageNum: number; totalPages: number;
}) {
  const t = tok(theme);
  const total = rows.find(r => r.flujo === TOTAL_KEY) || null;
  const porFlujo = rows.filter(r => r.flujo !== TOTAL_KEY);
  const ordered = porFlujo.concat(total ? [total] : []);

  const isProc = mode === "proceso";
  const keyHoy = isProc ? "conversion_proc_hoy_pct" : "conversion_usuario_hoy_pct";
  const keyAyer = isProc ? "conversion_proc_ayer_pct" : "conversion_usuario_ayer_pct";
  const keyDelta = isProc ? "conv_proc_delta_pp" : "conv_usuario_delta_pp";
  const keyCntHoy = isProc ? "procesos_iniciados_hoy" : "usuarios_unicos_hoy";
  const keyCntAyer = isProc ? "procesos_iniciados_ayer" : "usuarios_unicos_ayer";
  const unit = isProc ? "proc" : "usr";

  const labels = ordered.map(r => labelFlujo(r.flujo, flujoLabels));
  const hoyPct = ordered.map(r => n(r[keyHoy]));
  const ayerPct = ordered.map(r => n(r[keyAyer]));
  const hoyCount = ordered.map(r => n(r[keyCntHoy]));
  const ayerCount = ordered.map(r => n(r[keyCntAyer]));

  const title = isProc ? "Conversión del proceso" : "Conversión por usuario único";
  const label = isProc ? "DI · Conversión del proceso" : "DI · Conversión por usuario único";

  const convHoy = total ? total[keyHoy] : null;
  const delta = total ? deltaInfo(total[keyDelta], t) : { text: "—", color: t.muted };
  const iniHoy = total ? total[keyCntHoy] : null;
  const iniAyer = total ? total[keyCntAyer] : null;
  const okHoy = total ? (isProc ? total.procesos_exitosos_hoy : total.usuarios_exitosos_hoy) : null;
  const okAyer = total ? (isProc ? total.procesos_exitosos_ayer : total.usuarios_exitosos_ayer) : null;
  const labelIni = isProc ? "Procesos iniciados (hoy)" : "Usuarios únicos (hoy)";
  const labelOk = isProc ? "Procesos exitosos (hoy)" : "Usuarios exitosos (hoy)";

  return (
    <SlideFrame theme={theme} title={`${title} — ${periodLabel}`}
      subtitle={`Digital Identity · ${clientName} · hoy vs ayer`}
      slideLabel={label} pageNum={pageNum} totalPages={totalPages}>
      <div style={{ width: "34%", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
        <Kpi theme={theme} label="Conversión total (hoy)" value={fmtPct(convHoy)} valueColor={DI} sub={delta} />
        <Kpi theme={theme} label={labelIni} value={fmtInt(iniHoy)} sub={{ text: `ayer ${fmtInt(iniAyer)}`, color: t.muted }} />
        <Kpi theme={theme} label={labelOk} value={fmtInt(okHoy)} sub={{ text: `ayer ${fmtInt(okAyer)}`, color: t.muted }} />
      </div>
      <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow, borderRadius: 14, padding: "18px 22px 14px", display: "flex", flexDirection: "column", minWidth: 0 }}>
        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Conversión por flujo (%) — hoy vs ayer · etiqueta: % y nº de {isProc ? "procesos" : "usuarios"}
        </p>
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          {ordered.length === 0
            ? <p style={{ color: t.muted, fontSize: 13 }}>Sin datos en el período.</p>
            : <GroupedBar theme={theme} labels={labels} hoyPct={hoyPct} ayerPct={ayerPct} hoyCount={hoyCount} ayerCount={ayerCount} unit={unit} />}
        </div>
      </div>
    </SlideFrame>
  );
}

/* ════════════════════════════════════════════════════════════
   Slide 3 — Razones de rechazo (documento / rostro)
══════════════════════════════════════════════════════════════ */
function RazonesBar({ theme, rows }: { theme: DailyTheme; rows: RazRow[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const inst = useRef<Chart | null>(null);
  const t = tok(theme);
  const labels = rows.map(r => razonHumana(String(r.razon || "")));
  const hoy = rows.map(r => n(r.rechazos_hoy) || 0);
  const ayer = rows.map(r => n(r.rechazos_ayer) || 0);
  const colors = rows.map(r => (r.tipo === "Rostro" ? ROSTRO : DOC));
  useEffect(() => {
    if (!ref.current) return;
    if (inst.current) inst.current.destroy();
    inst.current = new Chart(ref.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Hoy", data: hoy as any, backgroundColor: colors, borderRadius: 5 },
          { label: "Ayer", data: ayer as any, backgroundColor: AYER, borderRadius: 5 },
        ],
      },
      options: {
        devicePixelRatio: DPR,
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", align: "end", labels: { color: t.text, font: { size: 12, weight: 600 }, usePointStyle: true, pointStyleWidth: 9 } },
          tooltip: { enabled: true },
          datalabels: {
            anchor: "end", align: "right", color: t.text, font: { size: 12, weight: 700 },
            formatter: (v: any) => (Number(v) > 0 ? String(v) : ""),
          },
        },
        scales: {
          x: { beginAtZero: true, grid: { color: t.grid }, ticks: { color: t.muted, precision: 0 } },
          y: { grid: { display: false }, ticks: { color: t.text, font: { size: 12, weight: 600 } } },
        },
        layout: { padding: { right: 32 } },
      },
      plugins: [ChartDataLabels],
    } as any);
    return () => { if (inst.current) { inst.current.destroy(); inst.current = null; } };
  }, [JSON.stringify(labels), JSON.stringify(hoy), JSON.stringify(ayer), theme]);
  return <canvas ref={ref} />;
}

export function DailyRazonesSlide({ theme, rows, clientName, periodLabel, pageNum, totalPages }: {
  theme: DailyTheme; rows: RazRow[]; clientName: string; periodLabel: string;
  pageNum: number; totalPages: number;
}) {
  const t = tok(theme);
  const total = rows.filter(r => r.flujo === TOTAL_KEY)
    .filter(r => (n(r.rechazos_hoy) || 0) > 0 || (n(r.rechazos_ayer) || 0) > 0)
    .sort((a, b) => (n(b.rechazos_hoy) || 0) - (n(a.rechazos_hoy) || 0));

  const totalHoy = total.reduce((s, r) => s + (n(r.rechazos_hoy) || 0), 0);
  const docHoy = total.filter(r => r.tipo !== "Rostro").reduce((s, r) => s + (n(r.rechazos_hoy) || 0), 0);
  const rostroHoy = total.filter(r => r.tipo === "Rostro").reduce((s, r) => s + (n(r.rechazos_hoy) || 0), 0);

  return (
    <SlideFrame theme={theme} title={`Razones de rechazo — ${periodLabel}`}
      subtitle={`Digital Identity · ${clientName} · hoy vs ayer (ambos flujos)`}
      slideLabel="DI · Razones de rechazo" pageNum={pageNum} totalPages={totalPages}>
      <div style={{ width: "30%", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
        <Kpi theme={theme} label="Rechazos hoy (total)" value={fmtInt(totalHoy)} valueColor="#EF4444" />
        <Kpi theme={theme} label="Por documento (hoy)" value={fmtInt(docHoy)} valueColor={DOC} />
        <Kpi theme={theme} label="Por rostro (hoy)" value={fmtInt(rostroHoy)} valueColor={ROSTRO} />
        <div style={{ fontSize: 11, color: t.muted, lineHeight: 1.5, marginTop: 2 }}>
          <span style={{ color: DOC, fontWeight: 700 }}>■</span> Documento &nbsp;
          <span style={{ color: ROSTRO, fontWeight: 700 }}>■</span> Rostro
        </div>
      </div>
      <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow, borderRadius: 14, padding: "18px 22px 14px", display: "flex", flexDirection: "column", minWidth: 0 }}>
        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Motivos de rechazo — hoy vs ayer
        </p>
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          {total.length === 0
            ? <p style={{ color: DI, fontSize: 14, fontWeight: 600 }}>Sin rechazos en el período ✅</p>
            : <RazonesBar theme={theme} rows={total} />}
        </div>
      </div>
    </SlideFrame>
  );
}
