import { useState } from "react";
import { S, fmtNum } from "@/components/botialertas/types";
import {
  parseDiRazonesAgregadas,
  parseBgcPorPais,
  parseCeFallos,
  heatmapColor,
  labelRazon,
  type BloqueMap,
  type CeCanal,
  type Producto,
} from "../types";
import { ChartCard } from "./sharedChartUtils";

/**
 * Visual 4 del dashboard: tabla de razones agregadas con heatmap
 * gradiente verde→amarillo→rojo según el % de cada razón sobre el total.
 *
 * Por producto:
 *   DI:  bloque 13 — todas las razones del rango (filtradas por tipo_fallo)
 *   BGC: bloque 2  — por país (rejection rate como métrica)
 *   CE:  bloque 3  — categorías de fallo outbound
 *
 * Sort por columna: click en header alterna asc/desc. Default = volumen DESC.
 */
export default function RazonesTablaHeatmap({
  bloques,
  producto,
  chartHeight,
}: {
  bloques: BloqueMap | null;
  producto: Producto;
  /** Override del alto de la zona del chart (default 360). */
  chartHeight?: number;
}) {
  const rows = buildRows(bloques, producto);
  const [sortBy, setSortBy] = useState<"volumen" | "pct" | "label">("volumen");
  const [sortDesc, setSortDesc] = useState(true);

  if (rows.length === 0) {
    return (
      <ChartCard
        title={titleFor(producto)}
        subtitle={`${producto} · Sin data en el rango`}
        height={120}
      >
        <div style={{ color: S.dim, fontSize: 12, textAlign: "center", paddingTop: 40 }}>
          No hay razones agregadas disponibles.
        </div>
      </ChartCard>
    );
  }

  const sorted = [...rows].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "label") cmp = a.labelDisplay.localeCompare(b.labelDisplay);
    if (sortBy === "volumen") cmp = a.volumen - b.volumen;
    if (sortBy === "pct") cmp = (a.pct ?? 0) - (b.pct ?? 0);
    return sortDesc ? -cmp : cmp;
  });

  const maxPct = Math.max(...rows.map((r) => r.pct ?? 0));

  function toggleSort(col: "volumen" | "pct" | "label") {
    if (sortBy === col) setSortDesc(!sortDesc);
    else {
      setSortBy(col);
      setSortDesc(true);
    }
  }

  return (
    <ChartCard
      title={titleFor(producto)}
      subtitle={`${producto} · ${rows.length} ${entityLabelFor(producto, rows.length)} · total ${fmtNum(rows[0].totalDenominador)} ${denomLabelFor(producto)}`}
      height={chartHeight ?? 360}
    >
      <div
        style={{
          height: "100%",
          overflowY: "auto",
          fontSize: 12,
          color: S.text,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, background: S.surface, zIndex: 1 }}>
            <tr>
              <Th onClick={() => toggleSort("label")} active={sortBy === "label"} desc={sortDesc} align="left">
                {labelHeaderFor(producto)}
              </Th>
              <Th onClick={() => toggleSort("volumen")} active={sortBy === "volumen"} desc={sortDesc} align="right">
                Volumen
              </Th>
              <Th onClick={() => toggleSort("pct")} active={sortBy === "pct"} desc={sortDesc} align="right">
                {pctHeaderFor(producto)}
              </Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              // Color del bg de la celda % según escala relativa al máximo del rango
              const intensity = maxPct > 0 ? (r.pct ?? 0) / maxPct : 0;
              const bgColor = heatmapColor(intensity * 100, 0.22);
              return (
                <tr
                  key={`${r.label}__${r.canal ?? "_"}`}
                  style={{ borderBottom: `1px solid ${S.border}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "8px 6px", color: S.text }}>
                    {r.labelDisplay}
                    {r.canal && <CanalBadge canal={r.canal} />}
                  </td>
                  <td style={{ padding: "8px 6px", textAlign: "right", color: S.muted, fontFeatureSettings: '"tnum"' }}>
                    {fmtNum(r.volumen)}
                  </td>
                  <td
                    style={{
                      padding: "8px 6px",
                      textAlign: "right",
                      fontWeight: 700,
                      color: S.text,
                      fontFeatureSettings: '"tnum"',
                      background: bgColor,
                      borderLeft: `3px solid ${heatmapColor(intensity * 100, 0.85)}`,
                    }}
                  >
                    {r.pct != null ? `${r.pct.toFixed(2)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

/* ─────────────────────────── Header con sort ─────────────────────────── */

function Th({
  children,
  onClick,
  active,
  desc,
  align = "left",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  desc: boolean;
  align?: "left" | "right";
}) {
  return (
    <th
      onClick={onClick}
      style={{
        textAlign: align,
        fontSize: 10,
        fontWeight: 700,
        color: active ? "#7C4DFF" : S.muted,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "10px 6px",
        borderBottom: `1px solid ${S.borderHi}`,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {children}
      {active && (
        <span style={{ marginLeft: 4, fontSize: 8 }}>{desc ? "▼" : "▲"}</span>
      )}
    </th>
  );
}

/* ─────────────────────────── Helpers ─────────────────────────── */

interface TablaRow {
  label: string;        // raw key (slug o pais o categoria)
  labelDisplay: string; // label legible para mostrar
  volumen: number;
  pct: number | null;   // % sobre el total del producto
  totalDenominador: number; // para subtitle
  canal?: CeCanal;      // solo CE: 'outbound' | 'notification' para badge visual
}

function buildRows(bloques: BloqueMap | null, producto: Producto): TablaRow[] {
  if (producto === "DI") {
    return parseDiRazonesAgregadas(bloques).map((r) => ({
      label: r.razon,
      labelDisplay: labelRazon(r.razon),
      volumen: r.volumen,
      pct: r.pct,
      totalDenominador: r.totalFallidos,
    }));
  }
  if (producto === "BGC") {
    const paises = parseBgcPorPais(bloques);
    if (paises.length === 0) return [];
    // El "volumen" del row ahora es el conteo de rechazados (score≤6 sobre
    // completados) en lugar de total_checks. Antes el título decía
    // "rechazados" pero la columna mostraba TODOS los checks del país —
    // confuso para PEXTO CO que mostraba 1.292.272 "rechazados" cuando en
    // realidad eran ~23k. col9 trae el conteo exacto del SQL desde 2026-05-14.
    const totalRechazados = paises.reduce((s, p) => s + p.rechazados, 0);
    return paises.map((p) => ({
      label: p.pais,
      labelDisplay: p.pais,
      volumen: p.rechazados,
      pct: p.rejectionRatePct,
      totalDenominador: totalRechazados,
    }));
  }
  // CE — cross-canal: outbound + notification con badge para diferenciar.
  const ce = parseCeFallos(bloques);
  const totalCe = ce.items.reduce((s, x) => s + x.totalFallos, 0);
  return ce.items.map((it) => ({
    label: it.categoria,
    labelDisplay: it.categoria,
    volumen: it.totalFallos,
    pct: it.pctDentroFallos,
    totalDenominador: totalCe,
    canal: it.canal,
  }));
}

function titleFor(producto: Producto): string {
  if (producto === "DI") return "Razones de rechazo (todas, agregadas)";
  if (producto === "BGC") return "Tasa de rechazo por país";
  return "Categorías de fallo (salientes + notificaciones)";
}

/** Badge chiquito al lado de la categoría para diferenciar canal CE.
 *  Outbound = cyan (color CE), Notification = gris violáceo (canal distinto). */
function CanalBadge({ canal }: { canal: CeCanal }) {
  const isNotif = canal === "notification";
  const color = isNotif ? "#94A3B8" : "#0891B2";
  const label = isNotif ? "Notif" : "Out";
  return (
    <span
      style={{
        marginLeft: 8,
        fontSize: 9,
        fontWeight: 700,
        color,
        background: `${color}1F`,
        padding: "2px 6px",
        borderRadius: 4,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        verticalAlign: "middle",
      }}
    >
      {label}
    </span>
  );
}

function labelHeaderFor(producto: Producto): string {
  if (producto === "DI") return "Razón";
  if (producto === "BGC") return "País";
  return "Categoría";
}

function denomLabelFor(producto: Producto): string {
  if (producto === "DI") return "rechazos";
  if (producto === "BGC") return "rechazados";
  return "fallos";
}

/** Header de la columna de % en la tabla. Para BGC pasa a "% Rechazo"
 *  explícito en vez de "% sobre checks" que era ambiguo (¿de qué checks?
 *  el rate es rechazados ÷ completados, no sobre el total ejecutado). */
function pctHeaderFor(producto: Producto): string {
  if (producto === "BGC") return "% Rechazo";
  return `% sobre ${denomLabelFor(producto)}`;
}

/** Lo que cada fila de la tabla representa. DI = razón, BGC = país,
 *  CE = categoría. Singular/plural por count. */
function entityLabelFor(producto: Producto, count: number): string {
  if (producto === "BGC") return count === 1 ? "país" : "países";
  if (producto === "CE")  return count === 1 ? "categoría" : "categorías";
  return count === 1 ? "razón" : "razones";
}
