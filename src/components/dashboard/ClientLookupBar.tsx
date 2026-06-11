import { useState } from "react";
import { Search, Loader2, X, Globe } from "lucide-react";
import { S } from "@/components/botialertas/types";

/**
 * Barra de consulta efímera por Client ID — vive arriba de la tabla portfolio
 * en el panel principal del Dashboard. Permite pegar CUALQUIER TCI (aunque no
 * esté en la cartera del CSM) y ver su consumo por sub-producto sin guardar
 * nada en la base. Es el preview rápido de "qué consume / qué hace" un cliente
 * que te preguntan y no manejás.
 *
 * Estilo shell (paleta S, pill violet). No usa shadcn.
 */
export default function ClientLookupBar({
  onSearch,
  onClear,
  loading,
  active,
}: {
  onSearch: (tci: string) => void;
  onClear: () => void;
  loading: boolean;
  active: boolean;
}) {
  const [val, setVal] = useState("");

  const submit = () => {
    const id = val.trim();
    if (!id || loading) return;
    onSearch(id);
  };

  return (
    <div
      style={{
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: 14,
        padding: "12px 16px",
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <Globe size={15} color="#7C4DFF" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: S.text }}>
            Consultar cualquier Client ID
          </div>
          <div style={{ fontSize: 11, color: S.muted, marginTop: 1 }}>
            Fuera de tu cartera · último año
          </div>
        </div>
      </div>

      <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
        <Search
          size={13}
          style={{
            position: "absolute", left: 10, top: "50%",
            transform: "translateY(-50%)", color: S.muted, pointerEvents: "none",
          }}
        />
        <input
          type="text"
          placeholder="Pega un TCI… (ej: TCIb4a69497cd6a328e720702723c18639a)"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          spellCheck={false}
          style={{
            width: "100%",
            background: S.surfaceLo,
            border: `1px solid ${S.border}`,
            borderRadius: 999,
            color: S.text,
            fontSize: 12,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            padding: "8px 12px 8px 30px",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      <button
        onClick={submit}
        disabled={loading || !val.trim()}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 16px", borderRadius: 999,
          fontSize: 12, fontWeight: 600,
          color: loading || !val.trim() ? S.muted : "#FFFFFF",
          background: loading || !val.trim()
            ? S.surfaceLo
            : "linear-gradient(135deg, #7C4DFF, #4B6FFF)",
          border: loading || !val.trim()
            ? `1px solid ${S.border}`
            : "1px solid rgba(124,77,255,0.5)",
          cursor: loading || !val.trim() ? "not-allowed" : "pointer",
          flexShrink: 0,
          transition: "opacity 0.15s",
        }}
      >
        {loading
          ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
          : <Search size={13} />}
        <span>{loading ? "Consultando…" : "Consultar"}</span>
      </button>

      {active && (
        <button
          onClick={() => { setVal(""); onClear(); }}
          title="Volver a tu cartera"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 999,
            fontSize: 12, fontWeight: 600,
            color: S.muted, background: "transparent",
            border: `1px solid ${S.border}`, cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <X size={13} />
          <span>Volver a mi cartera</span>
        </button>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
