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
import {
  parseConsumoMensual,
  pivotConsumoMensual,
  fmtMonthShort,
  type BloqueMap,
  type Producto,
} from "../types";
import {
  AXIS_STYLE,
  ChartCard,
  CHART_PALETTE,
  DarkTooltip,
  GRID_STYLE,
  colorAt,
  labelSubProductoForChart,
  dataLabelFormatter,
  DATA_LABEL_STYLE,
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
  producto,
}: {
  bloques: BloqueMap | null;
  /** Producto del cliente — define idioma de los labels de series.
   *  DI usa inglés (Document Validation, Passive Liveness, etc.) porque
   *  los nombres técnicos de sub-validaciones se reconocen mejor en inglés.
   *  BGC/CE usan lenguaje CSM (skill truora-domain). */
  producto: Producto;
}) {
  // Hover state per-celda: cuando el user pasa el mouse sobre una barra
  // específica (un sub-producto en un mes específico), solo esa celda se
  // resalta con stroke. El tooltip sigue shared (muestra todos los valores
  // del periodo). Con activeBar de Recharts + shared tooltip se highlight
  // todas las barras del grupo — no es lo que queremos.
  const [activeCell, setActiveCell] = useState<{ key: string; idx: number } | null>(null);

  const rows = parseConsumoMensual(bloques);
  if (rows.length === 0) {
    return (
      <ChartCard
        title="Consumo mensual por producto"
        subtitle={`${producto} · Sin data en el rango`}
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
      subtitle={`${producto} · ${series.length} sub-${series.length === 1 ? "producto" : "productos"} · ${data.length} ${data.length === 1 ? "mes" : "meses"} · pasa el mouse por una barra para ver el desglose`}
      height={420}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={dataConTotal}
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
                nameFormatter={(n) => (n === "_total" ? "Total" : labelSubProductoForChart(n, producto))}
              />
            )}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span style={{ color: S.muted }}>{labelSubProductoForChart(value, producto)}</span>
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
              {dataConTotal.map((_, idx) => {
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
              {/* Sin datalabels per-bar: con 5 sub-productos por mes los
                  números de barras adyacentes se chocaban (probamos rotar 90°
                  y quedó ilegible). El desglose se ve en el tooltip al hover.
                  El total mensual se etiqueta sobre la línea del Total abajo. */}
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
            {/* Headline mensual: 1 número por mes, total agregado de los
                sub-productos. Visible siempre, evita el clutter de tener
                un label encima de cada barra del grupo. */}
            <LabelList
              dataKey="_total"
              position="top"
              offset={10}
              formatter={dataLabelFormatter}
              style={{
                ...DATA_LABEL_STYLE,
                fontSize: 12,
                fontWeight: 700,
                fill: CHART_PALETTE[0],
              }}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
