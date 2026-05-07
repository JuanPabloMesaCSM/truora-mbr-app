import { Camera, FileCheck2, ScanFace, AlertTriangle } from "lucide-react";
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
import { S } from "@/components/botialertas/types";
import {
  AXIS_STYLE,
  GRID_STYLE,
  DarkTooltip,
  DATA_LABEL_STYLE,
  buildActiveBarStyle,
} from "@/components/dashboard/charts/sharedChartUtils";

/**
 * Slide reutilizable de captura biométrica para clientes Cueros Velez.
 *
 * Datos pre-procesados desde el cruce de IDENTITY_PROCESSES con
 * DOCUMENT_VALIDATION_HISTORY en Snowflake (Oct 2025 – Abr 2026, TCI
 * fb5e5b5843082274ff5da4143e8e8aa0).
 *
 * Consumido por:
 *   - /mbr-cueros-biometric (slide solo)
 *   - /mbr-cueros-completo  (al final del reporte completo)
 */

const TOTAL = 9033;
const EXITOSOS = 3503;
const NO_EXITOSOS = 5530;
const DOC_CAPT = 6457;
const FACE_CAPT = 4385;

const PCT_DOC = (DOC_CAPT / TOTAL) * 100;
const PCT_FACE = (FACE_CAPT / TOTAL) * 100;
const PCT_EXITOSOS = (EXITOSOS / TOTAL) * 100;

const EXITOSOS_DOC = 3503;
const EXITOSOS_FACE = 3365;
const EXITOSOS_BGC_ALT = 138;

const NOEX_DOC = 2954;
const NOEX_FACE = 1020;
const NOEX_NINGUNA = NO_EXITOSOS - NOEX_DOC;

const grupoData = [
  {
    resultado: "Exitosos",
    docPct: Math.round((EXITOSOS_DOC / EXITOSOS) * 1000) / 10,
    facePct: Math.round((EXITOSOS_FACE / EXITOSOS) * 1000) / 10,
    docNum: EXITOSOS_DOC,
    faceNum: EXITOSOS_FACE,
  },
  {
    resultado: "Fallidos + cancelados",
    docPct: Math.round((NOEX_DOC / NO_EXITOSOS) * 1000) / 10,
    facePct: Math.round((NOEX_FACE / NO_EXITOSOS) * 1000) / 10,
    docNum: NOEX_DOC,
    faceNum: NOEX_FACE,
  },
];

const COLOR_DOC = "#7C4DFF";
const COLOR_FACE = "#22D3EE";
const COLOR_OK = "#10B981";
const COLOR_BAD = "#EF4444";

export default function BiometricCaptureSlide({
  clientName,
  periodLabel,
}: {
  clientName: string;
  periodLabel: string;
}) {
  return (
    <div
      data-pptx-section="biometric"
      style={{
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: 18,
        padding: "28px 32px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
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
            {clientName}
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
            ¿Hasta dónde llegan los usuarios?
          </div>
          <div
            style={{
              fontSize: 13,
              color: S.muted,
              marginTop: 6,
              fontStyle: "italic",
            }}
          >
            Captura de documento y rostro sobre {TOTAL.toLocaleString("es-CO")} procesos · {periodLabel}
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
          hint={`${EXITOSOS_BGC_ALT} validaron con BGC como alternativa al rostro`}
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
        <SubCard
          title="Captura según resultado del proceso"
          subtitle="Porcentaje de procesos en cada grupo que llegó a documento y a rostro"
        >
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={grupoData}
                margin={{ top: 24, right: 18, left: 4, bottom: 12 }}
                barCategoryGap="28%"
                barGap={6}
              >
                <CartesianGrid {...GRID_STYLE} vertical={false} />
                <XAxis
                  dataKey="resultado"
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
                        const row = grupoData.find(
                          (r) => r.resultado === props.label,
                        );
                        const abs =
                          name === "Documento" ? row?.docNum : row?.faceNum;
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
                  {grupoData.map((_, i) => (
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
                  {grupoData.map((_, i) => (
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

        <SubCard
          title="Resultado × etapa biométrica"
          subtitle="Procesos por resultado y por etapa biométrica completada"
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
              Solo el <Strong>{grupoData[1].facePct.toFixed(0)}%</Strong> de
              ese grupo completa la biometría facial — vs <Strong>96%</Strong> en los exitosos.
            </>
          }
        />
        <InsightCard
          tone="ok"
          icon={<FileCheck2 size={16} />}
          title="Hallazgo en procesos exitosos"
          body={
            <>
              De los <Strong>{EXITOSOS.toLocaleString("es-CO")}</Strong> procesos
              exitosos, <Strong>{EXITOSOS_BGC_ALT}</Strong> validaron identidad usando
              <Strong> BGC como alternativa al rostro</Strong>. Es una alternativa real
              para usuarios donde la cámara no funciona — tenemos también oportunidad
              de mejora en la configuración de nuestros flujos de trabajo.
            </>
          }
        />
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
            <th style={{ ...headStyle, textAlign: "left" }}>Resultado</th>
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
        {NOEX_NINGUNA.toLocaleString("es-CO")} no completaron la captura de
        documento, tenemos oportunidad de mejora en gestión del flujo.
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
