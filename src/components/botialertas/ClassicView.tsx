import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Calendar } from "lucide-react";
import {
  S, SEV_LIST, SEV_META, SEV_ORDER, PROD_LIST, PROD_META,
  fmtNum, fmtPct, fmtRange,
} from "./types";
import type { Alerta, Producto, Severidad } from "./types";

interface Props {
  rows: Alerta[]; // already filtered by week + scope
}

/* ========================================================================
   ClassicView: vista de cards de severidad clickeables + grid de cards.
   Es exactamente la version anterior a 2026-04-29, conservada como toggle.
   ======================================================================== */
export default function ClassicView({ rows }: Props) {
  const [filterProd, setFilterProd] = useState<"all" | Producto>("all");
  const [filterSev, setFilterSev] = useState<"all" | Severidad>("all");

  const counts = useMemo(() => {
    const c: Record<Severidad, number> = { critica: 0, fuerte: 0, crecimiento: 0, leve: 0, estable: 0 };
    rows
      .filter((r) => filterProd === "all" || r.producto === filterProd)
      .forEach((r) => c[r.severidad]++);
    return c;
  }, [rows, filterProd]);

  const visible = useMemo(() => {
    return rows
      .filter((r) => filterProd === "all" || r.producto === filterProd)
      .filter((r) => filterSev === "all" || r.severidad === filterSev)
      .sort((a, b) => {
        const so = SEV_ORDER[a.severidad] - SEV_ORDER[b.severidad];
        if (so !== 0) return so;
        return (a.variacion_pct ?? 0) - (b.variacion_pct ?? 0);
      });
  }, [rows, filterProd, filterSev]);

  return (
    <>
      <SeverityCounters
        counts={counts}
        active={filterSev}
        onToggle={(s) => setFilterSev(filterSev === s ? "all" : s)}
      />

      <FilterBar
        filterProd={filterProd}
        setFilterProd={setFilterProd}
        filterSev={filterSev}
        clearSev={() => setFilterSev("all")}
        visibleCount={visible.length}
      />

      {visible.length === 0 ? (
        <EmptyCard text="Sin alertas con los filtros seleccionados." />
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 16,
        }}>
          {visible.map((r, i) => (
            <AlertCard key={r.id} alerta={r} index={i} />
          ))}
        </div>
      )}
    </>
  );
}

/* ───────── Counters ───────── */

function SeverityCounters({
  counts, active, onToggle,
}: {
  counts: Record<Severidad, number>;
  active: "all" | Severidad;
  onToggle: (s: Severidad) => void;
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
      gap: 10,
      marginBottom: 20,
    }}>
      {SEV_LIST.map((s, i) => {
        const m = SEV_META[s];
        const isActive = active === s;
        return (
          <motion.button
            key={s}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 + i * 0.04, ease: "easeOut" }}
            onClick={() => onToggle(s)}
            style={{
              position: "relative", overflow: "hidden",
              background: isActive ? m.bg : S.surface,
              border: `1px solid ${isActive ? m.border : S.border}`,
              borderRadius: 14,
              padding: "14px 16px 14px 20px",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.18s",
              outline: "none",
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.borderColor = S.borderHi; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.borderColor = S.border; }}
          >
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: m.color, opacity: isActive ? 1 : 0.5 }} />
            <div style={{ fontSize: 28, fontWeight: 800, color: isActive ? m.color : S.text, lineHeight: 1, letterSpacing: "-0.02em" }}>
              {counts[s]}
            </div>
            <div style={{ fontSize: 10, color: S.muted, marginTop: 6, letterSpacing: "0.10em", textTransform: "uppercase", fontWeight: 600 }}>
              {m.label}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

/* ───────── Filter bar ───────── */

function FilterBar({
  filterProd, setFilterProd, filterSev, clearSev, visibleCount,
}: {
  filterProd: "all" | Producto;
  setFilterProd: (p: "all" | Producto) => void;
  filterSev: "all" | Severidad;
  clearSev: () => void;
  visibleCount: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
      <ProductChip active={filterProd === "all"} color="#7C4DFF" label="Todos" onClick={() => setFilterProd("all")} />
      {PROD_LIST.map((p) => (
        <ProductChip
          key={p}
          active={filterProd === p}
          color={PROD_META[p].color}
          label={`${PROD_META[p].label} (${PROD_META[p].sigla})`}
          onClick={() => setFilterProd(p)}
        />
      ))}

      {filterSev !== "all" && (
        <button
          onClick={clearSev}
          style={{ fontSize: 11, color: S.muted, background: "transparent", border: "none", cursor: "pointer", padding: "6px 10px", borderRadius: 6, transition: "color 0.15s", marginLeft: 4 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = S.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = S.muted)}
        >
          Limpiar severidad
        </button>
      )}

      <span style={{ marginLeft: "auto", fontSize: 12, color: S.muted }}>
        {visibleCount} alerta{visibleCount === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function ProductChip({
  active, color, label, onClick,
}: { active: boolean; color: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12, fontWeight: 600,
        color: active ? color : S.muted,
        background: active ? `${color}18` : "transparent",
        border: `1px solid ${active ? `${color}50` : S.border}`,
        cursor: "pointer", padding: "6px 14px",
        borderRadius: 999, transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.color = S.text;
          e.currentTarget.style.borderColor = S.borderHi;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.color = S.muted;
          e.currentTarget.style.borderColor = S.border;
        }
      }}
    >
      {label}
    </button>
  );
}

/* ───────── Empty ───────── */

function EmptyCard({ text }: { text: string }) {
  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`,
      borderRadius: 14, padding: "32px 24px", textAlign: "center",
      color: S.muted, fontSize: 13,
    }}>
      {text}
    </div>
  );
}

/* ───────── Alert card ───────── */

function AlertCard({ alerta, index }: { alerta: Alerta; index: number }) {
  const sev = SEV_META[alerta.severidad];
  const prod = PROD_META[alerta.producto];
  const Icon = sev.icon;
  const [hover, setHover] = useState(false);

  const anterior = Number(alerta.valor_anterior ?? 0);
  const actual = Number(alerta.valor_actual ?? 0);
  const max = Math.max(anterior, actual, 1);
  const hAnt = (anterior / max) * 100;
  const hAct = (actual / max) * 100;

  const deltaColor =
    alerta.variacion_pct == null ? S.muted
      : alerta.variacion_pct < 0 ? "#EF4444"
        : alerta.variacion_pct > 0 ? "#10B981"
          : S.muted;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.04 + Math.min(index, 12) * 0.03, ease: "easeOut" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", overflow: "hidden",
        background: hover ? S.surfaceHi : S.surface,
        border: `1px solid ${hover ? sev.border : S.border}`,
        borderRadius: 16,
        padding: "18px 20px 16px 22px",
        transition: "all 0.18s",
        boxShadow: hover ? `0 8px 28px rgba(0,0,0,0.35), 0 0 0 1px ${sev.border}` : "0 2px 10px rgba(0,0,0,0.18)",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: sev.color }} />

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.10em",
          textTransform: "uppercase", color: prod.color,
          padding: "3px 8px", borderRadius: 4,
          background: `${prod.color}1A`, border: `1px solid ${prod.color}40`,
        }}>
          {prod.sigla}
        </span>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: sev.color,
          padding: "3px 8px", borderRadius: 4,
          background: sev.bg, border: `1px solid ${sev.border}`,
          display: "inline-flex", alignItems: "center", gap: 4,
        }}>
          <Icon size={10} strokeWidth={2.4} />
          {sev.label}
        </span>
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: S.text, marginBottom: 2, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {alerta.cliente?.nombre ?? alerta.client_id_externo}
      </div>
      <div style={{ fontSize: 10, color: S.dim, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", marginBottom: 16, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {alerta.client_id_externo}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, padding: "4px 0" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 76, paddingTop: 4 }}>
          <BarColumn label="Anterior" value={alerta.valor_anterior} heightPct={hAnt} color={S.muted} barBg="rgba(255,255,255,0.06)" />
          <BarColumn label="Actual"   value={alerta.valor_actual}   heightPct={hAct} color={sev.color} barBg={sev.bg} />
        </div>
        <div style={{ flex: 1, textAlign: "right" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: deltaColor, lineHeight: 1, letterSpacing: "-0.02em" }}>
            {fmtPct(alerta.variacion_pct)}
          </div>
          <div style={{ fontSize: 10, color: S.muted, marginTop: 8, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>
            Variación
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${S.border}`, fontSize: 10.5, color: S.dim, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        <Calendar size={11} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
          {fmtRange(alerta.periodo_anterior_inicio, alerta.periodo_anterior_fin)}
          {" → "}
          {fmtRange(alerta.periodo_actual_inicio, alerta.periodo_actual_fin)}
        </span>
      </div>
    </motion.div>
  );
}

function BarColumn({
  label, value, heightPct, color, barBg,
}: { label: string; value: number | null; heightPct: number; color: string; barBg: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 38 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.01em" }}>
        {fmtNum(value)}
      </div>
      <div style={{ position: "relative", width: 26, height: 50, borderRadius: 6, background: "rgba(255,255,255,0.03)", overflow: "hidden", border: `1px solid ${S.border}` }}>
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: `${Math.max(heightPct, value === 0 ? 0 : 4)}%` }}
          transition={{ duration: 0.6, ease: [0.34, 1.2, 0.64, 1], delay: 0.1 }}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: `linear-gradient(to top, ${color}, ${barBg})`, borderTop: value && value > 0 ? `2px solid ${color}` : "none" }}
        />
      </div>
      <div style={{ fontSize: 9, color: S.dim, letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>
        {label}
      </div>
    </div>
  );
}
