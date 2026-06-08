// Diccionario central de motivos DI — único punto de traducción para todos
// los slides DI (DI-7 documento, DI-8 rostro, DI-9 análisis de fallos,
// DI-10b declinados, DI-12 fricción). Cualquier motivo nuevo que aparezca
// en producción debe agregarse acá, no en diccionarios locales por slide.
//
// ⚠️ SINCRONIZACIÓN OBLIGATORIA con el SQL del workflow `Report Builder DI`
// en n8n (CTEs `razones_doc_agg` y `razones_rostro_agg`). Esas CTEs filtran
// procesos por `IDENTITY_PROCESSES.DECLINED_REASON IN (lista)` para clasificar
// los motivos como doc o rostro. Si Truora suma un motivo nuevo:
//   1. Agregalo acá con su descripción humana en español.
//   2. Agregalo en la lista correspondiente del SQL (ver
//      `.claude/skills/snowflake-queries.md` sección "Listas de motivos
//      doc / rostro").
// Si solo se actualiza este archivo, el motivo se traduce pero nunca aparece
// porque el SQL lo filtra fuera de DI-7/DI-8. Si solo se actualiza el SQL,
// aparece en el slide pero sin traducción (cae al fallback snake_case).
export const RAZONES_DI: Record<string, { descripcion: string; esAlerta: boolean }> = {
  // ── Rechazos de documento ────────────────────────────────────────
  'blurry_image':                    { descripcion: 'La foto del documento estaba borrosa o con mala iluminación', esAlerta: false },
  'expired_document':                { descripcion: 'El documento de identidad está vencido', esAlerta: false },
  'document_has_expired':            { descripcion: 'El documento de identidad está vencido', esAlerta: false },
  'document_is_a_photocopy':         { descripcion: 'El usuario subió una fotocopia, no el documento original', esAlerta: false },
  'document_is_a_photo_of_photo':    { descripcion: 'El usuario tomó foto a una foto del documento, no al original', esAlerta: false },
  'document_does_not_match_account_id': { descripcion: 'El documento no coincide con la cuenta del usuario', esAlerta: true },
  'document_validation_not_started': { descripcion: 'El usuario no inició la validación de documento', esAlerta: false },

  // ── Rechazos de documento — nivel VALIDACIÓN (Validador / DOCUMENT_VALIDATION_HISTORY) ──
  // Códigos que llegan por DECLINED_REASON en el flujo "Report Builder Validador".
  // NO requieren sync con el SQL de RB DI (ese filtra por lista de procesos; este no).
  'missing_text':                    { descripcion: 'No se encontraron los campos necesarios para validar el documento', esAlerta: false },
  'image_face_validation_not_passed':{ descripcion: 'El análisis del rostro en la imagen del documento no fue aprobado', esAlerta: false },
  'production_data_inconsistency':   { descripcion: 'Los datos del documento presentan inconsistencias', esAlerta: false },
  'invalid_issue_date':              { descripcion: 'La fecha de expedición del documento es inválida', esAlerta: false },
  'front_document_not_found':        { descripcion: 'No se pudo identificar el documento frontal en la imagen', esAlerta: false },
  'document_not_recognized':         { descripcion: 'No se pudo reconocer el tipo de documento', esAlerta: false },

  // ── Rechazos de rostro ───────────────────────────────────────────
  'no_face_detected':                { descripcion: 'La cámara no detectó un rostro válido', esAlerta: false },
  'similarity_threshold_not_passed': { descripcion: 'El rostro no coincide suficientemente con la foto del documento', esAlerta: false },
  'risky_face_detected':             { descripcion: 'El sistema detectó una posible suplantación de identidad', esAlerta: true },
  'passive_liveness_verification_not_passed': { descripcion: 'El rostro detectado no superó la prueba de vida', esAlerta: false },
  'user_face_match_in_client_collection': { descripcion: 'El rostro coincide con otro usuario registrado del cliente', esAlerta: true },
  'face_validation_not_started':     { descripcion: 'El usuario llegó al paso de la selfie pero no lo completó', esAlerta: false },

  // ── Permisos / inputs faltantes / abandono ──────────────────────
  'data_authorization_not_provided': { descripcion: 'El usuario no aceptó la pantalla de permisos', esAlerta: false },
  'geolocation_not_provided':        { descripcion: 'El usuario no compartió su ubicación', esAlerta: false },
  'input_file_not_uploaded':         { descripcion: 'El usuario no subió el archivo requerido', esAlerta: false },
  'abandoned_without_using_retries': { descripcion: 'El usuario abandonó sin usar los reintentos disponibles', esAlerta: false },
  'user_stopped_responding':         { descripcion: 'El usuario dejó de responder', esAlerta: false },
  'agent_stopped_responding':        { descripcion: 'El agente dejó de responder', esAlerta: false },
  'canceled':                        { descripcion: 'El usuario canceló el proceso voluntariamente', esAlerta: false },
  'validations_failed':              { descripcion: 'Las validaciones del proceso fallaron', esAlerta: false },
  'validation_not_finished':         { descripcion: 'El usuario no completó la validación', esAlerta: false },

  // ── Códigos agregados 2026-06-08 (Crediplus + Efecty) ────────────
  // Documento — SINCRONIZADOS con la lista doc del SQL razones_doc_agg.
  'invalid_document_status':               { descripcion: 'El estado del documento no es válido para verificar', esAlerta: false },
  'data_not_match_with_government_database':{ descripcion: 'Los datos del documento no coinciden con la base de gobierno', esAlerta: true },
  'document_unregistered':                 { descripcion: 'El documento no está registrado en la entidad', esAlerta: false },
  'missing_issue_number':                  { descripcion: 'Falta el número de expedición del documento', esAlerta: false },
  'invalid_qr_content':                    { descripcion: 'El contenido del código QR del documento es inválido', esAlerta: false },
  'invalid_issue_date':                    { descripcion: 'La fecha de expedición del documento es inválida', esAlerta: false },
  'invalid_mrz':                           { descripcion: 'La zona de lectura mecánica (MRZ) del documento es inválida', esAlerta: false },
  // Rostro — SINCRONIZADOS con la lista rostro del SQL razones_rostro_agg.
  'face_not_detected':                     { descripcion: 'No se detectó un rostro en la captura', esAlerta: false },
  // Proceso / infraestructura — NO van en listas doc/rostro → caen en "otro" (solo DI-10b).
  'government_database_unavailable':       { descripcion: 'La base de datos de la entidad de gobierno no estaba disponible', esAlerta: false },
  'risk_signal_detected':                  { descripcion: 'El sistema detectó una señal de riesgo', esAlerta: true },
  'not_enough_credits_in_electronic_signature': { descripcion: 'No había créditos suficientes de firma electrónica', esAlerta: false },
  'max_retries_reached':                   { descripcion: 'El usuario agotó los reintentos disponibles', esAlerta: false },
  'custom_question_max_retries_reached':   { descripcion: 'El usuario agotó los reintentos de las preguntas de seguridad', esAlerta: false },

  // Bucket sintético generado por el frontend (top-N + resto agregado).
  '__otros__':                             { descripcion: 'Otros motivos', esAlerta: false },
  // Validación declined sin DECLINED_REASON registrado (grano validación DI-7/DI-8).
  '(sin motivo)':                          { descripcion: 'Sin motivo registrado', esAlerta: false },
};

// Helper único: obtiene la descripción humana de un motivo DI.
// Si no hay traducción registrada cae a snake_case→espacios para que al menos
// se lea legible (pero en un único idioma, sin mezclar inglés y español).
export function describeRazonDI(codigo: string): { descripcion: string; esAlerta: boolean } {
  const direct = RAZONES_DI[codigo];
  if (direct) return direct;
  return { descripcion: (codigo || '').replace(/_/g, ' '), esAlerta: false };
}

export const LABELS_BGC: Record<string, { descripcion: string; esAlerta: boolean }> = {
  'High':   { descripcion: 'Alerta de riesgo alto', esAlerta: true },
  'Medium': { descripcion: 'Alerta de riesgo medio', esAlerta: false },
  'Low':    { descripcion: 'Información de bajo riesgo', esAlerta: false },
};

export const FALLOS_CE: Record<string, { descripcion: string; esAlerta: boolean }> = {
  'Message Undeliverable':        { descripcion: 'El número no existe, está bloqueado o no tiene WhatsApp', esAlerta: false },
  'Healthy ecosystem engagement': { descripcion: 'Meta limitó la entrega por baja interacción histórica', esAlerta: false },
  'User is part of an experiment':{ descripcion: 'Meta incluyó al usuario en un experimento de control', esAlerta: false },
  'Usuario bloqueó marketing':    { descripcion: 'El usuario optó por no recibir mensajes de marketing', esAlerta: true },
  'Límite spam':                  { descripcion: 'Se alcanzó el límite de mensajes permitidos por Meta', esAlerta: true },
  'Other':                        { descripcion: 'Error técnico o desconocido', esAlerta: false },
};

/** Obtiene descripción legible de un label BGC (ej: 'CO_High', 'MX_Medium') */
export function getLabelBGC(label: string): { descripcion: string; esAlerta: boolean } {
  const nivel = Object.keys(LABELS_BGC).find(k => label.includes(k));
  const pais = label.split('_')[0];
  if (!nivel) return { descripcion: label, esAlerta: false };
  return {
    descripcion: `${LABELS_BGC[nivel].descripcion} en ${pais}`,
    esAlerta: LABELS_BGC[nivel].esAlerta,
  };
}
