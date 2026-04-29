// n8n Code node — BotiAlertas v2 / Classify (v5 — secciones + unidades)
// =========================================================================
// Cambios vs v4 (mismo día 2026-04-29 PM):
//   * Defensa contra admins (Ana/JD): aunque prepare_whitelists ya los salta,
//     classify rechaza pushCandidate si csm_email está en ADMIN_EMAILS.
//   * Card compacta: se eliminaron las líneas redundantes "📅 Periodo base"
//     y "📊 Rangos comparados:" (los rangos ahora van en una sola línea).
//   * Variación con unidad: "(-2.227 VALIDACIONES)" / "(+5.000 CHECKS)" /
//     "(-31.499 CONVERSACIONES)". Antes: "(-2.227)" sin contexto.
//   * Nuevo header del Telegram con secciones:
//       - Greeting + intro caídas
//       - [cards de caídas]
//       - Emoji separador + intro crecimientos
//       - [cards de crecimientos]
//   * Si solo hay caídas o solo crecimientos, la sección vacía se omite.
//
// Sin cambio:
//   * Top 5 caídas + Top 5 crecimientos por |variacion_abs| (v4).
//   * boti_alertas recibe TODAS las clasificaciones para la página.
//   * Splitter de mensajes >4000 chars (con cards más compactas casi nunca dispara).
//   * BCC a admins (jdiaz + amarquez) — siguen recibiendo copias de los demás.

// =========================================================================
// 1. Constantes
// =========================================================================
const VOLUME_FLOOR_CLASSIFY = 50;
const TELEGRAM_TOP_N = 5;
const TG_MAX_CHARS = 4000;

// Admin emails: defensa redundante contra prepare_whitelists. Nunca deben
// recibir Telegram como CSM primario, solo como BCC (chat_id).
const ADMIN_EMAILS = ['jdiaz@truora.com', 'amarquez@truora.com'];

const PRODUCT_LABEL = {
  DI:  'Validaciones (DI)',
  BGC: 'Checks (BGC)',
  CE:  'WhatsApp (CE)',
};
const METRIC_LABEL = {
  DI:  'Validaciones',
  BGC: 'Checks',
  CE:  'Conversaciones totales',
};
// Etiqueta plural en MAYÚSCULAS para el sufijo de variación: "(-2.227 VALIDACIONES)".
const UNIT_LABEL_PLURAL = {
  DI:  'VALIDACIONES',
  BGC: 'CHECKS',
  CE:  'CONVERSACIONES',
};

const SEV_META = {
  critica:     { emoji: '🔴', label: 'Caída crítica' },
  fuerte:      { emoji: '🟠', label: 'Caída fuerte' },
  leve:        { emoji: '🟡', label: 'Caída leve' },
  crecimiento: { emoji: '📈', label: 'Crecimiento' },
};
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━';
const CSM_CENTER_URL = 'https://csmcenter.netlify.app/botialertas';

// =========================================================================
// 2. Helpers
// =========================================================================
function classify(curr, prev) {
  const c = Number.isFinite(curr) ? curr : 0;
  const p = Number.isFinite(prev) ? prev : 0;

  if (c < VOLUME_FLOOR_CLASSIFY && p < VOLUME_FLOOR_CLASSIFY) {
    return { severidad: 'estable', variacion_pct: null, variacion_abs: c - p };
  }
  if (p === 0) {
    return { severidad: 'crecimiento', variacion_pct: null, variacion_abs: c };
  }
  if (c === 0) {
    return { severidad: 'critica', variacion_pct: -100, variacion_abs: -p };
  }

  const variacion = ((c - p) / p) * 100;
  let severidad;
  if (variacion <= -50)      severidad = 'critica';
  else if (variacion <= -30) severidad = 'fuerte';
  else if (variacion <= -10) severidad = 'leve';
  else if (variacion < 30)   severidad = 'estable';
  else                       severidad = 'crecimiento';

  return {
    severidad,
    variacion_pct: Math.round(variacion * 10) / 10,
    variacion_abs: c - p,
  };
}

function severidadDisplay(cls) {
  const m = SEV_META[cls.severidad];
  if (m) return m;
  if (cls.variacion_abs > 0) return { emoji: '🟢', label: 'Crecimiento moderado' };
  if (cls.variacion_abs < 0) return { emoji: '🟡', label: 'Caída moderada' };
  return { emoji: '⚪', label: 'Sin cambio relevante' };
}

function fmtNum(n) {
  if (n === null || n === undefined) return '0';
  const v = Math.round(Number(n));
  return v.toLocaleString('es-CO');
}
function fmtNumSigned(n) {
  if (n === null || n === undefined) return '0';
  const v = Math.round(Number(n));
  const sign = v > 0 ? '+' : '';
  return sign + v.toLocaleString('es-CO');
}
function fmtPct(p) {
  if (p === null || p === undefined) return '—';
  const sign = p > 0 ? '+' : '';
  return sign + p.toFixed(1) + '%';
}
function fmtScore(s) {
  if (s === null || s === undefined) return '—';
  return Number(s).toFixed(1);
}
function fmtConv(p) {
  if (p === null || p === undefined) return '—';
  return Number(p).toFixed(1) + '%';
}
function parseDate(s) {
  if (!s) return null;
  const str = String(s);
  const parts = str.split('-');
  if (parts.length < 3) return null;
  const dayStr = parts[2].slice(0, 2);
  return { year: Number(parts[0]), month: Number(parts[1]), day: Number(dayStr) };
}
function fmtMonth(s) {
  const d = parseDate(s);
  if (!d) return '—';
  return MESES[d.month - 1] || '—';
}
function fmtRange(inicio, fin) {
  const i = parseDate(inicio);
  const f = parseDate(fin);
  if (!i || !f) return '—';
  const mes = MESES[f.month - 1] || '';
  return i.day + '–' + f.day + ' ' + mes + ' ' + f.year;
}

// =========================================================================
// 3. Construir card detallada (compacta, con unidad en variación)
// =========================================================================
function buildCard(productCode, clienteNombre, cls, curr, prev, extras, r) {
  const meta = severidadDisplay(cls);
  const mesActual = fmtMonth(r.PERIODO_ACTUAL_FIN);
  const mesPrev   = fmtMonth(r.PERIODO_ANTERIOR_FIN);
  const unitPlural = UNIT_LABEL_PLURAL[productCode] || '';

  const lines = [];
  lines.push(meta.emoji + ' Alerta de Consumo - ' + PRODUCT_LABEL[productCode] + ' : ' + meta.label);
  lines.push('');
  lines.push('📅 ' + fmtRange(r.PERIODO_ACTUAL_INICIO, r.PERIODO_ACTUAL_FIN) +
             '  vs  ' + fmtRange(r.PERIODO_ANTERIOR_INICIO, r.PERIODO_ANTERIOR_FIN));
  lines.push('');
  lines.push('👤 Cliente: ' + clienteNombre);
  lines.push('');
  lines.push('🧮 ' + METRIC_LABEL[productCode]);
  lines.push('• Mes anterior (' + mesPrev + '): ' + fmtNum(prev));
  lines.push('• Mes actual (' + mesActual + '):   ' + fmtNum(curr));
  lines.push('→ Variación: ' + fmtPct(cls.variacion_pct) +
             ' (' + fmtNumSigned(cls.variacion_abs) +
             (unitPlural ? ' ' + unitPlural : '') + ')');

  // Extras por producto
  if (productCode === 'BGC' && extras && (extras.score_actual !== null && extras.score_actual !== undefined ||
                                            extras.score_anterior !== null && extras.score_anterior !== undefined)) {
    lines.push('');
    lines.push('⭐ Score promedio');
    lines.push('• Mes anterior: ' + fmtScore(extras.score_anterior));
    lines.push('• Mes actual:   ' + fmtScore(extras.score_actual));
  }
  if (productCode === 'DI' && extras && (extras.conversion_actual !== null && extras.conversion_actual !== undefined ||
                                          extras.conversion_anterior !== null && extras.conversion_anterior !== undefined)) {
    lines.push('');
    lines.push('✅ Conversión');
    lines.push('• Mes anterior: ' + fmtConv(extras.conversion_anterior));
    lines.push('• Mes actual:   ' + fmtConv(extras.conversion_actual));
  }
  if (productCode === 'CE' && extras && extras.inbound) {
    lines.push('');
    lines.push('  Desglose:');
    lines.push('  • Inbound:    ' + fmtNum(extras.inbound.prev) + ' → ' + fmtNum(extras.inbound.curr));
    lines.push('  • Outbound:   ' + fmtNum(extras.outbound.prev) + ' → ' + fmtNum(extras.outbound.curr));
    lines.push('  • Notif:      ' + fmtNum(extras.notificaciones.prev) + ' → ' + fmtNum(extras.notificaciones.curr));
  }

  return lines.join('\n');
}

// =========================================================================
// 4. Construir mensaje con secciones (caídas + crecimientos).
//    Devuelve un único string. El splitter (sección 5) lo parte si excede 4000.
// =========================================================================
function buildSectionedMessage(headerStr, sections, footerStr) {
  // sections = [{ intro: '...', cards: [...] }, ...]
  const parts = [headerStr];
  for (const sec of sections) {
    if (sec.cards.length === 0) continue;
    parts.push('\n\n' + sec.intro + '\n' + SEPARATOR);
    for (const card of sec.cards) {
      parts.push('\n\n' + card);
    }
  }
  parts.push('\n\n' + SEPARATOR + '\n\n' + footerStr);
  return parts.join('');
}

// Splitter por si el mensaje excede TG_MAX_CHARS. Parte preservando integridad
// de cards: corta entre cards, no en medio. Casi nunca dispara con cards
// compactas (~290 chars × 10 = 2900, cabe holgado en 4000).
function splitIfNeeded(fullMessage, footerStr) {
  if (fullMessage.length <= TG_MAX_CHARS) return [fullMessage];

  // Estrategia: dividir por separador entre cards (\n\n) y empacar greedy.
  const chunks = fullMessage.split('\n\n');
  const messages = [];
  let buf = '';
  const closingFooter = '\n\n' + SEPARATOR + '\n\n' + footerStr;

  for (let i = 0; i < chunks.length; i++) {
    const piece = chunks[i];
    const next = (buf.length === 0) ? piece : buf + '\n\n' + piece;
    if (next.length + closingFooter.length > TG_MAX_CHARS && buf.length > 0) {
      messages.push(buf + '\n\n(continúa…)');
      buf = '(continuación)\n\n' + piece;
    } else {
      buf = next;
    }
  }
  messages.push(buf);
  return messages;
}

// =========================================================================
// 5. Lookup CSM
// =========================================================================
const csmByEmail = {};
const csmRows = $('Get CSM').all();
for (const it of csmRows) {
  const r = it.json;
  if (r && typeof r.email === 'string') {
    csmByEmail[r.email] = {
      nombre:           r.nombre,
      telegram_chat_id: r.telegram_chat_id,
      telegram_handle:  r.telegram_handle,
    };
  }
}

// =========================================================================
// 6. Mapas client_id -> { cliente_id (uuid), nombre, csm_email }
// =========================================================================
const ctx = $('Prepare Whitelists').first().json;
if (!ctx || !ctx.client_map) {
  throw new Error('BotiAlertas v2: Prepare Whitelists no expuso client_map.');
}
const mapDi  = ctx.client_map.di  || {};
const mapBgc = ctx.client_map.bgc || {};
const mapCe  = ctx.client_map.ce  || {};

// =========================================================================
// 7. Procesar productos -> filas boti_alertas + candidatos Telegram
// =========================================================================
const supabaseRows = [];
const telegramByCsm = {};

function pushCandidate(csm_email, alertaData) {
  if (!csm_email) return; // oncall sin owner — no notificamos
  // Defensa: nunca asignar candidatos a admins. Si llegó hasta acá significa
  // que prepare_whitelists no hizo su trabajo (o cambió la lista de admins
  // sin sincronizar). Loguear para diagnóstico.
  if (ADMIN_EMAILS.indexOf(csm_email) !== -1) {
    console.log('[BotiAlertas] skip admin candidate: ' + csm_email);
    return;
  }
  const csm = csmByEmail[csm_email];
  if (!csm || !csm.telegram_chat_id) return;
  if (!telegramByCsm[csm_email]) {
    telegramByCsm[csm_email] = {
      chat_id: csm.telegram_chat_id,
      handle:  csm.telegram_handle || csm_email,
      nombre:  csm.nombre || csm_email,
      candidates: [],
    };
  }
  telegramByCsm[csm_email].candidates.push(alertaData);
}

function processProduct(productCode, rows, clientMap, getCurr, getPrev, buildExtras) {
  for (const it of rows) {
    const r = it.json;
    if (!r) continue;
    const clientId = r.CLIENT_ID;
    if (!clientId || clientId === '__EMPTY__') continue;
    const meta = clientMap[clientId];
    if (!meta) continue;

    const curr = Number(getCurr(r));
    const prev = Number(getPrev(r));
    const cls  = classify(curr, prev);
    const extras = buildExtras(r);

    supabaseRows.push({
      kind: 'row',
      payload: {
        cliente_id:              meta.cliente_id,
        client_id_externo:       clientId,
        producto:                productCode,
        periodo_actual_inicio:   r.PERIODO_ACTUAL_INICIO,
        periodo_actual_fin:      r.PERIODO_ACTUAL_FIN,
        periodo_anterior_inicio: r.PERIODO_ANTERIOR_INICIO,
        periodo_anterior_fin:    r.PERIODO_ANTERIOR_FIN,
        valor_actual:            curr,
        valor_anterior:          prev,
        variacion_pct:           cls.variacion_pct,
        variacion_abs:           cls.variacion_abs,
        severidad:               cls.severidad,
        metricas_extra:          extras,
      },
    });

    pushCandidate(meta.csm_email, {
      productCode,
      clienteNombre: meta.nombre,
      cls,
      curr,
      prev,
      extras,
      r,
    });
  }
}

processProduct('DI', $('Snowflake DI').all(), mapDi,
  r => r.MTD_PROCESSES, r => r.PMTD_PROCESSES,
  r => ({
    conversion_actual:    r.MTD_CONVERSION_PCT,
    conversion_anterior:  r.PMTD_CONVERSION_PCT,
    successes_actual:     r.MTD_SUCCESSES,
    successes_anterior:   r.PMTD_SUCCESSES,
  }));

processProduct('BGC', $('Snowflake BGC').all(), mapBgc,
  r => r.MTD_CHECKS, r => r.PMTD_CHECKS,
  r => ({
    score_actual:   r.MTD_AVG_SCORE,
    score_anterior: r.PMTD_AVG_SCORE,
  }));

processProduct('CE', $('Snowflake CE').all(), mapCe,
  r => r.MTD_TOTAL, r => r.PMTD_TOTAL,
  r => ({
    inbound:        { curr: r.MTD_INBOUND,        prev: r.PMTD_INBOUND },
    outbound:       { curr: r.MTD_OUTBOUND,       prev: r.PMTD_OUTBOUND },
    notificaciones: { curr: r.MTD_NOTIFICATIONS,  prev: r.PMTD_NOTIFICATIONS },
  }));

// =========================================================================
// 8. Construir Telegrams — secciones top 5 caídas + top 5 crecimientos
// =========================================================================
const today = new Date();
const fechaStr = today.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const footerStr = '🔗 Ver más detalle en el CSM Center\n' + CSM_CENTER_URL;

const telegramItems = [];
for (const email in telegramByCsm) {
  if (!Object.prototype.hasOwnProperty.call(telegramByCsm, email)) continue;
  const cell = telegramByCsm[email];
  const candidates = cell.candidates;

  const negatives = candidates
    .filter(function (c) { return Number(c.cls.variacion_abs) < 0; })
    .sort(function (a, b) { return Number(a.cls.variacion_abs) - Number(b.cls.variacion_abs); })
    .slice(0, TELEGRAM_TOP_N);

  const positives = candidates
    .filter(function (c) { return Number(c.cls.variacion_abs) > 0; })
    .sort(function (a, b) { return Number(b.cls.variacion_abs) - Number(a.cls.variacion_abs); })
    .slice(0, TELEGRAM_TOP_N);

  const negCards = negatives.map(c => buildCard(c.productCode, c.clienteNombre, c.cls, c.curr, c.prev, c.extras, c.r)).filter(x => x);
  const posCards = positives.map(c => buildCard(c.productCode, c.clienteNombre, c.cls, c.curr, c.prev, c.extras, c.r)).filter(x => x);

  if (negCards.length === 0 && posCards.length === 0) continue;

  // Header con greeting
  const headerStr =
    '🚨 BotiAlertas — Semana del ' + fechaStr + '\n\n' +
    'Hola ' + cell.nombre + ',';

  // Construir secciones — solo agrega la sección si tiene cards
  const sections = [];
  if (negCards.length > 0) {
    sections.push({
      intro: '📉 Este es tu top ' + negCards.length + ' de caídas por volumen:',
      cards: negCards,
    });
  }
  if (posCards.length > 0) {
    sections.push({
      intro: '🚀 Este es tu top ' + posCards.length + ' de crecimientos por volumen:',
      cards: posCards,
    });
  }

  const fullMessage = buildSectionedMessage(headerStr, sections, footerStr);
  const messages = splitIfNeeded(fullMessage, footerStr);

  const total = negCards.length + posCards.length;
  for (let i = 0; i < messages.length; i++) {
    telegramItems.push({
      kind: 'telegram',
      payload: {
        chat_id:     cell.chat_id,
        csm_email:   email,
        csm_nombre:  cell.nombre,
        alert_count: total,
        text:        messages[i],
        part_index:  i + 1,
        part_total:  messages.length,
      },
    });
  }
}

// =========================================================================
// 9. BCC — copia de cada Telegram a la lista de admins
//    Si el original venia particionado en N partes, cada admin recibe N copias.
//    Snapshot de telegramItems antes de empezar para no BCCs sobre BCCs.
// =========================================================================
const BCC_EMAILS = ['jdiaz@truora.com', 'amarquez@truora.com'];
const originalMessages = telegramItems.slice();
const bccCopies = [];

for (const bccEmail of BCC_EMAILS) {
  const bccCsm = csmByEmail[bccEmail];
  if (!bccCsm || !bccCsm.telegram_chat_id) continue;

  for (const orig of originalMessages) {
    if (orig.payload.csm_email === bccEmail) continue;
    if (orig.payload.chat_id === bccCsm.telegram_chat_id) continue;

    const headerLine = 'Hola, ' + (bccCsm.nombre || 'Jefe') + ' - alertas de ' + (orig.payload.csm_nombre || orig.payload.csm_email);
    bccCopies.push({
      kind: 'telegram',
      payload: {
        chat_id:     bccCsm.telegram_chat_id,
        csm_email:   bccEmail,
        csm_nombre:  bccCsm.nombre,
        alert_count: orig.payload.alert_count,
        text:        headerLine + '\n\n' + orig.payload.text,
        bcc_for:     orig.payload.csm_email,
        part_index:  orig.payload.part_index,
        part_total:  orig.payload.part_total,
      },
    });
  }
}

for (const c of bccCopies) telegramItems.push(c);

// =========================================================================
// 10. Output
// =========================================================================
const out = [];
for (const r of supabaseRows)  out.push({ json: r });
for (const t of telegramItems) out.push({ json: t });

return out;
