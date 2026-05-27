/* Tipos compartidos para el chat con Oppy. */

export type Role = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  /** Cuando viene de un tool intermedio en n8n. Opcional, solo se renderiza si MOCK_MODE o debug. */
  toolName?: string;
}

/* El webhook n8n maneja el historial conversacional server-side (Postgres Chat
   Memory keyed por session_id), asi que el front manda solo el ultimo mensaje.
   user_email NO se manda: lo deriva la Edge Function del JWT del CSM. */
export interface OppyChatRequest {
  message: string;
  session_id: string;
  current_route?: string;
}

export interface OppyChatResponse {
  output: string;
  session_id?: string;
  error?: string;
}

/* Paleta para Oppy — toma de feedback_csm_center_shell_style.
   Color principal: violet/lavender. Para diferenciarse de Queries (más violet), va con un toque cyan. */
export const OPPY_COLORS = {
  primary: "#A78BFA",          // violet light (consistente con Queries pill)
  accent:  "#7C4DFF",          // truora violet
  glow:    "rgba(167,139,250,0.30)",
  bgPill:  "rgba(167,139,250,0.10)",
  borderPill: "rgba(167,139,250,0.30)",
} as const;

export const SHELL = {
  surface:   "#172840",
  surfaceHi: "#1B2F4D",
  border:    "rgba(255,255,255,0.09)",
  text:      "#EEF0FF",
  muted:     "#8892B8",
  dim:       "#4A5580",
} as const;
