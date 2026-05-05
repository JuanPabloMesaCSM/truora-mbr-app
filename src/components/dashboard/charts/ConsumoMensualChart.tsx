import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { S } from "@/components/botialertas/types";
import {
  parseConsumoMensual,
  pivotConsumoMensual,
  fmtMonthShort,
  type BloqueMap,
} from "../types";
import {
  AXIS_STYLE,
  ChartCard,
  CHART_PALETTE,
  DarkTooltip,
  GRID_STYLE,
  colorAt,
  labelSubProducto,
} from "./sharedChartUtils";

/**
 * Visual 1 del dashboard: barras agrupadas por mes (1 barra por sub-producto)
 * + línea de tendencia del total.
 *
 * Fuente: bloque `consumo_mensual` (de SHARED_COUNTERS_DYNAMO).
 *
 * Colores por sub-producto vienen de CHART_PALETTE — no usamos PROD_META
 * porque el "producto" del dashboard ya determina la sección, acá
 * desglosamos sub-validaciones / canales.
 */
export default function ConsumoMensualChart({
  bloques,
  productLabel,
}: {
  bloques: BloqueMap | null;
  /** "DI" / "BGC" / "CE" — solo para subtitle del card */
  productLabel: string;
}) {
  const rows = parseConsumoMensual(bloques);
  if (rows.length === 0) {
    return (
      <ChartCard
        title="Consumo mensual por producto"
        subtitle={`${productLabel} · Sin data en el rango`}
        height={120}
      >
        <div style={{ color: S.dim, fontSize: 12, textAlign: "center", paddingTop: 40 }}>
          No hay registros de uso facturable.
        </div>
      </ChartCard>
    );
  }

  const { data, series } = pivotConsumoMensual(rows);

  // Calcular total por mes para la línea de tendencia
  const dataConTotal = data.map((d) => {
    let total = 0;
    for (const s of series) total += d[s] ?? 0;
    return { ...d, _total: total };
  });

  return (
    <ChartCard
      title="Consumo mensual por producto"
      subtitle={`${productLabel} · ${series.length} sub-${series.length === 1 ? "producto" : "productos"} · ${data.length} ${data.length === 1 ? "mes" : "meses"}`}
      height={340}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={dataConTotal}
          margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
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
              />
            )}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span style={{ color: S.muted }}>{labelSubProducto(value)}</span>
            )}
          />
          {series.map((s, i) => (
            <Bar
              key={s}
              dataKey={s}
              fill={colorAt(i)}
              radius={[3, 3, 0, 0]}
              maxBarSize={42}
              animationDuration={650}
              animationEasing="ease-out"
              isAnimationActive
            >
              {/* Animación staggered: el efecto de entrada de cada serie es secuencial */}
              {dataConTotal.map((_, idx) => (
                <Cell key={idx} fill={colorAt(i)} />
              ))}
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
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
