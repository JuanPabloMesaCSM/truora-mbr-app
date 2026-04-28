export type Product = 'DI' | 'BGC' | 'CE';

export const PRODUCT_COLORS: Record<Product, string> = {
  DI: '#00C9A7',
  BGC: '#6C3FC5',
  CE: '#0891B2',
};

export const PRODUCT_LABELS: Record<Product, string> = {
  DI: 'Digital Identity',
  BGC: 'Background Checks',
  CE: 'Customer Engagement',
};

export const PRODUCT_WEBHOOKS: Record<Product, string> = {
  DI: 'https://n8n.zapsign.com.br/webhook/report-builder',
  BGC: 'https://n8n.zapsign.com.br/webhook/report-builder-bgc',
  CE: 'https://n8n.zapsign.com.br/webhook/report-builder-ce-async',
};

export const PRODUCT_CLIENT_FIELD: Record<Product, 'client_id_di' | 'client_id_bgc' | 'client_id_ce'> = {
  DI: 'client_id_di',
  BGC: 'client_id_bgc',
  CE: 'client_id_ce',
};

export type ChartType =
  | 'donut' | 'vertical-bars' | 'horizontal-bars' | 'stacked-bars'
  | 'stacked-100' | 'table' | 'ranked-list' | 'semicircles'
  | 'donut-list' | 'bars-line' | 'kpi-table' | 'grouped-bars' | 'kpi-mom';

export interface ModuleDef {
  id: string;
  label: string;
  desc: string;
  description: string;
  chart: ChartType;
  isBase?: boolean;
  hasFlowIdInput?: boolean;
  hasFlowSelector?: boolean;
  /* Si true, el modulo expone un selector de WABAs (lineas WhatsApp) en LeftPanel.
   * Aplica a Ce4 (5_flujo_inbound) y Ce5 (6_agentes_general). El backend usa la
   * seleccion para filtrar `INBOUND_WABA_FILTER` y `AGENTES_WABA_FILTER`. La
   * seleccion del modulo `6_agentes_general` aplica tambien a `7_agentes_top5`
   * porque comparten la misma CTE `agentes_actual` en el query Snowflake. */
  hasWabaSelector?: boolean;
  insightMode?: 'ai' | 'manual' | null;
  insightText?: string;
}

export interface ModuleInsight {
  mode: 'ai' | 'manual' | null;
  text: string;
}

export const MODULES: Record<Product, { base: ModuleDef; optional: ModuleDef[] }> = {
  DI: {
    base: { id: '1_metricas_generales', label: 'Conversión General del Proceso', desc: 'Dona + KPIs principales', description: 'Volumen total de procesos, tasa de conversión global y distribución de exitosos, fallidos, expirados y cancelados.', chart: 'donut', isBase: true },
    optional: [
      { id: '2_usuarios_reintentos', label: 'Usuarios y Reintentos', desc: 'Barras verticales', description: 'Usuarios únicos que iniciaron el proceso, tasa de conversión por usuario y distribución por número de intentos realizados.', chart: 'vertical-bars' },
      { id: '3_validaciones_doc_rostro', label: 'Validación de Documento vs Rostro', desc: 'Semicírculos', description: 'Tasa de éxito separada para validación de documento y reconocimiento facial, con detalle de abandonos y declinados.', chart: 'semicircles' },
      { id: '6_funnel', label: 'Embudo de Conversión', desc: 'Barras horizontales', description: 'Paso a paso de cuántos usuarios inician el proceso, llegan a documento y llegan a rostro.', chart: 'horizontal-bars' },
      { id: '7_razones_doc', label: 'Top 5 Rechazos: Documento', desc: 'Lista rankeada', description: 'Las 5 razones más frecuentes por las que la validación de documento fue rechazada.', chart: 'ranked-list' },
      { id: '8_razones_rostro', label: 'Top 5 Rechazos: Rostro', desc: 'Lista rankeada', description: 'Las 5 razones más frecuentes por las que el reconocimiento facial fue rechazado.', chart: 'ranked-list' },
      { id: '9_abandono', label: 'Análisis de Abandono', desc: 'Dona + lista', description: 'Distribución de procesos expirados (usuario abandonó) vs cancelados (usuario abortó), con motivos principales.', chart: 'donut-list' },
      { id: '10_declinados', label: 'Rechazos por Declinado', desc: 'Barras horizontales', description: 'Ranking de motivos por los que el sistema declinó el proceso, con volumen por razón.', chart: 'horizontal-bars' },
      { id: '11_friccion_usuario', label: 'Errores por Usuario Único', desc: 'Tabla', description: 'Motivos de fallo agrupados por usuarios únicos afectados, no por intentos totales.', chart: 'table' },
      { id: '4_historico_3meses', label: 'Evolución Histórica', desc: 'Barras + línea', description: 'Volumen de procesos y tasa de conversión de los últimos 3 meses para análisis de tendencia.', chart: 'bars-line' },
      { id: '5_flujos', label: 'Rendimiento por Flujos', desc: 'Tabla', description: 'Comparativo de conversión por cada flujo activo del cliente con variación MoM.', chart: 'table' },
    ],
  },
  BGC: {
    base: { id: '1_resumen_general', label: 'Resumen General', desc: 'Dona pass/rejection + KPIs', description: 'Total de checks, score promedio, pass rate y rejection rate del mes con comparativo vs mes anterior.', chart: 'donut', isBase: true },
    optional: [
      { id: '2_por_pais', label: 'Distribución por País', desc: 'Barras horizontales + tabla', description: 'Volumen, pass rate y score promedio por cada país donde el cliente tiene operaciones activas.', chart: 'horizontal-bars' },
      { id: '2b_pais_x_tipo', label: 'País por Tipo de Verificación', desc: 'Barras apiladas', description: 'Cruce de país vs tipo de verificación para entender la composición del volumen.', chart: 'stacked-bars' },
      { id: '3_por_tipo', label: 'Distribución por Tipo', desc: 'Barras horizontales', description: 'Volumen y pass rate por cada custom type configurado por el cliente.', chart: 'horizontal-bars' },
      { id: '4_score_por_pais', label: 'Score por País', desc: 'Barras apiladas 100%', description: 'Distribución de scores 0-10 por país, destacando el porcentaje de rechazados (score ≤ 6).', chart: 'stacked-100' },
      { id: '5_labels', label: 'Análisis de Labels', desc: 'Barras horizontales', description: 'Top labels asignados por el sistema de riesgo, con frecuencia por país.', chart: 'horizontal-bars' },
      { id: '6_labels_high_score', label: 'Labels High + Score', desc: 'Tabla de anomalías', description: 'Detección de anomalías: labels High que deberían tener score 6 pero muestran score diferente.', chart: 'table' },
      { id: '7_historico_3meses', label: 'Evolución Histórica', desc: 'Barras + líneas', description: 'Volumen de checks, score promedio y pass rate de los últimos 3 meses.', chart: 'bars-line' },
    ],
  },
  CE: {
    base: { id: '1_consumo_total', label: 'Consumo Total', desc: 'Barras apiladas inbound/outbound/notificaciones', description: 'Inbounds, outbounds y notificaciones del mes con variación MoM vs mes anterior.', chart: 'stacked-bars', isBase: true },
    optional: [
      { id: '2_eficiencia_campanas', label: 'Eficiencia de Campañas', desc: 'KPIs + tabla top 5', description: 'Tasas globales de entrega, lectura e interacción, más top 5 campañas por % de interacciones.', chart: 'kpi-table' },
      { id: '3_fallos_outbound', label: 'Razones de Fallo Outbound', desc: 'Barras agrupadas', description: 'Top 5 razones por las que los mensajes outbound no llegaron al usuario, comparado con el mes anterior.', chart: 'grouped-bars' },
      { id: '4_funnel_generico', label: 'Funnel Outbound', desc: 'Barras horizontales', description: 'De enviados a completados: enviados → fallan por Meta → recibidos → no respondidos → procesos iniciados → completados.', chart: 'horizontal-bars', hasFlowSelector: true },
      { id: '4b_funnel_steps', label: 'Funnel por Steps', desc: 'Barras horizontales', description: 'Drop-off paso a paso dentro de un flujo específico. Requiere FLOW_ID del flujo a analizar.', chart: 'horizontal-bars', hasFlowSelector: true },
      { id: '4c_vrf', label: 'Verificación (VRF)', desc: 'Funnel por flujo', description: 'Documento → rostro → liveness → firma por cada flujo seleccionado que tenga VRF habilitado.', chart: 'horizontal-bars', hasFlowSelector: true },
      { id: '4d_vrf_arbol', label: 'Verificación Árbol (VRF)', desc: 'Funnel tipo árbol', description: 'Journey completo: enviados → recibidos → contestados → documento → rostro → liveness → firma, en formato árbol jerárquico.', chart: 'horizontal-bars', hasFlowSelector: true },
      { id: '5_flujo_inbound', label: 'Resultados Flujo Inbound', desc: 'Dona + KPIs', description: 'Conversaciones recibidas, % que pasaron a agente humano y % resueltas exitosamente por el bot. Seleccioná flujos y/o líneas WhatsApp específicas para filtrar la métrica.', chart: 'donut', hasFlowSelector: true, hasWabaSelector: true },
      { id: '5b_consumo_por_linea', label: 'Consumo por Línea/Flujo', desc: 'Barras horizontales', description: 'Volumen de mensajes enviados por cada línea o flujo, ordenado de mayor a menor.', chart: 'horizontal-bars' },
      { id: '5c_tendencia_mensual', label: 'Tendencia Mensual', desc: 'Barras + línea', description: 'Evolución del volumen de conversaciones por tipo (inbound, outbound, notificación) de los últimos 3-6 meses.', chart: 'bars-line' },
      { id: '5d_heatmap_lineas', label: 'Heatmap Cambios por Línea', desc: 'Tabla de calor', description: 'Actividad por línea WhatsApp en los últimos 3 meses con indicadores de líneas nuevas y detenidas.', chart: 'table' },
      { id: '6_comparativo_flujos', label: 'Comparativo entre Flujos', desc: 'Tabla comparativa', description: 'Métricas clave (enviados, recepción, fallos Meta, conversión) lado a lado para todos los flujos CE activos. Incluye % Doc y % Rostro si el flujo tiene VRF.', chart: 'table' },
      { id: '6_agentes_general', label: 'Desempeño de Agentes', desc: 'KPIs con MoM', description: 'Mediana de tiempo de primera respuesta, % conversaciones cerradas y atendidas con comparativo MoM. Seleccioná líneas WhatsApp para filtrar (aplica también a Top 5 Agentes).', chart: 'kpi-mom', hasWabaSelector: true },
      { id: '7_agentes_top5', label: 'Métricas por Agente Top 5', desc: 'Tabla', description: 'Tabla individual de los 5 agentes con mayor volumen: atención, cierre, expiradas y tiempos de respuesta.', chart: 'table' },
    ],
  },
};

/* ─── Supabase row types (until auto-regenerated) ─── */

export interface CsmRow {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
}

export interface ClienteRow {
  id: string;
  nombre: string;
  csm_email: string;
  client_id_di: string | null;
  client_id_bgc: string | null;
  client_id_ce: string | null;
  caso_uso: string | null;
  activo: boolean;
}

/* ─── Period helpers ─── */

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function generatePeriods() {
  const periods: { label: string; value: string }[] = [];
  for (const year of [2025, 2026]) {
    for (let m = 0; m < 12; m++) {
      periods.push({
        label: `${MONTH_NAMES[m]} ${year}`,
        value: `${year}-${String(m + 1).padStart(2, '0')}`,
      });
    }
  }
  return periods;
}

export function parsePeriod(value: string) {
  const [yearStr, monthStr] = value.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr);
  const fechaInicio = `${year}-${monthStr}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const fechaFin = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
  const periodoReporte = `${MONTH_NAMES[month - 1]} ${year}`;
  return { fechaInicio, fechaFin, periodoReporte };
}

export const ADMIN_EMAIL = 'jpmesa@truora.com';

/* Mapping: metric key (insights_por_metrica) → slide IDs that receive that insight */
export const INSIGHT_TO_SLIDES: Record<string, string[]> = {
  volumen:                    ['1_metricas_generales', '1_resumen_general', '1_consumo_total'],
  conversion_global:          ['1_metricas_generales'],
  conversion_promedio_flujos: ['1_metricas_generales', '5_flujos'],
  reintentos:                 ['2_usuarios_reintentos'],
  declinados:                 ['10_declinados'],
  rechazados:                 ['7_razones_doc', '8_razones_rostro'],
  distribucion_labels:        ['5_labels'],
  custom_types:               ['3_por_tipo'],
  eficiencia_campanas:        ['2_eficiencia_campanas'],
  fallos_outbound:            ['3_fallos_outbound'],
  inbound:                    ['5_flujo_inbound'],
  agentes:                    ['6_agentes_general'],
  consumo_total:              ['1_consumo_total'],
};
