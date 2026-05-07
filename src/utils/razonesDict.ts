// Diccionario central de motivos DI — único punto de traducción para todos
// los slides DI (DI-7 documento, DI-8 rostro, DI-9 análisis de fallos,
// DI-10b declinados, DI-12 fricción). Cualquier motivo nuevo que aparezca
// en producción debe agregarse acá, no en diccionarios locales por slide.
export const RAZONES_DI: Record<string, { descripcion: string; esAlerta: boolean }> = {
  // ── Rechazos de documento ────────────────────────────────────────
  'blurry_image':                    { descripcion: 'La foto del documento estaba borrosa o con mala iluminación', esAlerta: false },
  'expired_document':                { descripcion: 'El documento de identidad está vencido', esAlerta: false },
  'document_has_expired':            { descripcion: 'El documento de identidad está vencido', esAlerta: false },
  'document_is_a_photocopy':         { descripcion: 'El usuario subió una fotocopia, no el documento original', esAlerta: false },
  'document_is_a_photo_of_photo':    { descripcion: 'El usuario tomó foto a una foto del documento, no al original', esAlerta: false },
  'document_does_not_match_account_id': { descripcion: 'El documento no coincide con la cuenta del usuario', esAlerta: true },
  'document_validation_not_started': { descripcion: 'El usuario no inició la validación de documento', esAlerta: false },

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
