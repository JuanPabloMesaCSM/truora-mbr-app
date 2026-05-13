import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { S } from "@/components/botialertas/types";
import {
  parseDiRazonesTendencia,
  pivotDiRazonesTendencia,
  parseBgcRejectionTendencia,
  pivotBgcRejectionTendencia,
  parseCeFallosTendencia,
  pivotCeFallosTendencia,
  fmtMonthShort,
  labelRazon,
  type BloqueMap,
  type Producto,
  type TipoFallo,
} from "../types";
import {
  AXIS_STYLE,
  ChartCard,
  DarkTooltip,
  GRID_STYLE,
  colorAt,
  dataLabelFormatter,
  DATA_LABEL_STYLE,
  buildActiveBarStyle,
} from "./sharedChartUtils";

/**
 * Visual 3 del dashboard: tendencia mensual de las top 5 razones / categorías.
 *
 * Adapta su lógica por producto:
 *   DI:  bloque 12 — top 5 declined_reason (afectado por filtro tipo_fallo)
 *   BGC: bloque 8  — % rejection por país (top 5 países)
 *   CE:  bloque 4  — top 5 categorías de fallo outbound
 *
 * El subtitle indica qué métrica está graficada (volumen vs %) según producto.
 */
export default function TendenciaRazonesChart({
  bloques,
  producto,
  tipoFallo,
  chartHeight,
}: {
  bloques: BloqueMap | null;
  producto: Producto;
  tipoFallo: TipoFallo;
  /** Override del alto de la zona de chart (default 360 / 380 para BGC). */
  chartHeight?: number;
}) {
  const cfg = buildPivot(bloques, producto);
  if (!cfg || cfg.data.length === 0 || cfg.series.length === 0) {
    return (
      <ChartCard
        title={titleFor(producto)}
        subtitle={subtitleFor(producto, tipoFallo, 0, 0)}
        height={120}
      >
        <div style={{ color: S.dim, fontSize: 12, textAlign: "center", paddingTop: 40 }}>
          Sin razones disponibles para este filtro.
        </div>
      </ChartCard>
    );
  }

  // Solo BGC tiene barras de total mensual (eje izquierdo) + líneas de %
  // por país (eje derecho). DI y CE solo tienen líneas de volumen (eje único).
  const isBgc = producto === "BGC";
  const lineYAxisId = isBgc ? "right" : "left";
  const barColor = "#A78BFA";

  return (
    <ChartCard
      title={titleFor(producto)}
      subtitle={subtitleFor(producto, tipoFallo, cfg.series.length, cfg.data.length)}
      height={chartHeight ?? (isBgc ? 380 : 360)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={cfg.data} margin={{ top: 22, right: isBgc ? 16 : 16, left: 0, bottom: 8 }}>
          <CartesianGrid {...GRID_STYLE} vertical={false} />
          <XAxis
            dataKey="periodo"
            tickFormatter={fmtMonthShort}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={{ stroke: S.border }}
          />
          {/* Eje izquierdo: en BGC = volumen total; en DI/CE = volumen razones.
              Headroom 30% para que el datalabel sobre la barra no choque con
              el datalabel de la línea (caso BGC: línea cerca del 100%, barras al tope). */}
          <YAxis
            yAxisId="left"
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={false}
            domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.3)]}
            tickFormatter={isBgc ? (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`) : cfg.yFormatter}
            width={48}
          />
          {/* Eje derecho: solo en BGC, para el % por país */}
          {isBgc && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={AXIS_STYLE}
              tickLine={false}
              axisLine={false}
              tickFormatter={cfg.yFormatter}
              width={48}
            />
          )}
          <Tooltip
            cursor={isBgc ? { fill: "rgba(255,255,255,0.04)" } : { stroke: S.borderHi, strokeWidth: 1 }}
            content={(props) => (
              <DarkTooltip
                {...props}
                labelFormatter={fmtMonthShort}
                valueFormatter={(v, name) =>
                  // _total_mes (BGC) es un conteo, no un %. Las demás series usan
                  // el formatter del producto (BGC = "%", DI/CE = entero es-CO).
                  name === "_total_mes" ? v.toLocaleString("es-CO") : cfg.tooltipFormatter(v)
                }
                nameFormatter={(n) =>
                  n === "_total_mes"
                    ? "Total checks del mes"
                    : cfg.legendFormatter(n)
                }
              />
            )}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span style={{ color: S.muted }}>
                {value === "_total_mes" ? "Total checks del mes" : cfg.legendFormatter(value)}
              </span>
            )}
          />
          {/* Bar de total mensual — solo BGC */}
          {isBgc && (
            <Bar
              yAxisId="left"
              dataKey="_total_mes"
              fill={barColor}
              fillOpacity={0.45}
              radius={[3, 3, 0, 0]}
              maxBarSize={56}
              name="_total_mes"
              animationDuration={650}
              animationEasing="ease-out"
              isAnimationActive
              activeBar={buildActiveBarStyle(barColor)}
            >
              <LabelList
                dataKey="_total_mes"
                position="top"
                formatter={dataLabelFormatter}
                style={DATA_LABEL_STYLE}
              />
            </Bar>
          )}
          {/* Líneas — % por país (BGC) o volumen razones (DI/CE) */}
          {cfg.series.map((s, i) => (
            <Line
              key={s}
              yAxisId={lineYAxisId}
              type="monotone"
              dataKey={s}
              stroke={colorAt(i)}
              strokeWidth={2.2}
              dot={{ r: 3.5, fill: colorAt(i), strokeWidth: 0 }}
              activeDot={{ r: 6, fill: colorAt(i), stroke: S.text, strokeWidth: 1 }}
              animationDuration={750 + i * 80}
              animationEasing="ease-out"
              isAnimationActive
              connectNulls
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/* ─────────────────────────── Helpers ─────────────────────────── */

interface PivotConfig {
  data: Array<{ periodo: string } & Record<string, number>>;
  series: string[];
  yFormatter: (v: number) => string;
  tooltipFormatter: (v: number) => string;
  legendFormatter: (s: string) => string;
}

function buildPivot(bloques: BloqueMap | null, producto: Producto): PivotConfig | null {
  if (producto === "DI") {
    const piv = pivotDiRazonesTendencia(parseDiRazonesTendencia(bloques));
    return {
      data: piv.data,
      series: piv.series,
      yFormatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`),
      tooltipFormatter: (v: number) => v.toLocaleString("es-CO"),
      legendFormatter: (s: string) => labelRazon(s),
    };
  }
  if (producto === "BGC") {
    const piv = pivotBgcRejectionTendencia(parseBgcRejectionTendencia(bloques));
    return {
      data: piv.data,
      series: piv.series,
      yFormatter: (v: number) => `${v.toFixed(1)}%`,
      tooltipFormatter: (v: number) => `${v.toFixed(2)}%`,
      legendFormatter: (s: string) => s, // país queda igual (CO, MX, etc.)
    };
  }
  // CE — series codificadas como `${categoria}__${canal}` para evitar colisión
  // cuando una misma categoría aparece en outbound y en notif. Decodificamos
  // en legend/tooltip via seriesMeta + badge canal.
  const piv = pivotCeFallosTendencia(parseCeFallosTendencia(bloques));
  return {
    data: piv.data,
    series: piv.series,
    yFormatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`),
    tooltipFormatter: (v: number) => v.toLocaleString("es-CO"),
    legendFormatter: (s: string) => {
      const meta = piv.seriesMeta[s];
      if (!meta) return s;
      const badge = meta.canal === "notification" ? "Notif" : "Out";
      return `${meta.categoria} · ${badge}`;
    },
  };
}

function titleFor(producto: Producto): string {
  if (producto === "DI") return "Tendencia mensual top 5 razones de rechazo";
  if (producto === "BGC") return "Tendencia mensual de % checks rechazados por país";
  return "Tendencia mensual top 5 categorías de fallo";
}

function subtitleFor(
  producto: Producto,
  tipoFallo: TipoFallo,
  numSeries: number,
  numMeses: number,
): string {
  const base = `${producto} · ${numSeries} ${numSeries === 1 ? "serie" : "series"} · ${numMeses} ${numMeses === 1 ? "mes" : "meses"}`;
  if (producto === "DI") {
    const filtroLabel =
      tipoFallo === "ambos"     ? "rechazados + abandonados"
    : tipoFallo === "declinado" ? "solo rechazados por el sistema"
    : /* expirado */              "solo abandonados por el usuario";
    return `${base} · ${filtroLabel}`;
  }
  return base;
}
