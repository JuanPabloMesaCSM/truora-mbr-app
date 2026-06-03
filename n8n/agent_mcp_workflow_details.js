// agent_mcp_workflow_details.js
// Code node — sub-workflow "Oppy Tool: get_workflow_details"
// DESPUES del HTTP Request al MCP zapsign.
// Mode: Run Once for All Items.
//
// El sub-workflow recibe { workflow_id } via Execute Workflow Trigger.
// El nodo previo (Set: Build MCP Body) arma el JSON-RPC y guarda started_at.
// El HTTP Request al MCP devuelve SSE doble-anidado en text/event-stream.
//
// Este Code:
//   1. Lee el body raw del HTTP (string SSE) y started_at del Set.
//   2. Parsea SSE: split por "data: " → JSON.parse() del JSON-RPC.
//   3. Lee result.content[0].text → JSON.parse() del JSON anidado del workflow.
//   4. Construye un RESUMEN COMPACTO de nodos (no el workflow entero) para no
//      saturar el rate limit de input tokens del LLM.
//      Por nodo: { name, type } siempre, mas campos especificos segun tipo
//      (sql en Snowflake, code en Code, method+url en HTTP, etc.) con cap por
//      campo y guard de tamano total.
//   5. Aplica redactSecrets() recursivamente sobre lo extraido.
//   6. Devuelve { ok, workflow_id, workflow_name, nodes_count, nodes, latency_ms,
//      truncated? }.
//
// Si algo falla devuelve { ok: false, error } con detalle para que el AI Agent
// se auto-corrija.

// ============================================================
// redactSecrets — recorre un objeto recursivamente y reemplaza
// valores con [REDACTED] cuando la KEY matchea patrones de secret.
// ============================================================
const SECRET_KEY_REGEX = /credentials?|token|apikey|api_key|secret|password|bearer|authorization/i;

function redactSecrets(obj, depth) {
  depth = depth || 0;
  if (depth > 20) return '[MAX_DEPTH]'; // safety
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(function(item) { return redactSecrets(item, depth + 1); });
  }

  const out = {};
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    if (SECRET_KEY_REGEX.test(key)) {
      // Redact ENTIRE subtree under this key — no peek
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactSecrets(obj[key], depth + 1);
    }
  }
  return out;
}

// ============================================================
// Main
// ============================================================
const item = $input.first().json;

// started_at del Set previo (rehidratado por posicion)
let startedAt = Date.now();
let workflowIdReq = '';
try {
  const setItem = $('Code: Build MCP Body').first().json;
  startedAt = setItem.started_at || Date.now();
  workflowIdReq = setItem.workflow_id || '';
} catch (_) {
  // Fallback si el nodo previo tiene otro nombre — leer del input directo
  startedAt = item.started_at || Date.now();
  workflowIdReq = item.workflow_id || '';
}

// El body raw del HTTP llega en distintas keys segun n8n version + responseFormat.
const responseRaw =
  typeof item.body === 'string' ? item.body
  : typeof item.data === 'string' ? item.data
  : typeof item.response === 'string' ? item.response
  : (item.json && typeof item.json === 'string') ? item.json
  : '';

if (!responseRaw || typeof responseRaw !== 'string') {
  return [{
    json: {
      ok: false,
      error: 'MCP response vacia o no es string. Verificar HTTP Options -> Response -> Response Format = Text.',
      received_keys: Object.keys(item).slice(0, 10),
      latency_ms: Date.now() - startedAt,
    }
  }];
}

// ============================================================
// 1. Split SSE doble-anidado: "event: message\ndata: {...}\n\n"
// ============================================================
const dataIdx = responseRaw.indexOf('data: ');
if (dataIdx < 0) {
  return [{
    json: {
      ok: false,
      error: 'MCP response no contiene "data: " marker. Posiblemente no es SSE.',
      sample: responseRaw.slice(0, 300),
      latency_ms: Date.now() - startedAt,
    }
  }];
}

const afterData = responseRaw.slice(dataIdx + 6);
const newlineIdx = afterData.indexOf('\n');
const ssePayload = (newlineIdx >= 0 ? afterData.slice(0, newlineIdx) : afterData).trim();

if (!ssePayload) {
  return [{
    json: {
      ok: false,
      error: 'SSE payload vacio despues de "data: "',
      latency_ms: Date.now() - startedAt,
    }
  }];
}

// ============================================================
// 2. Parse JSON-RPC envelope
// ============================================================
let jsonRpc;
try {
  jsonRpc = JSON.parse(ssePayload);
} catch (e) {
  return [{
    json: {
      ok: false,
      error: 'Error parseando JSON-RPC: ' + e.message,
      sample: ssePayload.slice(0, 300),
      latency_ms: Date.now() - startedAt,
    }
  }];
}

if (jsonRpc.error) {
  return [{
    json: {
      ok: false,
      error: 'MCP devolvio error JSON-RPC: ' + JSON.stringify(jsonRpc.error).slice(0, 500),
      workflow_id: workflowIdReq,
      latency_ms: Date.now() - startedAt,
    }
  }];
}

// ============================================================
// 3. Extract anidado: result.content[0].text es STRING con el JSON
// del workflow.
// ============================================================
const innerJsonString =
  jsonRpc.result &&
  jsonRpc.result.content &&
  jsonRpc.result.content[0] &&
  jsonRpc.result.content[0].text;

if (!innerJsonString || typeof innerJsonString !== 'string') {
  return [{
    json: {
      ok: false,
      error: 'Estructura JSON-RPC inesperada: falta result.content[0].text',
      received: JSON.stringify(jsonRpc).slice(0, 300),
      latency_ms: Date.now() - startedAt,
    }
  }];
}

let workflowData;
try {
  workflowData = JSON.parse(innerJsonString);
} catch (e) {
  return [{
    json: {
      ok: false,
      error: 'Error parseando JSON anidado del workflow: ' + e.message,
      sample: innerJsonString.slice(0, 300),
      latency_ms: Date.now() - startedAt,
    }
  }];
}

// MCP devuelve a veces { workflow: {...} } y a veces el workflow directo.
const wf = workflowData.workflow || workflowData;

if (!wf || typeof wf !== 'object') {
  return [{
    json: {
      ok: false,
      error: 'Workflow data no es objeto valido',
      keys: Object.keys(workflowData || {}).slice(0, 10),
      latency_ms: Date.now() - startedAt,
    }
  }];
}

const nodesArr = Array.isArray(wf.nodes) ? wf.nodes : [];
const nodesCount = nodesArr.length;

// ============================================================
// 4. Resumen compacto por nodo (evita devolver el workflow entero ~220KB
//    que satura el rate limit de input tokens del LLM).
// ============================================================
const MAX_FIELD_CHARS = 12000;   // por campo (SQL, code) — alcanza para queries Report Builder 2-9 KB
const MAX_TOTAL_CHARS = 80000;   // payload total — ~20k tokens, dentro del tier 1 (30k/min)

function trunc(s, n) {
  if (typeof s !== 'string') return s;
  if (s.length <= n) return s;
  return s.slice(0, n) + '... [TRUNCATED ' + (s.length - n) + ' chars]';
}

function summarizeNode(node) {
  const out = { name: node.name || null, type: node.type || null };
  if (node.disabled) out.disabled = true;
  const p = node.parameters || {};
  const t = node.type || '';

  if (t === 'n8n-nodes-base.snowflake') {
    if (p.query) out.sql = trunc(String(p.query), MAX_FIELD_CHARS);
    if (p.operation) out.operation = p.operation;
  } else if (t === 'n8n-nodes-base.code') {
    if (p.jsCode) out.code = trunc(String(p.jsCode), MAX_FIELD_CHARS);
    else if (p.pythonCode) out.code = trunc(String(p.pythonCode), MAX_FIELD_CHARS);
    if (p.mode) out.mode = p.mode;
    if (p.language) out.language = p.language;
  } else if (t === 'n8n-nodes-base.httpRequest') {
    if (p.method) out.method = p.method;
    if (p.url) out.url = trunc(String(p.url), 500);
    if (p.responseFormat) out.response_format = p.responseFormat;
  } else if (t === 'n8n-nodes-base.set') {
    if (p.values && p.values.string && Array.isArray(p.values.string)) {
      out.fields = p.values.string.map(function(v) { return v && v.name; }).filter(Boolean);
    } else if (p.assignments && p.assignments.assignments && Array.isArray(p.assignments.assignments)) {
      out.fields = p.assignments.assignments.map(function(a) { return a && a.name; }).filter(Boolean);
    }
  } else if (t === 'n8n-nodes-base.if') {
    if (p.conditions && p.conditions.conditions && Array.isArray(p.conditions.conditions)) {
      out.conditions_count = p.conditions.conditions.length;
    }
  } else if (t === 'n8n-nodes-base.switch') {
    if (p.rules && p.rules.rules && Array.isArray(p.rules.rules)) {
      out.rules_count = p.rules.rules.length;
    }
  } else if (t === 'n8n-nodes-base.webhook') {
    if (p.path) out.path = p.path;
    if (p.httpMethod) out.method = p.httpMethod;
    if (p.responseMode) out.response_mode = p.responseMode;
  } else if (t === 'n8n-nodes-base.respondToWebhook') {
    if (p.respondWith) out.respond_with = p.respondWith;
    if (p.responseCode) out.response_code = p.responseCode;
  } else if (t === 'n8n-nodes-base.scheduleTrigger') {
    if (p.rule) out.schedule = p.rule;
  } else if (t === 'n8n-nodes-base.executeWorkflowTrigger') {
    if (p.inputSource) out.input_source = p.inputSource;
  } else if (t === '@n8n/n8n-nodes-langchain.agent') {
    if (p.options && p.options.systemMessage) out.system_message = trunc(String(p.options.systemMessage), MAX_FIELD_CHARS);
    if (p.promptType) out.prompt_type = p.promptType;
  }
  return out;
}

let compactNodes = nodesArr.map(summarizeNode);

// Defensa en profundidad: redactSecrets sobre lo extraido por si algo se cuela.
compactNodes = redactSecrets(compactNodes);

// Guard de tamano total: si el payload aun excede el cap, trimear progresivamente
// los campos grandes (sql/code/system_message) desde el ultimo nodo hacia atras.
let truncatedFlag = false;
let payloadCore = {
  ok: true,
  workflow_id: workflowIdReq || wf.id || null,
  workflow_name: wf.name || null,
  nodes_count: nodesCount,
  nodes: compactNodes,
  latency_ms: Date.now() - startedAt,
};
let stringified = JSON.stringify(payloadCore);
if (stringified.length > MAX_TOTAL_CHARS) {
  for (let i = compactNodes.length - 1; i >= 0; i--) {
    const n = compactNodes[i];
    let touched = false;
    if (typeof n.sql === 'string' && n.sql.length > 1000) { n.sql = trunc(n.sql, 1000); touched = true; }
    if (typeof n.code === 'string' && n.code.length > 500) { n.code = trunc(n.code, 500); touched = true; }
    if (typeof n.system_message === 'string' && n.system_message.length > 1000) { n.system_message = trunc(n.system_message, 1000); touched = true; }
    if (touched) {
      truncatedFlag = true;
      stringified = JSON.stringify(payloadCore);
      if (stringified.length <= MAX_TOTAL_CHARS) break;
    }
  }
  if (truncatedFlag) payloadCore.truncated = true;
}

return [{ json: payloadCore }];
