import { Users, UserCheck, Mail, Phone } from "lucide-react";
import { S } from "@/components/botialertas/types";

/**
 * Slide reutilizable — Forms asistido vs Sin asistir para Cueros Velez.
 *
 * Datos pre-procesados desde IDENTITY_PROCESSES + el JSON `VARIABLES`
 * (Oct 2025 – Abr 2026, TCI fb5e5b58…). Distingue dos motores de captación:
 *
 *   - **Asistido**: 1 flujo (IPF344e8d97...) acompañado por la red de
 *     asesores. 4.839 procesos, 57,6% conversión. Captura nombre del asesor
 *     + tel + email del cliente.
 *   - **No Asistido**: 17 flujos auto-gestionados, 3.722 procesos, 19,2%
 *     conversión combinada. Sin captura de contacto.
 *
 * Top 7 asesores cubren el 88,5% del volumen del motor asistido.
 *
 * Sin insight callout ni footer (pedido del CSM).
 */

const TOTAL_ASISTIDO = 4839;
const EXITOSOS_ASISTIDO = 2787;
const PCT_ASISTIDO = 57.6;

const TOTAL_NO_ASISTIDO = 3722;
const EXITOSOS_NO_ASISTIDO = 716;
const PCT_NO_ASISTIDO = 19.2;

const TOTAL_EMAIL = 2717;
const TOTAL_TELEFONO = 2717;

const ASESORES = [
  { nombre: "Iván Leal", procesos: 504 },
  { nombre: "Valeria Rojas", procesos: 493 },
  { nombre: "María José Olaya", procesos: 431 },
  { nombre: "Luisa Peñate", procesos: 326 },
  { nombre: "Angela González", procesos: 264 },
  { nombre: "Alejandra Hincapié", procesos: 193 },
  { nombre: "Ana María Andrade", procesos: 193 },
];

const COLOR_ASIS = "#10B981";    // verde — motor con mejor performance
const COLOR_NOASIS = "#F59E0B";  // amber — motor con menor conversión
const COLOR_EMAIL = "#22D3EE";   // cyan
const COLOR_PHONE = "#7C4DFF";   // violet

export default function FormsAsistidoSlide({
  clientName,
  periodLabel,
}: {
  clientName: string;
  periodLabel: string;
}) {
  const maxProcesos = Math.max(...ASESORES.map((a) => a.procesos));
  const totalLeads = ASESORES.reduce((acc, a) => acc + a.procesos, 0);

  return (
    <div
      data-pptx-section="forms-asistido"
      style={{
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: 18,
        padding: "28px 32px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 22,
        boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: `1px solid ${S.border}`,
          paddingBottom: 18,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: S.muted,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          {clientName}
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: S.text,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
          }}
        >
          Forms asistido vs Sin asistir
        </div>
        <div
          style={{
            fontSize: 13,
            color: S.muted,
            marginTop: 6,
            fontStyle: "italic",
          }}
        >
          Distribución de validaciones por motor de captación · {periodLabel}
        </div>
      </div>

      {/* KPI strip — 2 motores */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <MotorCard
          icon={<UserCheck size={16} />}
          accent={COLOR_ASIS}
          label="Asistido"
          subtitle="Acompañado por asesor de ventas"
          procesos={TOTAL_ASISTIDO}
          exitosos={EXITOSOS_ASISTIDO}
          pct={PCT_ASISTIDO}
        />
        <MotorCard
          icon={<Users size={16} />}
          accent={COLOR_NOASIS}
          label="No Asistido"
          subtitle="Auto-gestionado por el usuario final"
          procesos={TOTAL_NO_ASISTIDO}
          exitosos={EXITOSOS_NO_ASISTIDO}
          pct={PCT_NO_ASISTIDO}
        />
      </div>

      {/* Contactos capturados */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <ContactoCard
          icon={<Mail size={14} />}
          accent={COLOR_EMAIL}
          label="Emails capturados"
          value={TOTAL_EMAIL}
        />
        <ContactoCard
          icon={<Phone size={14} />}
          accent={COLOR_PHONE}
          label="Teléfonos capturados"
          value={TOTAL_TELEFONO}
        />
      </div>

      {/* Top 7 asesores */}
      <div
        style={{
          background: S.surfaceLo,
          border: `1px solid ${S.border}`,
          borderRadius: 12,
          padding: "16px 18px 14px",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: S.text }}>
          Top 7 asesores · motor asistido
        </div>
        <div
          style={{
            fontSize: 11,
            color: S.muted,
            marginTop: 4,
            marginBottom: 14,
          }}
        >
          Volumen de validaciones acompañadas por asesor (suma top 7:{" "}
          {totalLeads.toLocaleString("es-CO")} procesos)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {ASESORES.map((a, i) => {
            const pct = (a.procesos / maxProcesos) * 100;
            return (
              <div
                key={a.nombre}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 26,
                    fontSize: 11,
                    color: S.dim,
                    fontWeight: 600,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  #{i + 1}
                </div>
                <div
                  style={{
                    width: 200,
                    fontSize: 12,
                    color: S.text,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {a.nombre}
                </div>
                <div style={{ flex: 1, position: "relative" }}>
                  <div
                    style={{
                      height: 22,
                      background: `linear-gradient(90deg, ${COLOR_ASIS}AA, ${COLOR_ASIS}44)`,
                      border: `1px solid ${COLOR_ASIS}66`,
                      borderRadius: 6,
                      width: `${pct}%`,
                      minWidth: 4,
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
                <div
                  style={{
                    width: 64,
                    fontSize: 13,
                    color: S.text,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    textAlign: "right",
                  }}
                >
                  {a.procesos.toLocaleString("es-CO")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function MotorCard({
  icon,
  accent,
  label,
  subtitle,
  procesos,
  exitosos,
  pct,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  subtitle: string;
  procesos: number;
  exitosos: number;
  pct: number;
}) {
  return (
    <div
      style={{
        background: S.surfaceLo,
        border: `1px solid ${S.border}`,
        borderRadius: 12,
        padding: "16px 18px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: accent,
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: accent,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {icon}
        {label}
      </div>
      <div
        style={{
          fontSize: 11,
          color: S.muted,
          marginBottom: 14,
        }}
      >
        {subtitle}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: S.muted, marginBottom: 2 }}>
            Procesos
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: S.text,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.1,
            }}
          >
            {procesos.toLocaleString("es-CO")}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: S.muted, marginBottom: 2 }}>
            Exitosos
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: S.text,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.1,
            }}
          >
            {exitosos.toLocaleString("es-CO")}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: S.muted, marginBottom: 2 }}>
            % Conversión
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: accent,
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1.1,
            }}
          >
            {pct.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactoCard({
  icon,
  accent,
  label,
  value,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: number;
}) {
  return (
    <div
      style={{
        background: S.surfaceLo,
        border: `1px solid ${S.border}`,
        borderRadius: 12,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: accent,
        }}
      />
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: `${accent}22`,
          color: accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 11,
            color: S.muted,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: S.text,
            lineHeight: 1.1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value.toLocaleString("es-CO")}
        </div>
      </div>
    </div>
  );
}
