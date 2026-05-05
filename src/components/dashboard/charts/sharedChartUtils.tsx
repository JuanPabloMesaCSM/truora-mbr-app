import { S } from "@/components/botialertas/types";

/**
 * Utilidades compartidas para los 4 charts del Dashboard.
 *
 * Paleta multi-serie: 8 colores distinguibles que se ven bien sobre fondo
 * S.surface (#172840). Diseñados para que series adyacentes contrasten.
 * Si hay más de 8 series, ciclan (raro en este dashboard — top 5 / top 6).
 */
export const CHART_PALETTE = [
  "#7C4DFF", // violet (primario CSM Center)
  "#10B981", // green (DI)
  "#0891B2", // cyan (CE)
  "#F59E0B", // amber
  "#EF4444", // red (rejection)
  "#A78BFA", // light purple
  "#22D3EE", // teal
  "#FB923C", // orange
] as const;

export function colorAt(i: number): string {
  return CHART_PALETTE[i % CHART_PALETTE.length];
}

/* ─────────────────────────── Tooltip dark personalizado ─────────────────────────── */

export interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
    payload?: Record<string, unknown>;
  }>;
  label?: string;
  /** Formatter para el valor (ej: número con miles, porcentaje) */
  valueFormatter?: (v: number) => string;
  /** Label override (ej: para mostrar mes legible en lugar de YYYY-MM-DD) */
  labelFormatter?: (l: string) => string;
}

export function DarkTooltip({
  active,
  payload,
  label,
  valueFormatter = (v) => v.toLocaleString("es-CO"),
  labelFormatter,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        background: S.surfaceHi,
        border: `1px solid ${S.borderHi}`,
        borderRadius: 10,
        padding: "10px 12px",
        boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
        fontSize: 12,
        color: S.text,
        minWidth: 180,
      }}
    >
      {label && (
        <div style={{ fontSize: 11, color: S.muted, marginBottom: 6, fontWeight: 600 }}>
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {payload.map((p, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: p.color,
                  display: "inline-block",
                }}
              />
              <span
                style={{
                  color: S.text,
                  maxWidth: 180,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {p.name}
              </span>
            </div>
            <span style={{ fontWeight: 700, color: S.text }}>{valueFormatter(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Eje y grid styles ─────────────────────────── */

export const AXIS_STYLE = {
  fontSize: 11,
  fill: S.muted,
};

export const GRID_STYLE = {
  stroke: S.border,
  strokeDasharray: "3 3",
};

/* ─────────────────────────── Sub-producto labels human-readable ─────────────────────────── */

/** Mapping de PRODUCT_IDENTIFIER técnico a label legible para charts.
 *  Cubre los identifiers conocidos de SHARED_COUNTERS_DYNAMO. */
export const SUB_PRODUCTO_LABELS: Record<string, string> = {
  // DI
  document_validation: "Validación documento",
  document_manual_review: "Revisión manual doc",
  passive_liveness: "Vida pasiva",
  face_search: "Reconocimiento facial",
  face_manual_review: "Revisión manual rostro",
  electronic_signature: "Firma electrónica",
  phone_verification: "Verificación teléfono",
  // BGC
  checks: "Background checks",
  // CE
  inbound: "Inbound",
  outbound: "Outbound",
  notification: "Notificaciones",
};

export function labelSubProducto(slug: string): string {
  return SUB_PRODUCTO_LABELS[slug] ?? slug.replace(/_/g, " ");
}

/* ─────────────────────────── Card wrapper común ─────────────────────────── */

export function ChartCard({
  title,
  subtitle,
  children,
  rightAccessory,
  height = 320,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  rightAccessory?: React.ReactNode;
  height?: number;
}) {
  return (
    <div
      style={{
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: 14,
        padding: "16px 18px 14px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: subtitle ? 4 : 12,
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: S.text }}>{title}</div>
        {rightAccessory}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: S.muted, marginBottom: 12 }}>{subtitle}</div>
      )}
      <div style={{ width: "100%", height }}>{children}</div>
    </div>
  );
}
