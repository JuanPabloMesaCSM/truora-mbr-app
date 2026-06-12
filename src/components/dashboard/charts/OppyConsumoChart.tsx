import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { S } from "@/components/botialertas/types";
import { fmtMonthShort } from "../types";
import type { OppyMonthRow } from "@/hooks/useOppyCartera";
import {
  AXIS_STYLE,
  ChartCard,
  CHART_PALETTE,
  DarkTooltip,
  GRID_STYLE,
  colorAt,
  dataLabelFormatter,
  DATA_LABEL_STYLE,
} from "./sharedChartUtils";

/**
 * Tendencia mensual de consumo de un producto agregado sobre TODA la cartera
 * Oppy: barras agrupadas por mes (1 por sub-producto) + línea de total.
 *
 * Gemelo visual de `ConsumoMensualChart` (mismos sharedChartUtils) pero
 * desacoplado de `Producto` — recibe los datos ya agregados desde
 * `useOppyCartera` + una función de label para los sub-productos, así sirve a
 * los 8 productos del portfolio (validations / checks / premium / truconnect /
 * zapsign / forms / …).
 */
export default function OppyConsumoChart({
  monthly,
  series,
  labelFn,
}: {
  monthly: OppyMonthRow[];
  /** sub-productos ordenados por usage total desc (define color + orden legend). */
  series: string[];
  labelFn: (sub: string) => string;
}) {
  const [activeCell, setActiveCell] = useState<{ key: string; idx: number } | null>(null);

  if (monthly.length === 0 || series.length === 0) {
    return (
      <ChartCard title="Consumo mensual" subtitle="Sin data en el rango" height={120}>
        <div style={{ color: S.dim, fontSize: 12, textAlign: "center", paddingTop: 40 }}>
          No hay registros de uso facturable.
        </div>
      </ChartCard>
    );
  }

  // Pivot: 1 fila por mes, 1 columna por sub-producto + _total.
  const data = monthly.map((m) => {
    const rec: { periodo: string; _total: number } & Record<string, number> = {
      periodo: m.periodo,
      _total: m.total,
    };
    for (const s of series) rec[s] = m.bySub[s] ?? 0;
    return rec;
  });

  return (
    <ChartCard
      title="Consumo mensual (toda la cartera)"
      subtitle={`${series.length} sub-${series.length === 1 ? "producto" : "productos"} · ${data.length} ${data.length === 1 ? "mes" : "meses"}`}
      height={420}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 32, right: 16, left: 0, bottom: 8 }}
          barGap={3}
          barCategoryGap="14%"
        >
          <CartesianGrid {...GRID_STYLE} vertical={false} />
          <XAxis
            dataKey="periodo"
            tickFormatter={fmtMonthShort}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={{ stroke: S.border }}
          />
          <YAxis
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)}
            width={48}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={(props) => (
              <DarkTooltip
                {...props}
                labelFormatter={fmtMonthShort}
                valueFormatter={(v) => v.toLocaleString("es-CO")}
                nameFormatter={(n) => (n === "_total" ? "Total" : labelFn(n))}
              />
            )}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span style={{ color: S.muted }}>{labelFn(value)}</span>
            )}
          />
          {series.map((s, i) => (
            <Bar
              key={s}
              dataKey={s}
              fill={colorAt(i)}
              radius={[3, 3, 0, 0]}
              maxBarSize={38}
              animationDuration={650}
              animationEasing="ease-out"
              isAnimationActive
              onMouseEnter={(_d: unknown, idx: number) => setActiveCell({ key: s, idx })}
              onMouseLeave={() => setActiveCell(null)}
            >
              {data.map((_, idx) => {
                const isActive = activeCell?.key === s && activeCell?.idx === idx;
                return (
                  <Cell
                    key={idx}
                    fill={colorAt(i)}
                    stroke={isActive ? S.text : undefined}
                    strokeWidth={isActive ? 1.5 : 0}
                    strokeOpacity={isActive ? 0.9 : 0}
                  />
                );
              })}
              <LabelList
                dataKey={s}
                position="top"
                offset={6}
                formatter={dataLabelFormatter}
                style={{ ...DATA_LABEL_STYLE, fontSize: 10 }}
              />
            </Bar>
          ))}
          <Line
            type="monotone"
            dataKey="_total"
            stroke={CHART_PALETTE[0]}
            strokeWidth={2}
            dot={{ r: 3, fill: CHART_PALETTE[0], strokeWidth: 0 }}
            activeDot={{ r: 5, fill: CHART_PALETTE[0], stroke: S.text, strokeWidth: 1 }}
            name="Total"
            animationDuration={900}
            animationEasing="ease-out"
            strokeDasharray="0"
            isAnimationActive
          >
            {series.length > 1 && (
              <LabelList
                dataKey="_total"
                position="top"
                offset={16}
                formatter={dataLabelFormatter}
                style={{
                  ...DATA_LABEL_STYLE,
                  fontSize: 12,
                  fontWeight: 700,
                  fill: CHART_PALETTE[0],
                }}
              />
            )}
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
