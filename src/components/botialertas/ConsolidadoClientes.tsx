import { useMemo } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import { S, PROD_META, fmtNum, fmtPct } from "./types";
import type { ClientTotal } from "@/hooks/useConsolidadoMensual";

/**
 * Vista COMBINADA por cliente para el consolidado (admin-only). Suma todos los
 * productos por cliente y reproduce las tablas del reporte trimestral:
 *   - Mayor crecimiento (Δ combinado > 0, orden desc por volumen ganado)
 *   - Mayor decrecimiento (Δ combinado < 0, orden asc por volumen perdido)
 *   - Nuevos / sin base comparable (sin período anterior → total, sin %)
 *
 * Comparación = total del período vs total del período anterior igual
 * (mismo criterio que el reporte: Q2 vs Q1). Unidades combinadas cross-producto
 * = "consumo" unitless, tal como lo presenta el reporte.
 */

const COLOR = "#7DD3FC";

export default function ConsolidadoClientes({
  clientTotals, csmByEmail, rangeLabels, comparable = true,
}: {
  clientTotals: ClientTotal[];
  csmByEmail: Record<string, { nombre: string }>;
  rangeLabels: { actual: string; anterior: string };
  /** false = el período no tiene uno anterior para comparar → solo totales. */
  comparable?: boolean;
}) {
  const { crecimiento, decrecimiento, nuevos } = useMemo(() => {
    const cre: ClientTotal[] = [];
    const dec: ClientTotal[] = [];
    const nue: ClientTotal[] = [];
    for (const c of clientTotals) {
      if (c.sin_base) nue.push(c);
      else if ((c.variacion_abs ?? 0) > 0) cre.push(c);
      else if ((c.variacion_abs ?? 0) < 0) dec.push(c);
    }
    cre.sort((a, b) => (b.variacion_abs ?? 0) - (a.variacion_abs ?? 0));
    dec.sort((a, b) => (a.variacion_abs ?? 0) - (b.variacion_abs ?? 0));
    nue.sort((a, b) => b.total_actual - a.total_actual);
    return { crecimiento: cre, decrecimiento: dec, nuevos: nue };
  }, [clientTotals]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ marginBottom: 28 }}
    >
      <SectionLabel label="Consumo por cliente · combinado (todos los productos)" />
      <div style={{ fontSize: 11.5, color: S.muted, margin: "2px 0 14px" }}>
        {comparable
          ? <>{rangeLabels.actual} <span style={{ color: S.dim }}>vs</span> {rangeLabels.anterior} · consumo por cliente</>
          : <>{rangeLabels.actual} · consumo por cliente (sin período anterior para comparar)</>}
      </div>

      {!comparable ? (
        <MoverColumn
          title={`Consumo por cliente · ${rangeLabels.actual}`}
          icon={<Sparkles size={13} color={COLOR} />}
          accent={COLOR}
          rows={[...clientTotals].sort((a, b) => b.total_actual - a.total_actual).slice(0, 20)}
          csmByEmail={csmByEmail}
          hideDelta
        />
      ) : (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <MoverColumn
          title="Mayor crecimiento"
          icon={<TrendingUp size={13} color="#10B981" />}
          accent="#10B981"
          rows={crecimiento.slice(0, 10)}
          csmByEmail={csmByEmail}
        />
        <MoverColumn
          title="Mayor decrecimiento"
          icon={<TrendingDown size={13} color="#EF4444" />}
          accent="#EF4444"
          rows={decrecimiento.slice(0, 10)}
          csmByEmail={csmByEmail}
        />
      </div>
      )}

      {comparable && nuevos.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <MoverColumn
            title="Clientes sin consumo en el período anterior pero sí en el actual"
            icon={<Sparkles size={13} color={COLOR} />}
            accent={COLOR}
            rows={nuevos.slice(0, 10)}
            csmByEmail={csmByEmail}
            hideDelta
          />
        </div>
      )}
    </motion.div>
  );
}

function MoverColumn({
  title, icon, accent, rows, csmByEmail, hideDelta,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  rows: ClientTotal[];
  csmByEmail: Record<string, { nombre: string }>;
  hideDelta?: boolean;
}) {
  return (
    <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 7, padding: "11px 14px",
        borderBottom: `1px solid ${S.border}`, fontSize: 12, fontWeight: 700, color: S.text,
      }}>
        {icon}
        <span>{title}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: S.dim }}>{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: "14px", fontSize: 11.5, color: S.dim }}>Sin clientes en esta categoría.</div>
      ) : (
        <div>
          {rows.map((c, i) => {
            const csmNombre = c.csm_email ? (csmByEmail[c.csm_email]?.nombre ?? c.csm_email) : "Sin CSM";
            return (
              <div
                key={c.cliente_id + "|" + i}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px",
                  borderTop: i === 0 ? "none" : `1px solid ${S.border}`,
                }}
              >
                {/* acento lateral por categoría */}
                <div style={{ width: 3, alignSelf: "stretch", background: accent, borderRadius: 2, opacity: 0.7 }} />

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.nombre}
                    </span>
                    {c.productos.map((p) => (
                      <span key={p} style={{
                        fontSize: 8.5, fontWeight: 700, color: PROD_META[p].color,
                        background: `${PROD_META[p].color}18`, border: `1px solid ${PROD_META[p].color}35`,
                        padding: "1px 5px", borderRadius: 999, letterSpacing: "0.04em",
                      }}>{PROD_META[p].sigla}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 10.5, color: S.dim, marginTop: 1 }}>{csmNombre}</div>
                </div>

                {/* números */}
                <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {hideDelta ? (
                    <div style={{ fontSize: 13, fontWeight: 700, color: S.text }}>{fmtNum(c.total_actual)}</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: S.text }}>
                        {fmtNum(c.total_anterior)} <span style={{ color: S.dim, fontWeight: 400 }}>→</span> {fmtNum(c.total_actual)}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: accent, marginTop: 1 }}>
                        {fmtPct(c.variacion_pct)} <span style={{ color: S.muted, fontWeight: 500 }}>({signed(c.variacion_abs)})</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function signed(n: number | null): string {
  if (n == null) return "—";
  const v = Math.round(n);
  return (v > 0 ? "+" : "") + v.toLocaleString("es-CO");
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      fontSize: 11, fontWeight: 600, color: COLOR,
      letterSpacing: "0.12em", textTransform: "uppercase",
    }}>
      <div style={{ width: 16, height: 1, background: COLOR, opacity: 0.6 }} />
      {label}
    </div>
  );
}
