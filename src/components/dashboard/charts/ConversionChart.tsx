import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { S } from "@/components/botialertas/types";
import {
  parseDiHistorico,
  parseBgcHistorico,
  parseCeHistorico,
  fmtMonthShort,
  type BloqueMap,
  type Producto,
} from "../types";
import {
  AXIS_STYLE,
  ChartCard,
  DarkTooltip,
  GRID_STYLE,
  dataLabelFormatter,
  dataLabelPctFormatter,
  DATA_LABEL_STYLE,
  buildActiveBarStyle,
} from "./sharedChartUtils";

/**
 * Visual 2 del dashboard: barras (volumen total mensual) + línea (conversión / pass rate)
 * en eje Y secundario.
 *
 * Adapta su lógica por producto:
 *   DI:  barras = total procesos      / línea = conversion_pct
 *   BGC: barras = total checks        / línea = pass_rate_pct
 *   CE:  barras = total mensajes      / línea (no aplica — sin métrica de conversión equivalente,
 *                                              mostramos línea de inbound como comparativo)
 */
export default function ConversionChart({
  bloques,
  producto,
}: {
  bloques: BloqueMap | null;
  producto: Producto;
}) {
  const data = buildData(bloques, producto);
  if (data.length === 0) {
    return (
      <ChartCard
        title={titleFor(producto)}
        subtitle={`${producto} · Sin data en el rango`}
        height={120}
      >
        <div style={{ color: S.dim, fontSize: 12, textAlign: "center", paddingTop: 40 }}>
          Sin histórico mensual disponible.
        </div>
      </ChartCard>
    );
  }

  const cfg = configFor(producto);

  return (
    <ChartCard
      title={titleFor(producto)}
      subtitle={`${producto} · ${data.length} ${data.length === 1 ? "mes" : "meses"} · barras: ${cfg.barLabel} · línea: ${cfg.lineLabel}`}
      height={320}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid {...GRID_STYLE} vertical={false} />
          <XAxis
            dataKey="periodo"
            tickFormatter={fmtMonthShort}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={{ stroke: S.border }}
          />
          <YAxis
            yAxisId="left"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
            width={48}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            domain={[0, cfg.lineDomain]}
            tickFormatter={cfg.lineFormatter}
            width={42}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={(props) => (
              <DarkTooltip
                {...props}
                labelFormatter={fmtMonthShort}
                valueFormatter={(v) => {
                  // distinguish bar vs line by color in payload — la "línea" siempre usa cfg.lineColor
                  if (typeof v !== "number") return String(v);
                  return v.toLocaleString("es-CO");
                }}
              />
            )}
          />
          <Bar
            yAxisId="left"
            dataKey="bar"
            fill={cfg.barColor}
            radius={[4, 4, 0, 0]}
            maxBarSize={56}
            animationDuration={650}
            animationEasing="ease-out"
            isAnimationActive
            name={cfg.barLabel}
            activeBar={buildActiveBarStyle(cfg.barColor)}
          >
            {data.map((_, idx) => (
              <Cell key={idx} fill={cfg.barColor} fillOpacity={0.85} />
            ))}
            <LabelList
              dataKey="bar"
              position="top"
              formatter={dataLabelFormatter}
              style={DATA_LABEL_STYLE}
            />
          </Bar>
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="line"
            stroke={cfg.lineColor}
            strokeWidth={2.5}
            dot={{ r: 4, fill: cfg.lineColor, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: cfg.lineColor, stroke: S.text, strokeWidth: 1 }}
            name={cfg.lineLabel}
            animationDuration={900}
            animationEasing="ease-out"
            isAnimationActive
            connectNulls
          >
            <LabelList
              dataKey="line"
              position="top"
              offset={10}
              formatter={dataLabelPctFormatter}
              style={{ ...DATA_LABEL_STYLE, fill: cfg.lineColor }}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ─────────────────────────── Helpers ─────────────────────────── */

interface ChartRow {
  periodo: string;
  bar: number;
  line: number | null;
}

function buildData(bloques: BloqueMap | null, producto: Producto): ChartRow[] {
  if (producto === "DI") {
    return parseDiHistorico(bloques).map((d) => ({
      periodo: d.periodo,
      bar: d.totalProcesos,
      line: d.conversionPct,
    }));
  }
  if (producto === "BGC") {
    return parseBgcHistorico(bloques).map((d) => ({
      periodo: d.periodo,
      bar: d.totalChecks,
      line: d.passRatePct,
    }));
  }
  // CE: usamos total como barras + ratio inbound/total como línea (proxy de "engagement")
  return parseCeHistorico(bloques).map((d) => ({
    periodo: d.periodo,
    bar: d.total,
    line: d.total > 0 ? Math.round((d.inbound / d.total) * 100 * 10) / 10 : null,
  }));
}

function titleFor(producto: Producto): string {
  if (producto === "DI") return "Conversión y total de validaciones";
  if (producto === "BGC") return "Checks exitosos y total de checks";
  return "Volumen y % de conversaciones entrantes";
}

function configFor(producto: Producto): {
  barLabel: string;
  lineLabel: string;
  barColor: string;
  lineColor: string;
  lineDomain: number;
  lineFormatter: (v: number) => string;
} {
  if (producto === "DI") {
    return {
      barLabel: "Validaciones",
      lineLabel: "% Conversión",
      barColor: "#A78BFA",
      lineColor: "#10B981",
      lineDomain: 100,
      lineFormatter: (v: number) => `${v}%`,
    };
  }
  if (producto === "BGC") {
    return {
      barLabel: "Checks",
      lineLabel: "% Checks exitosos",
      barColor: "#A78BFA",
      lineColor: "#6C3FC5",
      lineDomain: 100,
      lineFormatter: (v: number) => `${v}%`,
    };
  }
  return {
    barLabel: "Mensajes",
    lineLabel: "% Conversaciones entrantes",
    barColor: "#A78BFA",
    lineColor: "#0891B2",
    lineDomain: 100,
    lineFormatter: (v: number) => `${v}%`,
  };
}
