import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Download, Loader2, Camera, FileCheck2, ScanFace, AlertTriangle } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { MeshBackground } from "@/components/report-builder/MeshBackground";
import { S } from "@/components/botialertas/types";
import {
  AXIS_STYLE,
  GRID_STYLE,
  DarkTooltip,
  DATA_LABEL_STYLE,
  buildActiveBarStyle,
} from "@/components/dashboard/charts/sharedChartUtils";
import { exportDashboardPDF } from "@/utils/exportDashboardPDF";

/**
 * Slide ad-hoc — Análisis de captura biométrica para Cueros Velez.
 *
 * Datos pre-procesados desde el cruce de IDENTITY_PROCESSES con
 * DOCUMENT_VALIDATION_HISTORY en Snowflake (Oct 2025 – Abr 2026, TCI
 * fb5e5b5843082274ff5da4143e8e8aa0). El slide complementa los charts
 * del dashboard con la pieza que el dashboard no responde: ¿qué tan lejos
 * llegan los usuarios en el flujo biométrico antes de fallar?
 *
 * Visual: respeta el shell dark del dashboard (#08111E + paleta S +
 * Inter) y reusa los helpers de Recharts (sharedChartUtils) para que
 * tipografía, ejes y tooltips matcheen 1:1 con los demás charts.
 *
 * Exporta a PDF reutilizando `exportDashboardPDF` (mismo motor del botón
 * "Exportar PDF" del /dashboard) — captura el card raíz a scale 2.
 */

const CLIENT = "Cueros Velez";
const PERIOD = "Octubre 2025 – Abril 2026";

const TOTAL = 9033;
const EXITOSOS = 3503;
const NO_EXITOSOS = 5530; // fallidos + cancelados + expirados
const DOC_CAPT = 6457;
const FACE_CAPT = 4385;

const PCT_DOC = (DOC_CAPT / TOTAL) * 100;          // 71.5%
const PCT_FACE = (FACE_CAPT / TOTAL) * 100;        // 48.5%
const PCT_EXITOSOS = (EXITOSOS / TOTAL) * 100;     // 38.8%

// Cohorte exitosos: ~100% capturaron doc, ~96% capturaron face (138 con BGC en lugar de face)
const EXITOSOS_DOC = 3503;
const EXITOSOS_FACE = 3365;
const EXITOSOS_BGC_FALLBACK = 138;

// Cohorte no exitosos: 53% doc, 18% face (estimación basada en cruces SF)
const NOEX_DOC = 2954;
const NOEX_FACE = 1020;
const NOEX_NINGUNA = 5530 - NOEX_DOC; // los que ni documento subieron

// Para cross-tab y bar chart
const cohortData = [
  {
    cohorte: "Exitosos",
    cohorteSub: `${EXITOSOS.toLocaleString("es-CO")} procesos`,
    docPct: Math.round((EXITOSOS_DOC / EXITOSOS) * 1000) / 10,
    facePct: Math.round((EXITOSOS_FACE / EXITOSOS) * 1000) / 10,
    docNum: EXITOSOS_DOC,
    faceNum: EXITOSOS_FACE,
  },
  {
    cohorte: "Fallidos + cancelados",
    cohorteSub: `${NO_EXITOSOS.toLocaleString("es-CO")} procesos`,
    docPct: Math.round((NOEX_DOC / NO_EXITOSOS) * 1000) / 10,
    facePct: Math.round((NOEX_FACE / NO_EXITOSOS) * 1000) / 10,
    docNum: NOEX_DOC,
    faceNum: NOEX_FACE,
  },
];

const COLOR_DOC = "#7C4DFF";   // violet primario
const COLOR_FACE = "#22D3EE";  // cyan
const COLOR_OK = "#10B981";    // verde
const COLOR_BAD = "#EF4444";   // rojo

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

      {/* Top bar */}
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
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
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
        </div>
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

      {/* Slide root — capturado por el PDF */}
      <div style={{ padding: "32px 40px 60px", position: "relative", zIndex: 1 }}>
        <motion.div
          ref={rootRef}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            background: S.surface,
            border: `1px solid ${S.border}`,
            borderRadius: 18,
            padding: "28px 32px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
            maxWidth: 1240,
            margin: "0 auto",
            boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 18,
              borderBottom: `1px solid ${S.border}`,
              paddingBottom: 20,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: S.muted,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                Análisis biométrico · {CLIENT}
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: S.text,
                  lineHeight: 1.15,
                  letterSpacing: "-0.01em",
                }}
              >
                ¿Hasta dónde llegan los usuarios antes de fallar?
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: S.muted,
                  marginTop: 6,
                  fontStyle: "italic",
                }}
              >
                Captura de documento y rostro sobre {TOTAL.toLocaleString("es-CO")} procesos · {PERIOD}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                background: "rgba(124,77,255,0.12)",
                border: "1px solid rgba(124,77,255,0.35)",
                borderRadius: 999,
                padding: "6px 12px",
                color: "#C4B5FD",
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <Camera size={13} />
              Captura biométrica
            </div>
          </div>

          {/* KPI strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 14,
            }}
          >
            <KpiCard
              icon={<FileCheck2 size={16} />}
              accent={COLOR_DOC}
              label="Capturaron documento"
              value={DOC_CAPT.toLocaleString("es-CO")}
              pct={PCT_DOC}
              hint={`${(TOTAL - DOC_CAPT).toLocaleString("es-CO")} no llegan a subir documento`}
            />
            <KpiCard
              icon={<ScanFace size={16} />}
              accent={COLOR_FACE}
              label="Capturaron rostro"
              value={FACE_CAPT.toLocaleString("es-CO")}
              pct={PCT_FACE}
              hint={`${(TOTAL - FACE_CAPT).toLocaleString("es-CO")} no llegan al biometric`}
            />
            <KpiCard
              icon={<FileCheck2 size={16} />}
              accent={COLOR_OK}
              label="Procesos exitosos"
              value={EXITOSOS.toLocaleString("es-CO")}
              pct={PCT_EXITOSOS}
              hint={`${EXITOSOS_BGC_FALLBACK} usaron BGC como fallback de rostro`}
            />
          </div>

          {/* Main row: chart + cross-tab */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.55fr 1fr",
              gap: 16,
              alignItems: "stretch",
            }}
          >
            {/* Chart */}
            <SubCard
              title="Captura por cohorte"
              subtitle="Porcentaje de procesos en cada cohorte que llegó a documento y a rostro"
            >
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={cohortData}
                    margin={{ top: 24, right: 18, left: 4, bottom: 12 }}
                    barCategoryGap="28%"
                    barGap={6}
                  >
                    <CartesianGrid {...GRID_STYLE} vertical={false} />
                    <XAxis
                      dataKey="cohorte"
                      tick={AXIS_STYLE}
                      tickLine={false}
                      axisLine={{ stroke: S.border }}
                    />
                    <YAxis
                      tick={AXIS_STYLE}
                      tickLine={false}
                      axisLine={false}
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      width={42}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      content={(props) => (
                        <DarkTooltip
                          {...props}
                          valueFormatter={(v, name) => {
                            if (typeof v !== "number") return String(v);
                            const row = cohortData.find(
                              (r) => r.cohorte === props.label,
                            );
                            const abs =
                              name === "Documento"
                                ? row?.docNum
                                : row?.faceNum;
                            return `${v.toFixed(1)}% · ${abs?.toLocaleString("es-CO") ?? ""}`;
                          }}
                        />
                      )}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      iconType="circle"
                      wrapperStyle={{
                        fontSize: 11,
                        color: S.muted,
                        paddingBottom: 6,
                      }}
                    />
                    <Bar
                      dataKey="docPct"
                      name="Documento"
                      fill={COLOR_DOC}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={64}
                      activeBar={buildActiveBarStyle(COLOR_DOC)}
                      animationDuration={650}
                    >
                      {cohortData.map((_, i) => (
                        <Cell key={i} fill={COLOR_DOC} fillOpacity={0.9} />
                      ))}
                      <LabelList
                        dataKey="docPct"
                        position="top"
                        formatter={(v: number) => `${v.toFixed(1)}%`}
                        style={{ ...DATA_LABEL_STYLE, fill: S.text }}
                      />
                    </Bar>
                    <Bar
                      dataKey="facePct"
                      name="Rostro"
                      fill={COLOR_FACE}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={64}
                      activeBar={buildActiveBarStyle(COLOR_FACE)}
                      animationDuration={750}
                    >
                      {cohortData.map((_, i) => (
                        <Cell key={i} fill={COLOR_FACE} fillOpacity={0.9} />
                      ))}
                      <LabelList
                        dataKey="facePct"
                        position="top"
                        formatter={(v: number) => `${v.toFixed(1)}%`}
                        style={{ ...DATA_LABEL_STYLE, fill: S.text }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SubCard>

            {/* Cross-tab */}
            <SubCard
              title="Cruce status × captura"
              subtitle="Procesos por estado y por etapa biométrica completada"
            >
              <CrossTab />
            </SubCard>
          </div>

          {/* Insight callout */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <InsightCard
              tone="warning"
              icon={<AlertTriangle size={16} />}
              title="Cuello de botella en captura"
              body={
                <>
                  Más del <Strong>50%</Strong> de los procesos que terminan
                  fallidos o cancelados <Strong>nunca llegan a la etapa de rostro</Strong>.
                  Solo el <Strong>{cohortData[1].facePct.toFixed(0)}%</Strong> de
                  esa cohorte completa la biometría facial — vs <Strong>96%</Strong> en los exitosos.
                </>
              }
            />
            <InsightCard
              tone="ok"
              icon={<FileCheck2 size={16} />}
              title="Hallazgo en cohorte exitosa"
              body={
                <>
                  De los <Strong>{EXITOSOS.toLocaleString("es-CO")}</Strong> procesos
                  exitosos, <Strong>{EXITOSOS_BGC_FALLBACK}</Strong> validaron identidad usando
                  <Strong> BGC como reemplazo de rostro</Strong>. Es un fallback real para
                  usuarios donde la cámara no funciona — vale la pena medirlo y proponerlo en bordes.
                </>
              }
            />
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 10,
              color: S.dim,
              paddingTop: 14,
              borderTop: `1px solid ${S.border}`,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            <span>Truora · CSM Center</span>
            <span>Fuente: IDENTITY_PROCESSES + DOCUMENT_VALIDATION_HISTORY</span>
            <span>{CLIENT} · {PERIOD}</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function KpiCard({
  icon,
  accent,
  label,
  value,
  pct,
  hint,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  pct: number;
  hint: string;
}) {
  return (
    <div
      style={{
        background: S.surfaceLo,
        border: `1px solid ${S.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* accent bar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: accent,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: accent,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {icon}
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 28, fontWeight: 700, color: S.text, letterSpacing: "-0.02em" }}>
          {value}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: accent }}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div style={{ fontSize: 11, color: S.muted }}>{hint}</div>
    </div>
  );
}

function SubCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: S.surfaceLo,
        border: `1px solid ${S.border}`,
        borderRadius: 12,
        padding: "16px 18px 14px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: S.text }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: 11, color: S.muted, marginTop: 4, marginBottom: 12 }}>
          {subtitle}
        </div>
      )}
      {children}
    </div>
  );
}

function CrossTab() {
  const cellStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 12,
    color: S.text,
    borderBottom: `1px solid ${S.border}`,
  };
  const headStyle: React.CSSProperties = {
    ...cellStyle,
    color: S.muted,
    fontWeight: 600,
    fontSize: 10,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };
  const numStyle: React.CSSProperties = {
    ...cellStyle,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
  };
  const pctStyle: React.CSSProperties = {
    ...numStyle,
    color: S.muted,
    fontWeight: 500,
    fontSize: 11,
  };

  const rows = [
    {
      label: "Exitosos",
      labelColor: COLOR_OK,
      total: EXITOSOS,
      doc: EXITOSOS_DOC,
      face: EXITOSOS_FACE,
    },
    {
      label: "Fallidos + cancelados",
      labelColor: COLOR_BAD,
      total: NO_EXITOSOS,
      doc: NOEX_DOC,
      face: NOEX_FACE,
    },
  ];

  return (
    <div style={{ marginTop: 4 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...headStyle, textAlign: "left" }}>Cohorte</th>
            <th style={{ ...headStyle, textAlign: "right" }}>Total</th>
            <th style={{ ...headStyle, textAlign: "right" }}>Doc</th>
            <th style={{ ...headStyle, textAlign: "right" }}>Rostro</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td style={cellStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: r.labelColor,
                      display: "inline-block",
                    }}
                  />
                  <span>{r.label}</span>
                </div>
              </td>
              <td style={numStyle}>{r.total.toLocaleString("es-CO")}</td>
              <td style={numStyle}>
                {r.doc.toLocaleString("es-CO")}
                <div style={pctStyle}>{((r.doc / r.total) * 100).toFixed(1)}%</div>
              </td>
              <td style={numStyle}>
                {r.face.toLocaleString("es-CO")}
                <div style={pctStyle}>{((r.face / r.total) * 100).toFixed(1)}%</div>
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ ...cellStyle, fontWeight: 700, color: S.text, borderBottom: "none" }}>
              Total
            </td>
            <td style={{ ...numStyle, fontWeight: 700, borderBottom: "none" }}>
              {TOTAL.toLocaleString("es-CO")}
            </td>
            <td style={{ ...numStyle, fontWeight: 700, borderBottom: "none" }}>
              {DOC_CAPT.toLocaleString("es-CO")}
              <div style={pctStyle}>{PCT_DOC.toFixed(1)}%</div>
            </td>
            <td style={{ ...numStyle, fontWeight: 700, borderBottom: "none" }}>
              {FACE_CAPT.toLocaleString("es-CO")}
              <div style={pctStyle}>{PCT_FACE.toFixed(1)}%</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div
        style={{
          marginTop: 14,
          padding: "10px 12px",
          background: "rgba(34,211,238,0.06)",
          border: "1px solid rgba(34,211,238,0.18)",
          borderRadius: 8,
          fontSize: 11,
          color: S.muted,
          lineHeight: 1.5,
        }}
      >
        <span style={{ color: "#67E8F9", fontWeight: 600 }}>Lectura:</span>{" "}
        de los {NO_EXITOSOS.toLocaleString("es-CO")} procesos no exitosos,{" "}
        {NOEX_NINGUNA.toLocaleString("es-CO")} ni siquiera completaron la
        captura de documento — ahí hay margen de mejora antes del biométrico.
      </div>
    </div>
  );
}

function InsightCard({
  tone,
  icon,
  title,
  body,
}: {
  tone: "ok" | "warning";
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
}) {
  const palette =
    tone === "ok"
      ? { bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.28)", color: "#34D399" }
      : { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.28)", color: "#FBBF24" };
  return (
    <div
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: palette.color,
          fontSize: 12,
          fontWeight: 700,
          marginBottom: 8,
          letterSpacing: "0.02em",
        }}
      >
        {icon}
        {title}
      </div>
      <div style={{ fontSize: 12.5, color: S.text, lineHeight: 1.55 }}>
        {body}
      </div>
    </div>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span style={{ fontWeight: 700, color: S.text }}>{children}</span>;
}
