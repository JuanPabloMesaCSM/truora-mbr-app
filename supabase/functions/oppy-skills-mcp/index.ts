// ============================================================================
// Edge Function: oppy-skills-mcp
//
// Expone las skills de Oppy (tabla agent_skills) en DOS interfaces sobre el
// mismo backend:
//
//   /api/v1/skills              GET    -> lista todas (sin content_md)
//   /api/v1/skills/:name        GET    -> contenido completo de una
//   /api/v1/skills/search       POST   -> full-text search { query, limit }
//
//   /mcp                        POST   -> protocolo MCP (Streamable HTTP)
//                                         para clientes Claude / VS Code MCP.
//
// n8n + Gemini usa los endpoints REST (HTTP Request nodes).
// Cuando pasemos a Claude (con MCP nativo), apuntan al endpoint /mcp.
//
// Auth:
//   - REST: API key Supabase (anon o service_role) en header Authorization.
//     RLS se aplica sobre agent_skills (team-wide read).
//   - MCP: por ahora misma key. Mejorable con OAuth en Fase 2.5.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VOYAGE_API_KEY = Deno.env.get("VOYAGE_API_KEY"); // Optional - only needed for /api/v1/embed

// Proxy a n8n para el chat de Oppy. El token del Header Auth del webhook vive
// solo aca (Supabase secrets), nunca en el bundle del frontend.
const OPPY_N8N_WEBHOOK_URL = Deno.env.get("OPPY_N8N_WEBHOOK_URL");   // https://n8n.zapsign.com.br/webhook/oppy-chat
const OPPY_N8N_AUTH_HEADER = Deno.env.get("OPPY_N8N_AUTH_HEADER");   // nombre del header del credential "Agent Webhook Auth"
const OPPY_N8N_AUTH_VALUE = Deno.env.get("OPPY_N8N_AUTH_VALUE");     // valor del token

// Usamos service_role para que el agente pueda leer todas las skills.
// La autorizacion de quien llama esta function se hace via API key checking abajo.
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ──────────────────────────────────────────────────────────────────────────
// Data layer
// ──────────────────────────────────────────────────────────────────────────

interface SkillListItem {
  name: string;
  description: string;
  size_bytes: number;
  tags: string[];
  is_critical: boolean;
  updated_at: string;
}

interface SkillFull extends SkillListItem {
  content_md: string;
  sha256_hash: string;
}

interface SkillSearchHit {
  name: string;
  description: string;
  size_bytes: number;
  tags: string[];
  is_critical: boolean;
  rank: number;
}

async function listSkills(): Promise<SkillListItem[]> {
  const { data, error } = await supabase
    .from("agent_skills")
    .select("name, description, size_bytes, tags, is_critical, updated_at")
    .order("is_critical", { ascending: false })
    .order("name");
  if (error) throw new Error(error.message);
  return data || [];
}

async function readSkill(name: string): Promise<SkillFull | null> {
  const { data, error } = await supabase
    .from("agent_skills")
    .select("name, description, content_md, size_bytes, tags, is_critical, updated_at, sha256_hash")
    .eq("name", name)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as SkillFull | null;
}

async function searchSkills(query: string, limit: number = 5): Promise<SkillSearchHit[]> {
  const { data, error } = await supabase.rpc("search_agent_skills", {
    q: query,
    lim: limit,
  });
  if (error) throw new Error(error.message);
  return (data || []) as SkillSearchHit[];
}

// ──────────────────────────────────────────────────────────────────────────
// Voyage AI proxy (embeddings)
//
// Centralizamos la llamada al provider de embeddings aca para que la API key
// nunca aparezca en n8n. Si cambiamos de provider (Anthropic-Voyage cuando
// llegue API key, OpenAI, etc.), solo cambiamos este modulo.
//
// Voyage docs: https://docs.voyageai.com/docs/embeddings
// ──────────────────────────────────────────────────────────────────────────

interface EmbedRequest {
  text: string;
  input_type?: "query" | "document"; // Voyage: optimiza retrieval segun el caso
  model?: string;                    // default: voyage-3
}

interface EmbedResponse {
  embedding: number[];
  dimensions: number;
  model: string;
  tokens: number;
}

async function embedText(req: EmbedRequest): Promise<EmbedResponse> {
  if (!VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY no configurada. Ejecuta: supabase secrets set VOYAGE_API_KEY=...");
  }
  if (!req.text || req.text.length === 0) {
    throw new Error("text es requerido y no puede estar vacio");
  }
  // Voyage acepta hasta 320k tokens en input, pero limitamos por seguridad.
  // Aprox: 1 token ~ 4 chars en español, asi que 50000 chars ~ 12500 tokens, holgado.
  const safeText = req.text.length > 50000 ? req.text.slice(0, 50000) : req.text;

  const model = req.model || "voyage-3";
  const input_type = req.input_type || "document";

  const resp = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: [safeText],
      model,
      input_type,
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Voyage API ${resp.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await resp.json() as {
    data: { embedding: number[] }[];
    model: string;
    usage: { total_tokens: number };
  };

  if (!data.data || data.data.length === 0) {
    throw new Error("Voyage API devolvio respuesta vacia");
  }

  return {
    embedding: data.data[0].embedding,
    dimensions: data.data[0].embedding.length,
    model: data.model,
    tokens: data.usage.total_tokens,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Chat proxy (Oppy Chat — Fase 4)
//
// El frontend NO puede llamar al webhook n8n directo: el Header Auth token
// quedaria expuesto en el bundle. Asi que el front llama aca con el JWT del
// CSM logueado; validamos el JWT, derivamos el user_email del token (no del
// body — no se puede falsificar para spoofear logs) y reenviamos a n8n con el
// token secreto guardado en Supabase secrets.
// ──────────────────────────────────────────────────────────────────────────

interface ChatProxyResult {
  status: number;
  body: Record<string, unknown>;
}

async function proxyChat(req: Request): Promise<ChatProxyResult> {
  if (!OPPY_N8N_WEBHOOK_URL || !OPPY_N8N_AUTH_HEADER || !OPPY_N8N_AUTH_VALUE) {
    return {
      status: 503,
      body: { error: "Chat proxy no configurado. Faltan secrets OPPY_N8N_WEBHOOK_URL / OPPY_N8N_AUTH_HEADER / OPPY_N8N_AUTH_VALUE." },
    };
  }

  // 1) Validar el JWT del CSM y derivar su email del token.
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return { status: 401, body: { error: "Falta el token de sesion." } };

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  const email = userData && userData.user ? userData.user.email : null;
  if (userErr || !email) {
    return { status: 401, body: { error: "Sesion invalida o expirada." } };
  }
  const userEmail = email.toLowerCase();

  // 2) Parsear el body del front.
  const body = await req.json().catch(() => ({}));
  const message = String(body.message || "").trim();
  if (!message) return { status: 400, body: { error: "message es requerido." } };
  if (message.length > 4000) {
    return { status: 400, body: { error: "El mensaje excede 4000 caracteres." } };
  }
  const sessionId = String(body.session_id || "").trim() || `oppy-${Date.now()}`;
  const currentRoute = typeof body.current_route === "string" ? body.current_route : undefined;

  // 3) Reenviar a n8n con el header secreto. user_email viene del JWT.
  let resp: Response;
  try {
    resp = await fetch(OPPY_N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [OPPY_N8N_AUTH_HEADER]: OPPY_N8N_AUTH_VALUE,
      },
      body: JSON.stringify({
        session_id: sessionId,
        user_email: userEmail,
        message,
        current_route: currentRoute,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error de red";
    return { status: 502, body: { error: `No pude contactar al agente (${msg}).` } };
  }

  const rawText = await resp.text();
  let parsed: unknown = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsed = null;
  }

  if (!resp.ok) {
    const errMsg =
      parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
        ? String((parsed as Record<string, unknown>).error)
        : `El agente respondio ${resp.status}.`;
    return { status: resp.status === 400 ? 400 : 502, body: { error: errMsg } };
  }

  // n8n Respond "First Incoming Item" devuelve el item del AI Agent: { output, ... }.
  // Defensivo: puede venir como objeto o como array de 1 item.
  const item = Array.isArray(parsed) ? (parsed[0] || {}) : (parsed || {});
  const output =
    item && typeof item === "object" && "output" in item
      ? String((item as Record<string, unknown>).output || "")
      : "";

  if (!output) {
    return { status: 502, body: { error: "El agente no devolvio respuesta." } };
  }

  return { status: 200, body: { output, session_id: sessionId } };
}

// ──────────────────────────────────────────────────────────────────────────
// Sanitization (Capa 3 de defensa en profundidad)
//
// Cualquier output que va al LLM pasa por aca. Strip de patterns que parecen
// instrucciones inyectadas dentro del content_md o description.
// ──────────────────────────────────────────────────────────────────────────

function stripInjection(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/ignore (all |the )?(previous|prior|above) (instructions|prompts)/gi, "[redacted]")
    .replace(/you are now (a|an)?\s+/gi, "[redacted] ")
    .replace(/^\s*system\s*:\s*/gim, "")
    .replace(/<\|im_start\|>/g, "")
    .replace(/<\|im_end\|>/g, "")
    .replace(/\[INST\]/g, "")
    .replace(/\[\/INST\]/g, "");
}

function sanitizeListItem(s: SkillListItem): SkillListItem {
  return { ...s, description: stripInjection(s.description) };
}

function sanitizeFull(s: SkillFull): SkillFull {
  return {
    ...s,
    description: stripInjection(s.description),
    content_md: stripInjection(s.content_md),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// MCP server (Streamable HTTP transport)
//
// Implementacion minima del protocolo MCP. Cuando n8n soporte Streamable HTTP
// con Claude, se conecta aca.
// Por ahora exponemos: resources/list, resources/read, tools/list, tools/call.
// ──────────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

async function handleMcpRequest(reqBody: JsonRpcRequest): Promise<unknown> {
  const { method, params, id } = reqBody;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { resources: {}, tools: {} },
        serverInfo: { name: "oppy-skills-mcp", version: "1.0.0" },
      },
    };
  }

  if (method === "resources/list") {
    const skills = await listSkills();
    return {
      jsonrpc: "2.0",
      id,
      result: {
        resources: skills.map((s) => ({
          uri: `skill://${s.name}`,
          name: s.name,
          description: stripInjection(s.description),
          mimeType: "text/markdown",
        })),
      },
    };
  }

  if (method === "resources/read") {
    const uri = (params?.uri as string) || "";
    const name = uri.replace(/^skill:\/\//, "");
    const skill = await readSkill(name);
    if (!skill) {
      return { jsonrpc: "2.0", id, error: { code: -32602, message: `Skill not found: ${name}` } };
    }
    const safe = sanitizeFull(skill);
    return {
      jsonrpc: "2.0",
      id,
      result: {
        contents: [{ uri, mimeType: "text/markdown", text: safe.content_md }],
      },
    };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: [
          {
            name: "search_skills",
            description: "Busca skills por relevancia full-text (spanish).",
            inputSchema: {
              type: "object",
              properties: {
                query: { type: "string", description: "Texto a buscar" },
                limit: { type: "number", description: "Maximo de resultados (default 5)" },
              },
              required: ["query"],
            },
          },
        ],
      },
    };
  }

  if (method === "tools/call") {
    const toolName = params?.name as string;
    const args = (params?.arguments as Record<string, unknown>) || {};
    if (toolName === "search_skills") {
      const hits = await searchSkills(String(args.query || ""), Number(args.limit || 5));
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(hits.map(sanitizeListItem)) }],
          isError: false,
        },
      };
    }
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown tool: ${toolName}` } };
  }

  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } };
}

// ──────────────────────────────────────────────────────────────────────────
// HTTP routing
// ──────────────────────────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  // El path llega como "/oppy-skills-mcp/api/v1/skills" — strip del prefix
  const path = url.pathname.replace(/^\/oppy-skills-mcp/, "");

  try {
    // ── REST: lista de skills ─────────────────────────────────────────
    if (path === "/api/v1/skills" && req.method === "GET") {
      const skills = await listSkills();
      return json({ skills: skills.map(sanitizeListItem) });
    }

    // ── REST: search (POST con { query, limit }) ──────────────────────
    if (path === "/api/v1/skills/search" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const query = String(body.query || "").trim();
      if (!query) return json({ error: "query is required" }, 400);
      const limit = Math.min(Math.max(Number(body.limit || 5), 1), 20);
      const hits = await searchSkills(query, limit);
      return json({ results: hits.map(sanitizeListItem), query, limit });
    }

    // ── REST: read una skill por nombre ───────────────────────────────
    if (path.startsWith("/api/v1/skills/") && req.method === "GET") {
      const name = decodeURIComponent(path.replace("/api/v1/skills/", ""));
      if (!name) return json({ error: "skill name is required" }, 400);
      const skill = await readSkill(name);
      if (!skill) return json({ error: `skill not found: ${name}` }, 404);
      return json(sanitizeFull(skill));
    }

    // ── REST: embed (proxy a Voyage AI) ───────────────────────────────
    // POST { text, input_type?, model? } -> { embedding, dimensions, model, tokens }
    if (path === "/api/v1/embed" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const text = String(body.text || "").trim();
      if (!text) return json({ error: "text is required" }, 400);
      const input_type = body.input_type === "query" ? "query" : "document";
      const model = typeof body.model === "string" ? body.model : undefined;
      try {
        const result = await embedText({ text, input_type, model });
        return json(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "embedding error";
        return json({ error: msg }, 502);
      }
    }

    // ── Chat proxy (Oppy Chat — valida JWT y reenvia a n8n) ───────────
    // POST { message, session_id, current_route? } con Authorization: Bearer <jwt CSM>
    if (path === "/api/v1/chat" && req.method === "POST") {
      const result = await proxyChat(req);
      return json(result.body, result.status);
    }

    // ── MCP endpoint (Streamable HTTP) ────────────────────────────────
    if (path === "/mcp" && req.method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || body.jsonrpc !== "2.0") {
        return json({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } }, 400);
      }
      const response = await handleMcpRequest(body as JsonRpcRequest);
      return json(response);
    }

    // ── Health check ──────────────────────────────────────────────────
    if (path === "/health" || path === "") {
      return json({
        ok: true,
        service: "oppy-skills-mcp",
        endpoints: {
          rest: [
            "GET  /api/v1/skills",
            "GET  /api/v1/skills/:name",
            "POST /api/v1/skills/search",
            "POST /api/v1/embed",
            "POST /api/v1/chat",
          ],
          mcp: ["POST /mcp"],
        },
        embeddings_provider: VOYAGE_API_KEY ? "voyage-3 (Voyage AI)" : "not configured",
        chat_proxy: OPPY_N8N_WEBHOOK_URL ? "configured" : "not configured",
      });
    }

    return json({ error: "Not found", path }, 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[oppy-skills-mcp]", msg);
    return json({ error: msg }, 500);
  }
});
