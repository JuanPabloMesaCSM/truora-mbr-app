import { useCallback, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Message, OppyChatRequest, OppyChatResponse } from "@/components/oppy/types";

/* Toggle de desarrollo: MOCK_MODE devuelve respuestas hardcoded (heuristica
   simple) sin pegarle al backend. En produccion va false → llama a la Edge
   Function oppy-skills-mcp /api/v1/chat, que valida el JWT del CSM y reenvia
   al webhook n8n con el token secreto server-side. */
const MOCK_MODE = false;

/* Endpoint: la Edge Function actua de proxy con auth (NO el webhook n8n directo,
   para no exponer el Header Auth token en el bundle). */
const CHAT_ENDPOINT =
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oppy-skills-mcp/api/v1/chat`;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function makeSessionId(): string {
  return `oppy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface UseOppyChatOptions {
  userEmail: string;
  currentRoute?: string;
}

export function useOppyChat({ userEmail, currentRoute }: UseOppyChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef(makeSessionId());

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: Message = {
        id: makeMessageId(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);
      setLoading(true);
      setError(null);

      try {
        let replyText: string;

        if (MOCK_MODE) {
          replyText = await mockReply(trimmed);
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error("Sesión no encontrada. Iniciá sesión de nuevo.");

          const payload: OppyChatRequest = {
            message: trimmed,
            session_id: sessionId.current,
            current_route: currentRoute,
          };
          const res = await fetch(CHAT_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          });
          const data: OppyChatResponse = await res
            .json()
            .catch(() => ({ output: "", error: "Respuesta inválida del servidor." }));
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          replyText = data.output || "No recibí respuesta del agente.";
        }

        const assistantMsg: Message = {
          id: makeMessageId(),
          role: "assistant",
          content: replyText,
          createdAt: Date.now(),
        };
        setMessages(prev => [...prev, assistantMsg]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Error desconocido";
        setError(msg);
        const errorMsg: Message = {
          id: makeMessageId(),
          role: "assistant",
          content: `⚠ No pude responder en este momento (${msg}). Intentalo de nuevo en unos segundos.`,
          createdAt: Date.now(),
        };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        setLoading(false);
      }
    },
    [loading, currentRoute]
  );

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    sessionId.current = makeSessionId();
  }, []);

  const isMock = useMemo(() => MOCK_MODE, []);

  return { messages, loading, error, send, reset, isMock, sessionId: sessionId.current };
}

/* Respuestas mockeadas - heuristica simple para dev. Reemplazar cuando el webhook este listo. */
async function mockReply(text: string): Promise<string> {
  await sleep(700 + Math.random() * 600);
  const low = text.toLowerCase();

  if (/funnel\s+di|embudo\s+di/.test(low)) {
    return [
      "Encontre 2 queries del funnel DI en el catalogo:",
      "",
      "- `sf_di_funnel` — Embudo completo de conversion DI (inicia → exitosa).",
      "- `sf_di_validaciones_doc_rostro` — Desglose documento vs rostro.",
      "",
      "¿Cual querés ver en detalle?",
    ].join("\n");
  }

  if (/sf_di_funnel|funnel.*sql/.test(low) || /muestra.*funnel/.test(low)) {
    return [
      "Acá tenés `sf_di_funnel`:",
      "",
      "```sql",
      "WITH params AS (",
      "  SELECT CAST('<<FECHA_YYYY-MM-DD>>' AS DATE) AS mes_actual_inicio,",
      "         CAST('<<FECHA_YYYY-MM-DD>>' AS DATE) AS mes_actual_fin",
      "),",
      "procesos AS (",
      "  SELECT ip.PROCESS_ID, ip.STATUS, ...",
      "  FROM TRUORA.TRUORA_SCHEMA.IDENTITY_PROCESSES ip",
      "  WHERE ip.CLIENT_ID = '<<TCI_DEL_CLIENTE>>'",
      "    AND CAST(ip.CREATION_DATE AS DATE) BETWEEN ...",
      "),",
      "-- ... (CTEs aggregaciones)",
      "SELECT * FROM bloque6;",
      "```",
      "",
      "Tenés que reemplazar:",
      "- `<<TCI_DEL_CLIENTE>>` con el TCI del cliente",
      "- `<<FECHA_YYYY-MM-DD>>` con primer y último día del rango",
      "",
      "Tip: el botón `→ Snowflake` en `/queries` ya te lo deja listo para copiar.",
    ].join("\n");
  }

  if (/consumo|factur|cuanto.*pago|pexto.*may/.test(low)) {
    return [
      "Para consumo facturable usá los endpoints ClickHouse — son la fuente oficial desde dic-2025.",
      "",
      "- BGC → `ch_bgc_resumen` (completados del mes, = front del cliente)",
      "- CE  → `ch_ce_consumo` (outbound/notif/inbound del mes)",
      "- DI  → `ch_di_consumo_facturable` (validaciones billables, rescata también clientes standalone)",
      "",
      "¿De qué producto y cliente necesitás el dato?",
    ].join("\n");
  }

  if (/bgc|background|check/.test(low)) {
    return [
      "El catálogo tiene 8 queries BGC del Report Builder + 3 endpoints ClickHouse facturables. Las más usadas:",
      "",
      "- `ch_bgc_resumen` — Completados BGC del mes (= lo que ve el cliente en su factura).",
      "- `sf_bgc_resumen_general` — Resumen general checks (incluye score y pass_rate — solo Snowflake).",
      "- `ch_bgc_pais_tipo` — Desglose por país y tipo de check (facturable).",
      "- `ch_bgc_historico` — Completados BGC últimos 4 meses (tendencia).",
      "",
      "¿Cuál te interesa o querés que listemos todas?",
    ].join("\n");
  }

  if (/ce\b|whatsapp|inbound|outbound|conversacion/.test(low)) {
    return [
      "El catálogo tiene 9 queries CE Global + 3 CE por flujo + 4 endpoints ClickHouse facturables. Las más útiles:",
      "",
      "- `ch_ce_consumo` — Total mensajes outbound/notif/inbound del mes (= factura).",
      "- `ch_ce_tendencia` — Tendencia mensual CE (6 meses, zero-fill).",
      "- `sf_ce_eficiencia_campanas` — Tasa de entrega y lectura por campaña (Snowflake).",
      "- `sf_ce_desempeno_agentes` — Métricas de agentes humanos con medianas en horas.",
      "",
      "¿Algo en especifico?",
    ].join("\n");
  }

  if (/hola|buenas|hi\b|hey/.test(low)) {
    return "Hola! Soy Oppy, te ayudo a encontrar queries del catalogo. Probá preguntandome cosas como:\n\n- *funnel DI*\n- *consumo facturable de un cliente*\n- *queries BGC*\n- *muestrame el SQL de sf_ce_consumo_total*";
  }

  if (/ayuda|help|que pod|que sabes/.test(low)) {
    return [
      "Por ahora puedo:",
      "",
      "1. Buscar queries del catálogo (`/queries`) por nombre/producto/descripción.",
      "2. Mostrarte el SQL exacto de cualquier entry.",
      "3. Explicarte qué placeholders reemplazar antes de correr en Snowflake.",
      "",
      "Todavía NO ejecuto SQL ni saco números reales — solo te ayudo a llegar a la query correcta.",
    ].join("\n");
  }

  return [
    "Estoy en modo demo todavía (el backend del agente aún no está conectado).",
    "",
    "Cuando JP conecte el workflow n8n, voy a poder buscar entries reales del catalogo y mostrarte el SQL exacto.",
    "",
    "Mientras tanto, probá frases como: *funnel DI*, *consumo facturable*, *queries BGC*.",
  ].join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
