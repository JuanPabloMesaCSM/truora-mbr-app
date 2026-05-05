/**
 * Types, parsers y constantes para la página /dashboard.
 *
 * El backend (workflow n8n "Dashboard Metrics Detail") devuelve un JSON
 * agrupado por producto y por bloque, con cada bloque siendo un array de
 * filas con shape `{ periodo, col1..col_extra4 }` (todo VARCHAR del SQL).
 *
 * Los `parse*` helpers de este archivo convierten esas filas planas en
 * objetos semánticos que los componentes pueden consumir directo.
 *
 * Convención COL1..COL_EXTRA4 → campo: ver `.claude/skills/snowflake-queries.md`
 * sección "MAPEO COMPLETO DE COLUMNAS POR BLOQUE". Adaptado al subset de
 * bloques que devuelve el query nuevo del dashboard (no el Report Builder).
 */

export type Producto = "DI" | "BGC" | "CE";
export const PROD_LIST: Producto[] = ["DI", "BGC", "CE"];

/** URL del webhook n8n "Dashboard Metrics Detail" */
export const DASHBOARD_DETAIL_WEBHOOK_URL =
  "https://n8n.zapsign.com.br/webhook/dashboard-metrics-detail";

/* ─────────────────────────── Response shape ─────────────────────────── */

/** Una fila del output normalizado de Snowflake. Todos los valores llegan
 *  como string (VARCHAR) o null, así que cada parser hace su propio cast. */
export interface BloqueRow {
  periodo: string | null;
  col1: string | null;  col2: string | null;  col3: string | null;
  col4: string | null;  col5: string | null;  col6: string | null;
  col7: string | null;  col8: string | null;  col9: string | null;
  col10: string | null; col11: string | null;
  col_extra1: string | null; col_extra2: string | null;
  col_extra3: string | null; col_extra4: string | null;
}

/** Producto → bloque → filas del bloque. Si el query no devolvió un bloque
 *  específico (cliente sin datos), el bloque puede no estar presente. */
export type BloqueMap = Record<string, BloqueRow[]>;

export interface DashboardResponse {
  ok: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  productos: Producto[];
  productos_ejecutados: Record<Producto, boolean>;
  data: {
    DI: BloqueMap | null;
    BGC: BloqueMap | null;
    CE: BloqueMap | null;
  };
}

/* ─────────────────────────── Periodo presets ─────────────────────────── */

export type PeriodoPresetId =
  | "mes_actual"
  | "mes_pasado"
  | "ult_3_meses"
  | "ytd"
  | "anio_completo"
  | "custom";

export interface PeriodoSeleccion {
  preset: PeriodoPresetId;
  inicio: string; // YYYY-MM-DD
  fin: string;    // YYYY-MM-DD
}

/** Devuelve el rango por defecto para cada preset, calculado contra la
 *  fecha de hoy en zona Bogotá. */
export function buildPreset(id: PeriodoPresetId, today: Date = new Date()): PeriodoSeleccion {
  const y = today.getFullYear();
  const m = today.getMonth(); // 0-indexed

  function fmt(d: Date): string {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  }

  if (id === "mes_actual") {
    const inicio = new Date(y, m, 1);
    return { preset: id, inicio: fmt(inicio), fin: fmt(today) };
  }
  if (id === "mes_pasado") {
    const inicio = new Date(y, m - 1, 1);
    const fin = new Date(y, m, 0); // último día del mes anterior
    return { preset: id, inicio: fmt(inicio), fin: fmt(fin) };
  }
  if (id === "ult_3_meses") {
    const inicio = new Date(y, m - 2, 1);
    return { preset: id, inicio: fmt(inicio), fin: fmt(today) };
  }
  if (id === "ytd") {
    const inicio = new Date(y, 0, 1);
    return { preset: id, inicio: fmt(inicio), fin: fmt(today) };
  }
  if (id === "anio_completo") {
    const inicio = new Date(y, 0, 1);
    const fin = new Date(y, 11, 31);
    return { preset: id, inicio: fmt(inicio), fin: fmt(fin) };
  }
  // custom: arranca con mes_actual como base, el user lo ajusta
  const inicio = new Date(y, m, 1);
  return { preset: id, inicio: fmt(inicio), fin: fmt(today) };
}

export const PRESET_LABELS: Record<PeriodoPresetId, string> = {
  mes_actual: "Mes actual",
  mes_pasado: "Mes pasado",
  ult_3_meses: "Últimos 3 meses",
  ytd: "Año en curso (YTD)",
  anio_completo: "Año completo",
  custom: "Rango personalizado",
};

/* ─────────────────────────── Parsers DI ─────────────────────────── */

export interface DiMetricasGenerales {
  totalProcesos: number;
  exitosos: number;
  fallidos: number;
  expirados: number;
  declinados: number;
  erroresTecnicos: number;
  cancelados: number;
  conversionPct: number | null;
  totalProcesosPrev: number;
  exitososPrev: number;
  conversionPctPrev: number | null;
  variacionProcesosPct: number | null;
}

export function parseDiMetricasGenerales(bloques: BloqueMap | null): DiMetricasGenerales | null {
  if (!bloques) return null;
  const rows = bloques["1_metricas_generales"];
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    totalProcesos: numOrZero(r.col1),
    exitosos: numOrZero(r.col2),
    fallidos: numOrZero(r.col3),
    expirados: numOrZero(r.col4),
    declinados: numOrZero(r.col5),
    erroresTecnicos: numOrZero(r.col6),
    cancelados: numOrZero(r.col7),
    conversionPct: numOrNull(r.col8),
    totalProcesosPrev: numOrZero(r.col9),
    exitososPrev: numOrZero(r.col10),
    conversionPctPrev: numOrNull(r.col11),
    variacionProcesosPct: numOrNull(r.col_extra1),
  };
}

export interface DiHistoricoMes {
  periodo: string; // YYYY-MM-01
  totalProcesos: number;
  exitosos: number;
  conversionPct: number | null;
}

export function parseDiHistorico(bloques: BloqueMap | null): DiHistoricoMes[] {
  if (!bloques) return [];
  const rows = bloques["4_historico_mensual"] ?? [];
  return rows.map((r) => ({
    periodo: r.periodo ?? "",
    totalProcesos: numOrZero(r.col1),
    exitosos: numOrZero(r.col2),
    conversionPct: numOrNull(r.col3),
  })).filter((x) => x.periodo);
}

export interface RazonItem {
  motivo: string;
  total: number;
}

export function parseRazonesGenerico(bloques: BloqueMap | null, bloqueKey: string): RazonItem[] {
  if (!bloques) return [];
  const rows = bloques[bloqueKey] ?? [];
  return rows
    .map((r) => ({
      motivo: r.col1 ?? "—",
      total: numOrZero(r.col2),
    }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
}

/* ─────────────────────────── Parsers BGC ─────────────────────────── */

export interface BgcResumenGeneral {
  totalChecks: number;
  completados: number;
  errores: number;
  scorePromedio: number | null;
  passRatePct: number | null;
  rejectionRatePct: number | null;
  totalChecksPrev: number;
  completadosPrev: number;
  scorePromedioPrev: number | null;
  passRatePctPrev: number | null;
  variacionChecksPct: number | null;
}

export function parseBgcResumen(bloques: BloqueMap | null): BgcResumenGeneral | null {
  if (!bloques) return null;
  const rows = bloques["1_resumen_general"];
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    totalChecks: numOrZero(r.col1),
    completados: numOrZero(r.col2),
    errores: numOrZero(r.col3),
    scorePromedio: numOrNull(r.col4),
    passRatePct: numOrNull(r.col5),
    rejectionRatePct: numOrNull(r.col6),
    totalChecksPrev: numOrZero(r.col7),
    completadosPrev: numOrZero(r.col8),
    scorePromedioPrev: numOrNull(r.col9),
    passRatePctPrev: numOrNull(r.col10),
    variacionChecksPct: numOrNull(r.col11),
  };
}

export interface BgcPaisRow {
  pais: string;
  totalChecks: number;
  completados: number;
  errores: number;
  scorePromedio: number | null;
  passRatePct: number | null;
  rejectionRatePct: number | null;
  pctSobreTotal: number | null;
}

export function parseBgcPorPais(bloques: BloqueMap | null): BgcPaisRow[] {
  if (!bloques) return [];
  const rows = bloques["2_por_pais"] ?? [];
  return rows.map((r) => ({
    pais: r.col1 ?? "—",
    totalChecks: numOrZero(r.col2),
    completados: numOrZero(r.col3),
    errores: numOrZero(r.col4),
    scorePromedio: numOrNull(r.col5),
    passRatePct: numOrNull(r.col6),
    rejectionRatePct: numOrNull(r.col7),
    pctSobreTotal: numOrNull(r.col8),
  })).sort((a, b) => b.totalChecks - a.totalChecks);
}

export interface BgcAnomaliaRow {
  label: string;
  pais: string;
  scorePromedio: number | null;
  totalChecks: number;
  esAnomalia: boolean;
}

export function parseBgcAnomalias(bloques: BloqueMap | null): BgcAnomaliaRow[] {
  if (!bloques) return [];
  const rows = bloques["6_labels_high_score"] ?? [];
  return rows.map((r) => ({
    label: r.col1 ?? "—",
    pais: r.col2 ?? "—",
    scorePromedio: numOrNull(r.col3),
    totalChecks: numOrZero(r.col4),
    esAnomalia: r.col5 === "1",
  }));
}

export interface BgcHistoricoMes {
  periodo: string;
  totalChecks: number;
  completados: number;
  errores: number;
  scorePromedio: number | null;
  passRatePct: number | null;
  tasaCompletadoPct: number | null;
}

export function parseBgcHistorico(bloques: BloqueMap | null): BgcHistoricoMes[] {
  if (!bloques) return [];
  const rows = bloques["7_historico_mensual"] ?? [];
  return rows.map((r) => ({
    periodo: r.periodo ?? "",
    totalChecks: numOrZero(r.col1),
    completados: numOrZero(r.col2),
    errores: numOrZero(r.col3),
    scorePromedio: numOrNull(r.col4),
    passRatePct: numOrNull(r.col5),
    tasaCompletadoPct: numOrNull(r.col6),
  })).filter((x) => x.periodo);
}

/* ─────────────────────────── Parsers CE ─────────────────────────── */

export interface CeConsumoTotal {
  inbound: number;
  outbound: number;
  notif: number;
  total: number;
  inboundPrev: number;
  outboundPrev: number;
  notifPrev: number;
  totalPrev: number;
  variacionTotalPct: number | null;
  variacionOutboundPct: number | null;
  variacionInboundPct: number | null;
}

export function parseCeConsumo(bloques: BloqueMap | null): CeConsumoTotal | null {
  if (!bloques) return null;
  const rows = bloques["1_consumo_total"];
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    inbound: numOrZero(r.col1),
    outbound: numOrZero(r.col2),
    notif: numOrZero(r.col3),
    total: numOrZero(r.col4),
    inboundPrev: numOrZero(r.col5),
    outboundPrev: numOrZero(r.col6),
    notifPrev: numOrZero(r.col7),
    totalPrev: numOrZero(r.col8),
    variacionTotalPct: numOrNull(r.col9),
    variacionOutboundPct: numOrNull(r.col10),
    variacionInboundPct: numOrNull(r.col11),
  };
}

export interface CeFalloItem {
  categoria: string;
  totalFallos: number;
  pctDentroFallos: number | null;
}

export function parseCeFallos(bloques: BloqueMap | null): { items: CeFalloItem[]; pctExito: number | null; totalOutbound: number } {
  if (!bloques) return { items: [], pctExito: null, totalOutbound: 0 };
  const rows = bloques["3_fallos_outbound"] ?? [];
  if (rows.length === 0) return { items: [], pctExito: null, totalOutbound: 0 };
  const items = rows.map((r) => ({
    categoria: r.col1 ?? "—",
    totalFallos: numOrZero(r.col2),
    pctDentroFallos: numOrNull(r.col3),
  })).sort((a, b) => b.totalFallos - a.totalFallos);
  // col4 (totalOutbound), col7 (pctExito) son repetidos en cada fila — tomamos del primero
  const first = rows[0];
  return {
    items,
    pctExito: numOrNull(first.col7),
    totalOutbound: numOrZero(first.col4),
  };
}

export interface CeHistoricoMes {
  periodo: string;
  inbound: number;
  outbound: number;
  notif: number;
  total: number;
}

export function parseCeHistorico(bloques: BloqueMap | null): CeHistoricoMes[] {
  if (!bloques) return [];
  const rows = bloques["5c_tendencia_mensual"] ?? [];
  return rows.map((r) => ({
    periodo: r.periodo ?? "",
    inbound: numOrZero(r.col1),
    outbound: numOrZero(r.col2),
    notif: numOrZero(r.col3),
    total: numOrZero(r.col4),
  })).filter((x) => x.periodo);
}

/* ─────────────────────────── Helpers internos ─────────────────────────── */

function numOrZero(v: string | null): number {
  if (v == null) return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function numOrNull(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/* ─────────────────────────── Lenguaje DI razones ─────────────────────────── */

/** Traduce los slugs técnicos que devuelve SF a labels human-readable.
 *  Los slugs vienen de DOCUMENT_VALIDATION_HISTORY.declined_reason e
 *  IDENTITY_PROCESSES.canceled_reason / declined_reason. */
export const DI_RAZON_LABELS: Record<string, string> = {
  // Documento
  blurry_image: "Imagen borrosa",
  document_is_a_photo_of_photo: "Foto de foto del documento",
  document_not_recognized: "Documento no reconocido",
  document_has_expired: "Documento vencido",
  missing_text: "Texto del documento ilegible",
  front_document_not_found: "Frente del documento no encontrado",
  reverse_document_not_found: "Reverso del documento no encontrado",
  document_is_a_photocopy: "Documento es fotocopia",
  damaged_document: "Documento dañado",
  invalid_inputs_to_create_check: "Datos inválidos al crear validación",
  missing_document_number: "Falta número de documento",
  missing_date_of_birth: "Falta fecha de nacimiento",
  missing_expiration_date: "Falta fecha de vencimiento",
  invalid_issue_date: "Fecha de expedición inválida",
  document_unregistered: "Documento no registrado en BD oficial",
  data_not_match_with_government_database: "Datos no coinciden con BD del gobierno",
  government_database_unavailable: "BD del gobierno no disponible",
  production_data_inconsistency: "Inconsistencia en datos de producción",
  document_does_not_match_account_id: "Documento no coincide con la cuenta",
  front_side_document_is_a_photocopy: "Frente del documento es fotocopia",
  // Rostro
  no_face_detected: "No se detectó rostro",
  face_not_detected: "Rostro no detectado",
  similarity_threshold_not_passed: "Similitud insuficiente entre rostro y documento",
  passive_liveness_verification_not_passed: "Verificación de vida (pasiva) no superada",
  liveness_verification_not_passed: "Verificación de vida no superada",
  risky_face_detected: "Rostro de riesgo detectado",
  image_face_validation_not_passed: "Validación de imagen del rostro fallida",
  invalid_video_file: "Archivo de video inválido",
  risk_signal_detected: "Señal de riesgo detectada",
  // Abandono / cancelación
  abandoned_without_using_retries: "Abandonó sin reintentar",
  document_validation_not_started: "No inició validación de documento",
  face_validation_not_started: "No inició validación de rostro",
  not_answered_question: "No respondió pregunta",
  data_authorization_not_provided: "No autorizó tratamiento de datos",
  user_stopped_responding: "Usuario dejó de responder",
  canceled: "Cancelado por usuario",
  sin_motivo_registrado: "Sin motivo registrado",
  // Cancelados explícitos (lista skill snowflake-queries)
  other_reason: "Otro motivo",
  dont_want_to_send_my_document: "No quiere enviar el documento",
  dont_want_to_continue: "No quiere continuar",
  dont_understand_what_to_do: "No entiende qué hacer",
  other: "Otro",
  camara_problems: "Problemas con la cámara",
  dont_have_my_phone: "No tiene su celular",
  dont_want_to_send_my_video: "No quiere enviar video",
  dont_know_how_to_take_the_photo: "No sabe cómo tomar la foto",
  dont_have_my_document: "No tiene su documento",
  dont_want_to_send_my_number: "No quiere enviar su número",
  my_document_type_is_not_there: "Tipo de documento no disponible",
  doesnt_redirect_me: "No redirige correctamente",
};

export function labelRazon(slug: string): string {
  return DI_RAZON_LABELS[slug] ?? slug.replace(/_/g, " ");
}

/* ─────────────────────────── Cliente row ─────────────────────────── */

/** Cliente extraído de Supabase. Lo usamos en el ClientePicker para
 *  saber qué TCIs tiene cada cliente en cada producto (y deshabilitar
 *  productos sin client_id). */
export interface ClienteRow {
  id: string;
  nombre: string;
  csm_email: string;
  client_id_di: string | null;
  client_id_bgc: string | null;
  client_id_ce: string | null;
  activo: boolean;
}
