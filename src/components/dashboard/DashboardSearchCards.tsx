import { useState } from "react";
import { Search, Loader2, X, Globe, Briefcase } from "lucide-react";
import { S } from "@/components/botialertas/types";
import { PeriodoPicker } from "@/components/dashboard/Pickers";
import type { PeriodoSeleccion } from "@/components/dashboard/types";

/**
 * Cabecera de búsqueda del Dashboard — DOS tarjetas lado a lado (reemplaza las
 * 3 barras previas: el ClientePicker del top nav, el ClientLookupBar y el filtro
 * interno del PortfolioTable se consolidan acá).
 *
 *   ┌ Mi cartera (Oppy) ─────────┐  ┌ Fuera de cartera ──────────┐
 *   │ 🔍 nombre o Client ID…     │  │ 🔍 pega un Client ID…       │
 *   │ 📅 rango de fechas ▾       │  │             [ Consultar ]   │
 *   └────────────────────────────┘  └─────────────────────────────┘
 *
 * - "Mi cartera": el buscador filtra la tabla de consumo en vivo (controlado
 *   desde Dashboard); clic en una fila → abre las gráficas. El selector de fechas
 *   define el rango de la tabla Y del drill-down.
 * - "Fuera de cartera": consulta efímera de CUALQUIER Client ID (último año),
 *   sin guardar nada. Misma lógica que el viejo ClientLookupBar.
 *
 * Estilo shell (paleta S, pills violet). No usa shadcn.
 */
export default function DashboardSearchCards({
  filter,
  onFilterChange,
  periodo,
  onPeriodoChange,
  lookupOnSearch,
  lookupOnClear,
  lookupLoading,
  lookupActive,
}: {
  filter: string;
  onFilterChange: (v: string) => void;
  periodo: PeriodoSeleccion;
  onPeriodoChange: (p: PeriodoSeleccion) => void;
  lookupOnSearch: (tci: string) => void;
  lookupOnClear: () => void;
  lookupLoading: boolean;
  lookupActive: boolean;
}) {
  const [lookupVal, setLookupVal] = useState("");

  const submitLookup = () => {
    const id = lookupVal.trim();
    if (!id || lookupLoading) return;
    lookupOnSearch(id);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 14,
        marginBottom: 14,
      }}
    >
      {/* ── Tarjeta 1: Mi cartera (Oppy) ─────────────────────────── */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <Briefcase size={15} color="#7C4DFF" />
          <div>
            <div style={cardTitleStyle}>Cartera Oppy</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Search size={13} style={searchIconStyle} />
            <input
              type="text"
              placeholder="Nombre, Client ID, CSM…"
              value={filter}
              onChange={(e) => onFilterChange(e.target.value)}
              spellCheck={false}
              style={inputStyle}
            />
            {filter && (
              <button
                onClick={() => onFilterChange("")}
                title="Limpiar"
                style={clearInlineStyle}
              >
                <X size={12} />
              </button>
            )}
          </div>
          <PeriodoPicker value={periodo} onChange={onPeriodoChange} />
        </div>
      </div>

      {/* ── Tarjeta 2: Fuera de cartera (lookup externo) ─────────── */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <Globe size={15} color="#7C4DFF" />
          <div>
            <div style={cardTitleStyle}>Fuera de cartera</div>
            <div style={cardSubStyle}>Cualquier Client ID · último año</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <Search size={13} style={searchIconStyle} />
            <input
              type="text"
              placeholder="Pega un TCI… (ej: TCIb4a69497…)"
              value={lookupVal}
              onChange={(e) => setLookupVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitLookup(); }}
              spellCheck={false}
              style={{ ...inputStyle, fontFamily: "ui-monospace, SFMono-Regular, monospace" }}
            />
          </div>
          <button
            onClick={submitLookup}
            disabled={lookupLoading || !lookupVal.trim()}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 999,
              fontSize: 12, fontWeight: 600, flexShrink: 0,
              color: lookupLoading || !lookupVal.trim() ? S.muted : "#FFFFFF",
              background: lookupLoading || !lookupVal.trim()
                ? S.surfaceLo
                : "linear-gradient(135deg, #7C4DFF, #4B6FFF)",
              border: lookupLoading || !lookupVal.trim()
                ? `1px solid ${S.border}`
                : "1px solid rgba(124,77,255,0.5)",
              cursor: lookupLoading || !lookupVal.trim() ? "not-allowed" : "pointer",
              transition: "opacity 0.15s",
            }}
          >
            {lookupLoading
              ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
              : <Search size={13} />}
            <span>{lookupLoading ? "Consultando…" : "Consultar"}</span>
          </button>
          {lookupActive && (
            <button
              onClick={() => { setLookupVal(""); lookupOnClear(); }}
              title="Volver a tu cartera"
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 12px", borderRadius: 999,
                fontSize: 12, fontWeight: 600, flexShrink: 0,
                color: S.muted, background: "transparent",
                border: `1px solid ${S.border}`, cursor: "pointer",
              }}
            >
              <X size={13} />
              <span>Volver</span>
            </button>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

/* ── estilos compartidos ──────────────────────────────────────── */
const cardStyle: React.CSSProperties = {
  background: S.surface,
  border: `1px solid ${S.border}`,
  borderRadius: 14,
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const cardHeaderStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
};
const cardTitleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: S.text,
};
const cardSubStyle: React.CSSProperties = {
  fontSize: 11, color: S.muted, marginTop: 1,
};
const searchIconStyle: React.CSSProperties = {
  position: "absolute", left: 10, top: "50%",
  transform: "translateY(-50%)", color: S.muted, pointerEvents: "none",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  background: S.surfaceLo,
  border: `1px solid ${S.border}`,
  borderRadius: 999,
  color: S.text,
  fontSize: 12,
  padding: "8px 30px 8px 30px",
  outline: "none",
  boxSizing: "border-box",
};
const clearInlineStyle: React.CSSProperties = {
  position: "absolute", right: 8, top: "50%",
  transform: "translateY(-50%)",
  background: "transparent", border: "none", cursor: "pointer",
  color: S.muted, display: "flex", alignItems: "center", padding: 2,
};
