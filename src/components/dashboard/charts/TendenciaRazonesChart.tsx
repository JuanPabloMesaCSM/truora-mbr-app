import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
}: {
  bloques: BloqueMap | null;
  producto: Producto;
  tipoFallo: TipoFallo;
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

  return (
    <ChartCard
      title={titleFor(producto)}
      subtitle={subtitleFor(producto, tipoFallo, cfg.series.length, cfg.data.length)}
      height={360}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={cfg.data} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
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
            tickFormatter={cfg.yFormatter}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: S.borderHi, strokeWidth: 1 }}
            content={(props) => (
              <DarkTooltip
                {...props}
                labelFormatter={fmtMonthShort}
                valueFormatter={cfg.tooltipFormatter}
              />
            )}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
            formatter={(value: string) => (
              <span style={{ color: S.muted }}>{cfg.legendFormatter(value)}</span>
            )}
          />
          {cfg.series.map((s, i) => (
            <Line
              key={s}
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
        </LineChart>
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
  // CE
  const piv = pivotCeFallosTendencia(parseCeFallosTendencia(bloques));
  return {
    data: piv.data,
    series: piv.series,
    yFormatter: (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`),
    tooltipFormatter: (v: number) => v.toLocaleString("es-CO"),
    legendFormatter: (s: string) => s, // categorías ya vienen normalizadas legibles
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
