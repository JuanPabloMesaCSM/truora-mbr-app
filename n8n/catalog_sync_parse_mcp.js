// catalog_sync_parse_mcp.js
//
// Code node: parsea la respuesta SSE doble-anidada del MCP nativo de n8n
// (ver memoria reference_n8n_mcp_zapsign.md) y extrae el SQL del/los
// nodo/s Snowflake del workflow remoto + calcula SHA-256.
//
// Input (por item):
//   $json.workflow_id    string -- ID del workflow remoto (ej "aJTbPA3uXIHUUdjo")
//   $json.workflow_name  string -- nombre legible para mensajes de error
//   $json.data           string -- response raw del HTTP Request al MCP
//                                   (text/event-stream, Response Format = Text)
//
// Output (por item):
//   workflow_id              string
//   workflow_name            string (lo que vino del Set node)
//   workflow_name_remoto     string (lo que el MCP reporto)
//   sql_completo_remoto      string -- SQL del/los nodo/s Snowflake concatenado
//   sql_hash_remoto          string -- SHA256 hex del SQL (64 chars)
//   sf_nodes_count           number -- cuantos nodos Snowflake tenia el workflow

// =========================================================================
// SHA-256 puro JS (sin require('crypto') ni globalThis.crypto.subtle, que
// n8n bloquea en su sandbox). Implementacion estandar NIST FIPS 180-4.
// =========================================================================

function rotr(n, x) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function sha256Hex(message) {
  const msgBytes = new TextEncoder().encode(message);
  const msgLen = msgBytes.length;
  const bitLen = msgLen * 8;

  // Padding: append 0x80, then zeros, then 64-bit big-endian length
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(msgBytes);
  padded[msgLen] = 0x80;
  const dv = new DataView(padded.buffer);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  dv.setUint32(paddedLen - 8, hi, false);
  dv.setUint32(paddedLen - 4, lo, false);

  // Initial hash values (first 32 bits of fractional parts of square roots of first 8 primes)
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  // Round constants (first 32 bits of fractional parts of cube roots of first 64 primes)
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  const W = new Uint32Array(64);

  for (let chunkStart = 0; chunkStart < paddedLen; chunkStart += 64) {
    for (let i = 0; i < 16; i++) {
      W[i] = dv.getUint32(chunkStart + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(7, W[i - 15]) ^ rotr(18, W[i - 15]) ^ (W[i - 15] >>> 3);
      const s1 = rotr(17, W[i - 2]) ^ rotr(19, W[i - 2]) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }

    let a = H[0], b = H[1], c = H[2], d = H[3];
    let e = H[4], f = H[5], g = H[6], h = H[7];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }

  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += H[i].toString(16).padStart(8, '0');
  }
  return hex;
}

// =========================================================================
// Parser principal
// =========================================================================

const out = [];
const items = $input.all();

// El HTTP Request del nodo 4 (MCP get_workflow_details) pisa $json con la
// respuesta SSE, asi que workflow_id / workflow_name del Set Node original
// se pierden. Los rehidratamos por posicion desde el nodo "Set: Workflow List".
// n8n preserva el orden de items entre nodos secuenciales.
let setItems = [];
try {
  setItems = $('Set: Workflow List').all();
} catch (_) {
  // Si el nodo se llama distinto, fallback: leer del $json (puede ser undefined)
  setItems = [];
}

for (let idx = 0; idx < items.length; idx++) {
  const item = items[idx];
  const setItem = setItems[idx] && setItems[idx].json ? setItems[idx].json : {};

  // Rehidratar desde el Set Node, con fallback a $json por si el HTTP los preservo
  const workflowId   = setItem.workflow_id   || item.json.workflow_id;
  const workflowName = setItem.workflow_name || item.json.workflow_name || '(sin nombre local)';

  if (!workflowId) {
    throw new Error(
      `Item ${idx}: no se pudo recuperar workflow_id. ` +
      `Verificar que el nodo Code de la lista se llame exactamente "Set: Workflow List". ` +
      `Si tiene otro nombre, cambiar el string en $('NombreExacto').all()`
    );
  }

  // n8n entrega el body bajo data/body segun configuracion del HTTP Request
  const responseRaw =
    typeof item.json.body === 'string' ? item.json.body
    : typeof item.json.data === 'string' ? item.json.data
    : typeof item.json.response === 'string' ? item.json.response
    : '';

  if (!responseRaw || typeof responseRaw !== 'string') {
    throw new Error(
      `Workflow ${workflowId} (${workflowName}): MCP response vacia o no string. ` +
      `Verificar HTTP node -> Options -> Response -> Response Format = Text. ` +
      `Recibido: ${JSON.stringify(item.json).slice(0, 300)}`
    );
  }

  // SSE format:
  //   event: message
  //   data: {"result":{...},"jsonrpc":"2.0","id":1}\n\n
  //
  // El JSON-RPC viene en UNA sola linea (los \n internos del JSON estan
  // escapados como \\n). Buscamos "data: " y tomamos hasta el primer \n real
  // (que termina el evento SSE).
  const dataIdx = responseRaw.indexOf('data: ');
  if (dataIdx < 0) {
    throw new Error(
      `Workflow ${workflowId}: MCP response no contiene "data: ". ` +
      `Recibido (primeros 300 chars): ${responseRaw.slice(0, 300)}`
    );
  }

  const afterData = responseRaw.slice(dataIdx + 6); // "data: " = 6 chars
  const newlineIdx = afterData.indexOf('\n');
  const ssePayload = (newlineIdx >= 0 ? afterData.slice(0, newlineIdx) : afterData).trim();

  if (!ssePayload) {
    throw new Error(`Workflow ${workflowId}: SSE payload vacio`);
  }

  let jsonRpc;
  try {
    jsonRpc = JSON.parse(ssePayload);
  } catch (e) {
    throw new Error(
      `Workflow ${workflowId}: error parseando JSON-RPC: ${e.message}. ` +
      `Payload (primeros 300 chars): ${ssePayload.slice(0, 300)}`
    );
  }

  if (jsonRpc.error) {
    throw new Error(
      `Workflow ${workflowId}: MCP devolvio error JSON-RPC: ${JSON.stringify(jsonRpc.error)}`
    );
  }

  const innerJsonString =
    jsonRpc.result &&
    jsonRpc.result.content &&
    jsonRpc.result.content[0] &&
    jsonRpc.result.content[0].text;

  if (!innerJsonString || typeof innerJsonString !== 'string') {
    throw new Error(
      `Workflow ${workflowId}: estructura inesperada. ` +
      `Esperaba result.content[0].text. Recibido: ${JSON.stringify(jsonRpc).slice(0, 300)}`
    );
  }

  let workflowData;
  try {
    workflowData = JSON.parse(innerJsonString);
  } catch (e) {
    throw new Error(
      `Workflow ${workflowId}: error parseando JSON anidado: ${e.message}. ` +
      `String (primeros 300 chars): ${innerJsonString.slice(0, 300)}`
    );
  }

  const wf = workflowData.workflow || workflowData;
  const nodes = wf && wf.nodes;
  if (!Array.isArray(nodes)) {
    throw new Error(
      `Workflow ${workflowId}: workflow.nodes no es array. ` +
      `Keys disponibles: ${Object.keys(workflowData || {}).join(', ')}`
    );
  }

  const sfNodes = nodes.filter(n => n && n.type === 'n8n-nodes-base.snowflake');
  if (sfNodes.length === 0) {
    const tipos = [...new Set(nodes.map(n => n && n.type).filter(Boolean))].join(', ');
    throw new Error(
      `Workflow ${workflowId}: no se encontraron nodos Snowflake. Tipos disponibles: ${tipos}`
    );
  }

  let sqlCompletoRemoto;
  if (sfNodes.length === 1) {
    sqlCompletoRemoto = (sfNodes[0].parameters && sfNodes[0].parameters.query) || '';
    if (!sqlCompletoRemoto) {
      throw new Error(
        `Workflow ${workflowId}: nodo Snowflake "${sfNodes[0].name}" sin parameters.query`
      );
    }
  } else {
    sqlCompletoRemoto = sfNodes.map(n => {
      const q = (n.parameters && n.parameters.query) || '';
      return (
        '-- ============================================================\n' +
        `-- NODO: ${n.name || '(sin nombre)'}\n` +
        '-- ============================================================\n' +
        q
      );
    }).join('\n\n');
  }

  const sqlHashRemoto = sha256Hex(sqlCompletoRemoto);

  out.push({
    json: {
      workflow_id: workflowId,
      workflow_name: workflowName,
      workflow_name_remoto: wf.name || null,
      sql_completo_remoto: sqlCompletoRemoto,
      sql_hash_remoto: sqlHashRemoto,
      sf_nodes_count: sfNodes.length,
    },
  });
}

return out;
