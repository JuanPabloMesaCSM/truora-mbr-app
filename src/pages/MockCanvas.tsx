import { useState } from "react";
import { SlideCanvas, type Theme, type CeFlowData, PortadaSlide, AgendaSlide, SeparadorSlide, InsightsFinalesSlide, UpdatesSlide, CierreSlide } from "@/components/report-builder/SlideCanvas";
import { exportPDF } from "@/utils/exportPDF";

const DI_MOCK_DATA = {
  status: "success" as const,
  data: {
    "1_metricas_generales": [{
      bloque: "1_metricas_generales",
      col1: "26603", col2: "20995", col3: "4891",
      col4: "2318",  col5: "1876",  col6: "697",
      col7: "523",   col8: "78.9",  col9: "24100",
      col10: "18800", col11: "78.0", col_extra1: "10.4",
    }],
    "2_usuarios_reintentos": [{
      bloque: "2_usuarios_reintentos",
      col1: "18450", col2: "14600", col3: "79.1",
      col4: "16200", col5: "76.8",
      col6: "9200",  col7: "5100",  col8: "2800", col9: "1350",
      col10: "1.4",
    }],
    "3_validaciones_doc_rostro": [{
      bloque: "3_validaciones_doc_rostro",
      col1: "24100", col2: "19800", col3: "82.2",
      col4: "22300", col5: "80.1",
      col6: "22800", col7: "18200", col8: "79.8",
      col9: "21100", col10: "77.3",
      col11: "1820", col_extra1: "1240",
      col_extra2: "1560", col_extra3: "980",
    }],
    "4_historico_3meses": [
      { bloque: "4_historico_3meses", periodo: "2026-01-01", col1: "22100", col2: "16900", col3: "76.5", col4: "15800", col5: "71.5" },
      { bloque: "4_historico_3meses", periodo: "2026-02-01", col1: "24100", col2: "18800", col3: "78.0", col4: "17200", col5: "74.2" },
      { bloque: "4_historico_3meses", periodo: "2026-03-01", col1: "26603", col2: "20995", col3: "78.9", col4: "18450", col5: "79.1" },
    ],
    "5_flujos": [
      { bloque: "5_flujos", col1: "Captura Pereira", col2: "474", col3: "380", col4: "94", col5: "80.2", col_extra1: "+2.1% UP" },
      { bloque: "5_flujos", col1: "Captura Cali",    col2: "470", col3: "371", col4: "99", col5: "78.9", col_extra1: "-0.8% DOWN" },
      { bloque: "5_flujos", col1: "Captura Cúcuta",  col2: "448", col3: "348", col4: "100", col5: "77.7", col_extra1: "+1.2% UP" },
    ],
    "6_funnel": [{
      bloque: "6_funnel",
      col1: "26603", col2: "24100", col3: "22800",
      col4: "90.6",  col5: "85.7",
    }],
    "7_razones_doc": [
      { bloque: "7_razones_doc", col1: "blurry_image",                      col2: "820" },
      { bloque: "7_razones_doc", col1: "no_face_detected",                  col2: "614" },
      { bloque: "7_razones_doc", col1: "data_authorization_not_provided",   col2: "398" },
      { bloque: "7_razones_doc", col1: "similarity_threshold_not_passed",   col2: "287" },
      { bloque: "7_razones_doc", col1: "canceled",                          col2: "121" },
    ],
    "8_razones_rostro": [
      { bloque: "8_razones_rostro", col1: "similarity_threshold_not_passed", col2: "743" },
      { bloque: "8_razones_rostro", col1: "no_face_detected",                col2: "521" },
      { bloque: "8_razones_rostro", col1: "risky_face_detected",             col2: "312" },
      { bloque: "8_razones_rostro", col1: "blurry_image",                    col2: "198" },
      { bloque: "8_razones_rostro", col1: "face_validation_not_started",     col2: "87"  },
    ],
    "9_abandono": [
      { bloque: "9_abandono", col1: "abandoned_without_using_retries",  col2: "1240" },
      { bloque: "9_abandono", col1: "face_validation_not_started",      col2: "892"  },
      { bloque: "9_abandono", col1: "data_authorization_not_provided",  col2: "654"  },
      { bloque: "9_abandono", col1: "canceled",                         col2: "432"  },
      { bloque: "9_abandono", col1: "blurry_image",                     col2: "287"  },
      { bloque: "9_abandono", col1: "no_face_detected",                 col2: "113"  },
    ],
    "10_declinados": [
      { bloque: "10_declinados", col1: "similarity_threshold_not_passed",  col2: "743" },
      { bloque: "10_declinados", col1: "risky_face_detected",              col2: "521" },
      { bloque: "10_declinados", col1: "blurry_image",                     col2: "312" },
      { bloque: "10_declinados", col1: "no_face_detected",                 col2: "198" },
      { bloque: "10_declinados", col1: "data_authorization_not_provided",  col2: "87"  },
      { bloque: "10_declinados", col1: "expired_document",                 col2: "54"  },
    ],
    "11_friccion_usuario": [
      { bloque: "11_friccion_usuario", col1: "similarity_threshold_not_passed",  col2: "612" },
      { bloque: "11_friccion_usuario", col1: "abandoned_without_using_retries",  col2: "487" },
      { bloque: "11_friccion_usuario", col1: "no_face_detected",                 col2: "398" },
      { bloque: "11_friccion_usuario", col1: "blurry_image",                     col2: "276" },
      { bloque: "11_friccion_usuario", col1: "data_authorization_not_provided",  col2: "198" },
      { bloque: "11_friccion_usuario", col1: "face_validation_not_started",      col2: "143" },
      { bloque: "11_friccion_usuario", col1: "risky_face_detected",              col2: "87"  },
      { bloque: "11_friccion_usuario", col1: "canceled",                         col2: "54"  },
    ],
  },
  warnings: [],
};

const BGC_MOCK_DATA = {
  status: "success" as const,
  data: {
    "1_resumen_general": [{
      bloque: "1_resumen_general",
      col1: "14280", col4: "72.4", col5: "68.3", col6: "8.7",
      col9: "13100", col10: "66.1", col11: "9.0",
      col_extra1: "+6.3", col_extra2: "+2.2",
    }],
    "2_por_pais": [
      { bloque: "2_por_pais", col1: "Colombia",   col3: "4820", col5: "74.2", col6: "70.1", col8: "33.8" },
      { bloque: "2_por_pais", col1: "México",     col3: "3640", col5: "71.8", col6: "67.4", col8: "25.5" },
      { bloque: "2_por_pais", col1: "Perú",       col3: "2910", col5: "73.1", col6: "69.2", col8: "20.4" },
      { bloque: "2_por_pais", col1: "Chile",      col3: "1650", col5: "70.5", col6: "65.8", col8: "11.6" },
      { bloque: "2_por_pais", col1: "Ecuador",    col3: "1260", col5: "69.3", col6: "63.4", col8: "8.8"  },
    ],
    "4_score_por_pais": [
      { bloque: "4_score_por_pais", col1: "Colombia", col3: "4820", col6: "0" },
      { bloque: "4_score_por_pais", col1: "Colombia", col3: "420",  col6: "1" },
      { bloque: "4_score_por_pais", col1: "México",   col3: "3640", col6: "0" },
      { bloque: "4_score_por_pais", col1: "México",   col3: "380",  col6: "1" },
      { bloque: "4_score_por_pais", col1: "Perú",     col3: "2910", col6: "0" },
      { bloque: "4_score_por_pais", col1: "Perú",     col3: "310",  col6: "1" },
      { bloque: "4_score_por_pais", col1: "Chile",    col3: "1650", col6: "0" },
      { bloque: "4_score_por_pais", col1: "Chile",    col3: "190",  col6: "1" },
      { bloque: "4_score_por_pais", col1: "Ecuador",  col3: "1260", col6: "0" },
      { bloque: "4_score_por_pais", col1: "Ecuador",  col3: "160",  col6: "1" },
    ],
    "5_labels": [
      { bloque: "5_labels", col1: "identity_mismatch",         col3: "1840", col5: "12.9" },
      { bloque: "5_labels", col1: "criminal_record",           col3: "1520", col5: "10.6" },
      { bloque: "5_labels", col1: "incomplete_data",           col3: "1180", col5: "8.3"  },
      { bloque: "5_labels", col1: "document_expired",          col3: "920",  col5: "6.4"  },
      { bloque: "5_labels", col1: "address_mismatch",          col3: "740",  col5: "5.2"  },
    ],
    "6_labels_high_score": [
      { bloque: "6_labels_high_score", col1: "Colombia_identity_mismatch", col4: "312", col5: "1" },
      { bloque: "6_labels_high_score", col1: "México_criminal_record",     col4: "287", col5: "1" },
      { bloque: "6_labels_high_score", col1: "Perú_incomplete_data",       col4: "198", col5: "0" },
      { bloque: "6_labels_high_score", col1: "Chile_document_expired",     col4: "143", col5: "0" },
      { bloque: "6_labels_high_score", col1: "Ecuador_address_mismatch",   col4: "87",  col5: "1" },
    ],
    "7_historico_3meses": [
      { bloque: "7_historico_3meses", periodo: "2026-01-01", col1: "12400", col4: "70.1", col5: "64.8", col6: "88.2" },
      { bloque: "7_historico_3meses", periodo: "2026-02-01", col1: "13100", col4: "71.3", col5: "66.1", col6: "89.4" },
      { bloque: "7_historico_3meses", periodo: "2026-03-01", col1: "14280", col4: "72.4", col5: "68.3", col6: "90.1" },
    ],
    "2b_pais_x_tipo": [
      { bloque: "2b_pais_x_tipo", col1: "CO", col2: "bg-check-driver",  col3: "28400", col7: "93.1" },
      { bloque: "2b_pais_x_tipo", col1: "CO", col2: "bg-check-courier", col3: "12100", col7: "91.4" },
      { bloque: "2b_pais_x_tipo", col1: "CO", col2: "person",           col3: "3600",  col7: "88.2" },
      { bloque: "2b_pais_x_tipo", col1: "MX", col2: "bg-check-driver",  col3: "18200", col7: "92.8" },
      { bloque: "2b_pais_x_tipo", col1: "MX", col2: "solo_imss",        col3: "6400",  col7: "94.1" },
      { bloque: "2b_pais_x_tipo", col1: "MX", col2: "person",           col3: "3200",  col7: "87.6" },
      { bloque: "2b_pais_x_tipo", col1: "PE", col2: "bg-check-driver",  col3: "8900",  col7: "90.2" },
      { bloque: "2b_pais_x_tipo", col1: "PE", col2: "person",           col3: "2900",  col7: "86.4" },
    ],
    "3_por_tipo": [
      { bloque: "3_por_tipo", col1: "bg-check-driver",  col2: "55500", col3: "54200", col5: "92.4", col6: "59.2" },
      { bloque: "3_por_tipo", col1: "bg-check-courier", col2: "18900", col3: "18400", col5: "91.1", col6: "20.1" },
      { bloque: "3_por_tipo", col1: "solo_imss",        col2: "8100",  col3: "7980",  col5: "94.2", col6: "8.7"  },
      { bloque: "3_por_tipo", col1: "person",           col2: "7200",  col3: "6980",  col5: "87.3", col6: "7.6"  },
      { bloque: "3_por_tipo", col1: "doc-verification", col2: "3534",  col3: "3007",  col5: "85.1", col6: "3.3"  },
    ],
  },
  warnings: [],
};

const CE_MOCK_DATA = {
  status: "success" as const,
  data: {
    // COL1=total_inbounds, COL2=recipients_outbound, COL3=recipients_notificacion,
    // COL4=total_conversaciones, COL5=inbounds_prev, COL6=outbound_prev,
    // COL7=notif_prev, COL8=total_prev,
    // COL9=var_total_pct, COL10=var_outbound_pct, COL11=var_inbound_pct,
    // COL_EXTRA1=dir_total, COL_EXTRA2=dir_outbound, COL_EXTRA3=dir_inbound
    "1_consumo_total": [{
      bloque: "1_consumo_total",
      col1: "18420",  col2: "21480",  col3: "8420",   col4: "48320",
      col5: "16800",  col6: "19600",  col7: "7700",   col8: "44100",
      col9: "9.6",    col10: "9.6",   col11: "9.6",
      col_extra1: "UP", col_extra2: "UP", col_extra3: "UP",
    }],
    // COL1=tipo(GLOBAL|TOP5), COL2=nombre_campana/total_campanas,
    // COL3=total_recipients, COL4=total_delivered,
    // COL5=tasa_entrega_pct, COL6=tasa_lectura_pct, COL7=tasa_interaccion_pct,
    // COL8=entrega_prev, COL9=lectura_prev, COL10=interaccion_prev,
    // COL11=var_entrega_pp, COL_EXTRA1=var_lectura_pp, COL_EXTRA2=var_interaccion_pp
    "2_eficiencia_campanas": [
      { bloque: "2_eficiencia_campanas", col1: "GLOBAL", col2: "28",
        col3: "183600", col4: "163600", col5: "89.1", col6: "74.3", col7: "38.2",
        col8: "86.4",   col9: "71.8",   col10: "35.9",
        col11: "+2.7",  col_extra1: "+2.5", col_extra2: "+2.3" },
      { bloque: "2_eficiencia_campanas", col1: "TOP5", col2: "Campaña Cobranza Q1",
        col3: "8420",  col4: "8200", col5: "97.4", col6: "82.1", col7: "52.3" },
      { bloque: "2_eficiencia_campanas", col1: "TOP5", col2: "Campaña Bienvenida",
        col3: "6140",  col4: "5880", col5: "95.8", col6: "78.4", col7: "48.1" },
      { bloque: "2_eficiencia_campanas", col1: "TOP5", col2: "Campaña Renovación",
        col3: "4930",  col4: "4680", col5: "94.9", col6: "76.2", col7: "44.7" },
      { bloque: "2_eficiencia_campanas", col1: "TOP5", col2: "Campaña Retención",
        col3: "3820",  col4: "3620", col5: "94.8", col6: "74.8", col7: "41.2" },
      { bloque: "2_eficiencia_campanas", col1: "TOP5", col2: "Campaña Mora 30",
        col3: "2840",  col4: "2680", col5: "94.4", col6: "72.1", col7: "38.9" },
    ],
    // Múltiples filas (una por categoría de fallo). COL1=categoria_fallo,
    // COL2=total_actual, COL3=pct_actual, COL4=total_prev, COL5=pct_prev, COL6=variacion_pp,
    // COL7=exitosos_actual(global), COL8=fallidos_actual(global), COL9=pct_exito_actual,
    // COL10=exitosos_prev, COL11=pct_exito_prev (repetido en cada fila)
    "3_fallos_outbound": [
      { bloque: "3_fallos_outbound",
        col1: "Message Undeliverable",     col2: "2180", col3: "45.2", col4: "1920", col5: "45.7", col6: "-0.5",
        col7: "26585", col8: "4823", col9: "84.6", col10: "23800", col11: "85.0" },
      { bloque: "3_fallos_outbound",
        col1: "Número inválido",           col2: "1240", col3: "25.7", col4: "1080", col5: "25.7", col6: "0.0",
        col7: "26585", col8: "4823", col9: "84.6", col10: "23800", col11: "85.0" },
      { bloque: "3_fallos_outbound",
        col1: "Cuenta bloqueada",          col2: "890",  col3: "18.5", col4: "780",  col5: "18.6", col6: "-0.1",
        col7: "26585", col8: "4823", col9: "84.6", col10: "23800", col11: "85.0" },
      { bloque: "3_fallos_outbound",
        col1: "Usuario bloqueó marketing", col2: "513",  col3: "10.6", col4: "420",  col5: "10.0", col6: "+0.6",
        col7: "26585", col8: "4823", col9: "84.6", col10: "23800", col11: "85.0" },
    ],
    // COL1=conv_recibidas, COL2=pct_pauta_meta(null→N/D), COL3=conv_con_agente,
    // COL4=pct_conv_a_agente, COL5=conv_exitosas, COL6=pct_exitosos, COL7=pct_fallidos,
    // COL8=conv_recibidas_prev, COL9=pct_a_agente_prev,
    // COL10=variacion_conv_pct, COL11=variacion_a_agente_pp
    "5_flujo_inbound": [{
      bloque: "5_flujo_inbound",
      col1: "16912", col2: "42.3",  col3: "14320", col4: "84.7",
      col5: "8640",  col6: "51.1",  col7: "15.3",
      col8: "15800", col9: "82.1",  col10: "+7.0", col11: "+2.6",
    }],
    // COL1=total_conversaciones, COL2=agentes_activos, COL3=conv_atendidas,
    // COL4=pct_atendidas, COL5=conv_cerradas, COL6=pct_cerradas,
    // COL7=mediana_primera_respuesta_min, COL8=mediana_duracion_min,
    // COL9=total_conv_prev, COL10=pct_cerradas_prev, COL11=mediana_rta_prev,
    // COL_EXTRA1=var_cerradas_pp, COL_EXTRA2=var_mediana_rta_min, COL_EXTRA3=conv_sin_asignar
    "6_agentes_general": [{
      bloque: "6_agentes_general",
      col1: "14320", col2: "24",    col3: "12840", col4: "89.7",
      col5: "10920", col6: "76.3",  col7: "4.2",   col8: "12.4",
      col9: "13200", col10: "74.1", col11: "4.8",
      col_extra1: "+2.2", col_extra2: "-0.6", col_extra3: "280",
    }],
    // COL1=agente, COL2=total_conv, COL3=pct_atendidas, COL4=pct_cerradas,
    // COL5=pct_expiradas_agente(>15%→rojo), COL6=pct_expiradas_usuario,
    // COL7=mediana_primera_rta_min(>10→ámbar), COL8=mediana_duracion_min
    "7_agentes_top5": [
      { bloque: "7_agentes_top5", col1: "Ana García",  col2: "620", col3: "94.8", col4: "82.1", col5: "3.2",  col6: "4.8",  col7: "3.4",  col8: "11.2" },
      { bloque: "7_agentes_top5", col1: "Luis Mora",   col2: "581", col3: "92.4", col4: "79.3", col5: "7.3",  col6: "8.9",  col7: "4.1",  col8: "13.6" },
      { bloque: "7_agentes_top5", col1: "Sofía Reyes", col2: "541", col3: "93.6", col4: "80.7", col5: "5.8",  col6: "6.1",  col7: "3.9",  col8: "12.8" },
      { bloque: "7_agentes_top5", col1: "Carlos Vega", col2: "512", col3: "91.2", col4: "74.8", col5: "18.2", col6: "11.4", col7: "11.2", col8: "14.9" },
      { bloque: "7_agentes_top5", col1: "María López", col2: "494", col3: "92.7", col4: "77.2", col5: "4.3",  col6: "5.0",  col7: "4.3",  col8: "12.1" },
    ],
  },
  warnings: [],
};

const CE_MOCK_FLOWS: CeFlowData[] = [
  {
    flow_id: "flow_cobranza_q1",
    flow_name: "Cobranza Q1",
    tiene_vrf: true,
    // COL1=enviados, COL2=fallan_meta, COL3=recepcion, COL4=no_respondidos,
    // COL5=iniciados_otb, COL6=iniciados_inb, COL7=total_procesos,
    // COL8=enviados_prev, COL9=fallan_meta_prev, COL10=recepcion_prev
    funnel_otb: {
      COL1: "8420", COL2: "500",  COL3: "7920", COL4: "2030",
      COL5: "5890", COL6: "420",  COL7: "6310",
      COL8: "7800", COL9: "490",  COL10: "7310",
    },
    // COL1=step_nombre, COL2=procesos_iniciados, COL3=procesos_exitosos,
    // COL4=drop_off_abs, COL5=drop_off_pct, COL6=orden(1=mayor volumen)
    funnel_steps: [
      { COL1: "Bienvenida",         COL2: "5890", COL3: "5730", COL4: "160", COL5: "2.7",  COL6: "1" },
      { COL1: "Verificación datos", COL2: "5730", COL3: "5345", COL4: "385", COL5: "6.7",  COL6: "2" },
      { COL1: "Oferta de pago",     COL2: "5345", COL3: "4773", COL4: "572", COL5: "10.7", COL6: "3" },
      { COL1: "Confirmación",       COL2: "4773", COL3: "4127", COL4: "646", COL5: "13.5", COL6: "4" },
    ],
    // COL1=doc_iniciados, COL2=doc_exitosos, COL3=doc_expira,
    // COL4=doc_tasa_exito(%), COL5=doc_tasa_expira(%),
    // COL6=rostro_iniciados, COL7=rostro_exitosos, COL8=rostro_tasa_exito(%),
    // COL9=identidad_exitosa, COL10=identidad_tasa_exito(%),
    // COL11=firma_iniciada, COL_EXTRA1=firma_exitosa, COL_EXTRA2=firma_tasa_exito(%)
    vrf: {
      COL1: "4127",  COL2: "3887",  COL3: "124",  COL4: "94.2",  COL5: "3.0",
      COL6: "3887",  COL7: "3570",  COL8: "91.8",
      COL9: "3540",  COL10: "85.8",
      COL11: "3540", COL_EXTRA1: "3124", COL_EXTRA2: "88.2",
    },
  },
  {
    flow_id: "flow_bienvenida",
    flow_name: "Bienvenida Nuevos",
    tiene_vrf: false,
    funnel_otb: {
      COL1: "6140", COL2: "320",  COL3: "5820", COL4: "340",
      COL5: "5480", COL6: "0",    COL7: "5480",
      COL8: "5800", COL9: "340",  COL10: "5460",
    },
    funnel_steps: [
      { COL1: "Saludo inicial",    COL2: "5480", COL3: "5370", COL4: "110", COL5: "2.0",  COL6: "1" },
      { COL1: "Presentación",      COL2: "5370", COL3: "5070", COL4: "300", COL5: "5.6",  COL6: "2" },
      { COL1: "Activación cuenta", COL2: "5070", COL3: "4446", COL4: "624", COL5: "12.3", COL6: "3" },
      { COL1: "Cierre",            COL2: "4446", COL3: "4127", COL4: "319", COL5: "7.2",  COL6: "4" },
    ],
    vrf: {
      COL1: "0", COL2: "0", COL3: "0", COL4: "0",   COL5: "0",
      COL6: "0", COL7: "0", COL8: "0",
      COL9: "0", COL10: "0", COL11: "0",
      COL_EXTRA1: "0", COL_EXTRA2: "0",
    },
  },
];

const CE_SLIDES = [
  "1_consumo_total",
  "2_eficiencia_campanas",
  "3_fallos_outbound",
  "5_flujo_inbound",
  "6_agentes_general",
  "7_agentes_top5",
];

// Per-flow slide IDs: sep → otb → steps → vrf
const CE_FLOW_SLIDE_IDS = CE_MOCK_FLOWS.flatMap((_, i) => [
  `ce_sep_${i}`,
  `ce_otb_${i}`,
  `ce_steps_${i}`,
  `ce_vrf_${i}`,
]);

const DI_SLIDES = [
  "1_metricas_generales",
  "2_usuarios_reintentos",
  "3_validaciones_doc_rostro",
  "4_historico_3meses",
  "5_flujos",
  "6_funnel",
  "7_razones_doc",
  "9_abandono",
  "11_friccion_usuario",
];

const BGC_SLIDES = [
  "1_resumen_general",   // BGC-1 Actividad del mes
  "2_por_pais",          // BGC-2 Resultados por país
  "4_score_por_pais",    // BGC-3 Aprobados vs rechazados por país
  "5_labels",            // BGC-4 Alertas de riesgo detectadas
  "7_historico_3meses",  // BGC-5 Tendencia de los últimos 3 meses
  "2b_pais_x_tipo",      // BGC-6 Qué se verifica en cada país
  "3_por_tipo",          // BGC-7 Tipos de verificación activos
];

const TOTAL_PAGES = DI_SLIDES.length + BGC_SLIDES.length + CE_SLIDES.length + CE_FLOW_SLIDE_IDS.length + 2;

export default function MockCanvas() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [insightsAi, setInsightsAi] = useState(true);
  const [manualInsight, setManualInsight] = useState("");

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a12", padding: "24px 32px" }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 12, marginBottom: 28, alignItems: "center", position: "sticky", top: 0, zIndex: 10, background: "#0a0a12", padding: "8px 0" }}>
        <span style={{ color: "#94A3B8", fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Mock Canvas — DI · BGC · CE · Flujos · ✦ Insight Demo
        </span>
        {(["dark", "light"] as Theme[]).map(t => (
          <button key={t} onClick={() => setTheme(t)} style={{
            padding: "6px 16px", borderRadius: 6, border: "none", cursor: "pointer",
            background: theme === t ? (t === "dark" ? "#4B6FFF" : "#6B4EFF") : "#1e2040",
            color: "#fff", fontSize: 12, fontWeight: 600, textTransform: "capitalize",
          }}>
            {t}
          </button>
        ))}
        <button
          onClick={() => exportPDF("Cliente_Demo", "Marzo_2026", () => setExportingPdf(true), () => setExportingPdf(false))}
          disabled={exportingPdf}
          style={{
            padding: "6px 16px", borderRadius: 6, border: "none", cursor: exportingPdf ? "not-allowed" : "pointer",
            background: exportingPdf ? "#475569" : "#00D4A0",
            color: "#fff", fontSize: 12, fontWeight: 700, opacity: exportingPdf ? 0.7 : 1,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          {exportingPdf ? "⏳ Generando PDF..." : "⬇ Exportar PDF"}
        </button>
        {/* Toggle Insights AI */}
        <button
          onClick={() => setInsightsAi(v => !v)}
          style={{
            padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer",
            background: insightsAi ? "#6B4EFF" : "#1e2040",
            color: "#fff", fontSize: 12, fontWeight: 600,
          }}
        >
          ✦ Insights IA: {insightsAi ? "ON" : "OFF"}
        </button>
        <span style={{ color: "#475569", fontSize: 11 }}>
          {TOTAL_PAGES} slides · scroll para ver todos
        </span>
      </div>

      {/* All slides stacked vertically */}
      <div id="canvas-mbr-slides" style={{ display: "flex", flexDirection: "column", gap: 24, overflowX: "auto" }}>

        {/* ── Assets fijos apertura ── */}
        <PortadaSlide clientName="Cliente Demo" periodLabel="Marzo 2026" />
        <AgendaSlide />
        <SeparadorSlide src="/assets/mbr/separados-metricas.png" alt="Métricas del mes" />

        {DI_SLIDES.map((slideId, idx) => (
          <SlideCanvas
            key={slideId}
            slideId={slideId}
            product="DI"
            data={DI_MOCK_DATA.data}
            theme={theme}
            clientName="Cliente Demo"
            periodLabel="Marzo 2026"
            pageNum={idx + 1}
            totalPages={TOTAL_PAGES}
          />
        ))}
        {BGC_SLIDES.map((slideId, idx) => (
          <SlideCanvas
            key={`bgc_${slideId}`}
            slideId={slideId}
            product="BGC"
            data={BGC_MOCK_DATA.data}
            theme={theme}
            clientName="Cliente Demo"
            periodLabel="Marzo 2026"
            pageNum={DI_SLIDES.length + idx + 1}
            totalPages={TOTAL_PAGES}
          />
        ))}
        {CE_SLIDES.map((slideId, idx) => (
          <SlideCanvas
            key={`ce_${slideId}`}
            slideId={slideId}
            product="CE"
            data={CE_MOCK_DATA.data}
            ceFlows={CE_MOCK_FLOWS}
            theme={theme}
            clientName="Cliente Demo"
            periodLabel="Marzo 2026"
            pageNum={DI_SLIDES.length + BGC_SLIDES.length + idx + 1}
            totalPages={TOTAL_PAGES}
          />
        ))}
        {CE_FLOW_SLIDE_IDS.map((slideId, idx) => (
          <SlideCanvas
            key={`ceflow_${slideId}`}
            slideId={slideId}
            product="CE"
            data={CE_MOCK_DATA.data}
            ceFlows={CE_MOCK_FLOWS}
            theme={theme}
            clientName="Cliente Demo"
            periodLabel="Marzo 2026"
            pageNum={DI_SLIDES.length + BGC_SLIDES.length + CE_SLIDES.length + idx + 1}
            totalPages={TOTAL_PAGES}
          />
        ))}

        {/* ── Assets fijos cierre ── */}
        <SeparadorSlide src="/assets/mbr/separados-insights.png" alt="Insights y conclusiones" />
        <InsightsFinalesSlide
          insightsAi={insightsAi}
          insightText={insightsAi
            ? "La tasa de conversión del mes alcanzó 78.9%, mejorando 0.9pp respecto a febrero. El crecimiento en volumen de +10.4% MoM se explica por la expansión del flujo Captura Pereira. Se recomienda monitorear el incremento en expirados (+12% MoM). En BGC, el pass rate se mantiene estable en 84.2% con score promedio de 7.4. Los principales rechazos siguen concentrados en CO (38%) y MX (29%). Para CE, la tasa de interacción de campañas subió 2.3pp hasta 38.2%, con la campaña Cobranza Q1 liderando con 52.3%."
            : manualInsight}
          onInsightChange={insightsAi ? undefined : setManualInsight}
        />
        <SeparadorSlide src="/assets/mbr/separador-updates.png" alt="Updates de producto" />
        <UpdatesSlide />
        <CierreSlide csmName="Juan Pablo Mesa" />

        {/* ── Insight Demo ── */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 20, marginTop: 8 }}>
          <p style={{ color: "#4B6FFF", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>
            ✦ Demo Insight Panel — con IA / manual
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SlideCanvas
              key="insight_demo_ai"
              slideId="1_metricas_generales"
              product="DI"
              data={DI_MOCK_DATA.data}
              theme={theme}
              clientName="Cliente Demo"
              periodLabel="Marzo 2026"
              pageNum={TOTAL_PAGES - 1}
              totalPages={TOTAL_PAGES}
              insightSource="ai"
              insightText="La tasa de conversión del mes alcanzó 78.9%, representando una mejora de 0.9pp respecto a febrero. El crecimiento en volumen de +10.4% MoM se explica principalmente por la expansión del flujo Captura Pereira, que concentra el 39% de los nuevos procesos. Se recomienda monitorear el incremento en expirados (+12% MoM) antes del próximo reporte."
            />
            <SlideCanvas
              key="insight_demo_manual"
              slideId="2_usuarios_reintentos"
              product="DI"
              data={DI_MOCK_DATA.data}
              theme={theme}
              clientName="Cliente Demo"
              periodLabel="Marzo 2026"
              pageNum={TOTAL_PAGES}
              totalPages={TOTAL_PAGES}
              insightSource="manual"
              insightText="El cliente reportó problemas de cámara en dispositivos Android 12 durante la primera semana del mes, lo que explica el pico de usuarios con 3+ intentos. Ya fue escalado a producto."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
