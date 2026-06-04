// n8n Code node — "Armar Resumen" (Reporte Diario DI 2 Flujos)
// Mode: Run Once for All Items
// =========================================================================
// Lee por NOMBRE de nodo (no via $input):
//   $('SF Conversión').all()  -> Query 1 (1 fila por flujo + TOTAL)
//   $('SF Razones').all()     -> Query 2 (1 fila por razón, por flujo + TOTAL)
//   $('Get CSM').all()        -> 1 fila por destinatario en public.csm (chat_id + nombre)
// Devuelve 1 item POR destinatario: { json: { payload: { chat_id, text } } }.
// El nodo Telegram corre una vez por item -> un mensaje (idéntico) a cada CSM.
//
// Reglas n8n: SIN optional chaining (?.), SIN fetch(). new Date() sí está permitido
// en Code nodes (lo usa botialertas_v2_classify.js).
// Columnas de Snowflake vuelven en MAYÚSCULAS.
// =========================================================================

// ---------------- CONFIG (editar aquí) ----------------
const CLIENTE_NOMBRE = 'Banco W';          // nombre legible para el encabezado
const UMBRAL_CAIDA_PP = 10;                // 🔴 si la conversión cae >= 10 pp vs ayer
const FLUJOS = [
  { id: 'IPFd2ce1706f9d0a34ac4699ee9cb5deae2', nombre: 'Flujo 1' },
  { id: 'IPFdbb5de09c089403c0e20b86313abc47b', nombre: 'Flujo 2' },
];
const TOTAL_KEY = 'TOTAL (ambos)';
const SEP = '━━━━━━━━━━━━━━━━━━━━';
// Para armar el link al reporte con gráficas + descarga PDF (ruta /reporte-di-diario).
const CLIENT_ID = 'TCId5981cce1073baf2a0bc311dc90220bc';
const REPORTE_BASE = 'https://csmcenter.netlify.app/reporte-di-diario';

// Diccionario de motivos (subset de src/utils/razonesDict.ts).
// Si Truora suma un motivo nuevo: agregarlo acá y en la lista IN del SQL (Query 2).
const RAZONES = {
  blurry_image: 'Foto del documento borrosa o mal iluminada',
  expired_document: 'Documento vencido',
  document_has_expired: 'Documento vencido',
  document_is_a_photocopy: 'Subió una fotocopia, no el original',
  document_is_a_photo_of_photo: 'Tomó foto a una foto del documento',
  document_does_not_match_account_id: 'El documento no coincide con la cuenta',
  document_validation_not_started: 'No inició la validación de documento',
  damaged_document: 'Documento dañado',
  invalid_document_emission_date: 'Fecha de emisión inválida',
  document_data_does_not_match_government_data: 'Datos no coinciden con la fuente oficial',
  document_image_no_text_detected: 'No se detectó texto en la imagen del documento',
  document_front_not_identified: 'No se identificó el frente del documento',
  no_face_detected: 'La cámara no detectó un rostro válido',
  similarity_threshold_not_passed: 'El rostro no coincide con el documento',
  risky_face_detected: 'Posible suplantación de identidad',
  passive_liveness_verification_not_passed: 'No superó la prueba de vida',
  user_face_match_in_client_collection: 'El rostro coincide con otro usuario registrado',
  user_face_match_in_fraud_collection: 'El rostro coincide con la lista de fraude',
  face_validation_not_started: 'Llegó a la selfie pero no la completó',
  invalid_video_file: 'Archivo de video inválido',
};

// ---------------- Helpers ----------------
function g(row, key) {
  if (!row) return undefined;
  if (row[key] !== undefined) return row[key];
  const up = key.toUpperCase();
  if (row[up] !== undefined) return row[up];
  const lo = key.toLowerCase();
  if (row[lo] !== undefined) return row[lo];
  return undefined;
}
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(v);
  return isNaN(x) ? null : x;
}
function pct(v) {
  if (v === null) return 's/d';
  return (Math.round(v * 10) / 10).toFixed(1) + '%';
}
function ppStr(v) {
  if (v === null) return '';
  const s = v >= 0 ? '+' : '';
  return s + (Math.round(v * 10) / 10).toFixed(1) + ' pp';
}
function emojiDelta(delta) {
  if (delta === null) return '';
  if (delta <= -UMBRAL_CAIDA_PP) return '🔴';
  if (delta < 0) return '🟡';
  if (delta > 0) return '🟢';
  return '➖';
}
function razonHumana(code) {
  if (RAZONES[code]) return RAZONES[code];
  return String(code || '').replace(/_/g, ' ');
}
function shortId(id) {
  if (!id || id.length < 16) return id || '';
  return id.slice(0, 8) + '…' + id.slice(-5);
}

// ---------------- Data ----------------
const conv = $('SF Conversión').all().map(function (i) { return i.json; });
const raz  = $('SF Razones').all().map(function (i) { return i.json; });
// Get CSM trae 1 fila por destinatario (Sebas + JD). El mensaje es el mismo;
// fan-out a un item por CSM con telegram_chat_id (ver salida abajo).
const csmRows = $('Get CSM').all().map(function (i) { return i.json; });

function convRow(flujoId) {
  for (let i = 0; i < conv.length; i++) {
    if (g(conv[i], 'flujo') === flujoId) return conv[i];
  }
  return null;
}
function razonesDe(flujoId) {
  const out = [];
  for (let i = 0; i < raz.length; i++) {
    if (g(raz[i], 'flujo') === flujoId) out.push(raz[i]);
  }
  return out;
}

// ---------------- Construir bloque por flujo ----------------
const alertas = [];

function bloque(label, flujoId, esTotal) {
  const r = convRow(flujoId);
  const head = esTotal ? '📦 ' + label : '🔹 ' + label + '  (' + shortId(flujoId) + ')';
  if (!r) {
    if (!esTotal) {
      alertas.push('🔴 ' + label + ': 0 procesos hoy y ayer — verificar si el flujo está activo.');
    }
    return head + '\n⚠️ Sin procesos en la ventana (hoy y ayer).';
  }

  const pHoy  = num(g(r, 'procesos_iniciados_hoy'));
  const pAyer = num(g(r, 'procesos_iniciados_ayer'));
  const okHoy = num(g(r, 'procesos_exitosos_hoy'));
  const okAyer = num(g(r, 'procesos_exitosos_ayer'));
  const cvHoy = num(g(r, 'conversion_proc_hoy_pct'));
  const cvAyer = num(g(r, 'conversion_proc_ayer_pct'));
  const cvD   = num(g(r, 'conv_proc_delta_pp'));

  const uHoy  = num(g(r, 'usuarios_unicos_hoy'));
  const uAyer = num(g(r, 'usuarios_unicos_ayer'));
  const uOkHoy = num(g(r, 'usuarios_exitosos_hoy'));
  const uOkAyer = num(g(r, 'usuarios_exitosos_ayer'));
  const cvuHoy = num(g(r, 'conversion_usuario_hoy_pct'));
  const cvuAyer = num(g(r, 'conversion_usuario_ayer_pct'));
  const cvuD  = num(g(r, 'conv_usuario_delta_pp'));

  // Alertas (solo por flujo, no por TOTAL)
  if (!esTotal) {
    if (cvD !== null && cvD <= -UMBRAL_CAIDA_PP) {
      alertas.push('🔴 ' + label + ': conversión del proceso ' + pct(cvHoy) + ' (' + ppStr(cvD) + ' vs ayer).');
    }
    if (pHoy === 0 && pAyer !== null && pAyer > 0) {
      alertas.push('🔴 ' + label + ': 0 procesos iniciados hoy (ayer ' + pAyer + ') — posible flujo/URL caído.');
    }
  }

  const L = [];
  L.push(head);
  L.push('Conversión del proceso: ' + pct(cvHoy) + '  (ayer ' + pct(cvAyer) + ')  ' + emojiDelta(cvD) + ' ' + ppStr(cvD));
  L.push('  Procesos: ' + (pHoy === null ? 0 : pHoy) + ' iniciados · ' + (okHoy === null ? 0 : okHoy) +
         ' exitosos   (ayer ' + (pAyer === null ? 0 : pAyer) + ' · ' + (okAyer === null ? 0 : okAyer) + ')');
  L.push('Conversión por usuario único: ' + pct(cvuHoy) + '  (ayer ' + pct(cvuAyer) + ')  ' + emojiDelta(cvuD) + ' ' + ppStr(cvuD));
  L.push('  Usuarios: ' + (uHoy === null ? 0 : uHoy) + ' únicos · ' + (uOkHoy === null ? 0 : uOkHoy) +
         ' exitosos   (ayer ' + (uAyer === null ? 0 : uAyer) + ' · ' + (uOkAyer === null ? 0 : uOkAyer) + ')');

  // Razones (solo por flujo; en TOTAL las omitimos para no duplicar)
  if (!esTotal) {
    const rs = razonesDe(flujoId);
    if (rs.length === 0) {
      L.push('Rechazos hoy: ninguno ✅');
    } else {
      L.push('Rechazos hoy:');
      // ordenar por rechazos_hoy desc
      rs.sort(function (a, b) { return (num(g(b, 'rechazos_hoy')) || 0) - (num(g(a, 'rechazos_hoy')) || 0); });
      for (let i = 0; i < rs.length; i++) {
        const tipo = g(rs[i], 'tipo');
        const code = g(rs[i], 'razon');
        const rh = num(g(rs[i], 'rechazos_hoy'));
        const ra = num(g(rs[i], 'rechazos_ayer'));
        if (rh === null || rh === 0) continue; // solo lo que pasó hoy
        L.push('  • [' + tipo + '] ' + razonHumana(code) + ' — ' + rh + '  (ayer ' + (ra === null ? 0 : ra) + ')');
      }
    }
  }

  return L.join('\n');
}

// ---------------- Ensamblar mensaje ----------------
const ahora = new Date();
const fecha = ahora.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'long', year: 'numeric' });
const hora  = ahora.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });

const partes = [];
partes.push('🤖 Reporte diario DI — ' + CLIENTE_NOMBRE);
partes.push('🗓️ ' + fecha + ' · corte ' + hora + ' (hora Bogotá)');
partes.push('Comparación: hoy (parcial) vs ayer (día completo, D-1)');

// Bloques por flujo
const bloquesFlujo = [];
for (let i = 0; i < FLUJOS.length; i++) {
  bloquesFlujo.push(bloque(FLUJOS[i].nombre, FLUJOS[i].id, false));
}
const bloqueTotal = bloque(TOTAL_KEY, TOTAL_KEY, true);

// Sección de alertas arriba (si hay)
let header = partes.join('\n');
if (alertas.length > 0) {
  header += '\n\n🚨 ALERTAS DEL DÍA\n' + alertas.join('\n');
}

let text = header;
for (let i = 0; i < bloquesFlujo.length; i++) {
  text += '\n\n' + SEP + '\n\n' + bloquesFlujo[i];
}
text += '\n\n' + SEP + '\n\n' + bloqueTotal;

// Link al reporte con gráficas (nivel Report Builder) + botón Descargar PDF.
// URL corta: la página ya trae los defaults de Banco W + sus 2 flujos + hoy.
text += '\n\n' + SEP + '\n📊 Ver gráficas y descargar PDF:\n' + REPORTE_BASE;

// Telegram tope ~4096 chars; con 2 flujos no debería acercarse, pero recortamos por seguridad.
if (text.length > 4000) text = text.slice(0, 3990) + '\n…(recortado)';

// ---------------- Output: un mensaje por CSM destinatario ----------------
const out = [];
for (let i = 0; i < csmRows.length; i++) {
  const c = csmRows[i];
  if (!c || !c.telegram_chat_id) continue;
  out.push({
    json: {
      payload: {
        chat_id: String(c.telegram_chat_id),
        csm_nombre: c.nombre || 'CSM',
        alert_count: alertas.length,
        text: text,
      },
    },
  });
}
return out;
