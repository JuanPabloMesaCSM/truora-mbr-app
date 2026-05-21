/**
 * Tipos + paleta para la página /queries (Query Repository).
 *
 * Reutiliza S (paleta dark) y ADMIN_VIEW_EMAILS desde botialertas/types
 * para mantener consistencia con el resto del shell.
 */

import { S, ADMIN_VIEW_EMAILS } from "@/components/botialertas/types";

export { S, ADMIN_VIEW_EMAILS };

/* ─────────────── Datos del catálogo ─────────────── */

export type QueryProducto = "DI" | "BGC" | "CE" | "SUPABASE" | "GLOBAL";
export type QueryFuente = "snowflake" | "clickhouse" | "supabase";
export type QueryStatus = "draft" | "approved" | "deprecated";

export interface QueryParam {
  name: string;
  type: "string" | "date" | "number" | "array" | "boolean";
  required: boolean;
  description?: string;
  default?: unknown;
}

export interface QueryRow {
  id: string;
  nombre: string;
  slug: string;
  producto: QueryProducto;
  fuente: QueryFuente;
  tags: string[];
  sql_template: string;
  descripcion: string;
  descripcion_csm: string | null;
  parametros: QueryParam[];
  ejemplos_uso: string[];
  skill_referencias: string[];
  status: QueryStatus;
  creado_por: string;
  ultima_validacion: string | null;
  veces_usado: number;
  creado_en: string;
  actualizado_en: string;
  /* Modelo D — pointer pattern + drift + cross-refs */
  workflow_id_origen: string | null;
  bloque_id_origen: string | null;
  drift_detected_at: string | null;
  nota_importante: string | null;
  queries_relacionadas: string[];
  /* Embedido via PostgREST select=workflow_snapshots(*) */
  workflow?: WorkflowSnapshotLite | null;
}

export interface WorkflowSnapshotLite {
  workflow_id: string;
  workflow_name: string;
  last_synced_at: string;
  drift_detected_at: string | null;
}

/* ─────────────── Colores ─────────────── */

export const PRODUCTO_COLOR: Record<QueryProducto, string> = {
  DI:       "#00C9A7",
  BGC:      "#6C3FC5",
  CE:       "#0891B2",
  GLOBAL:   "#7C4DFF",
  SUPABASE: "#3FCF8E",
};

export const FUENTE_COLOR: Record<QueryFuente, string> = {
  snowflake:  "#F59E0B",
  clickhouse: "#FBBF24",
  supabase:   "#3FCF8E",
};

export const FUENTE_LABEL: Record<QueryFuente, string> = {
  snowflake:  "Snowflake",
  clickhouse: "ClickHouse",
  supabase:   "Supabase",
};

export const STATUS_COLOR: Record<QueryStatus, string> = {
  approved:   "#22C55E",
  draft:      "#F59E0B",
  deprecated: "#64748B",
};

export const STATUS_LABEL: Record<QueryStatus, string> = {
  approved:   "Aprobado",
  draft:      "Borrador",
  deprecated: "Deprecado",
};
