// n8n Code node — BotiAlertas v2 / Classify
// Fusion los outputs de los 3 nodos Snowflake (DI/BGC/CE) con los maps de
// Supabase (clientes + csm) y produce dos arrays:
//
//   supabase_rows[]  — una fila por (cliente, producto) con la forma exacta de
//                      public.boti_alertas. La rama Supabase del flujo upsertea
//                      con ON CONFLICT (cliente_id, producto, periodo_actual_fin).
//
//   telegram_msgs[]  — una entrada por CSM con cambios criticos / fuertes /
//                      crecimientos. Ya viene con chat_id y texto formateado;
//                      la rama Telegram solo itera y envia.
//
// Cada item de output expone:
//   { kind: 'row', payload: <fila boti_alertas> }   o
//   { kind: 'telegram', payload: { chat_id, csm_email, text, alert_count } }
//
// Un Switch node downstream rutea por kind a las dos ramas.
//
// Lee por nombre de nodo (sin optional chaining):
//   $('Prepare Whitelists').first().json.client_map.{di,bgc,ce}
//   $('Get CSM').all()       -> filas csm con email, telegram_chat_id, telegram_handle
//   $('Snowflake DI').all()  -> filas DI
//   $('Snowflake BGC').all()
//   $('Snowflake CE').all()

// =========================================================================
// 1. Reglas de severidad (compartidas por DI / BGC / CE)
// =========================================================================
//
//   * VOLUME_FLOOR_CLASSIFY = 50: por debajo en ambos meses ignoramos la senal
//                                  (estable). Evita ruido por clientes en piloto.
//   * VOLUME_FLOOR_TELEGRAM = 500: solo notificamos por Telegram cuando hay
//                                  volumen relevante en algun lado. Coincide con
//                                  el filtro del flujo original.
//   * Bandas (sobre el volumen filtrado):
//       variacion <= -50     -> critica
//       -50 <  variacion <= -30 -> fuerte
//       -30 <  variacion <= -10 -> leve
//       -10 <  variacion <  +30 -> estable
//       variacion >= +30     -> crecimiento
//   * Casos borde:
//       prev = 0, curr >= floor -> crecimiento (cliente nuevo / reactivado)
//       curr = 0, prev >= floor -> critica (caida total)
//       ambos = 0               -> estable
//
const VOLUME_FLOOR_CLASSIFY = 50;
const VOLUME_FLOOR_TELEGRAM = 500;
const TELEGRAM_SEVERIDADES  = ['critica', 'fuerte', 'crecimiento'];

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

function fmtNum(n) {
  if (n === null || n === undefined) return '0';
  const v = Math.round(Number(n));
  return v.toLocaleString('es-CO');
}

function fmtPct(p) {
  if (p === null || p === undefined) return '—';
  const sign = p > 0 ? '+' : '';
  return sign + p.toFixed(1) + '%';
}

// =========================================================================
// 2. Construir lookup de CSM (email -> chat_id, handle, nombre)
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
// 3. Mapas client_id -> { cliente_id (uuid), nombre, csm_email }
// =========================================================================
const ctx = $('Prepare Whitelists').first().json;
if (!ctx || !ctx.client_map) {
  throw new Error('BotiAlertas v2: Prepare Whitelists no expuso client_map.');
}
const mapDi  = ctx.client_map.di  || {};
const mapBgc = ctx.client_map.bgc || {};
const mapCe  = ctx.client_map.ce  || {};

// =========================================================================
// 4. Procesar cada producto -> filas boti_alertas
// =========================================================================
const supabaseRows = [];
// agrupador para Telegram: { csm_email -> { chat_id, handle, nombre, buckets } }
const telegramByCsm = {};

function pushTelegram(csm_email, severidad, line) {
  if (TELEGRAM_SEVERIDADES.indexOf(severidad) === -1) return;
  if (!csm_email) return; // oncall sin owner — no notificamos via Telegram
  const csm = csmByEmail[csm_email];
  if (!csm || !csm.telegram_chat_id) return; // CSM sin chat_id — skip silencioso
  if (!telegramByCsm[csm_email]) {
    telegramByCsm[csm_email] = {
      chat_id: csm.telegram_chat_id,
      handle:  csm.telegram_handle || csm_email,
      nombre:  csm.nombre || csm_email,
      buckets: { critica: [], fuerte: [], crecimiento: [] },
    };
  }
  telegramByCsm[csm_email].buckets[severidad].push(line);
}

function processProduct(productCode, rows, clientMap, getCurr, getPrev, buildExtras, telegramLine) {
  for (const it of rows) {
    const r = it.json;
    if (!r) continue;
    const clientId = r.CLIENT_ID;
    if (!clientId) continue;
    const meta = clientMap[clientId];
    if (!meta) continue; // no esta en Supabase activo — ignorar
    if (clientId === '__EMPTY__') continue;

    const curr = Number(getCurr(r));
    const prev = Number(getPrev(r));
    const cls  = classify(curr, prev);

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
        metricas_extra:          buildExtras(r),
      },
    });

    // Filtro adicional para Telegram: volumen >= 500 en algun lado
    const maxVol = Math.max(curr, prev);
    if (maxVol >= VOLUME_FLOOR_TELEGRAM) {
      pushTelegram(meta.csm_email, cls.severidad, telegramLine(meta.nombre, productCode, cls, curr, prev, r));
    }
  }
}

// ------- DI -------
processProduct(
  'DI',
  $('Snowflake DI').all(),
  mapDi,
  r => r.MTD_PROCESSES,
  r => r.PMTD_PROCESSES,
  r => ({
    conversion_actual:    r.MTD_CONVERSION_PCT,
    conversion_anterior:  r.PMTD_CONVERSION_PCT,
    successes_actual:     r.MTD_SUCCESSES,
    successes_anterior:   r.PMTD_SUCCESSES,
  }),
  (nombre, prod, cls, curr, prev) =>
    `• ${nombre} — ${prod}: ${fmtPct(cls.variacion_pct)} (${fmtNum(prev)} → ${fmtNum(curr)})`
);

// ------- BGC -------
processProduct(
  'BGC',
  $('Snowflake BGC').all(),
  mapBgc,
  r => r.MTD_CHECKS,
  r => r.PMTD_CHECKS,
  r => ({
    score_actual:   r.MTD_AVG_SCORE,
    score_anterior: r.PMTD_AVG_SCORE,
  }),
  (nombre, prod, cls, curr, prev) =>
    `• ${nombre} — ${prod}: ${fmtPct(cls.variacion_pct)} (${fmtNum(prev)} → ${fmtNum(curr)})`
);

// ------- CE -------
processProduct(
  'CE',
  $('Snowflake CE').all(),
  mapCe,
  r => r.MTD_TOTAL,
  r => r.PMTD_TOTAL,
  r => ({
    inbound:        { curr: r.MTD_INBOUND,        prev: r.PMTD_INBOUND },
    outbound:       { curr: r.MTD_OUTBOUND,       prev: r.PMTD_OUTBOUND },
    notificaciones: { curr: r.MTD_NOTIFICATIONS,  prev: r.PMTD_NOTIFICATIONS },
  }),
  (nombre, prod, cls, curr, prev) =>
    `• ${nombre} — ${prod}: ${fmtPct(cls.variacion_pct)} (${fmtNum(prev)} → ${fmtNum(curr)})`
);

// =========================================================================
// 5. Construir mensajes Telegram (uno por CSM con alertas)
// =========================================================================
const today = new Date();
const fechaStr = today.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

const telegramItems = [];
for (const email in telegramByCsm) {
  if (!Object.prototype.hasOwnProperty.call(telegramByCsm, email)) continue;
  const cell = telegramByCsm[email];
  const total = cell.buckets.critica.length + cell.buckets.fuerte.length + cell.buckets.crecimiento.length;
  if (total === 0) continue;

  const lines = [];
  lines.push(`🚨 BotiAlertas — semana del ${fechaStr}`);
  lines.push('');
  lines.push(`Hola ${cell.handle}, cambios en tu cartera (${total}):`);

  if (cell.buckets.critica.length > 0) {
    lines.push('');
    lines.push(`🔴 CRITICAS (${cell.buckets.critica.length})`);
    for (const ln of cell.buckets.critica) lines.push(ln);
  }
  if (cell.buckets.fuerte.length > 0) {
    lines.push('');
    lines.push(`🟠 FUERTES (${cell.buckets.fuerte.length})`);
    for (const ln of cell.buckets.fuerte) lines.push(ln);
  }
  if (cell.buckets.crecimiento.length > 0) {
    lines.push('');
    lines.push(`📈 CRECIMIENTOS (${cell.buckets.crecimiento.length})`);
    for (const ln of cell.buckets.crecimiento) lines.push(ln);
  }
  lines.push('');
  lines.push('Detalle completo en /botialertas del CSM Center.');

  telegramItems.push({
    kind: 'telegram',
    payload: {
      chat_id:     cell.chat_id,
      csm_email:   email,
      csm_nombre:  cell.nombre,
      alert_count: total,
      text:        lines.join('\n'),
    },
  });
}

// =========================================================================
// 6. Output: items para Switch downstream
// =========================================================================
const out = [];
for (const r of supabaseRows)  out.push({ json: r });
for (const t of telegramItems) out.push({ json: t });

return out;
