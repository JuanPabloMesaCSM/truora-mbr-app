import { useState } from "react";
import { S, fmtNum } from "@/components/botialertas/types";
import {
  parseDiRazonesAgregadas,
  parseBgcPorPais,
  parseCeFallos,
  heatmapColor,
  labelRazon,
  type BloqueMap,
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
}: {
  bloques: BloqueMap | null;
  producto: Producto;
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
      subtitle={`${producto} · ${rows.length} ${rows.length === 1 ? "razón" : "razones"} · total ${fmtNum(rows[0].totalDenominador)} ${denomLabelFor(producto)}`}
      height={360}
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
                % sobre {denomLabelFor(producto)}
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
                  key={r.label}
                  style={{ borderBottom: `1px solid ${S.border}` }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "8px 6px", color: S.text }}>
                    {r.labelDisplay}
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
  label: string;        // raw key (slug o pais)
  labelDisplay: string; // label legible para mostrar
  volumen: number;
  pct: number | null;   // % sobre el total del producto
  totalDenominador: number; // para subtitle
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
    const totalChecks = paises.reduce((s, p) => s + p.totalChecks, 0);
    return paises.map((p) => ({
      label: p.pais,
      labelDisplay: p.pais,
      volumen: p.totalChecks,
      pct: p.rejectionRatePct,
      totalDenominador: totalChecks,
    }));
  }
  // CE
  const ce = parseCeFallos(bloques);
  return ce.items.map((it) => ({
    label: it.categoria,
    labelDisplay: it.categoria,
    volumen: it.totalFallos,
    pct: it.pctDentroFallos,
    totalDenominador: ce.items.reduce((s, x) => s + x.totalFallos, 0),
  }));
}

function titleFor(producto: Producto): string {
  if (producto === "DI") return "Razones de rechazo (todas, agregadas)";
  if (producto === "BGC") return "Checks rechazados por país";
  return "Categorías de fallo de mensajes salientes";
}

function labelHeaderFor(producto: Producto): string {
  if (producto === "DI") return "Razón";
  if (producto === "BGC") return "País";
  return "Categoría";
}

function denomLabelFor(producto: Producto): string {
  if (producto === "DI") return "rechazos";
  if (producto === "BGC") return "checks";
  return "fallos";
}
