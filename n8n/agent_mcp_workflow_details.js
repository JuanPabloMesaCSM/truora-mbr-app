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
//   4. Aplica redactSecrets() recursivamente para borrar credentials/tokens/etc.
//   5. Devuelve { ok, workflow_id, workflow_name, nodes_count, workflow, latency_ms }.
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
  const setItem = $('Set: Build MCP Body').first().json;
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

const nodesCount = Array.isArray(wf.nodes) ? wf.nodes.length : 0;

// ============================================================
// 4. Redact secrets recursivamente
// ============================================================
const sanitizedWorkflow = redactSecrets(wf);

return [{
  json: {
    ok: true,
    workflow_id: workflowIdReq || wf.id || null,
    workflow_name: wf.name || null,
    nodes_count: nodesCount,
    workflow: sanitizedWorkflow,
    latency_ms: Date.now() - startedAt,
  }
}];
