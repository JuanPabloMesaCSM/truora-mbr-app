export const RAZONES_DI: Record<string, { descripcion: string; esAlerta: boolean }> = {
  'blurry_image':                    { descripcion: 'La foto del documento estaba borrosa o con mala iluminación', esAlerta: false },
  'no_face_detected':                { descripcion: 'La cámara no detectó un rostro válido', esAlerta: false },
  'similarity_threshold_not_passed': { descripcion: 'El rostro no coincide suficientemente con la foto del documento', esAlerta: false },
  'risky_face_detected':             { descripcion: 'El sistema detectó una posible suplantación de identidad', esAlerta: true },
  'data_authorization_not_provided': { descripcion: 'El usuario no aceptó la pantalla de permisos', esAlerta: false },
  'canceled':                        { descripcion: 'El usuario canceló el proceso voluntariamente', esAlerta: false },
  'abandoned_without_using_retries': { descripcion: 'El usuario abandonó sin usar los reintentos disponibles', esAlerta: false },
  'face_validation_not_started':     { descripcion: 'El usuario llegó al paso de la selfie pero no lo completó', esAlerta: false },
  'expired_document':                { descripcion: 'El documento de identidad está vencido', esAlerta: false },
};

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
