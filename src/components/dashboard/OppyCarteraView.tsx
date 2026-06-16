import { motion } from "framer-motion";
import { ArrowLeft, RefreshCw, Users, Layers } from "lucide-react";
import { S, fmtNum } from "@/components/botialertas/types";
import type { PeriodoSeleccion } from "./types";
import type { OppyProductAgg, OppyCarteraMeta } from "@/hooks/useOppyCartera";
import { productConfig } from "./PortfolioTable";
import { titleCaseEn, SUB_PRODUCTO_LABELS_BGC_CE } from "./charts/sharedChartUtils";
import OppyConsumoChart from "./charts/OppyConsumoChart";

/**
 * Vista "Oppy · Toda la cartera": consumo facturable agregado de TODA la
 * cartera Oppy, por producto + sub-producto, con tendencia mensual.
 *
 * Criterio de verdad: cada número COINCIDE con la suma del front Truora de
 * cada cliente (facturable CH, no procesos). Por eso NO incluye el embudo de
 * conversión / procesos DI — esa métrica no tiene equivalente en el front y
 * además está contaminada por conversaciones CE para clientes mixtos.
 *
 * Lee de `useOppyCartera` (agrega `portfolio_consumption`). Grano mensual.
 */

export default function OppyCarteraView({
  products,
  meta,
  loading,
  error,
  periodo,
  onBack,
}: {
  products: OppyProductAgg[];
  meta: OppyCarteraMeta;
  loading: boolean;
  error: string | null;
  periodo: PeriodoSeleccion;
  onBack: () => void;
}) {
  return (
    <motion.div
      id="dashboard-export-root"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{ display: "flex", flexDirection: "column", gap: 24 }}
    >
      {/* Header */}
      <div
        style={{
          position: "relative",
          background: "linear-gradient(135deg, rgba(124,77,255,0.14), rgba(75,111,255,0.05))",
          border: "1px solid rgba(124,77,255,0.30)",
          borderRadius: 14,
          padding: "18px 22px",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#7C4DFF" }} />
        <button
          onClick={onBack}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "transparent", border: `1px solid ${S.border}`,
            color: S.muted, cursor: "pointer",
            padding: "5px 10px", borderRadius: 8, fontSize: 11, marginBottom: 12,
          }}
        >
          <ArrowLeft size={12} />
          <span>Volver a la cartera</span>
        </button>
        <div style={{ fontSize: 11, color: S.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
          Vista agregada
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: S.text, marginBottom: 8 }}>
          Oppy · Toda la cartera
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 11, color: S.dim, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <Users size={12} /> {meta.clientesCount} {meta.clientesCount === 1 ? "cliente" : "clientes"} con consumo
          </span>
          <span>Rango: {periodo.inicio} → {periodo.fin}</span>
          {meta.ultimaActualizacion && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <RefreshCw size={10} /> Actualizado {fmtRelTime(meta.ultimaActualizacion)}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: S.muted, marginTop: 10, lineHeight: 1.5 }}>
          Consumo facturable (ClickHouse) sumado sobre toda la cartera. Cada número coincide con la
          suma del front Truora de cada cliente — es lo que se cobra, no procesos iniciados.
        </div>
      </div>

      {/* Estados */}
      {loading && (
        <div style={cardCenterStyle}>Agregando consumo de la cartera…</div>
      )}
      {error && (
        <div style={errorBoxStyle}>
          Error al cargar portfolio_consumption: {error}
        </div>
      )}
      {!loading && !error && products.length === 0 && (
        <div style={cardCenterStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: S.text, marginBottom: 6 }}>
            Sin consumos en el rango.
          </div>
          <div style={{ fontSize: 12 }}>
            {periodo.inicio} → {periodo.fin}. Prueba ampliar el rango o esperar la próxima corrida del
            cron (L/M/V 6 AM BOG).
          </div>
        </div>
      )}

      {/* Cards por producto */}
      {!loading && !error && products.map((p) => (
        <ProductCard key={p.product} product={p} />
      ))}
    </motion.div>
  );
}

/* ─────────────────────────── ProductCard ─────────────────────────── */

function ProductCard({ product }: { product: OppyProductAgg }) {
  const cfg = productConfig(product.product);
  const series = product.subs.map((s) => s.sub_product);
  const labelFn = (sub: string) => subLabel(product.product, sub);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header del producto + total + breakdown de sub-productos */}
      <div
        style={{
          position: "relative",
          background: S.surface,
          border: `1px solid ${S.border}`,
          borderRadius: 14,
          padding: "18px 22px",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: cfg.color }} />
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px",
                borderRadius: 999, fontSize: 12, fontWeight: 700,
                background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}30`,
              }}
            >
              {cfg.label}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: S.dim }}>
              <Layers size={11} /> {product.subs.length} {product.subs.length === 1 ? "sub-producto" : "sub-productos"}
            </span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: S.muted, marginBottom: 2 }}>Consumo facturable del rango</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: S.text, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>
              {fmtNum(product.total)}
            </div>
          </div>
        </div>

        {/* Breakdown sub-producto: barras horizontales con % del producto */}
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 7 }}>
          {product.subs.slice(0, 14).map((s) => {
            const pct = product.total > 0 ? (s.usage / product.total) * 100 : 0;
            return (
              <div key={s.sub_product}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 11 }}>
                  <span style={{ color: S.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
                    {labelFn(s.sub_product)}
                  </span>
                  <span style={{ color: S.muted, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {fmtNum(s.usage)} <span style={{ color: S.dim }}>· {pct.toFixed(1)}%</span>
                  </span>
                </div>
                <div style={{ height: 5, background: S.surfaceLo, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: cfg.color, opacity: 0.7 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tendencia mensual */}
      <OppyConsumoChart monthly={product.monthly} series={series} labelFn={labelFn} />
    </div>
  );
}

/* ─────────────────────────── Helpers ─────────────────────────── */

/** Label legible del sub-producto según el producto raíz:
 *  validations → inglés title-case · truconnect → lenguaje CSM ·
 *  checks/otros → código de país en mayúscula o capitalizado. */
function subLabel(product: string, sub: string): string {
  if (sub === "—") return "—";
  const slug = product.toLowerCase();
  if (slug === "validations") return titleCaseEn(sub);
  if (slug === "truconnect") return SUB_PRODUCTO_LABELS_BGC_CE[sub] ?? capFirst(sub);
  if (sub.length <= 3 && /^[a-z]+$/.test(sub)) return sub.toUpperCase(); // país: co, mx, sv
  return capFirst(sub);
}

function capFirst(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function fmtRelTime(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `hace ${diffD} ${diffD === 1 ? "día" : "días"}`;
  return d.toISOString().slice(0, 10);
}

const cardCenterStyle: React.CSSProperties = {
  background: S.surface,
  border: `1px solid ${S.border}`,
  borderRadius: 14,
  padding: "50px 30px",
  textAlign: "center",
  fontSize: 14,
  color: S.muted,
};

const errorBoxStyle: React.CSSProperties = {
  background: "rgba(239,68,68,0.10)",
  border: "1px solid rgba(239,68,68,0.30)",
  borderRadius: 14,
  padding: 16,
  fontSize: 13,
  color: "#FCA5A5",
};
