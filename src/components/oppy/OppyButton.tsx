import { useState } from "react";
import { Sparkles } from "lucide-react";
import { OppyChatDrawer } from "./OppyChatDrawer";
import { OPPY_COLORS } from "./types";

interface Props {
  userEmail: string;
  currentRoute?: string;
}

/* Componente todo-en-uno: pill para el TopBar + drawer asociado.
   Cada pagina lo importa una vez en su top bar. */
export function OppyButton({ userEmail, currentRoute }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Preguntale a Oppy sobre el catalogo de queries"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 12, fontWeight: 600,
          color: OPPY_COLORS.primary,
          background: OPPY_COLORS.bgPill,
          border: `1px solid ${OPPY_COLORS.borderPill}`,
          cursor: "pointer", padding: "6px 12px",
          borderRadius: 999, transition: "all 0.15s",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = "rgba(167,139,250,0.18)";
          e.currentTarget.style.borderColor = "rgba(167,139,250,0.45)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = OPPY_COLORS.bgPill;
          e.currentTarget.style.borderColor = OPPY_COLORS.borderPill;
        }}
      >
        <Sparkles size={13} />
        <span>Oppy</span>
        <span style={{
          fontSize: 9, fontWeight: 700,
          color: "#FBBF24",
          background: "rgba(251,191,36,0.15)",
          border: "1px solid rgba(251,191,36,0.35)",
          borderRadius: 999, padding: "0 6px",
          marginLeft: 2, letterSpacing: "0.04em",
        }}>BETA</span>
      </button>

      <OppyChatDrawer
        open={open}
        onClose={() => setOpen(false)}
        userEmail={userEmail}
        currentRoute={currentRoute}
      />
    </>
  );
}
