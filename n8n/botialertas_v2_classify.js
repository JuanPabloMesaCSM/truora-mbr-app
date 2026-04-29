// n8n Code node — BotiAlertas v2 / Classify (v4 — alertas por volumen de consumo)
// =========================================================================
// Cambios vs v3 (2026-04-29 al inicio del día):
//   * Selección de alertas para Telegram cambia de "% sobre la cuenta" a
//     "volumen de consumo" (variacion_abs). Por CSM, se mandan las top 5
//     caídas y los top 5 crecimientos por |variacion_abs| absoluto.
//     Motivo: clientes con caídas grandes en número pero % bajo (clasificados
//     'estable') quedaban fuera de la alerta aunque su impacto en la cuenta
//     era enorme. Caso real: un cliente con 1M → 950k (-5%, 'estable')
//     no aparecía como alerta a pesar de las 50.000 conversaciones perdidas.
//   * El % se mantiene como info en cada card pero ya NO determina la selección.
//   * SEV_META extendido para incluir 'leve' y un display dinámico para 'estable'
//     (caída moderada / crecimiento moderado según signo de variacion_abs)
//     porque ahora estos rangos pueden aparecer en el Telegram.
//   * Sin volume floor de 500 — ya no aplica, el ranking por volumen filtra solo.
//
// Sin cambio:
//   * boti_alertas sigue recibiendo TODAS las clasificaciones (la página
//     /botialertas las muestra junto con la columna Balance). El cambio es
//     solo en el subconjunto que se manda al Telegram.
//   * Cards detalladas (período, rangos, cliente, métrica con prev/curr/var,
//     extras por producto: Score BGC, Conversión DI, Desglose CE).
//   * Splitter de mensajes >4000 chars.
//   * BCC a admins (jdiaz + amarquez).

// =========================================================================
// 1. Constantes
// =========================================================================
const VOLUME_FLOOR_CLASSIFY = 50;
// Top N por dirección (caídas / crecimientos) por CSM en el Telegram.
const TELEGRAM_TOP_N = 5;
// Telegram limita 4096 chars por mensaje. 4000 deja margen para BCC header
// (~60-80 chars) que se prepende mas abajo.
const TG_MAX_CHARS = 4000;

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
// SEV_META: incluye 'leve' porque ahora puede aparecer en el Telegram.
// 'estable' se renderiza dinámicamente por dirección (ver severidadDisplay).
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

// Display meta para la card. SEV_META cubre 'critica'/'fuerte'/'leve'/'crecimiento'.
// 'estable' se diferencia por signo del variacion_abs porque la banda de %
// es centrada (-10% < x < +30%) y puede ser ligeramente positiva o negativa.
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
function fmtBase(s) {
  const d = parseDate(s);
  if (!d) return '—';
  return (MESES[d.month - 1] || '—') + ' ' + d.year;
}
function fmtRange(inicio, fin) {
  const i = parseDate(inicio);
  const f = parseDate(fin);
  if (!i || !f) return '—';
  const mes = MESES[f.month - 1] || '';
  return i.day + '–' + f.day + ' ' + mes + ' ' + f.year;
}

// =========================================================================
// 3. Construir card detallada (estilo BotiAlertas antiguo)
// =========================================================================
function buildCard(productCode, clienteNombre, cls, curr, prev, extras, r) {
  const meta = severidadDisplay(cls);

  const mesActual = fmtMonth(r.PERIODO_ACTUAL_FIN);
  const mesPrev   = fmtMonth(r.PERIODO_ANTERIOR_FIN);

  const lines = [];
  lines.push(meta.emoji + ' Alerta de Consumo - ' + PRODUCT_LABEL[productCode] + ' : ' + meta.label);
  lines.push('');
  lines.push('📅 Periodo base: ' + fmtBase(r.PERIODO_ACTUAL_FIN));
  lines.push('📊 Rangos comparados:');
  lines.push('• Mes actual:   ' + fmtRange(r.PERIODO_ACTUAL_INICIO, r.PERIODO_ACTUAL_FIN));
  lines.push('• Mes anterior: ' + fmtRange(r.PERIODO_ANTERIOR_INICIO, r.PERIODO_ANTERIOR_FIN));
  lines.push('');
  lines.push('👤 Cliente: ' + clienteNombre);
  lines.push('');
  lines.push('🧮 ' + METRIC_LABEL[productCode]);
  lines.push('• Mes anterior (' + mesPrev + '): ' + fmtNum(prev));
  lines.push('• Mes actual (' + mesActual + '):   ' + fmtNum(curr));
  lines.push('→ Variación: ' + fmtPct(cls.variacion_pct) + ' (' + fmtNumSigned(cls.variacion_abs) + ')');

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
// 4. Combinar cards en mensajes (uno o varios si exceden TG_MAX_CHARS)
// =========================================================================
function buildMessages(headerStr, cards, footerStr) {
  if (cards.length === 0) return [];

  const sep = '\n\n' + SEPARATOR + '\n\n';
  const footerSep = sep + footerStr;

  const messages = [];
  let buf = headerStr;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const tentative = buf + sep + card;
    const finalLen = tentative.length + footerSep.length;
    if (finalLen > TG_MAX_CHARS && buf !== headerStr) {
      messages.push(buf + '\n\n(continúa…)');
      buf = '(continuación)\n\n' + card;
    } else {
      buf = tentative;
    }
  }
  messages.push(buf + footerSep);
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
// agrupador: { csm_email -> { chat_id, handle, nombre, candidates: [...] } }
// candidates es un array plano de { productCode, clienteNombre, cls, curr, prev, extras, r }.
// La selección top 5 / top 5 se hace al construir los Telegrams (sección 8).
const telegramByCsm = {};

function pushCandidate(csm_email, alertaData) {
  if (!csm_email) return; // oncall sin owner — no notificamos
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

    // Empuja todas las clasificaciones al pool de candidatos del CSM.
    // El ranking por volumen y la selección top 5 ocurren en la sección 8.
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
// 8. Construir Telegrams — top 5 caídas + top 5 crecimientos por CSM
//    ordenadas por volumen absoluto de la variación (variacion_abs).
//    El % de cambio se conserva como info en cada card pero no determina
//    quién entra al Telegram.
// =========================================================================
const today = new Date();
const fechaStr = today.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const footerStr = '🔗 Ver más detalle en el CSM Center\n' + CSM_CENTER_URL;

const telegramItems = [];
for (const email in telegramByCsm) {
  if (!Object.prototype.hasOwnProperty.call(telegramByCsm, email)) continue;
  const cell = telegramByCsm[email];
  const candidates = cell.candidates;

  // Top N negativos: variacion_abs más negativa primero (orden ascendente
  // de variacion_abs porque -100k < -10k).
  const negatives = candidates
    .filter(function (c) { return Number(c.cls.variacion_abs) < 0; })
    .sort(function (a, b) { return Number(a.cls.variacion_abs) - Number(b.cls.variacion_abs); })
    .slice(0, TELEGRAM_TOP_N);

  // Top N positivos: variacion_abs más positiva primero (orden descendente).
  const positives = candidates
    .filter(function (c) { return Number(c.cls.variacion_abs) > 0; })
    .sort(function (a, b) { return Number(b.cls.variacion_abs) - Number(a.cls.variacion_abs); })
    .slice(0, TELEGRAM_TOP_N);

  const orderedCards = [];
  for (const c of negatives) {
    const card = buildCard(c.productCode, c.clienteNombre, c.cls, c.curr, c.prev, c.extras, c.r);
    if (card) orderedCards.push(card);
  }
  for (const c of positives) {
    const card = buildCard(c.productCode, c.clienteNombre, c.cls, c.curr, c.prev, c.extras, c.r);
    if (card) orderedCards.push(card);
  }

  const total = orderedCards.length;
  if (total === 0) continue;

  // Header: indicar que son top por volumen.
  const negCount = negatives.length;
  const posCount = positives.length;
  const movementsParts = [];
  if (negCount > 0) movementsParts.push(negCount + ' caída' + (negCount === 1 ? '' : 's'));
  if (posCount > 0) movementsParts.push(posCount + ' crecimiento' + (posCount === 1 ? '' : 's'));
  const headerStr =
    '🚨 BotiAlertas — Semana del ' + fechaStr + '\n\n' +
    'Hola ' + cell.nombre + ', ' + movementsParts.join(' y ') +
    ' por mayor variación de volumen en tu cartera.';

  const messages = buildMessages(headerStr, orderedCards, footerStr);
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
    // No BCC sobre las propias alertas del admin
    if (orig.payload.csm_email === bccEmail) continue;
    // Defensa redundante por chat_id
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
