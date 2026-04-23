import { useEffect, useRef, useState } from "react";
import { RAZONES_DI, getLabelBGC, FALLOS_CE } from "@/utils/razonesDict";
import { useWabaNamesMap } from "./WabaNamesProvider";
import {
  Chart,
  ArcElement,
  DoughnutController,
  BarElement,
  BarController,
  LineElement,
  LineController,
  PointElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";

Chart.register(
  ArcElement, DoughnutController,
  BarElement, BarController,
  LineElement, LineController, PointElement,
  CategoryScale, LinearScale,
  Legend, Tooltip, ChartDataLabels,
);
Chart.defaults.font.family = "'Inter', sans-serif";
(Chart.defaults as any).animation = false;
(Chart.defaults as any).maintainAspectRatio = false;

/* ─── Types ─── */

export type Theme = "dark" | "light";

export interface BlockRow {
  bloque: string;
  periodo?: string;
  col1?: string; col2?: string; col3?: string; col4?: string;
  col5?: string; col6?: string; col7?: string; col8?: string;
  col9?: string; col10?: string; col11?: string;
  col_extra1?: string; col_extra2?: string; col_extra3?: string; col_extra4?: string;
}

export interface ReportData {
  status: "success";
  data: Record<string, BlockRow[]>;
  warnings?: string[];
}

/* ─── Helpers ─── */

function num(val: string | undefined, decimals = 0): string {
  const n = parseFloat(val || "0");
  if (isNaN(n)) return "—";
  return n.toLocaleString("es-CO", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function todayLabel(): string {
  return new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function formatLabel(s: string): string {
  return s.replace(/_/g, " ");
}

function monthLabel(periodo: string): string {
  const d = new Date(periodo + "T12:00:00");
  return d.toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
}

function parseMoM(label: string | undefined): { text: string; color: string } {
  if (!label || label === "N/A") return { text: "N/A", color: "#64748B" };
  if (label.includes("UP"))   return { text: label.replace(" UP", "").trim(),   color: "#22C55E" };
  if (label.includes("DOWN")) return { text: label.replace(" DOWN", "").trim(), color: "#EF4444" };
  return { text: label, color: "#64748B" };
}

/* ─── Theme tokens ─── */

function tok(theme: Theme) {
  const d = theme === "dark";
  return {
    slideBg:      d ? "#0D1137"                            : "#F5F5F7",
    cardBg:       d ? "#1A2151"                            : "#FFFFFF",
    cardBorder:   d ? "1px solid rgba(255,255,255,0.08)"   : "1px solid #E2E8F0",
    cardShadow:   d ? "0 4px 24px rgba(0,0,0,0.4)"        : "0 4px 24px rgba(0,0,0,0.08)",
    textPrimary:  d ? "#FFFFFF"                            : "#0D1137",
    textMuted:    "#64748B",
    accentBar:    d ? "#4B6FFF"                            : "#6B4EFF",
    footerBg:     d ? "rgba(0,0,0,0.22)"                   : "rgba(0,0,0,0.05)",
    footerBorder: d ? "rgba(255,255,255,0.06)"             : "#E2E8F0",
    chartText:    d ? "#94A3B8"                            : "#334155",
    doughnutBg:   d ? "#0D1137"                            : "#F5F5F7",
    legendColor:  d ? "#94A3B8"                            : "#334155",
    rowAlt:       d ? "rgba(255,255,255,0.04)"             : "rgba(0,0,0,0.03)",
    gaugeBg:      d ? "#0D1137"                            : "#E2E8F0",
    histBar:      d ? "#3D5A99"                            : "#94A3B8",
  };
}

/* ─── RazonRechazo card ─── */

interface RazonRechazoProps {
  codigo: string;
  descripcion: string;
  tema: Theme;
  esAlerta?: boolean;
}

function RazonRechazo({ codigo, descripcion, tema, esAlerta }: RazonRechazoProps) {
  return (
    <div style={{
      padding: '8px 12px',
      borderRadius: 8,
      background: esAlerta
        ? 'rgba(239,68,68,0.08)'
        : tema === 'dark' ? 'rgba(255,255,255,0.04)' : '#F8F9FA',
      borderLeft: esAlerta ? '3px solid #EF4444' : '3px solid transparent',
      marginBottom: 6,
    }}>
      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#64748B', letterSpacing: '0.02em', marginBottom: 2 }}>
        {esAlerta ? '⚠️ ' : ''}{codigo}
      </div>
      <div style={{ fontSize: 13, color: tema === 'dark' ? '#E2E8F0' : '#334155', lineHeight: 1.4 }}>
        {descripcion}
      </div>
    </div>
  );
}

/* ─── Delta badge ─── */

function Delta({ value, invert = false }: { value: string | undefined; invert?: boolean }) {
  const n = parseFloat(value || "");
  if (isNaN(n) || value === undefined) return null;
  const isUp = n > 0; const isFlat = n === 0;
  const good  = invert ? !isUp : isUp;
  const color = isFlat ? "#94A3B8" : good ? "#22C55E" : "#EF4444";
  const arrow = isFlat ? "→" : isUp ? "↑" : "↓";
  return (
    <span style={{ color, fontSize: 13, fontWeight: 700, lineHeight: 1 }}>
      {arrow} {Math.abs(n).toFixed(1)}%
      <span style={{ color: "#64748B", fontWeight: 400, fontSize: 11, marginLeft: 4 }}>vs mes ant.</span>
    </span>
  );
}

/* ─── KPI Card ─── */

function KpiCard({ label, value, valueColor, delta, deltaInvert, footnote, theme }: {
  label: string; value: string; valueColor?: string;
  delta?: string; deltaInvert?: boolean; footnote?: string; theme: Theme;
}) {
  const t = tok(theme);
  return (
    <div style={{
      background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
      borderRadius: 14, padding: "12px 16px 10px", flex: 1, minHeight: 0,
      display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden",
    }}>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: t.textMuted,
        textTransform: "uppercase", letterSpacing: "0.15em", lineHeight: 1, flexShrink: 0 }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: 52, fontWeight: 800, color: valueColor || t.textPrimary,
        lineHeight: 0.95, letterSpacing: "-0.03em", flexShrink: 1, overflow: "hidden" }}>{value}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0, marginTop: 4 }}>
        {delta !== undefined && <Delta value={delta} invert={deltaInvert} />}
        {footnote && <span style={{ color: t.textMuted, fontSize: 11, lineHeight: 1.2 }}>{footnote}</span>}
      </div>
    </div>
  );
}

/* ─── Slide Header ─── */

function SlideHeader({ title, subtitle, theme }: { title: string; subtitle: string; theme: Theme }) {
  const t = tok(theme);
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 72, display: "flex", alignItems: "stretch" }}>
      <div style={{ width: 4, background: t.accentBar, flexShrink: 0, marginRight: 18 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: t.textPrimary, lineHeight: 1.15, letterSpacing: "-0.01em" }}>{title}</h2>
        <p style={{ margin: "3px 0 0", fontSize: 12, color: t.textMuted, lineHeight: 1 }}>{subtitle}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", paddingRight: 40, flexShrink: 0 }}>
        <span style={{ color: "#FFFFFF", fontSize: 18, fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Truora</span>
      </div>
    </div>
  );
}

/* ─── Slide Footer ─── */

function SlideFooter({ theme, pageNum, slideLabel }: { theme: Theme; pageNum: number; slideLabel?: string }) {
  const t = tok(theme);
  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, height: 32,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "0 40px", background: t.footerBg, borderTop: `1px solid ${t.footerBorder}`, boxSizing: "border-box",
    }}>
      <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 500 }}>Fuente: Snowflake · {todayLabel()}</span>
      {slideLabel && <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 500 }}>{slideLabel}</span>}
      <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 600 }}>{pageNum}</span>
    </div>
  );
}

/* ─── Slide shell ─── */

function SlideShell({ id, theme, children }: { id: string; theme: Theme; children: React.ReactNode }) {
  const t = tok(theme);
  return (
    <div data-slide-id={id} className="slide slide-page" style={{
      position: "relative", width: 1280, height: 720, background: t.slideBg,
      fontFamily: "'Inter', sans-serif", flexShrink: 0, overflow: "hidden", boxSizing: "border-box",
    }}>
      {children}
    </div>
  );
}

/* ─── Body area ─── */

const bodyStyle: React.CSSProperties = {
  position: "absolute", top: 72, left: 0,
  right: 'var(--slide-insight-right, 0px)' as React.CSSProperties['right'],
  bottom: 32,
  display: "flex", gap: 16, padding: "14px 40px 14px 20px",
  boxSizing: "border-box", overflow: "hidden",
};

/* ════════════════════════════════════════════════════════════
   DI-1 | Métricas generales
══════════════════════════════════════════════════════════════ */

function Di1Slide({ data, theme, clientName, periodLabel, pageNum = 1, convTotalGlobal, convPromedioPorFlujo }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
  convTotalGlobal?: string; convPromedioPorFlujo?: string;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const b1 = data["1_metricas_generales"]?.[0];
  const b2 = data["2_usuarios_reintentos"]?.[0];
  const totalProcesos    = parseInt(b1?.col1 || "0", 10);
  const procExitosos     = parseInt(b1?.col2 || "0", 10);
  const procFallidosBase = parseInt(b1?.col3 || "0", 10);
  const erroresTec       = parseInt(b1?.col6 || "0", 10);
  const procFallidos     = procFallidosBase + erroresTec;
  const convPct          = parseFloat(b1?.col8  || "0");
  const convPrev         = parseFloat(b1?.col11 || "0");
  const variacion        = b1?.col_extra1;
  const usuariosUnicos   = b2 ? parseInt(b2.col1 || "0", 10) : null;
  const convUsuarioPct   = b2?.col3;
  const pctFallo         = totalProcesos > 0 ? (100 - convPct).toFixed(1) : "0.0";

  useEffect(() => {
    if (!chartRef.current || totalProcesos === 0) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "doughnut",
      data: {
        labels: [`Exitosos (${convPct.toFixed(1)}%)`, `Fallidos (${pctFallo}%)`],
        datasets: [{ data: [procExitosos, procFallidos],
          backgroundColor: ["#00C9A7", "#FF4B5C"], borderWidth: 4,
          borderColor: t.cardBg, hoverOffset: 6 }],
      },
      options: { cutout: "70%", plugins: {
        legend: { position: "bottom", labels: { font: { size: 12, weight: 600 },
          color: t.legendColor, padding: 16, usePointStyle: true, pointStyleWidth: 9 } },
        tooltip: { enabled: true },
        datalabels: { display: true, color: "#FFFFFF", font: { size: 16, weight: 700 },
          formatter: (v: number) => v.toLocaleString("es-CO"),
          anchor: "center", align: "center",
          textShadowColor: "rgba(0,0,0,0.4)", textShadowBlur: 4 },
      }},
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [procExitosos, procFallidos, convPct, pctFallo, t.doughnutBg, t.legendColor, totalProcesos]);

  return (
    <SlideShell id="DI-1" theme={theme}>
      <SlideHeader title={`Métricas generales — ${periodLabel}`} subtitle={`Digital Identity · ${clientName}`} theme={theme} />
      <div style={bodyStyle}>
        <div style={{ width: "36%", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          <KpiCard label="Total procesos" value={num(b1?.col1)} delta={variacion} theme={theme} />
          <KpiCard label="Tasa de conversión" value={`${num(b1?.col8, 1)}%`} valueColor="#00C9A7" footnote={`Anterior: ${convPrev.toFixed(1)}%`} theme={theme} />
          <KpiCard label="Usuarios únicos" value={usuariosUnicos !== null ? usuariosUnicos.toLocaleString("es-CO") : "—"}
            footnote={convUsuarioPct ? `${num(convUsuarioPct, 1)}% conversión por usuario` : undefined} theme={theme} />
          {(convTotalGlobal || convPromedioPorFlujo) && (
            <div style={{
              padding: '10px 14px', borderRadius: 12,
              background: t.cardBg, border: t.cardBorder,
              fontSize: 11,
            }}>
              <p style={{ fontSize: 10, fontWeight: 600, color: '#00C9A7', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>
                Conversión — dos vistas
              </p>
              {convTotalGlobal && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ color: t.textMuted, fontSize: 11 }}>Global (exitosos/total)</span>
                  <span style={{ fontWeight: 700, color: t.textPrimary }}>{convTotalGlobal}%</span>
                </div>
              )}
              {convPromedioPorFlujo && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: t.textMuted, fontSize: 11 }}>Promedio por flujo</span>
                  <span style={{ fontWeight: 700, color: t.textPrimary }}>{convPromedioPorFlujo}%</span>
                </div>
              )}
              <p style={{ fontSize: 9, color: t.textMuted, margin: 0, lineHeight: 1.4, opacity: 0.8 }}>
                La global mide sobre el total. El promedio por flujo es la media simple de cada flujo — la diferencia refleja el peso del volumen.
              </p>
            </div>
          )}
        </div>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
          padding: "12px 20px 8px", overflow: "hidden", position: "relative" }}>
          {totalProcesos === 0 ? (
            <p style={{ color: t.textMuted, fontSize: 13 }}>Sin datos para el período</p>
          ) : (
            <div style={{ position: "relative", width: 370, height: 370, flexShrink: 0 }}>
              <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", pointerEvents: "none", paddingBottom: 44 }}>
                <span style={{ fontSize: 56, fontWeight: 800, color: t.textPrimary, lineHeight: 1, letterSpacing: "-0.02em" }}>
                  {convPct.toFixed(1)}%
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: "#94A3B8", marginTop: 5,
                  letterSpacing: "0.06em", textTransform: "uppercase" }}>conversión</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="DI · Métricas generales" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   DI-2 | Usuarios y Reintentos
══════════════════════════════════════════════════════════════ */

function Di2Slide({ data, theme, clientName, periodLabel, pageNum = 2 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const b = data["2_usuarios_reintentos"]?.[0];
  const uUnicos  = parseInt(b?.col1  || "0", 10);
  const convUsr  = parseFloat(b?.col3 || "0");
  const convPrev = parseFloat(b?.col5 || "0");
  const avgInt   = parseFloat(b?.col10 || "0");
  const u1 = parseInt(b?.col6 || "0", 10);
  const u2 = parseInt(b?.col7 || "0", 10);
  const u3 = parseInt(b?.col8 || "0", 10);
  const u4 = parseInt(b?.col9 || "0", 10);

  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels: ["1 Intento", "2 Intentos", "3 Intentos", "4+ Intentos"],
        datasets: [{ data: [u1, u2, u3, u4],
          backgroundColor: ["#00C9A7", "#00C9A7", "#F59E0B", "#FF4B5C"],
          borderRadius: 8 }],
      },
      options: {
        plugins: {
          legend: { display: false }, tooltip: { enabled: true },
          datalabels: { anchor: "end", align: "top", color: t.textPrimary,
            font: { size: 14, weight: 700 }, formatter: (v: number) => v.toLocaleString("es-CO") },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: t.chartText, font: { size: 13 } } },
          y: { display: false, beginAtZero: true },
        },
        layout: { padding: { top: 28 } },
      },
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [u1, u2, u3, u4, t.textPrimary, t.chartText]);

  return (
    <SlideShell id="DI-2" theme={theme}>
      <SlideHeader title={`Usuarios y Reintentos — ${periodLabel}`} subtitle={`Digital Identity · ${clientName}`} theme={theme} />
      <div style={bodyStyle}>
        <div style={{ width: "36%", display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
          <KpiCard label="Usuarios únicos" value={uUnicos.toLocaleString("es-CO")} theme={theme} />
          <KpiCard label="Conversión por usuario" value={`${convUsr.toFixed(1)}%`} valueColor="#00C9A7" footnote={`Anterior: ${convPrev.toFixed(1)}%`} theme={theme} />
          <KpiCard label="Promedio de intentos" value={avgInt.toFixed(1)} theme={theme} />
        </div>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "20px 24px 16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <p style={{ margin: "0 0 12px", fontSize: 11, fontWeight: 700, color: t.textMuted,
            textTransform: "uppercase", letterSpacing: "0.12em" }}>Distribución de reintentos</p>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="DI · Usuarios y Reintentos" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   DI-3 | Validación de Documento vs Rostro
══════════════════════════════════════════════════════════════ */

function GaugeColumn({ label, pct, total, exitosas, expirados, declinados, theme }: {
  label: string; pct: number; total: number; exitosas: number;
  expirados: number; declinados: number; theme: Theme;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<Chart | null>(null);
  const t = tok(theme);

  useEffect(() => {
    if (!chartRef.current) return;
    chartInst.current?.destroy();
    chartInst.current = new Chart(chartRef.current, {
      type: "doughnut",
      data: { datasets: [{ data: [pct, 100 - pct],
        backgroundColor: ["#00C9A7", t.gaugeBg], borderWidth: 0 }] },
      options: {
        rotation: -90, circumference: 180, cutout: "76%",
        plugins: { legend: { display: false }, tooltip: { enabled: false }, datalabels: { display: false } },
      },
    } as any);
    return () => { chartInst.current?.destroy(); chartInst.current = null; };
  }, [pct, t.gaugeBg]);

  const rows = [
    { label: "Total validaciones", val: total.toLocaleString("es-CO"),    color: undefined },
    { label: "Exitosas",           val: exitosas.toLocaleString("es-CO"),  color: "#00C9A7" },
    { label: "Expiradas",          val: expirados.toLocaleString("es-CO"), color: "#F59E0B" },
    { label: "Declinadas",         val: declinados.toLocaleString("es-CO"),color: "#EF4444" },
  ];

  return (
    <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
      borderRadius: 14, padding: "20px 24px 16px", display: "flex", flexDirection: "column",
      alignItems: "center", overflow: "hidden" }}>
      <p style={{ margin: "0 0 10px", alignSelf: "flex-start", fontSize: 11, fontWeight: 700,
        color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.14em" }}>{label}</p>
      {/* Gauge: 260×260 canvas, show only top 130px */}
      <div style={{ position: "relative", width: 260, height: 130, overflow: "hidden", flexShrink: 0 }}>
        <canvas ref={chartRef} width={260} height={260} style={{ display: "block" }} />
        <div style={{ position: "absolute", bottom: 4, left: 0, right: 0, textAlign: "center" }}>
          <span style={{ fontSize: 38, fontWeight: 800, color: "#00C9A7", lineHeight: 1 }}>{pct.toFixed(1)}%</span>
        </div>
      </div>
      <span style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase",
        letterSpacing: "0.08em", marginTop: 6, marginBottom: 14 }}>conversión</span>
      <div style={{ width: "100%", borderTop: `1px solid ${t.footerBorder}`, paddingTop: 10 }}>
        {rows.map(row => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between",
            alignItems: "center", padding: "6px 0",
            borderBottom: `1px solid ${t.footerBorder}` }}>
            <span style={{ fontSize: 12, color: t.textMuted }}>{row.label}</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: row.color || t.textPrimary }}>{row.val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Di3Slide({ data, theme, clientName, periodLabel, pageNum = 3 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const b = data["3_validaciones_doc_rostro"]?.[0];
  return (
    <SlideShell id="DI-3" theme={theme}>
      <SlideHeader title={`Validación Doc vs Rostro — ${periodLabel}`} subtitle={`Digital Identity · ${clientName}`} theme={theme} />
      <div style={bodyStyle}>
        <GaugeColumn label="Documento"
          pct={parseFloat(b?.col3 || "0")}
          total={parseInt(b?.col1 || "0", 10)}       exitosas={parseInt(b?.col2 || "0", 10)}
          expirados={parseInt(b?.col11 || "0", 10)}  declinados={parseInt(b?.col_extra1 || "0", 10)}
          theme={theme} />
        <GaugeColumn label="Rostro"
          pct={parseFloat(b?.col8 || "0")}
          total={parseInt(b?.col6 || "0", 10)}         exitosas={parseInt(b?.col7 || "0", 10)}
          expirados={parseInt(b?.col_extra2 || "0", 10)} declinados={parseInt(b?.col_extra3 || "0", 10)}
          theme={theme} />
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="DI · Doc vs Rostro" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   DI-4 | Evolución Histórica
══════════════════════════════════════════════════════════════ */

function Di4Slide({ data, theme, clientName, periodLabel, pageNum = 4 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const hist     = data["4_historico_3meses"] || [];
  const labels   = hist.map(r => monthLabel(r.periodo || ""));
  const volumes  = hist.map(r => parseInt(r.col1  || "0", 10));
  const convPcts = hist.map(r => parseFloat(r.col3 || "0"));
  const depKey   = JSON.stringify([volumes, convPcts, labels]);

  useEffect(() => {
    if (!chartRef.current || hist.length === 0) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { type: "line" as any, label: "Conversión %", data: convPcts,
            borderColor: "#00C9A7", backgroundColor: "transparent", borderWidth: 3,
            pointRadius: 7, pointBackgroundColor: "#fff", pointBorderColor: "#00C9A7",
            pointBorderWidth: 2.5, yAxisID: "yConv", order: 1,
            datalabels: { display: true, anchor: "end", align: "top",
              color: "#00C9A7", font: { size: 13, weight: 700 },
              formatter: (v: number) => v.toFixed(1) + "%" } as any },
          { type: "bar" as any, label: "Volumen", data: volumes,
            backgroundColor: t.histBar, borderRadius: 8, yAxisID: "yVol", order: 2,
            datalabels: { display: false } as any },
        ],
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: { grid: { display: false }, ticks: { color: t.chartText, font: { size: 14 } } },
          yConv: { display: false, min: 0, max: 100, position: "left" },
          yVol:  { display: false, beginAtZero: true, position: "right" },
        },
        layout: { padding: { top: 44, right: 20 } },
      },
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, t.cardBg, t.chartText, t.textMuted]);

  return (
    <SlideShell id="DI-4" theme={theme}>
      <SlideHeader title={`Evolución Histórica — Últimos 3 meses`} subtitle={`Digital Identity · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        {/* Mini KPI row */}
        <div style={{ display: "flex", gap: 12, flexShrink: 0, height: 86 }}>
          {hist.map((row, i) => (
            <div key={i} style={{ flex: 1, background: t.cardBg, border: t.cardBorder,
              borderRadius: 12, padding: "10px 16px", display: "flex", flexDirection: "column",
              justifyContent: "space-between", overflow: "hidden" }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: t.textMuted,
                textTransform: "uppercase", letterSpacing: "0.1em" }}>{monthLabel(row.periodo || "")}</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: t.textPrimary }}>
                  {parseInt(row.col1 || "0", 10).toLocaleString("es-CO")}
                </span>
                <span style={{ fontSize: 20, fontWeight: 700, color: "#00C9A7" }}>
                  {parseFloat(row.col3 || "0").toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
        {/* Chart */}
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "16px 20px 12px", overflow: "hidden", position: "relative", minHeight: 0 }}>
          <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="DI · Evolución Histórica" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   DI-5 | Rendimiento por Flujos (tabla)
══════════════════════════════════════════════════════════════ */

function Di5Slide({ data, theme, clientName, periodLabel, pageNum = 5 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const t = tok(theme);
  const flujos = data["5_flujos"] || [];
  const cols = ["Flujo", "Total", "Exitosos", "Fallidos", "Conversión", "MoM"];
  const colW  = ["36%", "13%", "13%", "13%", "15%", "10%"];

  return (
    <SlideShell id="DI-5" theme={theme}>
      <SlideHeader title={`Rendimiento por Flujos — ${periodLabel}`} subtitle={`Digital Identity · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, alignItems: "stretch" }}>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Header row */}
          <div style={{ display: "flex", background: t.accentBar, padding: "14px 24px", flexShrink: 0 }}>
            {cols.map((c, i) => (
              <div key={c} style={{ width: colW[i], flexShrink: 0, fontSize: 11, fontWeight: 700,
                color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.12em" }}>{c}</div>
            ))}
          </div>
          {/* Data rows */}
          {flujos.map((row, idx) => {
            const mom  = parseMoM(row.col_extra1);
            const conv = parseFloat(row.col5 || "0");
            return (
              <div key={idx} style={{ display: "flex", alignItems: "center", padding: "0 24px",
                flex: 1, background: idx % 2 === 1 ? t.rowAlt : "transparent",
                borderBottom: idx < flujos.length - 1 ? `1px solid ${t.footerBorder}` : "none" }}>
                <div style={{ width: colW[0], flexShrink: 0, overflow: 'hidden' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: t.textPrimary,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.col_extra2 || row.col1}
                  </p>
                </div>
                {[row.col2, row.col3, row.col4].map((v, vi) => (
                  <div key={vi} style={{ width: colW[1 + vi], flexShrink: 0 }}>
                    <span style={{ fontSize: 24, fontWeight: 800, color: t.textPrimary }}>
                      {parseInt(v || "0", 10).toLocaleString("es-CO")}
                    </span>
                  </div>
                ))}
                <div style={{ width: colW[4], flexShrink: 0 }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: "#00C9A7" }}>{conv.toFixed(1)}%</span>
                </div>
                <div style={{ width: colW[5], flexShrink: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: mom.color }}>{mom.text}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="DI · Flujos" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   DI-6 | Embudo de Conversión
══════════════════════════════════════════════════════════════ */

function Di6Slide({ data, theme, clientName, periodLabel, pageNum = 6 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const b        = data["6_funnel"]?.[0];
  const inicio   = parseInt(b?.col1 || "0", 10);
  const llDoc    = parseInt(b?.col2 || "0", 10);
  const llRost   = parseInt(b?.col3 || "0", 10);
  const tasaDoc  = parseFloat(b?.col4 || "0");
  const tasaRost = parseFloat(b?.col5 || "0");

  useEffect(() => {
    if (!chartRef.current || inicio === 0) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels: [
          `Inician proceso`,
          `Llegan a documento  (${tasaDoc.toFixed(1)}%)`,
          `Llegan a rostro  (${tasaRost.toFixed(1)}%)`,
        ],
        datasets: [{ data: [inicio, llDoc, llRost],
          backgroundColor: [t.accentBar, "#00C9A7", "#00C9A7"],
          borderRadius: 10 }],
      },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { display: false }, tooltip: { enabled: true },
          datalabels: { color: "#FFFFFF", anchor: "end", align: "left",
            font: { size: 18, weight: 700 },
            formatter: (v: number) => v.toLocaleString("es-CO") },
        },
        scales: {
          x: { display: false, beginAtZero: true, max: inicio * 1.08 },
          y: { grid: { display: false }, ticks: { color: t.chartText, font: { size: 15 }, padding: 12 } },
        },
        layout: { padding: { right: 20, left: 8 } },
      },
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [inicio, llDoc, llRost, tasaDoc, tasaRost, t.accentBar, t.chartText]);

  return (
    <SlideShell id="DI-6" theme={theme}>
      <SlideHeader title={`Embudo de Conversión — ${periodLabel}`} subtitle={`Digital Identity · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, alignItems: "stretch" }}>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "20px 24px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: t.textMuted,
            textTransform: "uppercase", letterSpacing: "0.12em" }}>Usuarios por etapa del proceso</p>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="DI · Embudo" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   DI-7/8 | Top Razones de Rechazo
══════════════════════════════════════════════════════════════ */

const BAR_PALETTE = [
  "#4B6FFF", "#22C55E", "#F59E0B", "#EF4444",
  "#A78BFA", "#38BDF8", "#FB923C", "#34D399",
];

function HBarChart({ rows, theme }: { rows: BlockRow[]; theme: Theme }) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<Chart | null>(null);
  const t = tok(theme);

  const labels = rows.map(r => {
    const lbl = formatLabel(r.col1 || "");
    return r.col1 && r.col1.includes("risky_face") ? lbl + " ⚠️" : lbl;
  });
  const values = rows.map(r => parseInt(r.col2 || "0", 10));
  const colors = rows.map((_, i) => BAR_PALETTE[i % BAR_PALETTE.length]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartInst.current?.destroy();
    chartInst.current = new Chart(chartRef.current, {
      type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 6 }] },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { display: false }, tooltip: { enabled: true },
          datalabels: { color: t.textPrimary, anchor: "end", align: "right",
            font: { size: 12, weight: 700 }, formatter: (v: number) => v.toLocaleString("es-CO") },
        },
        scales: {
          x: { display: false, beginAtZero: true },
          y: { grid: { display: false }, ticks: { color: t.chartText, font: { size: 11 }, padding: 6 } },
        },
        layout: { padding: { right: 52, top: 4 } },
      },
    } as any);
    return () => { chartInst.current?.destroy(); chartInst.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values), JSON.stringify(labels), JSON.stringify(colors), t.textPrimary, t.chartText]);

  return (
    <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
      <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

/* helper compartido para la lista de razones de rechazo */
function RejectionList({ rows, theme }: { rows: BlockRow[]; theme: Theme }) {
  const t = tok(theme);
  return (
    <div style={{ display: "flex", gap: 24, flex: 1 }}>
      {/* Columna izquierda */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 0 }}>
        {rows.slice(0, Math.ceil(rows.length / 2)).map(r => {
          const codigo = r.col1 || "";
          const count  = parseInt(r.col2 || "0", 10);
          const info   = RAZONES_DI[codigo] || { descripcion: formatLabel(codigo), esAlerta: false };
          return (
            <div key={codigo} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <RazonRechazo codigo={codigo} descripcion={info.descripcion} tema={theme} esAlerta={info.esAlerta} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 10,
                color: info.esAlerta ? "#EF4444" : "#94A3B8" }}>
                {count.toLocaleString("es-CO")}
              </span>
            </div>
          );
        })}
      </div>
      {/* Columna derecha */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 0 }}>
        {rows.slice(Math.ceil(rows.length / 2)).map(r => {
          const codigo = r.col1 || "";
          const count  = parseInt(r.col2 || "0", 10);
          const info   = RAZONES_DI[codigo] || { descripcion: formatLabel(codigo), esAlerta: false };
          return (
            <div key={codigo} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <RazonRechazo codigo={codigo} descripcion={info.descripcion} tema={theme} esAlerta={info.esAlerta} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 10,
                color: info.esAlerta ? "#EF4444" : "#94A3B8" }}>
                {count.toLocaleString("es-CO")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Di7Slide({ data, theme, clientName, periodLabel, pageNum = 7 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const t = tok(theme);
  const b    = data["3_validaciones_doc_rostro"]?.[0];
  const rows = data["7_razones_doc"] || [];
  return (
    <SlideShell id="DI-7" theme={theme}>
      <SlideHeader title={`Documento — Métricas y Rechazos — ${periodLabel}`} subtitle={`Digital Identity · ${clientName}`} theme={theme} />
      <div style={bodyStyle}>
        {/* Left: gauge documento */}
        <GaugeColumn
          label="Documento"
          pct={parseFloat(b?.col3 || "0")}
          total={parseInt(b?.col1 || "0", 10)}
          exitosas={parseInt(b?.col2 || "0", 10)}
          expirados={parseInt(b?.col11 || "0", 10)}
          declinados={parseInt(b?.col_extra1 || "0", 10)}
          theme={theme}
        />
        {/* Right: razones de rechazo */}
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder,
          boxShadow: t.cardShadow, borderRadius: 14, padding: "20px 24px",
          display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: t.textMuted,
            textTransform: "uppercase", letterSpacing: "0.14em" }}>Razones de rechazo</p>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 0, overflowY: "auto" }}>
            {rows.map(r => {
              const codigo = r.col1 || "";
              const count  = parseInt(r.col2 || "0", 10);
              const info   = RAZONES_DI[codigo] || { descripcion: formatLabel(codigo), esAlerta: false };
              return (
                <div key={codigo} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <RazonRechazo codigo={codigo} descripcion={info.descripcion} tema={theme} esAlerta={info.esAlerta} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 10,
                    color: info.esAlerta ? "#EF4444" : "#94A3B8" }}>
                    {count.toLocaleString("es-CO")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="DI · Documento" />
    </SlideShell>
  );
}

function Di8Slide({ data, theme, clientName, periodLabel, pageNum = 8 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const t = tok(theme);
  const b    = data["3_validaciones_doc_rostro"]?.[0];
  const rows = data["8_razones_rostro"] || [];
  return (
    <SlideShell id="DI-8" theme={theme}>
      <SlideHeader title={`Rostro — Métricas y Rechazos — ${periodLabel}`} subtitle={`Digital Identity · ${clientName}`} theme={theme} />
      <div style={bodyStyle}>
        {/* Left: gauge rostro */}
        <GaugeColumn
          label="Rostro"
          pct={parseFloat(b?.col8 || "0")}
          total={parseInt(b?.col6 || "0", 10)}
          exitosas={parseInt(b?.col7 || "0", 10)}
          expirados={parseInt(b?.col_extra2 || "0", 10)}
          declinados={parseInt(b?.col_extra3 || "0", 10)}
          theme={theme}
        />
        {/* Right: razones de rechazo */}
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder,
          boxShadow: t.cardShadow, borderRadius: 14, padding: "20px 24px",
          display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <p style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: t.textMuted,
            textTransform: "uppercase", letterSpacing: "0.14em" }}>Razones de rechazo</p>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 0, overflowY: "auto" }}>
            {rows.map(r => {
              const codigo = r.col1 || "";
              const count  = parseInt(r.col2 || "0", 10);
              const info   = RAZONES_DI[codigo] || { descripcion: formatLabel(codigo), esAlerta: false };
              return (
                <div key={codigo} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <RazonRechazo codigo={codigo} descripcion={info.descripcion} tema={theme} esAlerta={info.esAlerta} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 10,
                    color: info.esAlerta ? "#EF4444" : "#94A3B8" }}>
                    {count.toLocaleString("es-CO")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="DI · Rostro" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   DI-9 | Análisis de Abandono
══════════════════════════════════════════════════════════════ */

function Di9Slide({ data, theme, clientName, periodLabel, pageNum = 9 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const abandonoChartRef = useRef<HTMLCanvasElement>(null);
  const abandonoInst     = useRef<Chart | null>(null);
  const t = tok(theme);

  const abandonoRows = data["9_abandono"] || [];

  const cancelados = abandonoRows.filter(r => r.col1 === "canceled")
    .reduce((s, r) => s + parseInt(r.col2 || "0", 10), 0);
  const expirados  = abandonoRows.filter(r => r.col1 !== "canceled")
    .reduce((s, r) => s + parseInt(r.col2 || "0", 10), 0);
  const totalAband = cancelados + expirados;
  const pctExp = totalAband > 0 ? (expirados  / totalAband * 100).toFixed(1) : "0.0";
  const pctCan = totalAband > 0 ? (cancelados / totalAband * 100).toFixed(1) : "0.0";

  useEffect(() => {
    if (!abandonoChartRef.current || totalAband === 0) return;
    abandonoInst.current?.destroy();
    abandonoInst.current = new Chart(abandonoChartRef.current, {
      type: "doughnut",
      data: {
        labels: [`Abandonados (${pctExp}%)`, `Cancelados (${pctCan}%)`],
        datasets: [{ data: [expirados, cancelados],
          backgroundColor: ["#F59E0B", "#EF4444"],
          borderWidth: 4, borderColor: t.doughnutBg }],
      },
      options: { cutout: "68%", plugins: {
        legend: { position: "bottom", labels: { color: t.legendColor,
          font: { size: 12, weight: 600 }, padding: 14, usePointStyle: true, pointStyleWidth: 9 } },
        tooltip: { enabled: true },
        datalabels: { display: false },
      }},
    } as any);
    return () => { abandonoInst.current?.destroy(); abandonoInst.current = null; };
  }, [expirados, cancelados, pctExp, pctCan, t.doughnutBg, t.legendColor, totalAband]);

  return (
    <SlideShell id="DI-9" theme={theme}>
      <SlideHeader title={`Análisis de Abandono — ${periodLabel}`} subtitle={`Digital Identity · ${clientName}`} theme={theme} />
      <div style={bodyStyle}>
        {/* Donut centrado */}
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "16px 20px", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <p style={{ margin: "0 0 8px", alignSelf: "flex-start", fontSize: 11, fontWeight: 700,
            color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>Abandono</p>
          <div style={{ position: "relative", width: 320, height: 320, flexShrink: 0 }}>
            <canvas ref={abandonoChartRef} style={{ width: "100%", height: "100%" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", pointerEvents: "none", paddingBottom: 36 }}>
              <span style={{ fontSize: 48, fontWeight: 800, color: "#F59E0B", lineHeight: 1 }}>
                {totalAband.toLocaleString("es-CO")}
              </span>
              <span style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase",
                letterSpacing: "0.06em", marginTop: 4 }}>total</span>
            </div>
          </div>
        </div>
        {/* KPIs abandono */}
        <div style={{ width: "38%", display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
          {[
            { label: "Abandonados (expiraron)", val: expirados, pct: pctExp + "%", color: "#F59E0B" },
            { label: "Cancelados (usuario abortó)", val: cancelados, pct: pctCan + "%", color: "#EF4444" },
          ].map(item => (
            <div key={item.label} style={{ flex: 1, background: t.cardBg, border: t.cardBorder,
              boxShadow: t.cardShadow, borderRadius: 14, padding: "20px 24px",
              display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: t.textMuted,
                textTransform: "uppercase", letterSpacing: "0.10em" }}>{item.label}</p>
              <p style={{ margin: 0, fontSize: 40, fontWeight: 800, color: item.color, lineHeight: 1 }}>
                {item.val.toLocaleString("es-CO")}
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 600, color: t.textSecondary }}>
                {item.pct} del total
              </p>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="DI · Abandono" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   DI-10b | Rechazos por Declinado
══════════════════════════════════════════════════════════════ */

function DiDeclinadosSlide({ data, theme, clientName, periodLabel, pageNum = 10 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const t = tok(theme);
  const rows = data["10_declinados"] || [];

  return (
    <SlideShell id="DI-10b" theme={theme}>
      <SlideHeader title={`Rechazos por Declinado — ${periodLabel}`} subtitle={`Digital Identity · ${clientName}`} theme={theme} />
      <div style={bodyStyle}>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder,
          boxShadow: t.cardShadow, borderRadius: 14, padding: "20px 28px",
          display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <p style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: t.textMuted,
            textTransform: "uppercase", letterSpacing: "0.12em" }}>Top motivos de declinación</p>
          <HBarChart rows={rows} theme={theme} />
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="DI · Declinados" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   DI-10 | Fricción por Usuario Único
══════════════════════════════════════════════════════════════ */

function Di10Slide({ data, theme, clientName, periodLabel, pageNum = 10 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const rows   = data["11_friccion_usuario"] || [];
  const labels = rows.map(r => {
    const codigo = r.col1 || "";
    const info = RAZONES_DI[codigo];
    return info ? info.descripcion : formatLabel(codigo);
  });
  const values = rows.map(r => parseInt(r.col2 || "0", 10));
  const colors = rows.map(r => {
    const info = RAZONES_DI[r.col1 || ""];
    return info && info.esAlerta ? "#EF4444" : BAR_PALETTE[0];
  });

  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 8 }] },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { display: false }, tooltip: { enabled: true },
          datalabels: { color: t.textPrimary, anchor: "end", align: "right",
            font: { size: 13, weight: 700 }, formatter: (v: number) => v.toLocaleString("es-CO") },
        },
        scales: {
          x: { display: false, beginAtZero: true },
          y: { grid: { display: false }, ticks: { color: t.chartText, font: { size: 12 }, padding: 8 } },
        },
        layout: { padding: { right: 60, top: 4 } },
      },
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values), JSON.stringify(labels), JSON.stringify(colors), t.textPrimary, t.chartText]);

  return (
    <SlideShell id="DI-10" theme={theme}>
      <SlideHeader title={`Fricción por Usuario Único — ${periodLabel}`} subtitle={`Digital Identity · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column" }}>
        <p style={{ margin: "0 0 10px", fontSize: 12, color: t.textMuted, flexShrink: 0 }}>
          Usuarios únicos afectados por motivo — no intentos totales
        </p>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "16px 20px", display: "flex", flexDirection: "column",
          overflow: "hidden", minHeight: 0 }}>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="DI · Fricción Usuario" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   BGC palette
══════════════════════════════════════════════════════════════ */

const BGC = { primary: "#6C3FC5", light: "#E8D9FC", success: "#22C55E", danger: "#EF4444", warning: "#F59E0B" };

/* ════════════════════════════════════════════════════════════
   BGC-1 | Resumen General
══════════════════════════════════════════════════════════════ */

function Bgc1Slide({ data, theme, clientName, periodLabel, pageNum = 1 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const b = data["1_resumen_general"]?.[0];
  const totalChecks   = parseInt(b?.col1  || "0", 10);
  const scorePromedio = parseFloat(b?.col4 || "0");
  const scorePrev     = parseFloat(b?.col9 || "0");
  const passRate      = parseFloat(b?.col5 || "0");
  const passRatePrev  = parseFloat(b?.col10 || "0");
  const rejectionRate = parseFloat(b?.col6 || "0");
  const varChecks     = b?.col11;
  const deltaScore    = b?.col_extra1;
  const deltaPassRate = b?.col_extra2;

  useEffect(() => {
    if (!chartRef.current || totalChecks === 0) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "doughnut",
      data: {
        labels: [`Checks exitosos (${passRate.toFixed(1)}%)`, `Checks con advertencias (${rejectionRate.toFixed(1)}%)`],
        datasets: [{ data: [passRate, rejectionRate],
          backgroundColor: [BGC.success, BGC.danger], borderWidth: 4, borderColor: t.cardBg }],
      },
      options: { cutout: "68%", plugins: {
        legend: { position: "bottom", labels: { color: t.legendColor,
          font: { size: 12, weight: 600 }, padding: 14, usePointStyle: true, pointStyleWidth: 9 } },
        tooltip: { enabled: true },
        datalabels: { display: true, color: "#FFFFFF", font: { size: 15, weight: 700 },
          formatter: (v: number) => v.toFixed(1) + "%", anchor: "center", align: "center" },
      }},
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  }, [passRate, rejectionRate, t.cardBg, t.legendColor, totalChecks]);

  return (
    <SlideShell id="BGC-1" theme={theme}>
      <SlideHeader title={`Actividad del mes — ${periodLabel}`} subtitle={`Background Check · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexShrink: 0, height: 148 }}>
          <KpiCard label="Total verificaciones" value={totalChecks.toLocaleString("es-CO")} delta={varChecks} theme={theme} />
          <KpiCard label="Puntaje de confianza" value={`${scorePromedio.toFixed(1)}`}
            footnote={`/ 10 pts · Anterior: ${scorePrev.toFixed(1)}${deltaScore ? ` (Δ${deltaScore} pts)` : ""}`} theme={theme} />
          <KpiCard label="Checks exitosos" value={`${passRate.toFixed(1)}%`} valueColor={BGC.success}
            footnote={`Anterior: ${passRatePrev.toFixed(1)}%${deltaPassRate ? ` · Δ ${deltaPassRate} pp` : ""}`} theme={theme} />
        </div>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", overflow: "hidden", minHeight: 0 }}>
          <div style={{ position: "relative", width: 300, height: 300, flexShrink: 0 }}>
            <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", pointerEvents: "none", paddingBottom: 40 }}>
              <span style={{ fontSize: 50, fontWeight: 800, color: BGC.success, lineHeight: 1, letterSpacing: "-0.02em" }}>
                {passRate.toFixed(1)}%
              </span>
              <span style={{ fontSize: 11, color: "#94A3B8", marginTop: 6, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                checks exitosos
              </span>
            </div>
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 10, color: t.textMuted, textAlign: "center" }}>
            Calculado con umbral puntaje &gt; 6 · Confirmar umbral con el cliente si es diferente
          </p>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="BGC · Actividad del mes" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   BGC-2 | Distribución por País
══════════════════════════════════════════════════════════════ */

function Bgc2Slide({ data, theme, clientName, periodLabel, pageNum = 2 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const rows = [...(data["2_por_pais"] || [])].sort((a, b) =>
    parseInt(b.col3 || "0", 10) - parseInt(a.col3 || "0", 10)
  ).slice(0, 5);

  const labels    = rows.map(r => r.col1 || "");
  const volumes   = rows.map(r => parseInt(r.col3 || "0", 10));
  const passRates = rows.map(r => parseFloat(r.col6 || "0"));
  const depKey = JSON.stringify([labels, volumes, passRates]);

  useEffect(() => {
    if (!chartRef.current || rows.length === 0) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { type: "bar" as any, label: "Checks completados", data: volumes,
            backgroundColor: labels.map((_, i) => BAR_PALETTE[i % BAR_PALETTE.length]),
            borderRadius: 8, yAxisID: "yVol",
            datalabels: { display: false } as any },
          { type: "line" as any, label: "Pass Rate %", data: passRates,
            borderColor: BGC.success, backgroundColor: "transparent", borderWidth: 3,
            pointRadius: 6, pointBackgroundColor: "#fff", pointBorderColor: BGC.success,
            pointBorderWidth: 2, yAxisID: "yRate",
            datalabels: { display: true, anchor: "end", align: "top",
              color: BGC.success, font: { size: 12, weight: 700 },
              formatter: (v: number) => v.toFixed(1) + "%" } as any },
        ],
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: { grid: { display: false }, ticks: { color: t.chartText, font: { size: 14 } } },
          yVol:  { display: false, beginAtZero: true, position: "left" },
          yRate: { display: false, min: 80, max: 100, position: "right" },
        },
        layout: { padding: { top: 36 } },
      },
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, t.chartText]);

  const tableColW = ["10%", "24%", "20%", "22%", "24%"];
  const tableCols = ["País", "Checks", "Pass Rate", "Score", "% Total"];

  return (
    <SlideShell id="BGC-2" theme={theme}>
      <SlideHeader title={`Resultados por país — ${periodLabel}`} subtitle={`Background Check · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "16px 20px 8px", overflow: "hidden", position: "relative", minHeight: 0 }}>
          <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
        </div>
        <div style={{ flexShrink: 0, background: t.cardBg, border: t.cardBorder,
          boxShadow: t.cardShadow, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "flex", background: t.accentBar, padding: "8px 20px" }}>
            {tableCols.map((c, i) => (
              <div key={c} style={{ width: tableColW[i], flexShrink: 0, fontSize: 10, fontWeight: 700,
                color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.12em" }}>{c}</div>
            ))}
          </div>
          {rows.map((row, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", padding: "7px 20px",
              background: idx % 2 === 1 ? t.rowAlt : "transparent",
              borderBottom: idx < rows.length - 1 ? `1px solid ${t.footerBorder}` : "none" }}>
              <div style={{ width: tableColW[0], flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: BGC.primary }}>{row.col1}</span>
              </div>
              <div style={{ width: tableColW[1], flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>
                  {parseInt(row.col3 || "0", 10).toLocaleString("es-CO")}
                </span>
              </div>
              <div style={{ width: tableColW[2], flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: BGC.success }}>
                  {parseFloat(row.col6 || "0").toFixed(1)}%
                </span>
              </div>
              <div style={{ width: tableColW[3], flexShrink: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>
                  {parseFloat(row.col5 || "0").toFixed(1)}
                </span>
              </div>
              <div style={{ width: tableColW[4], flexShrink: 0 }}>
                <span style={{ fontSize: 13, color: t.textMuted }}>{parseFloat(row.col8 || "0").toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="BGC · Resultados por país" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   BGC-3 | Score por País
══════════════════════════════════════════════════════════════ */

function Bgc3Slide({ data, theme, clientName, periodLabel, pageNum = 3 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const rows4 = data["4_score_por_pais"] || [];
  const countries: string[] = [];
  const seen = new Set<string>();
  for (const r of rows4) {
    const c = r.col1 || "";
    if (!seen.has(c)) { seen.add(c); countries.push(c); }
  }

  const approved = countries.map(c =>
    rows4.filter(r => r.col1 === c && r.col6 === "0").reduce((s, r) => s + parseInt(r.col3 || "0", 10), 0)
  );
  const rejected = countries.map(c =>
    rows4.filter(r => r.col1 === c && r.col6 === "1").reduce((s, r) => s + parseInt(r.col3 || "0", 10), 0)
  );
  const totals = countries.map((_, i) => approved[i] + rejected[i]);
  const pctApp = countries.map((_, i) => totals[i] > 0 ? Math.round(approved[i] / totals[i] * 100) : 0);
  const pctRej = countries.map((_, i) => 100 - pctApp[i]);

  const totalApp = approved.reduce((s, v) => s + v, 0);
  const totalAll = totalApp + rejected.reduce((s, v) => s + v, 0);
  const globalApp = totalAll > 0 ? (totalApp / totalAll * 100).toFixed(1) : "0.0";
  const globalRej = totalAll > 0 ? (100 - parseFloat(globalApp)).toFixed(1) : "0.0";
  const depKey = JSON.stringify([pctApp, pctRej, countries]);

  useEffect(() => {
    if (!chartRef.current || countries.length === 0) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels: countries,
        datasets: [
          { label: "Aprobados (score > 6)", data: pctApp,
            backgroundColor: BGC.success, stack: "stack", borderRadius: 0 },
          { label: "Rechazados (score ≤ 6)", data: pctRej,
            backgroundColor: BGC.danger,  stack: "stack", borderRadius: 0 },
        ],
      },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { position: "bottom", labels: { color: t.legendColor,
            font: { size: 12, weight: 600 }, padding: 16, usePointStyle: true, pointStyleWidth: 9 } },
          tooltip: { enabled: true },
          datalabels: { display: true, color: "#FFFFFF", font: { size: 14, weight: 700 },
            anchor: "center", align: "center",
            formatter: (v: number) => v > 8 ? v + "%" : "" },
        },
        scales: {
          x: { stacked: true, display: false, min: 0, max: 100 },
          y: { stacked: true, grid: { display: false }, ticks: { color: t.chartText, font: { size: 14 } } },
        },
      },
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, t.legendColor, t.chartText]);

  return (
    <SlideShell id="BGC-3" theme={theme}>
      <SlideHeader title={`Aprobados vs rechazados por país — ${periodLabel}`} subtitle={`Background Check · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexShrink: 0, height: 80 }}>
          {[
            { label: "Aprobados global", val: globalApp + "%", color: BGC.success, sub: "score > 6" },
            { label: "Rechazados global", val: globalRej + "%", color: BGC.danger,  sub: "score ≤ 6" },
          ].map(k => (
            <div key={k.label} style={{ flex: 1, background: t.cardBg, border: t.cardBorder,
              borderRadius: 12, padding: "12px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.val}</span>
              <div>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: t.textMuted,
                  textTransform: "uppercase", letterSpacing: "0.12em" }}>{k.label}</p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: t.textMuted }}>{k.sub}</p>
              </div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "16px 24px 8px", display: "flex", flexDirection: "column",
          overflow: "hidden", minHeight: 0 }}>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="BGC · Aprobados vs rechazados" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   BGC-4 | Análisis de Labels de Riesgo
══════════════════════════════════════════════════════════════ */

function Bgc4Slide({ data, theme, clientName, periodLabel, pageNum = 4 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const labelsRows = data["5_labels"]            || [];
  const highRows   = data["6_labels_high_score"] || [];
  const anomalies  = highRows.filter(r => r.col5 === "1");
  const anomalyN   = anomalies.reduce((s, r) => s + parseInt(r.col4 || "0", 10), 0);

  const chartLabels = labelsRows.map(r => {
    const info = getLabelBGC(r.col1 || "");
    return info.descripcion;
  });
  const chartRawCodes = labelsRows.map(r => r.col1 || "");
  const chartValues = labelsRows.map(r => parseInt(r.col3 || "0", 10));
  const chartColors = chartRawCodes.map(code => getLabelBGC(code).esAlerta ? "#EF4444" : BAR_PALETTE[0]);
  const depKey = JSON.stringify([chartLabels, chartValues]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: { labels: chartLabels, datasets: [{ data: chartValues,
        backgroundColor: chartColors, borderRadius: 8 }] },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { display: false }, tooltip: { enabled: true },
          datalabels: { color: t.textPrimary, anchor: "end", align: "right",
            font: { size: 13, weight: 700 }, formatter: (v: number) => v.toLocaleString("es-CO") },
        },
        scales: {
          x: { display: false, beginAtZero: true },
          y: { grid: { display: false }, ticks: { color: t.chartText, font: { size: 13 }, padding: 8 } },
        },
        layout: { padding: { right: 70, top: 4 } },
      },
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, t.textPrimary, t.chartText, JSON.stringify(chartColors)]);

  return (
    <SlideShell id="BGC-4" theme={theme}>
      <SlideHeader title={`Alertas de riesgo detectadas — ${periodLabel}`} subtitle={`Background Check · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "16px 20px", display: "flex", flexDirection: "column",
          overflow: "hidden", minHeight: 0 }}>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
        {anomalies.length > 0 && (
          <div style={{ flexShrink: 0, padding: "12px 20px", borderRadius: 10,
            background: "rgba(239,68,68,0.10)", border: `1.5px solid ${BGC.danger}`,
            display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <p style={{ margin: 0, fontSize: 12, color: BGC.danger, lineHeight: 1.5 }}>
              Se detectaron <strong>{anomalyN.toLocaleString("es-CO")}</strong> checks con label{" "}
              <strong>High</strong> pero score &gt; 6. Puede indicar una base de datos configurada
              como informativa. Verificar con el equipo técnico de Truora.
            </p>
          </div>
        )}
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="BGC · Alertas de riesgo" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   BGC-4b | Labels High + Score (tabla de anomalías)
══════════════════════════════════════════════════════════════ */

function Bgc4bSlide({ data, theme, clientName, periodLabel, pageNum = 4 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const t = tok(theme);
  const rows = data["6_labels_high_score"] || [];
  const anomalies = rows.filter(r => r.col5 === "1");
  const normal    = rows.filter(r => r.col5 !== "1");

  return (
    <SlideShell id="BGC-4b" theme={theme}>
      <SlideHeader title={`Alertas de riesgo alto y puntaje — ${periodLabel}`} subtitle={`Background Check · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        {/* Anomaly alert */}
        {anomalies.length > 0 && (
          <div style={{ flexShrink: 0, padding: "12px 20px", borderRadius: 10,
            background: "rgba(239,68,68,0.10)", border: `1.5px solid ${BGC.danger}`,
            display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <p style={{ margin: 0, fontSize: 12, color: BGC.danger, lineHeight: 1.5 }}>
              Se detectaron <strong>{anomalies.reduce((s, r) => s + parseInt(r.col4 || "0", 10), 0).toLocaleString("es-CO")}</strong> verificaciones con alerta de riesgo alto pero puntaje superior a 6.
              Esto puede indicar una base de datos configurada como informativa.
            </p>
          </div>
        )}
        {/* Table */}
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", background: BGC.primary, padding: "8px 16px", flexShrink: 0 }}>
            {["Alerta", "País", "Puntaje", "Verificaciones", "Estado"].map((c, i) => (
              <div key={c} style={{ width: ["30%", "15%", "15%", "20%", "20%"][i], flexShrink: 0,
                fontSize: 10, fontWeight: 700, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.1em" }}>{c}</div>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {rows.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: t.textMuted, fontSize: 13 }}>
                Sin alertas de riesgo alto en este período
              </div>
            )}
            {rows.map((r, i) => {
              const isAnomaly = r.col5 === "1";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 16px",
                  background: i % 2 === 1 ? t.rowAlt : "transparent",
                  borderBottom: i < rows.length - 1 ? `1px solid ${t.footerBorder}` : "none" }}>
                  <div style={{ width: "30%", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: isAnomaly ? BGC.danger : t.textPrimary }}>
                      {getLabelBGC(r.col1 || "").descripcion}
                    </span>
                  </div>
                  <div style={{ width: "15%", flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: t.textMuted }}>{r.col2 || "—"}</span>
                  </div>
                  <div style={{ width: "15%", flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>{r.col3 || "—"}</span>
                  </div>
                  <div style={{ width: "20%", flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>
                      {parseInt(r.col4 || "0", 10).toLocaleString("es-CO")}
                    </span>
                  </div>
                  <div style={{ width: "20%", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                      background: isAnomaly ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
                      color: isAnomaly ? BGC.danger : BGC.success }}>
                      {isAnomaly ? "Anomalía" : "Normal"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="BGC · Alertas de riesgo alto" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   BGC-5 | Evolución Histórica BGC
══════════════════════════════════════════════════════════════ */

function Bgc5Slide({ data, theme, clientName, periodLabel, pageNum = 5 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const hist      = data["7_historico_3meses"] || [];
  const labels    = hist.map(r => monthLabel(r.periodo || ""));
  const volumes   = hist.map(r => parseInt(r.col1 || "0", 10));
  const passRates = hist.map(r => parseFloat(r.col5 || "0"));
  const scores    = hist.map(r => parseFloat(r.col4 || "0"));
  const depKey    = JSON.stringify([labels, volumes, passRates, scores]);

  const rateMin = Math.max(0, Math.min(...passRates) - 5);
  const rateMax = Math.min(100, Math.max(...passRates) + 5);
  const scoreMin = Math.max(0, Math.min(...scores) - 3);
  const scoreMax = Math.min(100, Math.max(...scores) + 3);

  useEffect(() => {
    if (!chartRef.current || hist.length === 0) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { type: "bar" as any, label: "Volumen de checks", data: volumes,
            backgroundColor: "rgba(108,63,197,0.25)", borderColor: BGC.primary,
            borderWidth: 1.5, borderRadius: 8, yAxisID: "yVol",
            datalabels: { display: true, anchor: "end", align: "top",
              color: BGC.primary, font: { size: 12, weight: 700 },
              formatter: (v: number) => v.toLocaleString("es-CO") } as any },
          { type: "line" as any, label: "Pass Rate %", data: passRates,
            borderColor: BGC.success, backgroundColor: "transparent", borderWidth: 3,
            pointRadius: 7, pointBackgroundColor: "#fff", pointBorderColor: BGC.success,
            pointBorderWidth: 2.5, yAxisID: "yRate", order: 0,
            datalabels: { display: true, anchor: "end", align: "top",
              color: BGC.success, font: { size: 13, weight: 700 },
              formatter: (v: number) => v.toFixed(1) + "%" } as any },
          { type: "line" as any, label: "Score promedio (pts)", data: scores,
            borderColor: BGC.warning, backgroundColor: "transparent", borderWidth: 3,
            borderDash: [6, 3] as any,
            pointRadius: 7, pointBackgroundColor: "#fff", pointBorderColor: BGC.warning,
            pointBorderWidth: 2.5, yAxisID: "yScore", order: 0,
            datalabels: { display: true, anchor: "end", align: "bottom",
              color: BGC.warning, font: { size: 13, weight: 700 },
              formatter: (v: number) => v.toFixed(1) + " pts" } as any },
        ],
      },
      options: {
        plugins: {
          legend: { position: "bottom", labels: { color: t.legendColor,
            font: { size: 12, weight: 600 }, padding: 20, usePointStyle: true, pointStyleWidth: 9 } },
          tooltip: { enabled: true },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: t.chartText, font: { size: 14 } } },
          yRate:  { display: false, min: rateMin,  max: rateMax,  position: "left" },
          yScore: { display: false, min: scoreMin, max: scoreMax, position: "right" },
          yVol:   { display: false, beginAtZero: true, position: "right" },
        },
        layout: { padding: { top: 44, left: 16, right: 16 } },
      },
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, rateMin, rateMax, scoreMin, scoreMax, t.legendColor, t.chartText]);

  return (
    <SlideShell id="BGC-5" theme={theme}>
      <SlideHeader title={`Tendencia de los últimos 3 meses`} subtitle={`Background Check · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        {/* Summary cards — one per period */}
        <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
          {hist.map((row, i) => (
            <div key={i} style={{ flex: 1, background: t.cardBg, border: t.cardBorder,
              borderRadius: 12, padding: "10px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: t.textMuted,
                textTransform: "uppercase", letterSpacing: "0.1em" }}>{monthLabel(row.periodo || "")}</p>
              <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: BGC.primary, lineHeight: 1 }}>
                    {parseInt(row.col1 || "0", 10).toLocaleString("es-CO")}
                  </span>
                  <span style={{ fontSize: 9, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>
                    checks
                  </span>
                </div>
                <div style={{ width: 1, height: 28, background: t.footerBorder, flexShrink: 0 }} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: BGC.success, lineHeight: 1 }}>
                    {parseFloat(row.col5 || "0").toFixed(1)}%
                  </span>
                  <span style={{ fontSize: 9, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>
                    pass rate
                  </span>
                </div>
                <div style={{ width: 1, height: 28, background: t.footerBorder, flexShrink: 0 }} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: BGC.warning, lineHeight: 1 }}>
                    {parseFloat(row.col4 || "0").toFixed(1)}
                  </span>
                  <span style={{ fontSize: 9, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>
                    score avg
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Chart */}
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "12px 20px 8px", overflow: "hidden", position: "relative", minHeight: 0 }}>
          <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="BGC · Tendencia 3 meses" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   BGC-6 | Qué se verifica en cada país
══════════════════════════════════════════════════════════════ */

const BGC6_COLORS     = ["#6C3FC5", "#9B72E8", "#C4A9F0", "#D4BBFA", "#E8D9FC", "#2A1760"];
const BGC6_TEXT_COLORS = ["#FFFFFF", "#FFFFFF", "#2A1760", "#2A1760", "#2A1760", "#FFFFFF"];

function Bgc6Slide({ data, theme, clientName, periodLabel, pageNum = 6 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const rows = data["2b_pais_x_tipo"] || [];

  // Collect unique countries and types (max 6 types)
  const countries: string[] = [];
  const seenC = new Set<string>();
  for (const r of rows) {
    const c = r.col1 || "";
    if (!seenC.has(c)) { seenC.add(c); countries.push(c); }
  }

  const allTypes: string[] = [];
  const seenT = new Set<string>();
  for (const r of rows) {
    const tp = r.col2 || "";
    if (!seenT.has(tp)) { seenT.add(tp); allTypes.push(tp); }
  }
  const types = allTypes.slice(0, 6);

  // Per type dataset: values indexed by country
  const datasets = types.map((tp, i) => ({
    label: tp,
    data: countries.map(c => {
      const match = rows.find(r => r.col1 === c && r.col2 === tp);
      return match ? parseInt(match.col3 || "0", 10) : 0;
    }),
    backgroundColor: BGC6_COLORS[i % BGC6_COLORS.length],
    stack: "stack",
    borderRadius: 0,
    datalabels: {
      display: (ctx: any) => {
        const val = Number(ctx.dataset.data[ctx.dataIndex] || 0);
        if (val === 0) return false;
        const total = ctx.chart.data.datasets.reduce((s: number, ds: any) => {
          return s + Number(ds.data[ctx.dataIndex] || 0);
        }, 0);
        return total > 0 && val / total >= 0.11;
      },
      anchor: "center",
      align: "center",
      color: BGC6_TEXT_COLORS[i % BGC6_TEXT_COLORS.length],
      font: { size: 10, weight: 700 },
      formatter: (_: any, ctx: any) => ctx.dataset.label,
    } as any,
  }));

  // Table rows: sorted by country then checks DESC
  const tableRows = [...rows]
    .filter(r => types.includes(r.col2 || ""))
    .sort((a, b) => {
      const cmp = (a.col1 || "").localeCompare(b.col1 || "");
      if (cmp !== 0) return cmp;
      return parseInt(b.col3 || "0", 10) - parseInt(a.col3 || "0", 10);
    });

  const depKey = JSON.stringify([countries, types, datasets.map(d => d.data)]);

  useEffect(() => {
    if (!chartRef.current || countries.length === 0) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: { labels: countries, datasets },
      options: {
        plugins: {
          legend: { position: "bottom", labels: { color: t.legendColor,
            font: { size: 11, weight: 600 }, padding: 14, usePointStyle: true, pointStyleWidth: 8 } },
          tooltip: { enabled: true },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: t.chartText, font: { size: 13 } } },
          y: { stacked: true, display: false, beginAtZero: true },
        },
        layout: { padding: { top: 8 } },
      },
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, t.legendColor, t.chartText]);

  const tColW = ["14%", "34%", "24%", "28%"];
  const tCols = ["País", "Tipo", "Checks", "Pass Rate"];

  return (
    <SlideShell id="BGC-6" theme={theme}>
      <SlideHeader title={`Qué se verifica en cada país — ${periodLabel}`} subtitle={`Background Check · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        {/* Chart */}
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "12px 20px 8px", overflow: "hidden", position: "relative", minHeight: 0 }}>
          <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
        </div>
        {/* Compact table */}
        <div style={{ flexShrink: 0, background: t.cardBg, border: t.cardBorder,
          boxShadow: t.cardShadow, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ display: "flex", background: BGC.primary, padding: "6px 20px" }}>
            {tCols.map((c, i) => (
              <div key={c} style={{ width: tColW[i], flexShrink: 0, fontSize: 10, fontWeight: 700,
                color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.12em" }}>{c}</div>
            ))}
          </div>
          {tableRows.map((row, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", padding: "5px 20px",
              background: idx % 2 === 1 ? t.rowAlt : "transparent",
              borderBottom: idx < tableRows.length - 1 ? `1px solid ${t.footerBorder}` : "none" }}>
              <div style={{ width: tColW[0], flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: BGC.primary }}>{row.col1}</span>
              </div>
              <div style={{ width: tColW[1], flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: t.textPrimary }}>{row.col2}</span>
              </div>
              <div style={{ width: tColW[2], flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: t.textPrimary }}>
                  {parseInt(row.col3 || "0", 10).toLocaleString("es-CO")}
                </span>
              </div>
              <div style={{ width: tColW[3], flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: BGC.success }}>
                  {parseFloat(row.col7 || "0").toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="BGC · Verificación por país" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   BGC-7 | Tipos de verificación activos
══════════════════════════════════════════════════════════════ */

function Bgc7Slide({ data, theme, clientName, periodLabel, pageNum = 7 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const rows = [...(data["3_por_tipo"] || [])].sort(
    (a, b) => parseInt(b.col3 || "0", 10) - parseInt(a.col3 || "0", 10)
  );

  const labels = rows.map(r => r.col1 || "");
  const values = rows.map(r => parseInt(r.col3 || "0", 10));
  const depKey = JSON.stringify([labels, values]);

  useEffect(() => {
    if (!chartRef.current || rows.length === 0) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: BGC.primary, borderRadius: 8 }],
      },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { display: false }, tooltip: { enabled: true },
          datalabels: { color: t.textPrimary, anchor: "end", align: "right",
            font: { size: 13, weight: 700 }, formatter: (v: number) => v.toLocaleString("es-CO") },
        },
        scales: {
          x: { display: false, beginAtZero: true },
          y: { grid: { display: false }, ticks: { color: t.chartText, font: { size: 12 }, padding: 8 } },
        },
        layout: { padding: { right: 80, top: 4 } },
      },
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, t.textPrimary, t.chartText]);

  function passRateColor(rate: number): string {
    if (rate >= 90) return BGC.success;
    if (rate >= 80) return BGC.warning;
    return BGC.danger;
  }

  const tColW = ["34%", "20%", "22%", "24%"];
  const tCols = ["Tipo", "Checks", "Pass Rate", "% Total"];
  const totalChecks = rows.reduce((s, r) => s + parseInt(r.col3 || "0", 10), 0);

  return (
    <SlideShell id="BGC-7" theme={theme}>
      <SlideHeader title={`Tipos de verificación activos — ${periodLabel}`} subtitle={`Background Check · ${clientName}`} theme={theme} />
      <div style={bodyStyle}>
        {/* Left: horizontal bars */}
        <div style={{ width: "40%", background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "16px 20px", display: "flex", flexDirection: "column",
          overflow: "hidden", flexShrink: 0 }}>
          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: t.textMuted,
            textTransform: "uppercase", letterSpacing: "0.14em" }}>Checks completados</p>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
        {/* Right: detailed table */}
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* Table header */}
          <div style={{ display: "flex", background: BGC.primary, padding: "10px 20px", flexShrink: 0 }}>
            {tCols.map((c, i) => (
              <div key={c} style={{ width: tColW[i], flexShrink: 0, fontSize: 10, fontWeight: 700,
                color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.12em" }}>{c}</div>
            ))}
          </div>
          {/* Table body */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {rows.map((row, idx) => {
              const pr = parseFloat(row.col5 || "0");
              const checks = parseInt(row.col3 || "0", 10);
              const pct = totalChecks > 0 ? (checks / totalChecks * 100).toFixed(1) : "0.0";
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", padding: "10px 20px",
                  background: idx % 2 === 1 ? t.rowAlt : "transparent",
                  borderBottom: idx < rows.length - 1 ? `1px solid ${t.footerBorder}` : "none" }}>
                  <div style={{ width: tColW[0], flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: BGC.primary }}>{row.col1}</span>
                  </div>
                  <div style={{ width: tColW[1], flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>
                      {checks.toLocaleString("es-CO")}
                    </span>
                  </div>
                  <div style={{ width: tColW[2], flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: passRateColor(pr) }}>
                      {pr.toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ width: tColW[3], flexShrink: 0 }}>
                    <span style={{ fontSize: 13, color: t.textMuted }}>{row.col6 || pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Total row */}
          <div style={{ display: "flex", alignItems: "center", padding: "10px 20px",
            borderTop: `2px solid ${t.footerBorder}`, background: t.rowAlt, flexShrink: 0 }}>
            <div style={{ width: tColW[0], flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: t.textPrimary }}>TOTAL</span>
            </div>
            <div style={{ width: tColW[1], flexShrink: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: BGC.primary }}>
                {totalChecks.toLocaleString("es-CO")}
              </span>
            </div>
            <div style={{ width: tColW[2], flexShrink: 0 }} />
            <div style={{ width: tColW[3], flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.textMuted }}>100%</span>
            </div>
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="BGC · Tipos de verificación" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE palette + CeFlowData
══════════════════════════════════════════════════════════════ */

const CE = { inbound: "#22C55E", outbound: "#0891B2", notif: "#94A3B8", danger: "#EF4444", warning: "#F59E0B" };

export interface CeFlowData {
  flow_id: string;
  flow_name: string;
  tiene_vrf: boolean;
  funnel_otb: Record<string, string>;
  funnel_steps: Array<Record<string, string>>;
  vrf: Record<string, string>;
}

/* ════════════════════════════════════════════════════════════
   CE-1 | Consumo Total
══════════════════════════════════════════════════════════════ */

function Ce1Slide({ data, theme, clientName, periodLabel, pageNum = 1 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const b        = data["1_consumo_total"]?.[0];
  const inbound  = parseInt(b?.col1 || "0", 10);
  const outbound = parseInt(b?.col2 || "0", 10);
  const notif    = parseInt(b?.col3 || "0", 10);
  const inbPrev  = parseInt(b?.col5 || "0", 10);
  const outPrev  = parseInt(b?.col6 || "0", 10);
  const notPrev  = parseInt(b?.col7 || "0", 10);
  const depKey   = JSON.stringify([inbound, outbound, notif, inbPrev, outPrev, notPrev]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels: ["Mes anterior", "Mes actual"],
        datasets: [
          { label: "Inbound",        data: [inbPrev, inbound],  backgroundColor: CE.inbound,  stack: "stack", borderRadius: 0, datalabels: { display: false } as any },
          { label: "Outbound",       data: [outPrev, outbound], backgroundColor: CE.outbound, stack: "stack", borderRadius: 0, datalabels: { display: false } as any },
          { label: "Notificaciones", data: [notPrev, notif],    backgroundColor: CE.notif,    stack: "stack", borderRadius: 0, datalabels: { display: false } as any },
        ],
      },
      options: {
        plugins: {
          legend: { position: "bottom", labels: { color: t.legendColor, font: { size: 12, weight: 600 }, padding: 14, usePointStyle: true, pointStyleWidth: 9 } },
          tooltip: { enabled: true },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: t.chartText, font: { size: 14 } } },
          y: { stacked: true, display: false, beginAtZero: true },
        },
        layout: { padding: { top: 8 } },
      },
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, t.legendColor, t.chartText]);

  const varItems = [
    { label: "Total",    val: b?.col9,  dir: b?.col_extra1 },
    { label: "Outbound", val: b?.col10, dir: b?.col_extra2 },
    { label: "Inbound",  val: b?.col11, dir: b?.col_extra3 },
  ];

  return (
    <SlideShell id="CE-1" theme={theme}>
      <SlideHeader title={`Consumo Total — ${periodLabel}`} subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexShrink: 0, height: 110 }}>
          <KpiCard label="Total conversaciones" value={num(b?.col4)} delta={b?.col9} theme={theme} />
          <KpiCard label="Inbounds recibidos"   value={num(b?.col1)} valueColor={CE.inbound}  theme={theme} />
          <KpiCard label="Outbounds enviados"   value={num(b?.col2)} valueColor={CE.outbound} theme={theme} />
          <KpiCard label="Notificaciones"       value={num(b?.col3)} valueColor={CE.notif}    theme={theme} />
        </div>
        <div style={{ flex: 1, display: "flex", gap: 12, minHeight: 0 }}>
          <div style={{ flex: 3, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
            borderRadius: 14, padding: "12px 20px 8px", overflow: "hidden", position: "relative" }}>
            <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
          </div>
          <div style={{ flex: 2, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
            borderRadius: 14, padding: "16px 20px", display: "flex", flexDirection: "column", justifyContent: "space-evenly" }}>
            <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: t.textMuted,
              textTransform: "uppercase", letterSpacing: "0.14em" }}>Variación vs mes anterior</p>
            {varItems.map(item => (
              <div key={item.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 0", borderBottom: `1px solid ${t.footerBorder}` }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{item.label}</span>
                <span style={{ fontSize: 24, fontWeight: 800,
                  color: item.dir === "UP" ? CE.inbound : item.dir === "DOWN" ? CE.danger : t.textMuted }}>
                  {item.dir === "UP" ? "↑" : item.dir === "DOWN" ? "↓" : "→"} {item.val}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="CE · Consumo Total" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-2 | Eficiencia de Campañas
══════════════════════════════════════════════════════════════ */

function Ce2Slide({ data, theme, clientName, periodLabel, pageNum = 2 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const t = tok(theme);
  const rows      = data["2_eficiencia_campanas"] || [];
  const globalRow = rows.find(r => r.col1 === "GLOBAL");
  const top5      = rows.filter(r => r.col1 === "TOP5").sort((a, b) =>
    parseFloat(b.col7 || "0") - parseFloat(a.col7 || "0")
  );

  const colW = ["38%", "16%", "15%", "15%", "16%"];
  const colH = ["Nombre campaña", "Destinatarios", "% Recibidos", "% Leídos", "% Interacciones"];

  return (
    <SlideShell id="CE-2" theme={theme}>
      <SlideHeader title={`Eficiencia de Campañas — ${periodLabel}`} subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexShrink: 0, height: 110 }}>
          <KpiCard label="Campañas enviadas"  value={num(globalRow?.col2)} theme={theme} />
          <KpiCard label="% Entrega"          value={`${parseFloat(globalRow?.col5  || "0").toFixed(1)}%`} valueColor={CE.outbound} footnote={`${globalRow?.col11} pp vs ant.`} theme={theme} />
          <KpiCard label="% Leídos"           value={`${parseFloat(globalRow?.col6  || "0").toFixed(1)}%`} valueColor={CE.outbound} footnote={`${globalRow?.col_extra1} pp vs ant.`} theme={theme} />
          <KpiCard label="% Interacciones"    value={`${parseFloat(globalRow?.col7  || "0").toFixed(1)}%`} valueColor={CE.outbound} footnote={`${globalRow?.col_extra2} pp vs ant.`} theme={theme} />
        </div>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", background: CE.outbound, padding: "9px 20px", flexShrink: 0 }}>
            {colH.map((c, i) => (
              <div key={c} style={{ width: colW[i], flexShrink: 0, fontSize: 10, fontWeight: 700,
                color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.1em" }}>{c}</div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            {top5.map((row, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", padding: "10px 20px",
                background: idx % 2 === 1 ? t.rowAlt : "transparent",
                borderBottom: `1px solid ${t.footerBorder}` }}>
                <div style={{ width: colW[0], flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.textPrimary }}>{row.col2}</span>
                </div>
                <div style={{ width: colW[1], flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>
                    {parseInt(row.col3 || "0", 10).toLocaleString("es-CO")}
                  </span>
                </div>
                <div style={{ width: colW[2], flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: t.textPrimary }}>{parseFloat(row.col5 || "0").toFixed(1)}%</span>
                </div>
                <div style={{ width: colW[3], flexShrink: 0 }}>
                  <span style={{ fontSize: 13, color: t.textPrimary }}>{parseFloat(row.col6 || "0").toFixed(1)}%</span>
                </div>
                <div style={{ width: colW[4], flexShrink: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: CE.outbound }}>{parseFloat(row.col7 || "0").toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "8px 20px", borderTop: `1px solid ${t.footerBorder}`, flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: 10, color: t.textMuted, fontStyle: "italic" }}>
              % Leídos puede parecer mayor que % Recibidos — solo cuenta usuarios con confirmación de lectura activa en WhatsApp
            </p>
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="CE · Eficiencia Campañas" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-3 | Razones de Fallo Outbound
══════════════════════════════════════════════════════════════ */

function Ce3Slide({ data, theme, clientName, periodLabel, pageNum = 3 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const donutRef  = useRef<HTMLCanvasElement>(null);
  const donutInst = useRef<Chart | null>(null);
  const barRef    = useRef<HTMLCanvasElement>(null);
  const barInst   = useRef<Chart | null>(null);
  const t = tok(theme);

  const rows    = data["3_fallos_outbound"] || [];
  const first   = rows[0];
  const exitosos   = parseInt(first?.col7  || "0", 10);
  const fallidos   = parseInt(first?.col8  || "0", 10);
  const pctExito   = parseFloat(first?.col9  || "0");
  const exitosPrev = parseInt(first?.col10 || "0", 10);

  const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + "…" : s;
  const reasonLabels = rows.map(r => {
    const codigo = r.col1 || "";
    const info = FALLOS_CE[codigo];
    return info ? truncate(info.descripcion, 42) : truncate(codigo, 42);
  });
  const actualData   = rows.map(r => parseInt(r.col2 || "0", 10));
  const prevData     = rows.map(r => parseInt(r.col4 || "0", 10));

  const donutKey = JSON.stringify([exitosos, fallidos]);
  const barKey   = JSON.stringify([reasonLabels, actualData, prevData]);

  useEffect(() => {
    if (!donutRef.current) return;
    donutInst.current?.destroy();
    donutInst.current = new Chart(donutRef.current, {
      type: "doughnut",
      data: {
        labels: [`Exitosos (${pctExito.toFixed(1)}%)`, `Fallidos (${(100 - pctExito).toFixed(1)}%)`],
        datasets: [{ data: [exitosos, fallidos], backgroundColor: [CE.inbound, CE.danger],
          borderWidth: 4, borderColor: t.cardBg }],
      },
      options: { cutout: "68%", plugins: {
        legend: { position: "bottom", labels: { color: t.legendColor, font: { size: 11, weight: 600 }, padding: 10, usePointStyle: true, pointStyleWidth: 8 } },
        tooltip: { enabled: true }, datalabels: { display: false },
      }},
    } as any);
    return () => { donutInst.current?.destroy(); donutInst.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donutKey, pctExito, t.cardBg, t.legendColor]);

  useEffect(() => {
    if (!barRef.current || rows.length === 0) return;
    barInst.current?.destroy();
    barInst.current = new Chart(barRef.current, {
      type: "bar",
      data: {
        labels: reasonLabels,
        datasets: [
          { label: "Mes actual",   data: actualData, backgroundColor: CE.danger,  borderRadius: 4, datalabels: { color: t.textPrimary, anchor: "end", align: "right", font: { size: 11, weight: 700 }, formatter: (v: number) => v.toLocaleString("es-CO") } as any },
          { label: "Mes anterior", data: prevData,   backgroundColor: "#FCA5A5", borderRadius: 4, datalabels: { display: false } as any },
        ],
      },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { position: "bottom", labels: { color: t.legendColor, font: { size: 11, weight: 600 }, padding: 10, usePointStyle: true, pointStyleWidth: 8 } },
          tooltip: { enabled: true },
        },
        scales: {
          x: { display: false, beginAtZero: true },
          y: { grid: { display: false }, ticks: { color: t.chartText, font: { size: 10 }, padding: 4 } },
        },
        layout: { padding: { right: 52, top: 4 } },
      },
    } as any);
    return () => { barInst.current?.destroy(); barInst.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barKey, t.legendColor, t.textPrimary, t.chartText]);

  return (
    <SlideShell id="CE-3" theme={theme}>
      <SlideHeader title={`Razones de Fallo | Outbound — ${periodLabel}`} subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexShrink: 0, height: 100 }}>
          <KpiCard label="Mensajes exitosos"       value={exitosos.toLocaleString("es-CO")}   valueColor={CE.inbound}  theme={theme} />
          <KpiCard label="Mensajes fallidos"        value={fallidos.toLocaleString("es-CO")}   valueColor={CE.danger}   theme={theme} />
          <KpiCard label="Exitosos mes anterior"    value={exitosPrev.toLocaleString("es-CO")} theme={theme} />
        </div>
        <div style={{ flex: 1, display: "flex", gap: 12, minHeight: 0 }}>
          <div style={{ width: "38%", background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
            borderRadius: 14, padding: "16px 20px", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
            <div style={{ position: "relative", width: 230, height: 230, flexShrink: 0 }}>
              <canvas ref={donutRef} style={{ width: "100%", height: "100%" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", pointerEvents: "none", paddingBottom: 44 }}>
                <span style={{ fontSize: 40, fontWeight: 800, color: CE.inbound, lineHeight: 1 }}>{pctExito.toFixed(1)}%</span>
                <span style={{ fontSize: 11, color: t.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>éxito</span>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
            borderRadius: 14, padding: "16px 20px 8px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
              <canvas ref={barRef} style={{ width: "100%", height: "100%" }} />
            </div>
          </div>
        </div>
        <p style={{ margin: "0 0 2px", fontSize: 10, color: t.textMuted, fontStyle: "italic", flexShrink: 0 }}>
          "El número no existe, bloqueado o sin WhatsApp" es la única categoría donde se pueden aplicar estrategias de reintento de envío
        </p>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="CE · Fallos Outbound" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-4 | Resultados Flujo Inbound
══════════════════════════════════════════════════════════════ */

function Ce4Slide({ data, theme, clientName, periodLabel, pageNum = 4 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t = tok(theme);

  const b            = data["5_flujo_inbound"]?.[0];
  const pctExitosos  = parseFloat(b?.col6  || "0");
  const pctRestante  = 100 - pctExitosos;
  const pctAgente    = parseFloat(b?.col4  || "0");
  const pctMeta      = b?.col2 ? parseFloat(b.col2).toFixed(1) + "%" : "N/D";
  const depKey       = JSON.stringify([pctExitosos, pctRestante]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "doughnut",
      data: {
        labels: [`Exitosos (${pctExitosos.toFixed(1)}%)`, `A agente / Fallidos (${pctRestante.toFixed(1)}%)`],
        datasets: [{ data: [pctExitosos, pctRestante], backgroundColor: [CE.inbound, CE.warning],
          borderWidth: 4, borderColor: t.cardBg }],
      },
      options: { cutout: "68%", plugins: {
        legend: { position: "bottom", labels: { color: t.legendColor, font: { size: 12, weight: 600 }, padding: 14, usePointStyle: true, pointStyleWidth: 9 } },
        tooltip: { enabled: true }, datalabels: { display: false },
      }},
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, t.cardBg, t.legendColor]);

  const kpiItems = [
    { label: "Conversaciones recibidas", val: num(b?.col1),              color: t.accentBar,   sub: b?.col10 ? `${b.col10}% vs mes ant.` : undefined },
    { label: "% Conv. con pauta Meta",   val: pctMeta,                   color: t.textMuted   },
    { label: "% Conv. a agente",         val: `${pctAgente.toFixed(1)}%`, color: CE.warning,   sub: b?.col11 ? `Δ ${b.col11} pp` : undefined },
    { label: "% Procesos exitosos",      val: `${pctExitosos.toFixed(1)}%`, color: CE.inbound },
  ];

  return (
    <SlideShell id="CE-4" theme={theme}>
      <SlideHeader title={`Resultados del Flujo Inbound — ${periodLabel}`} subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
      <div style={bodyStyle}>
        <div style={{ width: "44%", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
          {kpiItems.map(item => (
            <div key={item.label} style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
              borderRadius: 12, display: "flex", alignItems: "stretch", overflow: "hidden", minHeight: 0 }}>
              <div style={{ width: 4, background: item.color, flexShrink: 0 }} />
              <div style={{ flex: 1, padding: "10px 16px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: t.textMuted,
                  textTransform: "uppercase", letterSpacing: "0.12em" }}>{item.label}</p>
                <span style={{ fontSize: 38, fontWeight: 800, color: item.color, lineHeight: 1.1, marginTop: 4 }}>{item.val}</span>
                {item.sub && <span style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{item.sub}</span>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <div style={{ position: "relative", width: 300, height: 300, flexShrink: 0 }}>
            <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", pointerEvents: "none", paddingBottom: 50 }}>
              <span style={{ fontSize: 46, fontWeight: 800, color: CE.inbound, lineHeight: 1 }}>{pctExitosos.toFixed(1)}%</span>
              <span style={{ fontSize: 11, color: t.textMuted, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>exitosos</span>
            </div>
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="CE · Flujo Inbound" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-5 | Desempeño de Agentes
══════════════════════════════════════════════════════════════ */

function Ce5Slide({ data, theme, clientName, periodLabel, pageNum = 5 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const t = tok(theme);
  const b = data["6_agentes_general"]?.[0];

  const agentesAct  = parseInt(b?.col2      || "0", 10);
  const totalConv   = parseInt(b?.col1      || "0", 10);
  const totalPrev   = parseInt(b?.col9      || "0", 10);
  const pctAtend    = parseFloat(b?.col4    || "0");
  const pctCerradas = parseFloat(b?.col6    || "0");
  const pctCerPrev  = parseFloat(b?.col10   || "0");
  const medPrimRta  = parseFloat(b?.col7    || "0");
  const medRtaPrev  = parseFloat(b?.col11   || "0");
  const medDur      = parseFloat(b?.col8    || "0");
  const varCerradas = b?.col_extra1;
  const varRta      = b?.col_extra2;
  const sinAsignar  = parseInt(b?.col_extra3 || "0", 10);

  const cerBg    = pctCerradas < 80  ? "rgba(239,68,68,0.12)"  : "transparent";
  const rtaBg    = medPrimRta  > 10  ? "rgba(245,158,11,0.12)" : "transparent";
  const sinAsiBg = sinAsignar  > 0   ? "rgba(239,68,68,0.12)"  : "transparent";

  const cards = [
    { label: "Total conversaciones",    val: totalConv.toLocaleString("es-CO"),    sub: `Anterior: ${totalPrev.toLocaleString("es-CO")}`, bg: "transparent", vc: t.textPrimary },
    { label: "% Conv. atendidas",      val: `${pctAtend.toFixed(1)}%`,             bg: "transparent", vc: t.textPrimary },
    { label: "% Conv. cerradas",       val: `${pctCerradas.toFixed(1)}%`,          sub: `Anterior: ${pctCerPrev.toFixed(1)}%`, bg: cerBg,   vc: pctCerradas < 80 ? CE.danger : CE.inbound },
    { label: "Mediana 1ª respuesta",   val: `${medPrimRta.toFixed(1)} min`,        sub: `Anterior: ${medRtaPrev.toFixed(1)} min`, bg: rtaBg,  vc: medPrimRta > 10 ? CE.warning : CE.inbound },
    { label: "Mediana duración",       val: `${medDur.toFixed(1)} min`,            bg: "transparent", vc: t.textPrimary },
    { label: "Conv. sin asignar",      val: sinAsignar.toLocaleString("es-CO"),    bg: sinAsiBg, vc: sinAsignar > 0 ? CE.danger : t.textPrimary },
  ];

  return (
    <SlideShell id="CE-5" theme={theme}>
      <SlideHeader title={`Desempeño de Agentes — ${periodLabel}`} subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 12, flexShrink: 0, height: 226 }}>
          {cards.map(c => (
            <div key={c.label} style={{ background: c.bg !== "transparent" ? c.bg : t.cardBg,
              border: t.cardBorder, boxShadow: c.bg === "transparent" ? t.cardShadow : "none",
              borderRadius: 14, padding: "12px 18px", display: "flex", flexDirection: "column",
              justifyContent: "space-between", overflow: "hidden" }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: t.textMuted,
                textTransform: "uppercase", letterSpacing: "0.13em", lineHeight: 1 }}>{c.label}</p>
              <p style={{ margin: "4px 0 0", fontSize: 38, fontWeight: 800, color: c.vc,
                lineHeight: 0.95, letterSpacing: "-0.02em" }}>{c.val}</p>
              {c.sub && <span style={{ fontSize: 11, color: t.textMuted }}>{c.sub}</span>}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
            borderRadius: 12, padding: "12px 20px", display: "flex", gap: 32, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Variación MoM</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>
              Cerradas: <span style={{ color: parseFloat(varCerradas || "0") > 0 ? CE.inbound : CE.danger }}>{varCerradas} pp</span>
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>
              Mediana respuesta: <span style={{ color: parseFloat(varRta || "0") < 0 ? CE.inbound : CE.warning }}>{varRta} min</span>
            </span>
          </div>
          <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
            borderRadius: 12, padding: "12px 20px", display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 44, fontWeight: 800, color: CE.outbound, lineHeight: 1 }}>{agentesAct}</span>
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: t.textMuted,
                textTransform: "uppercase", letterSpacing: "0.1em" }}>Agentes activos</p>
              <p style={{ margin: "4px 0 0", fontSize: 11, color: t.textMuted, fontStyle: "italic" }}>
                Agentes con respuesta &lt;10 min suelen tener tasas de cierre 3-4× más altas
              </p>
            </div>
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="CE · Desempeño Agentes" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-6 | Métricas por Agente Top 5
══════════════════════════════════════════════════════════════ */

function Ce6Slide({ data, theme, clientName, periodLabel, pageNum = 6 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const t    = tok(theme);
  const rows = data["7_agentes_top5"] || [];

  function expStyle(pct: number) {
    if (pct > 15) return { color: CE.danger,  bg: "rgba(239,68,68,0.10)"  };
    if (pct >= 5) return { color: CE.warning, bg: "rgba(245,158,11,0.10)" };
    return              { color: CE.inbound,  bg: "transparent"             };
  }

  const colW = ["26%", "9%", "10%", "10%", "12%", "12%", "11%", "10%"];
  const colH = ["Agente", "Total", "% Atend", "% Cerr", "% Exp.Agente", "% Exp.Usu", "Med.Rta", "Med.Dur"];

  return (
    <SlideShell id="CE-6" theme={theme}>
      <SlideHeader title={`Métricas por Agente — Top 5 — ${periodLabel}`} subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", background: CE.outbound, padding: "10px 20px", flexShrink: 0 }}>
            {colH.map((c, i) => (
              <div key={c} style={{ width: colW[i], flexShrink: 0, fontSize: 10, fontWeight: 700,
                color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.08em" }}>{c}</div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            {rows.map((row, idx) => {
              const expAgt = parseFloat(row.col5 || "0");
              const medRta = parseFloat(row.col7 || "0");
              const es     = expStyle(expAgt);
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", padding: "11px 20px",
                  background: idx % 2 === 1 ? t.rowAlt : "transparent",
                  borderBottom: idx < rows.length - 1 ? `1px solid ${t.footerBorder}` : "none" }}>
                  <div style={{ width: colW[0], flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: CE.outbound }}>
                      {(row.col1 || "").split("@")[0]}
                    </span>
                  </div>
                  <div style={{ width: colW[1], flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: t.textPrimary }}>{row.col2}</span>
                  </div>
                  <div style={{ width: colW[2], flexShrink: 0 }}>
                    <span style={{ fontSize: 13, color: t.textPrimary }}>{parseFloat(row.col3 || "0").toFixed(1)}%</span>
                  </div>
                  <div style={{ width: colW[3], flexShrink: 0 }}>
                    <span style={{ fontSize: 13, color: t.textPrimary }}>{parseFloat(row.col4 || "0").toFixed(1)}%</span>
                  </div>
                  <div style={{ width: colW[4], flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: es.color,
                      background: es.bg, borderRadius: 6, padding: "2px 6px" }}>{expAgt.toFixed(1)}%</span>
                  </div>
                  <div style={{ width: colW[5], flexShrink: 0 }}>
                    <span style={{ fontSize: 13, color: t.textMuted }}>{parseFloat(row.col6 || "0").toFixed(1)}%</span>
                  </div>
                  <div style={{ width: colW[6], flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: medRta > 10 ? CE.warning : t.textPrimary }}>
                      {medRta.toFixed(1)} min
                    </span>
                  </div>
                  <div style={{ width: colW[7], flexShrink: 0 }}>
                    <span style={{ fontSize: 13, color: t.textMuted }}>{parseFloat(row.col8 || "0").toFixed(1)} min</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ padding: "9px 20px", borderTop: `1px solid ${t.footerBorder}`, flexShrink: 0 }}>
            <p style={{ margin: 0, fontSize: 10, color: t.textMuted, fontStyle: "italic" }}>
              % Expiradas calculado sobre las conversaciones atendidas por el agente o el usuario
            </p>
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="CE · Agentes Top 5" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-7 | Separador de flujo (decorativo)
══════════════════════════════════════════════════════════════ */

function Ce7Slide({ ceFlows, flowIndex, theme, pageNum = 1 }: {
  ceFlows: CeFlowData[]; flowIndex: number; theme: Theme; pageNum?: number; totalPages?: number;
}) {
  const t    = tok(theme);
  const flow = ceFlows[flowIndex];
  if (!flow) return null;

  return (
    <SlideShell id={`CE-7-${flowIndex}`} theme={theme}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, background: t.accentBar }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", padding: "0 80px 0 86px" }}>
        <span style={{ fontSize: 180, fontWeight: 900, color: t.accentBar, lineHeight: 1, opacity: 0.18, marginRight: 40, flexShrink: 0 }}>
          {flowIndex + 1}
        </span>
        <div>
          <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: t.textMuted,
            textTransform: "uppercase", letterSpacing: "0.22em" }}>Flujo {flowIndex + 1}</p>
          <h2 style={{ margin: 0, fontSize: 54, fontWeight: 800, color: t.textPrimary, lineHeight: 1.1,
            letterSpacing: "-0.02em" }}>{flow.flow_name}</h2>
          <p style={{ margin: "14px 0 0", fontSize: 18, color: t.textMuted }}>Análisis del funnel de conversión</p>
        </div>
      </div>
      {pageNum && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 32,
          display: "flex", justifyContent: "flex-end", alignItems: "center", padding: "0 40px",
          boxSizing: "border-box" }}>
          <span style={{ fontSize: 10, color: t.textMuted, fontWeight: 600 }}>{pageNum}</span>
        </div>
      )}
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-8 | Funnel Outbound (por flujo)
══════════════════════════════════════════════════════════════ */

function Ce8Slide({ ceFlows, flowIndex, theme, clientName, periodLabel, pageNum = 1 }: {
  ceFlows: CeFlowData[]; flowIndex: number; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t    = tok(theme);
  const flow = ceFlows[flowIndex];
  if (!flow) return null;
  const fo = flow.funnel_otb;

  const enviados   = parseInt(fo.COL1 || "0", 10);
  const fallanMeta = parseInt(fo.COL2 || "0", 10);
  const recepcion  = parseInt(fo.COL3 || "0", 10);
  const noResp     = parseInt(fo.COL4 || "0", 10);
  const inicOTB    = parseInt(fo.COL5 || "0", 10);
  const inicINB    = parseInt(fo.COL6 || "0", 10);
  const envPrev    = parseInt(fo.COL8 || "0", 10);
  const falPrev    = parseInt(fo.COL9 || "0", 10);
  const recPrev    = parseInt(fo.COL10 || "0", 10);

  const fLabels = ["Enviados OTB", "Fallan Meta", "Recepción", "No respondidos", "Iniciados OTB", "Iniciados INB"];
  const fData   = [enviados, fallanMeta, recepcion, noResp, inicOTB, inicINB];
  const fColors = [CE.outbound, CE.danger, CE.outbound, CE.warning, CE.inbound, CE.notif];
  const depKey  = JSON.stringify(fData);

  useEffect(() => {
    if (!chartRef.current) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: { labels: fLabels, datasets: [{ data: fData, backgroundColor: fColors, borderRadius: 8,
        datalabels: { color: t.textPrimary, anchor: "end", align: "right",
          font: { size: 14, weight: 700 }, formatter: (v: number) => v.toLocaleString("es-CO") } as any }] },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          x: { display: false, beginAtZero: true },
          y: { grid: { display: false }, ticks: { color: t.chartText, font: { size: 12 }, padding: 8 } },
        },
        layout: { padding: { right: 80, top: 4 } },
      },
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, t.textPrimary, t.chartText, JSON.stringify(fColors)]);

  return (
    <SlideShell id={`CE-8-${flowIndex}`} theme={theme}>
      <SlideHeader title={`Funnel Outbound — ${flow.flow_name}`} subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
      <div style={bodyStyle}>
        <div style={{ flex: 3, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "16px 20px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
        <div style={{ flex: 2, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", background: CE.outbound, padding: "8px 16px", flexShrink: 0 }}>
            {["Paso", "Cantidad", "% vs Envío"].map((c, i) => (
              <div key={c} style={{ width: ["50%","25%","25%"][i], flexShrink: 0, fontSize: 10,
                fontWeight: 700, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.1em" }}>{c}</div>
            ))}
          </div>
          {fLabels.map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", padding: "9px 16px",
              background: i % 2 === 1 ? t.rowAlt : "transparent",
              borderBottom: i < fLabels.length - 1 ? `1px solid ${t.footerBorder}` : "none" }}>
              <div style={{ width: "50%", flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: fColors[i] }}>{label}</span>
              </div>
              <div style={{ width: "25%", flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: t.textPrimary }}>
                  {fData[i].toLocaleString("es-CO")}
                </span>
              </div>
              <div style={{ width: "25%", flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: t.textMuted }}>
                  {enviados > 0 ? (fData[i] / enviados * 100).toFixed(1) : "0.0"}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel={`CE · Funnel OTB · ${flow.flow_name}`} />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-9 | Funnel por Steps (por flujo)
══════════════════════════════════════════════════════════════ */

function Ce9Slide({ ceFlows, flowIndex, theme, clientName, periodLabel, pageNum = 1 }: {
  ceFlows: CeFlowData[]; flowIndex: number; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const t    = tok(theme);
  const flow = ceFlows[flowIndex];
  if (!flow) return null;

  const steps       = [...flow.funnel_steps].sort((a, b) => parseInt(a.COL6 || "0", 10) - parseInt(b.COL6 || "0", 10));
  const truncate    = (s: string) => s.length > 16 ? s.slice(0, 16) + "…" : s;
  const stepLabels  = steps.map(s => truncate(s.COL1 || ""));
  const iniciados   = steps.map(s => parseInt(s.COL2 || "0", 10));
  const exitosos    = steps.map(s => parseInt(s.COL3 || "0", 10));
  const depKey      = JSON.stringify([stepLabels, iniciados, exitosos]);

  useEffect(() => {
    if (!chartRef.current || steps.length === 0) return;
    chartInstance.current?.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels: stepLabels,
        datasets: [
          { label: "Iniciados", data: iniciados, backgroundColor: CE.outbound, borderRadius: 6, datalabels: { display: false } as any },
          { label: "Exitosos",  data: exitosos,  backgroundColor: CE.inbound,  borderRadius: 6, datalabels: { display: false } as any },
        ],
      },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { position: "bottom", labels: { color: t.legendColor, font: { size: 12, weight: 600 }, padding: 14, usePointStyle: true, pointStyleWidth: 9 } },
          tooltip: { enabled: true },
        },
        scales: {
          x: { display: false, beginAtZero: true },
          y: { grid: { display: false }, ticks: { color: t.chartText, font: { size: 12 }, padding: 8 } },
        },
        layout: { padding: { top: 4 } },
      },
    } as any);
    return () => { chartInstance.current?.destroy(); chartInstance.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, t.legendColor, t.chartText]);

  return (
    <SlideShell id={`CE-9-${flowIndex}`} theme={theme}>
      <SlideHeader title={`Análisis del Funnel por Steps — ${flow.flow_name}`} subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
      <div style={bodyStyle}>
        <div style={{ flex: 3, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "16px 20px 8px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
          </div>
        </div>
        <div style={{ flex: 2, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", background: CE.outbound, padding: "8px 16px", flexShrink: 0 }}>
            {["Step", "Inician", "Exitosos", "Drop%"].map((c, i) => (
              <div key={c} style={{ width: ["36%","20%","22%","22%"][i], flexShrink: 0, fontSize: 10,
                fontWeight: 700, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.1em" }}>{c}</div>
            ))}
          </div>
          {steps.map((s, i) => {
            const drop     = parseFloat(s.COL5 || "0");
            const highDrop = drop > 30;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", padding: "9px 16px",
                background: i % 2 === 1 ? t.rowAlt : "transparent",
                borderBottom: i < steps.length - 1 ? `1px solid ${t.footerBorder}` : "none" }}>
                <div style={{ width: "36%", flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.textPrimary }}>{s.COL1}</span>
                </div>
                <div style={{ width: "20%", flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: CE.outbound }}>
                    {parseInt(s.COL2 || "0", 10).toLocaleString("es-CO")}
                  </span>
                </div>
                <div style={{ width: "22%", flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: CE.inbound }}>
                    {parseInt(s.COL3 || "0", 10).toLocaleString("es-CO")}
                  </span>
                </div>
                <div style={{ width: "22%", flexShrink: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: highDrop ? 800 : 600, color: highDrop ? CE.danger : t.textMuted }}>
                    {drop.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel={`CE · Steps · ${flow.flow_name}`} />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-10 | Validación de Identidad (por flujo, solo si tiene_vrf)
══════════════════════════════════════════════════════════════ */

function Ce10Slide({ ceFlows, flowIndex, theme, clientName, periodLabel, pageNum = 1 }: {
  ceFlows: CeFlowData[]; flowIndex: number; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const t    = tok(theme);
  const flow = ceFlows[flowIndex];
  if (!flow || !flow.tiene_vrf) return null;
  const v = flow.vrf;

  const docIniciados  = parseInt(v.COL1  || "0", 10);
  const docExitosos   = parseInt(v.COL2  || "0", 10);
  const docExpira     = parseInt(v.COL3  || "0", 10);
  const docTasaExito  = parseFloat(v.COL4  || "0");
  const docTasaExpira = parseFloat(v.COL5  || "0");
  const rosIniciados  = parseInt(v.COL6  || "0", 10);
  const rosExitosos   = parseInt(v.COL7  || "0", 10);
  const rosTasa       = parseFloat(v.COL8  || "0");
  const identExitosa  = parseInt(v.COL9  || "0", 10);
  const identTasa     = parseFloat(v.COL10 || "0");
  const firmaIniciada = parseInt(v.COL11 || "0", 10);
  const firmaExitosa  = parseInt(v.COL_EXTRA1 || "0", 10);
  const firmaTasa     = parseFloat(v.COL_EXTRA2 || "0");

  function SectionHdr({ label }: { label: string }) {
    return (
      <div style={{ background: t.accentBar, borderRadius: 8, padding: "5px 14px", marginBottom: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.14em" }}>{label}</span>
      </div>
    );
  }
  function MCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
    return (
      <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
        borderRadius: 12, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>{label}</p>
        <span style={{ fontSize: 32, fontWeight: 800, color: color || t.textPrimary, lineHeight: 1 }}>{value}</span>
        {sub && <span style={{ fontSize: 11, color: t.textMuted }}>{sub}</span>}
      </div>
    );
  }

  return (
    <SlideShell id={`CE-10-${flowIndex}`} theme={theme}>
      <SlideHeader title={`Validación de Identidad — ${flow.flow_name}`} subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <SectionHdr label="Validación de Documento" />
          <div style={{ display: "flex", gap: 12, flex: 1 }}>
            <MCard label="Iniciados" value={docIniciados.toLocaleString("es-CO")} />
            <MCard label="Exitosos" value={`${docTasaExito.toFixed(1)}%`} sub={`${docExitosos.toLocaleString("es-CO")} validaciones`} color={CE.inbound} />
            <MCard label="Expirados" value={`${docTasaExpira.toFixed(1)}%`} sub={`${docExpira.toLocaleString("es-CO")} validaciones`} color={CE.warning} />
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <SectionHdr label="Validación de Rostro" />
          <div style={{ display: "flex", gap: 12, flex: 1 }}>
            <MCard label="Iniciados" value={rosIniciados.toLocaleString("es-CO")} />
            <MCard label="Exitosos" value={`${rosTasa.toFixed(1)}%`} sub={`${rosExitosos.toLocaleString("es-CO")} validaciones`} color={CE.inbound} />
            <MCard label="Identidad completa (doc+rostro)" value={`${identTasa.toFixed(1)}%`} sub={`${identExitosa.toLocaleString("es-CO")} procesos`} color={CE.inbound} />
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <SectionHdr label="Firma Electrónica" />
          {firmaIniciada === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: t.cardBg,
              border: t.cardBorder, borderRadius: 12, padding: "14px 20px" }}>
              <span style={{ fontSize: 16 }}>ℹ️</span>
              <span style={{ fontSize: 13, color: t.textMuted, fontStyle: "italic" }}>Este flujo no incluye firma electrónica</span>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 12, flex: 1 }}>
              <MCard label="Firma iniciada" value={firmaIniciada.toLocaleString("es-CO")} />
              <MCard label="Firma exitosa" value={`${firmaTasa.toFixed(1)}%`} sub={`${firmaExitosa.toLocaleString("es-CO")} firmas`} color={CE.inbound} />
            </div>
          )}
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel={`CE · VRF · ${flow.flow_name}`} />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-11 | VRF Árbol — Journey completo OTB → VRF en formato árbol
══════════════════════════════════════════════════════════════ */

function Ce11Slide({ ceFlows, flowIndex, theme, clientName, periodLabel, pageNum = 1 }: {
  ceFlows: CeFlowData[]; flowIndex: number; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const t    = tok(theme);
  const flow = ceFlows[flowIndex];
  if (!flow || !flow.tiene_vrf) return null;
  const fo = flow.funnel_otb;
  const v  = flow.vrf;

  const enviados   = parseInt(fo.COL1 || "0", 10);
  const fallanMeta = parseInt(fo.COL2 || "0", 10);
  const recepcion  = parseInt(fo.COL3 || "0", 10);
  const noResp     = parseInt(fo.COL4 || "0", 10);
  const contestados = recepcion - noResp;

  const docIniciados  = parseInt(v.COL1  || "0", 10);
  const docExitosos   = parseInt(v.COL2  || "0", 10);
  const docExpira     = parseInt(v.COL3  || "0", 10);
  const docFallidos   = docIniciados - docExitosos - docExpira;
  const rosIniciados  = parseInt(v.COL6  || "0", 10);
  const rosExitosos   = parseInt(v.COL7  || "0", 10);
  const identExitosa  = parseInt(v.COL9  || "0", 10);
  const firmaIniciada = parseInt(v.COL11 || "0", 10);
  const firmaExitosa  = parseInt(v.COL_EXTRA1 || "0", 10);

  const fmt = (n: number) => n.toLocaleString("es-CO");
  const pct = (part: number, total: number) => total > 0 ? `${((part / total) * 100).toFixed(1)}%` : "—";

  type TreeNode = { label: string; value: number; pctLabel: string; color: string; children?: TreeNode[] };

  const tree: TreeNode = {
    label: "Enviados", value: enviados, pctLabel: "100%", color: CE.outbound,
    children: [
      { label: "Fallan Meta", value: fallanMeta, pctLabel: pct(fallanMeta, enviados), color: CE.danger },
      { label: "Recibidos", value: recepcion, pctLabel: pct(recepcion, enviados), color: CE.outbound,
        children: [
          { label: "No respondidos", value: noResp, pctLabel: pct(noResp, recepcion), color: CE.warning },
          { label: "Contestados", value: contestados, pctLabel: pct(contestados, recepcion), color: CE.inbound,
            children: [
              ...(docIniciados > 0 ? [{
                label: "Documento", value: docIniciados, pctLabel: pct(docIniciados, contestados), color: CE.outbound,
                children: [
                  ...(docFallidos > 0 ? [{ label: "Doc. fallido", value: docFallidos, pctLabel: pct(docFallidos, docIniciados), color: CE.danger }] : []),
                  ...(docExpira > 0 ? [{ label: "Doc. expirado", value: docExpira, pctLabel: pct(docExpira, docIniciados), color: CE.warning }] : []),
                  { label: "Doc. exitoso", value: docExitosos, pctLabel: pct(docExitosos, docIniciados), color: CE.inbound,
                    children: [
                      ...(rosIniciados > 0 ? [{
                        label: "Rostro", value: rosIniciados, pctLabel: pct(rosIniciados, docExitosos), color: CE.outbound,
                        children: [
                          { label: "Rostro exitoso", value: rosExitosos, pctLabel: pct(rosExitosos, rosIniciados), color: CE.inbound,
                            children: [
                              ...(identExitosa > 0 ? [{
                                label: "Identidad completa", value: identExitosa, pctLabel: pct(identExitosa, rosExitosos), color: CE.inbound,
                                children: firmaIniciada > 0 ? [
                                  { label: "Firma exitosa", value: firmaExitosa, pctLabel: pct(firmaExitosa, firmaIniciada), color: CE.inbound },
                                ] : undefined,
                              }] : []),
                            ],
                          },
                        ],
                      }] : []),
                    ],
                  },
                ],
              }] : []),
            ],
          },
        ],
      },
    ],
  };

  const NODE_H = 38;
  const INDENT = 28;
  const COL_VAL_W = 80;
  const COL_PCT_W = 60;

  function countNodes(node: TreeNode): number {
    let c = 1;
    if (node.children) for (const ch of node.children) c += countNodes(ch);
    return c;
  }
  const totalNodes = countNodes(tree);
  const dynamicH = Math.min(NODE_H, Math.floor(540 / totalNodes));

  function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
    const dotSize = 10;
    const isLeaf = !node.children || node.children.length === 0;
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", height: dynamicH, paddingLeft: depth * INDENT }}>
          {depth > 0 && (
            <div style={{ width: 16, height: "100%", position: "relative", flexShrink: 0 }}>
              <div style={{ position: "absolute", left: 6, top: 0, bottom: "50%", width: 1, background: `${t.textMuted}33` }} />
              <div style={{ position: "absolute", left: 6, top: "50%", width: 10, height: 1, background: `${t.textMuted}33` }} />
            </div>
          )}
          <div style={{ width: dotSize, height: dotSize, borderRadius: "50%", background: node.color, flexShrink: 0, marginRight: 8 }} />
          <span style={{ flex: 1, fontSize: 11, fontWeight: isLeaf ? 600 : 700, color: t.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {node.label}
          </span>
          <span style={{ width: COL_VAL_W, textAlign: "right", fontSize: 12, fontWeight: 700, color: t.textPrimary, flexShrink: 0 }}>
            {fmt(node.value)}
          </span>
          <span style={{ width: COL_PCT_W, textAlign: "right", fontSize: 11, fontWeight: 600, color: node.color, flexShrink: 0 }}>
            {node.pctLabel}
          </span>
        </div>
        {node.children && node.children.map((ch, i) => (
          <TreeRow key={`${ch.label}-${i}`} node={ch} depth={depth + 1} />
        ))}
      </>
    );
  }

  return (
    <SlideShell id={`CE-11-${flowIndex}`} theme={theme}>
      <SlideHeader title={`Journey Completo — ${flow.flow_name}`} subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 10 }}>
        <div style={{ background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "14px 20px", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Column headers */}
          <div style={{ display: "flex", alignItems: "center", height: 28, borderBottom: `1px solid ${t.footerBorder}`, marginBottom: 4, flexShrink: 0 }}>
            <span style={{ flex: 1, fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.14em" }}>Paso</span>
            <span style={{ width: COL_VAL_W, textAlign: "right", fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.14em" }}>Cantidad</span>
            <span style={{ width: COL_PCT_W, textAlign: "right", fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.14em" }}>% del paso</span>
          </div>
          {/* Tree */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <TreeRow node={tree} depth={0} />
          </div>
        </div>
        {/* KPI summary row */}
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {[
            { label: "Enviados", value: fmt(enviados), color: CE.outbound },
            { label: "Recibidos", value: fmt(recepcion), color: CE.outbound },
            { label: "Doc. exitoso", value: fmt(docExitosos), color: CE.inbound },
            { label: "Rostro exitoso", value: fmt(rosExitosos), color: CE.inbound },
            ...(firmaIniciada > 0 ? [{ label: "Firma exitosa", value: fmt(firmaExitosa), color: CE.inbound }] : []),
          ].map((kpi) => (
            <div key={kpi.label} style={{ flex: 1, background: t.cardBg, border: t.cardBorder, borderRadius: 10,
              padding: "8px 12px", display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.1em" }}>{kpi.label}</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}</span>
            </div>
          ))}
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel={`CE · VRF Árbol · ${flow.flow_name}`} />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-12 | Consumo por Línea WhatsApp
══════════════════════════════════════════════════════════════ */

function Ce12Slide({ data, theme, clientName, periodLabel, pageNum = 1 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef  = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<Chart | null>(null);
  const t = tok(theme);
  const wabaNames = useWabaNamesMap();

  const rows = (data["5b_consumo_por_linea"] || [])
    .slice()
    .sort((a, b) => parseInt(b.col4 || "0", 10) - parseInt(a.col4 || "0", 10));

  const labels    = rows.map(r => wabaNames.get(r.col1 || "") || r.col1 || "—");
  const otbData   = rows.map(r => parseInt(r.col2 || "0", 10));
  const notifData = rows.map(r => parseInt(r.col3 || "0", 10));
  const totals    = rows.map(r => parseInt(r.col4 || "0", 10));
  const totalGlobal = totals.reduce((s, v) => s + v, 0);
  const topLine   = rows[0];
  const depKey    = JSON.stringify([labels, otbData, notifData]);

  useEffect(() => {
    if (!chartRef.current || rows.length === 0) return;
    chartInst.current?.destroy();
    chartInst.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Outbound",       data: otbData,   backgroundColor: CE.outbound, stack: "stack", borderRadius: 0, datalabels: { display: false } as any },
          { label: "Notificaciones", data: notifData, backgroundColor: CE.notif,    stack: "stack", borderRadius: 0,
            datalabels: { display: true, color: t.textPrimary, anchor: "end", align: "right", font: { size: 10, weight: 700 },
              formatter: (_: number, ctx: any) => {
                const total = (otbData[ctx.dataIndex] || 0) + (notifData[ctx.dataIndex] || 0);
                return total.toLocaleString("es-CO");
              },
            } as any,
          },
        ],
      },
      options: {
        indexAxis: "y",
        plugins: {
          legend: { position: "bottom", labels: { color: t.legendColor, font: { size: 11, weight: 600 }, padding: 10, usePointStyle: true, pointStyleWidth: 8 } },
          tooltip: { enabled: true },
        },
        scales: {
          x: { stacked: true, display: false, beginAtZero: true },
          y: { stacked: true, grid: { display: false }, ticks: { color: t.chartText, font: { size: 10 }, padding: 4 } },
        },
        layout: { padding: { right: 72, top: 4 } },
      },
    } as any);
    return () => { chartInst.current?.destroy(); chartInst.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, t.legendColor, t.chartText, t.textPrimary]);

  return (
    <SlideShell id="CE-12" theme={theme}>
      <SlideHeader title={`Consumo por Línea WhatsApp — ${periodLabel}`} subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexShrink: 0, height: 100 }}>
          <KpiCard label="Volumen total" value={totalGlobal.toLocaleString("es-CO")} theme={theme} />
          <KpiCard label="Líneas activas" value={String(rows.length)} theme={theme} />
          <KpiCard label="Línea top" value={topLine ? `${parseFloat(topLine.col5 || "0").toFixed(1)}%` : "—"}
            valueColor={CE.outbound} footnote={topLine ? (wabaNames.get(topLine.col1 || "") || topLine.col1) : undefined} theme={theme} />
        </div>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "12px 20px 8px", overflow: "hidden", position: "relative" }}>
          <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="CE · Consumo por Línea" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-13 | Tendencia Mensual
══════════════════════════════════════════════════════════════ */

function Ce13Slide({ data, theme, clientName, periodLabel, pageNum = 1 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const chartRef  = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<Chart | null>(null);
  const t = tok(theme);

  const rows = (data["5c_tendencia_mensual"] || [])
    .slice()
    .sort((a, b) => (a.periodo || "").localeCompare(b.periodo || ""));

  const labels    = rows.map(r => monthLabel(r.periodo || ""));
  const otbData   = rows.map(r => parseInt(r.col1 || "0", 10));
  const notifData = rows.map(r => parseInt(r.col2 || "0", 10));
  const inbData   = rows.map(r => parseInt(r.col3 || "0", 10));
  const totals    = rows.map(r => parseInt(r.col4 || "0", 10));

  const lastTotal = totals[totals.length - 1] || 0;
  const prevTotal = totals[totals.length - 2] || 0;
  const momPct    = prevTotal > 0 ? ((lastTotal - prevTotal) / prevTotal * 100).toFixed(1) : null;
  const maxTotal  = totals.length > 0 ? Math.max(...totals) : 0;
  const maxIndex  = totals.indexOf(maxTotal);
  const depKey    = JSON.stringify([labels, otbData, notifData, inbData]);

  useEffect(() => {
    if (!chartRef.current || rows.length === 0) return;
    chartInst.current?.destroy();
    chartInst.current = new Chart(chartRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "Outbound",       data: otbData,   backgroundColor: CE.outbound, stack: "stack", borderRadius: 0, datalabels: { display: false } as any },
          { label: "Notificaciones", data: notifData, backgroundColor: CE.notif,    stack: "stack", borderRadius: 0, datalabels: { display: false } as any },
          { label: "Inbound",        data: inbData,   backgroundColor: CE.inbound,  stack: "stack", borderRadius: 0,
            datalabels: { display: true, color: t.textPrimary, anchor: "end", align: "top", font: { size: 10, weight: 700 },
              formatter: (_: number, ctx: any) => {
                const total = totals[ctx.dataIndex] || 0;
                if (total === 0) return "";
                return total >= 1000000 ? `${(total / 1000000).toFixed(1)}M` : total >= 1000 ? `${Math.round(total / 1000)}k` : String(total);
              },
            } as any,
          },
        ],
      },
      options: {
        plugins: {
          legend: { position: "bottom", labels: { color: t.legendColor, font: { size: 12, weight: 600 }, padding: 14, usePointStyle: true, pointStyleWidth: 9 } },
          tooltip: { enabled: true },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: t.chartText, font: { size: 13, weight: 600 } } },
          y: { stacked: true, display: false, beginAtZero: true },
        },
        layout: { padding: { top: 24 } },
      },
    } as any);
    return () => { chartInst.current?.destroy(); chartInst.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, t.legendColor, t.chartText, t.textPrimary]);

  return (
    <SlideShell id="CE-13" theme={theme}>
      <SlideHeader title={`Tendencia Mensual — ${clientName}`} subtitle={`Customer Engagement · ${periodLabel}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexShrink: 0, height: 100 }}>
          <KpiCard label="Mes actual" value={lastTotal.toLocaleString("es-CO")} theme={theme} />
          {momPct !== null && (
            <KpiCard label="Variación MoM"
              value={`${parseFloat(momPct) >= 0 ? "+" : ""}${momPct}%`}
              valueColor={parseFloat(momPct) >= 0 ? CE.inbound : CE.danger}
              theme={theme} />
          )}
          {maxIndex >= 0 && rows.length > 0 && (
            <KpiCard label="Mes pico" value={labels[maxIndex] || "—"} footnote={maxTotal.toLocaleString("es-CO")} theme={theme} />
          )}
        </div>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "12px 20px 8px", overflow: "hidden", position: "relative" }}>
          <canvas ref={chartRef} style={{ width: "100%", height: "100%" }} />
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="CE · Tendencia Mensual" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-14 | Heatmap Cambios por Línea WhatsApp
══════════════════════════════════════════════════════════════ */

function Ce14Slide({ data, theme, clientName, periodLabel, pageNum = 1 }: {
  data: Record<string, BlockRow[]>; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const t = tok(theme);
  const rows = data["5d_heatmap_lineas"] || [];
  const wabaNames = useWabaNamesMap();

  const label_m0 = rows[0]?.col_extra1 || "Mes 0";
  const label_m1 = rows[0]?.col_extra2 || "Mes -1";
  const label_m2 = rows[0]?.col_extra3 || "Mes -2";

  const allVols = rows.flatMap(r => [
    parseInt(r.col2 || "0", 10),
    parseInt(r.col3 || "0", 10),
    parseInt(r.col4 || "0", 10),
  ]);
  const maxVol = Math.max(...allVols, 1);

  const newLines     = rows.filter(r => r.col5 === "NEW").length;
  const stoppedLines = rows.filter(r => r.col5 === "STOPPED").length;
  const activeLines  = rows.filter(r => r.col5 === "ACTIVE").length;
  const totalVol     = rows.reduce((s, r) => s + parseInt(r.col2 || "0", 10), 0);

  function cellBg(vol: number): string {
    if (vol === 0) return theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
    const intensity = Math.max(0.08, (vol / maxVol) * 0.80);
    return `rgba(8,145,178,${intensity.toFixed(2)})`;
  }

  const HEADER_H = 28;
  const TABLE_AREA = 450;
  const rowH = Math.min(28, Math.max(15, Math.floor((TABLE_AREA - HEADER_H) / Math.max(rows.length, 1))));
  const fs   = rowH <= 17 ? 9 : 10;

  return (
    <SlideShell id="CE-14" theme={theme}>
      <SlideHeader title={`Actividad por Línea — ${label_m2} · ${label_m1} · ${label_m0}`} subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexShrink: 0, height: 100 }}>
          <KpiCard label="Volumen mes actual"  value={totalVol.toLocaleString("es-CO")} theme={theme} />
          <KpiCard label="Líneas activas"      value={String(activeLines)} theme={theme} />
          <KpiCard label="Líneas nuevas"       value={String(newLines)}     valueColor={CE.inbound} theme={theme} />
          <KpiCard label="Líneas detenidas"    value={String(stoppedLines)} valueColor={stoppedLines > 0 ? CE.danger : t.textMuted} theme={theme} />
        </div>
        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "10px 16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", height: HEADER_H,
            borderBottom: `1px solid ${t.footerBorder}`, marginBottom: 2, flexShrink: 0 }}>
            <span style={{ flex: 2, fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>Línea WhatsApp</span>
            <span style={{ width: 130, textAlign: "center", fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>{label_m2}</span>
            <span style={{ width: 130, textAlign: "center", fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>{label_m1}</span>
            <span style={{ width: 130, textAlign: "center", fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>{label_m0}</span>
            <span style={{ width: 80,  textAlign: "center", fontSize: 9, fontWeight: 700, color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.12em" }}>Estado</span>
          </div>
          {/* Rows */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            {rows.map((row, i) => {
              const v0 = parseInt(row.col2 || "0", 10);
              const v1 = parseInt(row.col3 || "0", 10);
              const v2 = parseInt(row.col4 || "0", 10);
              const isNew     = row.col5 === "NEW";
              const isStopped = row.col5 === "STOPPED";
              const fmtVol = (v: number) => v === 0 ? "—" : v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v/1000)}k` : String(v);
              return (
                <div key={row.col1 || i} style={{
                  display: "flex", alignItems: "center", height: rowH,
                  background: i % 2 === 0 ? t.rowAlt : "transparent", borderRadius: 3,
                }}>
                  <span style={{ flex: 2, fontSize: fs, fontWeight: 600,
                    color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8 }}>
                    {wabaNames.get(row.col1 || "") || row.col1}
                  </span>
                  {[v2, v1, v0].map((vol, ci) => (
                    <div key={ci} style={{ width: 130, height: rowH - 3, margin: "1px 2px",
                      background: cellBg(vol), borderRadius: 4,
                      display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: fs, fontWeight: 700,
                        color: vol === 0 ? t.textMuted : theme === "dark" ? "#FFFFFF" : "#0D1137" }}>
                        {fmtVol(vol)}
                      </span>
                    </div>
                  ))}
                  <div style={{ width: 80, display: "flex", justifyContent: "center" }}>
                    {(isNew || isStopped) && (
                      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.05em",
                        padding: "2px 7px", borderRadius: 10,
                        background: isNew ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.12)",
                        color: isNew ? CE.inbound : CE.danger }}>
                        {isNew ? "NUEVA" : "DETENIDA"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="CE · Actividad por Línea" />
    </SlideShell>
  );
}

/* ════════════════════════════════════════════════════════════
   CE-15 | Comparativo entre Flujos
══════════════════════════════════════════════════════════════ */

function Ce15Slide({ ceFlows, theme, clientName, periodLabel, pageNum = 1 }: {
  ceFlows: CeFlowData[]; theme: Theme;
  clientName: string; periodLabel: string; pageNum?: number; totalPages?: number;
}) {
  const t = tok(theme);

  if (!ceFlows || ceFlows.length === 0) {
    return (
      <SlideShell id="CE-15" theme={theme}>
        <SlideHeader title="Comparativo entre Flujos" subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
        <div style={{ ...bodyStyle, alignItems: "center", justifyContent: "center" }}>
          <p style={{ color: t.textMuted, fontSize: 14 }}>No hay flujos disponibles para comparar.</p>
        </div>
        <SlideFooter theme={theme} pageNum={pageNum} slideLabel="CE · Comparativo entre Flujos" />
      </SlideShell>
    );
  }

  const rows = ceFlows.map(function(flow) {
    const fo  = flow.funnel_otb  || {};
    const vrf = flow.vrf         || {};

    const enviados   = parseInt(fo.COL1 || "0", 10);
    const fallanMeta = parseInt(fo.COL2 || "0", 10);
    const recepcion  = parseInt(fo.COL3 || "0", 10);
    const iniciados  = parseInt(fo.COL5 || "0", 10);

    const pctRecepcion = enviados  > 0 ? recepcion  / enviados  * 100 : 0;
    const pctFallos    = enviados  > 0 ? fallanMeta / enviados  * 100 : 0;
    const pctConvTotal = enviados  > 0 ? iniciados  / enviados  * 100 : 0;

    const docTasa     = flow.tiene_vrf ? parseFloat(vrf.COL4  || "0") : null;
    const rostroTasa  = flow.tiene_vrf ? parseFloat(vrf.COL8  || "0") : null;
    const identTasa   = flow.tiene_vrf ? parseFloat(vrf.COL10 || "0") : null;

    return { name: flow.flow_name, tiene_vrf: flow.tiene_vrf,
      enviados, pctRecepcion, pctFallos, pctConvTotal,
      docTasa, rostroTasa, identTasa };
  });

  const anyVrf = ceFlows.some(function(f) { return f.tiene_vrf; });

  const convVals  = rows.map(function(r) { return r.pctConvTotal; });
  const maxConv   = Math.max.apply(null, convVals);
  const minConv   = Math.min.apply(null, convVals);
  const recVals   = rows.map(function(r) { return r.pctRecepcion; });
  const maxRec    = Math.max.apply(null, recVals);
  const falVals   = rows.map(function(r) { return r.pctFallos; });
  const minFal    = Math.min.apply(null, falVals);

  const totalEnviados = rows.reduce(function(s, r) { return s + r.enviados; }, 0);
  const vrfCount      = ceFlows.filter(function(f) { return f.tiene_vrf; }).length;

  function fmtVol(v: number): string {
    return v >= 1000000 ? (v / 1000000).toFixed(1) + "M"
         : v >= 1000    ? Math.round(v / 1000) + "k"
         : String(v);
  }
  function fmtPct(v: number | null): string {
    return v === null ? "—" : v.toFixed(1) + "%";
  }
  function convColor(v: number): string {
    if (rows.length > 1 && v === maxConv) return CE.inbound;
    if (rows.length > 1 && v === minConv) return CE.danger;
    return t.textPrimary;
  }

  const HEADER_H = 28;
  const TABLE_AREA = 500;
  const rowH = Math.min(36, Math.max(20, Math.floor((TABLE_AREA - HEADER_H) / Math.max(rows.length, 1))));
  const fs   = rowH <= 22 ? 10 : 12;

  const cols = anyVrf
    ? ["32%", "10%", "13%", "13%", "13%", "9%", "9%"]
    : ["40%", "13%", "15%", "16%", "16%"];
  const hdrs = anyVrf
    ? ["Flujo", "Enviados", "% Recepción", "% Fallos Meta", "% Conversión", "% Doc", "% Rostro"]
    : ["Flujo", "Enviados", "% Recepción", "% Fallos Meta", "% Conversión"];

  return (
    <SlideShell id="CE-15" theme={theme}>
      <SlideHeader title="Comparativo entre Flujos" subtitle={`Customer Engagement · ${clientName}`} theme={theme} />
      <div style={{ ...bodyStyle, flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexShrink: 0, height: 90 }}>
          <KpiCard label="Flujos analizados"  value={String(ceFlows.length)} theme={theme} />
          <KpiCard label="Total enviados"     value={fmtVol(totalEnviados)} theme={theme} />
          <KpiCard label="Mayor conversión"   value={fmtPct(maxConv)} valueColor={CE.inbound} theme={theme} />
          <KpiCard label="Menor conversión"   value={fmtPct(minConv)}
            valueColor={minConv < 10 ? CE.danger : minConv < 20 ? CE.warning : t.textPrimary} theme={theme} />
          {anyVrf && <KpiCard label="Flujos con VRF" value={String(vrfCount)} valueColor={CE.outbound} theme={theme} />}
        </div>

        <div style={{ flex: 1, background: t.cardBg, border: t.cardBorder, boxShadow: t.cardShadow,
          borderRadius: 14, padding: "10px 16px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", height: HEADER_H,
            borderBottom: `1px solid ${t.footerBorder}`, marginBottom: 2, flexShrink: 0 }}>
            {hdrs.map(function(h, i) {
              return (
                <span key={i} style={{ width: cols[i], flexShrink: 0, fontSize: 9, fontWeight: 700,
                  color: t.textMuted, textTransform: "uppercase", letterSpacing: "0.10em" }}>{h}</span>
              );
            })}
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {rows.map(function(row, i) {
              const isBest  = rows.length > 1 && row.pctConvTotal === maxConv;
              const isWorst = rows.length > 1 && row.pctConvTotal === minConv && row.pctConvTotal !== maxConv;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", height: rowH,
                  background: i % 2 === 0 ? t.rowAlt : "transparent", borderRadius: 4,
                  borderLeft: isBest ? `3px solid ${CE.inbound}` : isWorst ? `3px solid ${CE.danger}` : "3px solid transparent",
                  paddingLeft: 6,
                }}>
                  <span style={{ width: cols[0], flexShrink: 0, fontSize: fs, fontWeight: 600,
                    color: t.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8,
                    display: "flex", alignItems: "center", gap: 6 }}>
                    {row.name}
                    {row.tiene_vrf && (
                      <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, flexShrink: 0,
                        background: "rgba(8,145,178,0.15)", color: CE.outbound }}>VRF</span>
                    )}
                  </span>
                  <span style={{ width: cols[1], flexShrink: 0, fontSize: fs, fontWeight: 700, color: t.textPrimary }}>
                    {fmtVol(row.enviados)}
                  </span>
                  <span style={{ width: cols[2], flexShrink: 0, fontSize: fs, fontWeight: 700,
                    color: row.pctRecepcion === maxRec ? CE.inbound : t.textPrimary }}>
                    {fmtPct(row.pctRecepcion)}
                  </span>
                  <span style={{ width: cols[3], flexShrink: 0, fontSize: fs, fontWeight: 700,
                    color: row.pctFallos === minFal ? CE.inbound : row.pctFallos > 30 ? CE.danger : row.pctFallos > 15 ? CE.warning : t.textPrimary }}>
                    {fmtPct(row.pctFallos)}
                  </span>
                  <span style={{ width: cols[4], flexShrink: 0, fontSize: fs, fontWeight: 800,
                    color: convColor(row.pctConvTotal) }}>
                    {fmtPct(row.pctConvTotal)}
                  </span>
                  {anyVrf && (
                    <>
                      <span style={{ width: cols[5], flexShrink: 0, fontSize: fs, fontWeight: 700,
                        color: row.docTasa === null ? t.textMuted : row.docTasa >= 70 ? CE.inbound : CE.warning }}>
                        {fmtPct(row.docTasa)}
                      </span>
                      <span style={{ width: cols[6], flexShrink: 0, fontSize: fs, fontWeight: 700,
                        color: row.rostroTasa === null ? t.textMuted : row.rostroTasa >= 70 ? CE.inbound : CE.warning }}>
                        {fmtPct(row.rostroTasa)}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="CE · Comparativo entre Flujos" />
    </SlideShell>
  );
}

/* ─── Main router ─── */

/* ════════════════════════════════════════════════════════════
   ASSET SLIDES — imágenes fijas del MBR con overlays de texto
══════════════════════════════════════════════════════════════ */

const ASSET_IMG: React.CSSProperties = {
  width: 1280, height: 720, display: "block", objectFit: "fill",
};

const ASSET_SHELL: React.CSSProperties = {
  position: "relative", width: 1280, height: 720, flexShrink: 0, overflow: "hidden",
};

/* ── Portada ── */
function PortadaSlide({ clientName, periodLabel }: { clientName: string; periodLabel: string }) {
  return (
    <div className="slide-page" style={ASSET_SHELL}>
      <img src="/assets/mbr/portada.png" alt="Portada" style={ASSET_IMG} />
      {/* Overlay periodo + cliente — debajo del logo Truora, alineado con "Monthly Business Review"
          El título MBR ocupa aprox. y=220–487; el overlay arranca en y=500.
          Tipografía: Inter 800 para coincidir con el peso del título quemado en el PNG. */}
      <div style={{ position: "absolute", top: 500, left: 65, width: 500, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{
          fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800,
          color: "#00D4A0", lineHeight: 1.2, letterSpacing: "-0.01em",
        }}>
          {periodLabel}
        </span>
        <span style={{
          fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 800,
          color: "#FFFFFF", lineHeight: 1.2, letterSpacing: "-0.01em",
        }}>
          {clientName}
        </span>
      </div>
    </div>
  );
}

/* ── Agenda ── */
function AgendaSlide() {
  return (
    <div className="slide-page" style={{ width: 1280, height: 720, flexShrink: 0 }}>
      <img src="/assets/mbr/agenda.png" alt="Agenda" style={ASSET_IMG} />
    </div>
  );
}

/* ── Separadores genéricos ── */
function SeparadorSlide({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="slide-page" style={{ width: 1280, height: 720, flexShrink: 0 }}>
      <img src={src} alt={alt} style={ASSET_IMG} />
    </div>
  );
}

/* ── Insights Finales — IA o manual (temático) ── */
function InsightsFinalesSlide({
  insightsAi,
  insightText,
  onInsightChange,
  theme = 'dark',
  pageNum = 0,
}: {
  insightsAi: boolean;
  insightText?: string;
  onInsightChange?: (text: string) => void;
  theme?: Theme;
  pageNum?: number;
}) {
  const t = tok(theme);
  const d = theme === 'dark';
  const accent = d ? '#4B6FFF' : '#6B4EFF';

  return (
    <SlideShell id="insights_finales" theme={theme}>
      {/* Barra acento izquierda */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 6, height: 720, background: accent }} />

      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 72,
        display: 'flex', alignItems: 'center', padding: '0 40px 0 28px',
        borderBottom: `1px solid ${t.footerBorder}`,
      }}>
        <span style={{
          fontSize: 22, fontWeight: 700, color: t.textPrimary,
          letterSpacing: '-0.02em',
        }}>
          ✦ Análisis estratégico
        </span>
        <span style={{
          marginLeft: 14, fontSize: 10, fontWeight: 700,
          padding: '3px 10px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.06em',
          background: insightsAi
            ? (d ? 'rgba(75,111,255,0.2)' : 'rgba(107,78,255,0.12)')
            : (d ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.12)'),
          color: insightsAi ? (d ? '#818CF8' : '#6B4EFF') : '#16A34A',
        }}>
          {insightsAi ? 'Truora AI' : 'CSM'}
        </span>
      </div>

      {/* Content area */}
      <div style={{
        position: 'absolute', top: 72, left: 28, right: 40, bottom: 32,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '24px 16px',
        boxSizing: 'border-box', overflow: 'hidden',
      }}>
        {insightsAi ? (
          insightText ? (
            <p style={{
              fontSize: 17, fontWeight: 450, color: t.textPrimary,
              lineHeight: 1.78, margin: 0, letterSpacing: '0.01em',
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 12, WebkitBoxOrient: 'vertical',
            } as React.CSSProperties}>
              {insightText}
            </p>
          ) : (
            <p style={{
              fontSize: 15, fontWeight: 450, fontStyle: 'italic',
              color: t.textMuted, lineHeight: 1.7, margin: 0,
            }}>
              El análisis estratégico será generado automáticamente por Truora AI al generar el reporte.
            </p>
          )
        ) : (
          <textarea
            value={insightText || ''}
            onChange={e => onInsightChange && onInsightChange(e.target.value)}
            placeholder="Escribe aquí el análisis estratégico del mes para este cliente..."
            style={{
              flex: 1, width: '100%', resize: 'none', border: 'none', outline: 'none',
              fontFamily: "'Inter', sans-serif",
              fontSize: 17, fontWeight: 450, color: t.textPrimary,
              lineHeight: 1.78, letterSpacing: '0.01em',
              background: d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
              borderRadius: 12, padding: '20px 24px',
              boxSizing: 'border-box',
            }}
          />
        )}
      </div>

      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="Análisis estratégico" />
    </SlideShell>
  );
}

/* ── Updates Novedades — 2 cards editables ── */
type UpdateCard = { imageUrl: string | null; text: string };

function UpdatesSlide() {
  const [cards, setCards] = useState<UpdateCard[]>([
    { imageUrl: null, text: "" },
    { imageUrl: null, text: "" },
  ]);

  const handleImage = (idx: number, file: File | null) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, imageUrl: url } : c));
  };

  const removeImage = (idx: number) => {
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, imageUrl: null } : c));
  };

  const handleText = (idx: number, val: string) => {
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, text: val } : c));
  };

  // Layout puro JSX — sin PNG de fondo para eliminar toda desalineación.
  // La estructura visual reproduce fielmente el diseño del PNG original:
  //   • Fondo lavanda claro  #ECEEF6
  //   • Barra acento izq.    7px   #6B4EFF
  //   • Título               top=0  h=80px
  //   • 2 cards blancos      top=85 bottom=44  flex row con gap 28
  //     – Zona imagen (gris) flexShrink:0  h=260px
  //     – Zona texto         flex:1  → rellena el resto
  //   • Barra pie            h=44   #6B4EFF
  // Con flexbox column dentro de cada card NADA puede solaparse ni salirse.

  return (
    <div className="slide-page" style={{
      position: "relative", width: 1280, height: 720, flexShrink: 0, overflow: "hidden",
      background: "#ECEEF6",
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Barra acento izquierda */}
      <div style={{
        position: "absolute", left: 0, top: 0, width: 7, height: 720,
        background: "#6B4EFF",
      }} />

      {/* Título */}
      <div style={{
        position: "absolute", top: 0, left: 7, right: 0, height: 80,
        display: "flex", alignItems: "center", paddingLeft: 36,
      }}>
        <h2 style={{
          fontSize: 26, fontWeight: 700, color: "#0D1137",
          margin: 0, letterSpacing: "-0.01em",
        }}>
          Updates | Novedades y Roadmap
        </h2>
      </div>

      {/* Fila de cards */}
      <div style={{
        position: "absolute",
        top: 85, left: 40, right: 32, bottom: 44,
        display: "flex", gap: 28,
      }}>
        {[0, 1].map(idx => (
          <div key={idx} style={{
            flex: 1, background: "#FFFFFF", borderRadius: 8,
            overflow: "hidden", display: "flex", flexDirection: "column",
            boxShadow: "0 2px 16px rgba(0,0,0,0.10)",
          }}>

            {/* Zona imagen — altura fija, nunca se desborda */}
            <div style={{
              height: 260, flexShrink: 0,
              background: "#F1F2F8",
              border: "1px solid #E2E4EF",
              position: "relative",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}>
              {cards[idx].imageUrl ? (
                <>
                  <img
                    src={cards[idx].imageUrl}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    alt=""
                  />
                  <button
                    onClick={() => removeImage(idx)}
                    style={{
                      position: "absolute", top: 8, right: 8,
                      width: 26, height: 26, borderRadius: "50%",
                      background: "rgba(0,0,0,0.55)", border: "none",
                      cursor: "pointer", color: "#fff", fontSize: 15, fontWeight: 700,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      lineHeight: 1, zIndex: 2,
                    }}
                  >×</button>
                </>
              ) : (
                <label style={{
                  cursor: "pointer", width: "100%", height: "100%",
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 10,
                }}>
                  <input
                    type="file" accept="image/*" style={{ display: "none" }}
                    onChange={e => handleImage(idx, e.target.files?.[0] ?? null)}
                  />
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: "#E2E4EF",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: 22, color: "#9CA3AF", lineHeight: 1 }}>+</span>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 600, color: "#9CA3AF",
                    letterSpacing: "0.06em", textTransform: "uppercase",
                  }}>Subir imagen</span>
                </label>
              )}
            </div>

            {/* Zona texto — ocupa el espacio restante, jamás superpone la imagen */}
            <div style={{
              flex: 1, overflow: "hidden",
              display: "flex", padding: "14px 16px",
            }}>
              <textarea
                value={cards[idx].text}
                onChange={e => handleText(idx, e.target.value)}
                placeholder="Describe la novedad de producto..."
                style={{
                  flex: 1, resize: "none", border: "none", outline: "none",
                  background: "transparent",
                  padding: 0, boxSizing: "border-box",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 15, fontWeight: 400,
                  color: "#1E1B4B", lineHeight: 1.65, letterSpacing: "0.01em",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Barra pie */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 44,
        background: "#6B4EFF",
      }} />
    </div>
  );
}

/* ── Cierre ── */
function CierreSlide({ csmName }: { csmName: string }) {
  return (
    <div className="slide-page" style={ASSET_SHELL}>
      <img src="/assets/mbr/cierre.png" alt="Cierre" style={ASSET_IMG} />
      {/* Overlay nombre CSM — apilado justo encima de "Customer Success Manager" quemado en el PNG.
          "Customer Success Manager" está en aprox. x=847–1143, y=553–580 (1280×720).
          El nombre va en la misma columna, ~45px arriba, alineado a la izquierda de ese bloque.
          Tipografía: Inter 600 para coincidir con el peso ligero del subtítulo del PNG. */}
      <div style={{ position: "absolute", top: 508, left: 847 }}>
        <p style={{
          fontFamily: "'Inter', sans-serif", fontSize: 19, fontWeight: 600,
          color: "#FFFFFF", margin: 0, lineHeight: 1.3, letterSpacing: "0.01em",
          whiteSpace: "nowrap",
        }}>
          {csmName}
        </p>
      </div>
    </div>
  );
}

export { PortadaSlide, AgendaSlide, SeparadorSlide, InsightsFinalesSlide, UpdatesSlide, CierreSlide };

/* ════════════════════════════════════════════════════════════
   AnalisisEstrategicoSlide — solo si con_ia = true
   Renderiza analisis_estrategico del response
══════════════════════════════════════════════════════════════ */

export interface AnalisisEstrategicoData {
  resumen_ejecutivo?: string;
  highlights_positivos?: string[];
  highlights_negativos?: string[];
  alertas?: { nivel?: string; mensaje?: string }[];
  talking_points?: string[];
  recomendaciones?: string[];
}

export function AnalisisEstrategicoSlide({
  analisis, theme, clientName, periodLabel, pageNum = 1, totalPages = 1,
}: {
  analisis: AnalisisEstrategicoData;
  theme: Theme;
  clientName: string;
  periodLabel: string;
  pageNum?: number;
  totalPages?: number;
}) {
  const t = tok(theme);
  const d = theme === 'dark';

  const badgeColor: Record<string, string> = {
    alto: '#EF4444', high: '#EF4444',
    medio: '#F59E0B', medium: '#F59E0B',
    bajo: '#22C55E', low: '#22C55E',
  };

  return (
    <SlideShell id="ANALISIS-IA" theme={theme}>
      <SlideHeader title="Análisis Estratégico IA" subtitle={`${clientName} · ${periodLabel}`} theme={theme} />
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 20px 8px', overflow: 'hidden' }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
          {/* Resumen ejecutivo */}
          {analisis.resumen_ejecutivo && (
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: d ? 'rgba(124,77,255,0.10)' : '#F3F0FF',
              border: `1px solid ${d ? 'rgba(124,77,255,0.25)' : '#C4B5FD'}`,
              flex: 1, overflow: 'hidden',
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#9B7FFF', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                Resumen ejecutivo
              </p>
              <p style={{
                fontSize: 12, color: t.textPrimary, lineHeight: 1.6, margin: 0,
                display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              } as React.CSSProperties}>
                {analisis.resumen_ejecutivo}
              </p>
            </div>
          )}

          {/* Talking points */}
          {analisis.talking_points && analisis.talking_points.length > 0 && (
            <div style={{
              padding: '10px 14px', borderRadius: 12,
              background: t.cardBg, border: t.cardBorder,
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                💬 Lo que puedes decir en la reunión
              </p>
              <ol style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {analisis.talking_points.slice(0, 3).map((tp, i) => (
                  <li key={i} style={{ fontSize: 11, color: t.textPrimary, lineHeight: 1.4 }}>{tp}</li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
          {/* Highlights positivos */}
          {analisis.highlights_positivos && analisis.highlights_positivos.length > 0 && (
            <div style={{
              padding: '10px 14px', borderRadius: 12,
              background: d ? 'rgba(34,197,94,0.08)' : '#F0FDF4',
              border: `1px solid ${d ? 'rgba(34,197,94,0.2)' : '#BBF7D0'}`,
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                ✅ Positivos
              </p>
              <ul style={{ margin: 0, paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {analisis.highlights_positivos.slice(0, 3).map((h, i) => (
                  <li key={i} style={{ fontSize: 11, color: t.textPrimary, lineHeight: 1.4 }}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Highlights negativos */}
          {analisis.highlights_negativos && analisis.highlights_negativos.length > 0 && (
            <div style={{
              padding: '10px 14px', borderRadius: 12,
              background: d ? 'rgba(239,68,68,0.07)' : '#FFF1F2',
              border: `1px solid ${d ? 'rgba(239,68,68,0.2)' : '#FECDD3'}`,
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                ⚠️ A mejorar
              </p>
              <ul style={{ margin: 0, paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {analisis.highlights_negativos.slice(0, 3).map((h, i) => (
                  <li key={i} style={{ fontSize: 11, color: t.textPrimary, lineHeight: 1.4 }}>{h}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Recomendaciones */}
          {analisis.recomendaciones && analisis.recomendaciones.length > 0 && (
            <div style={{
              padding: '10px 14px', borderRadius: 12,
              background: t.cardBg, border: t.cardBorder,
              flex: 1,
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                Recomendaciones
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {analisis.recomendaciones.slice(0, 3).map((r, i) => (
                  <div key={i} style={{
                    padding: '5px 8px', borderRadius: 8, fontSize: 11, color: t.textPrimary, lineHeight: 1.4,
                    background: d ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
                    border: `1px solid ${d ? 'rgba(255,255,255,0.07)' : '#E2E8F0'}`,
                  }}>
                    {i + 1}. {r}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alertas de análisis */}
          {analisis.alertas && analisis.alertas.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {analisis.alertas.slice(0, 2).map((a, i) => {
                const nivel = (a.nivel || 'bajo').toLowerCase();
                const bc = badgeColor[nivel] || '#94A3B8';
                return (
                  <div key={i} style={{
                    padding: '6px 10px', borderRadius: 8,
                    background: `${bc}12`, border: `1px solid ${bc}35`,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                      background: `${bc}25`, color: bc, flexShrink: 0,
                    }}>{(a.nivel || 'bajo').toUpperCase()}</span>
                    <span style={{ fontSize: 11, color: t.textPrimary, lineHeight: 1.4 }}>{a.mensaje}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <SlideFooter theme={theme} pageNum={pageNum} slideLabel="IA · Análisis estratégico" />
    </SlideShell>
  );
}

/* ─── Insight Panel ─── */

function InsightPanel({ text, source, theme, editable, onChange }: {
  text: string;
  source: 'ai' | 'manual';
  theme: Theme;
  editable?: boolean;
  onChange?: (text: string) => void;
}) {
  const t = tok(theme);
  const d = theme === 'dark';
  return (
    <div style={{
      position: 'absolute', top: 72, right: 0, bottom: 32, width: 448,
      background: d ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
      borderLeft: `3px solid ${d ? '#4B6FFF' : '#6B4EFF'}`,
      padding: '16px 24px', boxSizing: 'border-box', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          ✦ Análisis
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.06em',
          background: source === 'ai'
            ? (d ? 'rgba(75,111,255,0.2)' : 'rgba(107,78,255,0.1)')
            : (d ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.1)'),
          color: source === 'ai' ? (d ? '#818CF8' : '#6B4EFF') : '#16A34A',
        }}>
          {source === 'ai' ? 'Generado con IA' : 'CSM'}
        </span>
      </div>
      {editable && source === 'manual' ? (
        <textarea
          value={text}
          onChange={e => onChange && onChange(e.target.value)}
          placeholder="Escribe tu análisis aquí..."
          style={{
            flex: 1, width: '100%', resize: 'none', border: 'none', outline: 'none',
            fontFamily: "'Inter', sans-serif",
            fontSize: 14, color: t.textPrimary, lineHeight: 1.65,
            background: d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
            borderRadius: 8, padding: '12px 14px',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <p style={{
          fontSize: 15, color: t.textPrimary, lineHeight: 1.65, margin: 0,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 9, WebkitBoxOrient: 'vertical',
        } as React.CSSProperties}>
          {text || (editable ? '' : '—')}
        </p>
      )}
    </div>
  );
}

interface SlideCanvasProps {
  slideId: string;
  product: "DI" | "BGC" | "CE";
  data: Record<string, BlockRow[]>;
  ceFlows?: CeFlowData[];
  meta?: Record<string, any>;
  theme: Theme;
  clientName: string;
  periodLabel: string;
  pageNum?: number;
  totalPages?: number;
  insightText?: string;
  insightSource?: 'ai' | 'manual';
  insightEditable?: boolean;
  onInsightChange?: (text: string) => void;
}

export function SlideCanvas({ slideId, product, data, ceFlows, meta, theme, clientName, periodLabel, pageNum = 1, totalPages = 1, insightText, insightSource, insightEditable, onInsightChange }: SlideCanvasProps) {
  const p = { data, theme, clientName, periodLabel, pageNum, totalPages };

  const resolveSlide = (): React.ReactElement | null => {
    if (product === "DI") {
      switch (slideId) {
        case "1_metricas_generales":      return <Di1Slide  {...p} convTotalGlobal={meta?.conversion_total_global} convPromedioPorFlujo={meta?.conversion_promedio_flujos} />;
        case "2_usuarios_reintentos":     return <Di2Slide  {...p} />;
        case "3_validaciones_doc_rostro": return <Di3Slide  {...p} />;
        case "4_historico_3meses":        return <Di4Slide  {...p} />;
        case "5_flujos":                  return <Di5Slide  {...p} />;
        case "6_funnel":                  return <Di6Slide  {...p} />;
        case "7_razones_doc":             return <Di7Slide  {...p} />;
        case "8_razones_rostro":          return <Di8Slide  {...p} />;
        case "9_abandono":                return <Di9Slide  {...p} />;
        case "10_declinados":             return <DiDeclinadosSlide {...p} />;
        case "11_friccion_usuario":       return <Di10Slide {...p} />;
        default:                          return null;
      }
    }
    if (product === "BGC") {
      switch (slideId) {
        case "1_resumen_general":    return <Bgc1Slide {...p} />;
        case "2_por_pais":          return <Bgc2Slide {...p} />;
        case "4_score_por_pais":    return <Bgc3Slide {...p} />;
        case "5_labels":            return <Bgc4Slide {...p} />;
        case "6_labels_high_score": return <Bgc4bSlide {...p} />;
        case "7_historico_3meses":  return <Bgc5Slide {...p} />;
        case "2b_pais_x_tipo":      return <Bgc6Slide {...p} />;
        case "3_por_tipo":          return <Bgc7Slide {...p} />;
        default:                   return null;
      }
    }
    if (product === "CE") {
      const flows = ceFlows ?? [];
      switch (slideId) {
        case "1_consumo_total":       return <Ce1Slide {...p} />;
        case "2_eficiencia_campanas": return <Ce2Slide {...p} />;
        case "3_fallos_outbound":     return <Ce3Slide {...p} />;
        case "5_flujo_inbound":       return <Ce4Slide {...p} />;
        case "6_agentes_general":     return <Ce5Slide {...p} />;
        case "7_agentes_top5":        return <Ce6Slide {...p} />;
        case "5b_consumo_por_linea":   return <Ce12Slide {...p} />;
        case "5c_tendencia_mensual":   return <Ce13Slide {...p} />;
        case "5d_heatmap_lineas":      return <Ce14Slide {...p} />;
        case "6_comparativo_flujos":   return <Ce15Slide ceFlows={flows} theme={theme} clientName={clientName} periodLabel={periodLabel} pageNum={pageNum} totalPages={totalPages} />;
      }
      if (slideId.startsWith("ce_sep_")) {
        const i = parseInt(slideId.split("_")[2], 10);
        if (!isNaN(i) && i < flows.length) return <Ce7Slide ceFlows={flows} flowIndex={i} theme={theme} pageNum={pageNum} totalPages={totalPages} />;
      }
      if (slideId.startsWith("ce_otb_")) {
        const i = parseInt(slideId.split("_")[2], 10);
        if (!isNaN(i) && i < flows.length) return <Ce8Slide ceFlows={flows} flowIndex={i} theme={theme} clientName={clientName} periodLabel={periodLabel} pageNum={pageNum} totalPages={totalPages} />;
      }
      if (slideId.startsWith("ce_steps_")) {
        const i = parseInt(slideId.split("_")[2], 10);
        if (!isNaN(i) && i < flows.length) return <Ce9Slide ceFlows={flows} flowIndex={i} theme={theme} clientName={clientName} periodLabel={periodLabel} pageNum={pageNum} totalPages={totalPages} />;
      }
      if (slideId.startsWith("ce_vrfarbol_")) {
        const i = parseInt(slideId.split("_")[2], 10);
        if (!isNaN(i) && i < flows.length) return <Ce11Slide ceFlows={flows} flowIndex={i} theme={theme} clientName={clientName} periodLabel={periodLabel} pageNum={pageNum} totalPages={totalPages} />;
      }
      if (slideId.startsWith("ce_vrf_")) {
        const i = parseInt(slideId.split("_")[2], 10);
        if (!isNaN(i) && i < flows.length) return <Ce10Slide ceFlows={flows} flowIndex={i} theme={theme} clientName={clientName} periodLabel={periodLabel} pageNum={pageNum} totalPages={totalPages} />;
      }
      return null;
    }
    return null;
  };

  const slide = resolveSlide();
  if (!slide) return null;

  const showInsight = (insightText && insightSource) || (insightEditable && insightSource === 'manual');
  if (showInsight && insightSource) {
    return (
      <div className="slide-with-insight" style={{
        position: 'relative', width: 1280, height: 720, flexShrink: 0,
        '--slide-insight-right': '448px',
      } as React.CSSProperties}>
        {slide}
        <InsightPanel
          text={insightText || ''}
          source={insightSource}
          theme={theme}
          editable={insightEditable}
          onChange={onInsightChange}
        />
      </div>
    );
  }

  return slide;
}
