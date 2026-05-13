import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw } from "lucide-react";
import { S, fmtNum, ADMIN_EMAILS } from "@/components/botialertas/types";
import type { ClienteRow, PeriodoSeleccion } from "./types";
import type { PortfolioRow, PortfolioMeta } from "@/hooks/usePortfolioConsumption";

/**
 * Vista panorámica de la cartera CSM en el panel principal del Dashboard.
 *
 * Una fila por (cliente, producto) con la suma de `usage` dentro del rango
 * elegido (selector "Periodo" del header). Sort por consumo desc default.
 *
 * Las filas cuyo `client_id` (TCI) matchea con un cliente de Supabase.clientes
 * son clickeables → entran al drill-down (vista cliente con los 4 charts).
 * Las que no matchean (clientes "huérfanos" en SF, sin CSM Truora asignado)
 * se muestran de forma tenue y sin click.
 *
 * El refresh es por el cron LMV 6AM Bogotá. Se muestra `meta.ultimaActualizacion`
 * para que el CSM sepa qué tan reciente es lo que ve.
 */

type SortField = "client_name" | "csm_owner" | "product" | "usage";
type SortDir = "asc" | "desc";

export default function PortfolioTable({
  rows,
  meta,
  loading,
  error,
  clientes,
  csmNombres,
  periodo,
  onClickCliente,
}: {
  rows: PortfolioRow[];
  meta: PortfolioMeta;
  loading: boolean;
  error: string | null;
  clientes: ClienteRow[];
  /** Mapeo email → nombre legible (ej: "dtibaquira@truora.com" → "Daniela Tibaquirá").
   *  Cargado desde la tabla `csm` de Supabase en Dashboard.tsx. */
  csmNombres: Map<string, string>;
  periodo: PeriodoSeleccion;
  onClickCliente: (c: ClienteRow) => void;
}) {
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("usage");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // TCI → ClienteRow para resolver clickability + datos de display.
  // Filtramos admins (Ana Marquez, JD) ANTES del map: tienen los mismos TCIs
  // que el CSM real (RLS pattern, no son CSMs reales). Sin filtro, el .set()
  // sobreescribiría al CSM real con el admin y la columna mostraría "jdiaz" en
  // vez de "Daniela Tibaquirá". Ver memoria feedback_admin_duplicate_pattern.md.
  const tciToCliente = useMemo(() => {
    const m = new Map<string, ClienteRow>();
    const realCsms = clientes.filter((c) => !ADMIN_EMAILS.has((c.csm_email ?? "").toLowerCase()));
    for (const c of realCsms) {
      if (c.client_id_di)  m.set(c.client_id_di,  c);
      if (c.client_id_bgc) m.set(c.client_id_bgc, c);
      if (c.client_id_ce)  m.set(c.client_id_ce,  c);
    }
    return m;
  }, [clientes]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      // El filtro busca contra LO QUE EL USUARIO VE: nombre canonical de
      // Supabase (cliente.nombre) y nombre legible del CSM (csmNombres),
      // no solo lo que viene de SF crudo. Caso real: SF guarda "Adelantos"
      // pero Supabase tiene "PayJoy Colombia" — buscar "PayJoy" no encontraba
      // nada con el filtro antiguo aunque la columna mostraba "PayJoy Colombia".
      const cliente = tciToCliente.get(r.client_id);
      const nombreVisible = cliente?.nombre ?? r.client_name ?? "";
      const csmEmail = cliente?.csm_email ?? "";
      const csmNombreVisible = csmEmail ? (csmNombres.get(csmEmail) ?? csmEmail) : (r.csm_owner ?? "");
      return (
        r.client_id.toLowerCase().includes(q) ||
        nombreVisible.toLowerCase().includes(q) ||
        (r.client_name ?? "").toLowerCase().includes(q) ||  // fallback al SF crudo
        csmNombreVisible.toLowerCase().includes(q) ||
        csmEmail.toLowerCase().includes(q) ||
        r.product.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, tciToCliente, csmNombres]);

  const sorted = useMemo(() => {
    const arr = filtered.slice();
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "usage":
          cmp = a.usage - b.usage;
          break;
        case "client_name":
          cmp = (a.client_name ?? "").localeCompare(b.client_name ?? "");
          break;
        case "csm_owner":
          cmp = (a.csm_owner ?? "").localeCompare(b.csm_owner ?? "");
          break;
        case "product":
          cmp = a.product.localeCompare(b.product);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "usage" ? "desc" : "asc");
    }
  };

  if (loading) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "60px 30px", color: S.muted }}>
          Cargando consumos de cartera…
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ ...errorBoxStyle, padding: 16 }}>
          Error al cargar portfolio_consumption: {error}
          <div style={{ fontSize: 11, marginTop: 8, color: S.muted }}>
            ¿Falta correr el cron por primera vez? El flujo n8n "Portfolio Consumption Sync"
            (LMV 6AM BOG) llena esta tabla. Una corrida manual desde n8n la activa.
          </div>
        </div>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <div style={{ textAlign: "center", padding: "50px 30px", color: S.muted }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: S.text, marginBottom: 6 }}>
            Sin consumos en el rango.
          </div>
          <div style={{ fontSize: 12 }}>
            {periodo.inicio} → {periodo.fin}. Probá ampliar el rango o esperar la próxima
            corrida del cron (Lunes/Miércoles/Viernes 6 AM BOG).
          </div>
        </div>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <Card>
        {/* Header: título + búsqueda + meta */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: S.text }}>
              Consumo de cartera
            </div>
            <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>
              {sorted.length} de {rows.length} {rows.length === 1 ? "fila" : "filas"} ·
              {" "}suma del rango {periodo.inicio} → {periodo.fin}
              {meta.ultimaActualizacion && (
                <>
                  {" · "}
                  <RefreshCw size={10} style={{ display: "inline", marginRight: 3 }} />
                  Actualizado {fmtRelTime(meta.ultimaActualizacion)}
                </>
              )}
            </div>
          </div>

          <div style={{ position: "relative", minWidth: 280 }}>
            <Search
              size={13}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: S.muted,
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder="Filtrar por nombre, TCI, CSM o producto…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                width: "100%",
                background: S.surfaceLo,
                border: `1px solid ${S.border}`,
                borderRadius: 999,
                color: S.text,
                fontSize: 12,
                padding: "7px 12px 7px 30px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Tabla scroll vertical */}
        <div style={{ overflow: "auto", maxHeight: 580, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: S.surface, zIndex: 1 }}>
                <Th align="left" width={250}>Client ID</Th>
                <Th
                  align="left"
                  sortable
                  active={sortField === "client_name"}
                  dir={sortDir}
                  onClick={() => handleSort("client_name")}
                >
                  Cliente
                </Th>
                <Th
                  align="left"
                  sortable
                  active={sortField === "csm_owner"}
                  dir={sortDir}
                  onClick={() => handleSort("csm_owner")}
                >
                  CSM
                </Th>
                <Th
                  align="left"
                  sortable
                  active={sortField === "product"}
                  dir={sortDir}
                  onClick={() => handleSort("product")}
                >
                  Producto
                </Th>
                <Th
                  align="right"
                  sortable
                  active={sortField === "usage"}
                  dir={sortDir}
                  onClick={() => handleSort("usage")}
                >
                  Consumo
                </Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const cliente = tciToCliente.get(r.client_id);
                const isClickable = !!cliente;
                return (
                  <tr
                    key={`${r.client_id}|${r.product}|${i}`}
                    onClick={() => cliente && onClickCliente(cliente)}
                    style={{
                      borderTop: `1px solid ${S.border}`,
                      cursor: isClickable ? "pointer" : "default",
                      opacity: isClickable ? 1 : 0.5,
                      transition: "background-color 120ms ease",
                    }}
                    onMouseEnter={(e) => {
                      if (isClickable) e.currentTarget.style.background = "rgba(124,77,255,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Td>
                      <code style={{
                        fontSize: 10,
                        color: S.muted,
                        fontFamily: "ui-monospace, SFMono-Regular, monospace",
                      }}>
                        {r.client_id}
                      </code>
                    </Td>
                    <Td>
                      <span style={{ color: S.text, fontWeight: 600 }}>
                        {/* Preferir el nombre de Supabase (canonical, lo que mantiene
                            el equipo CSM). El CLIENT_NAME_DYNAMODB_TABLE de SF
                            puede tener nombres tecnicos / stale (ej "Adelantos"
                            cuando en Supabase es "PayJoy Colombia"). */}
                        {cliente?.nombre ?? r.client_name ?? <em style={{ color: S.dim }}>—</em>}
                      </span>
                    </Td>
                    <Td>
                      <span style={{ color: S.muted }}>
                        {/* Preferimos: nombre legible del csm (lookup email→nombre
                            en tabla `csm`), sino fallback al email, sino al
                            csm_owner de SF (que ya viene NULL post-2026-05-06,
                            queda solo por defensa), sino guion. */}
                        {(() => {
                          const email = cliente?.csm_email ?? null;
                          const nombre = email ? csmNombres.get(email) : null;
                          if (nombre) return nombre;
                          if (email)  return email;
                          if (r.csm_owner) return r.csm_owner;
                          return <em style={{ color: S.dim }}>—</em>;
                        })()}
                      </span>
                    </Td>
                    <Td>
                      <ProductPill product={r.product} />
                    </Td>
                    <Td align="right">
                      <span style={{ color: S.text, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        {fmtNum(r.usage)}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div style={{ fontSize: 11, color: S.dim, marginTop: 10, lineHeight: 1.5 }}>
          Click en una fila → drill-down con los 4 charts del cliente. Las filas atenuadas
          son TCIs sin cliente asignado en CSM Center (no clickeables).
        </div>
      </Card>
    </motion.div>
  );
}

/* ─────────────────────────── Subcomponentes ─────────────────────────── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: 14,
        padding: "16px 18px 14px",
      }}
    >
      {children}
    </div>
  );
}

function Th({
  children,
  align = "left",
  sortable = false,
  active = false,
  dir,
  onClick,
  width,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  sortable?: boolean;
  active?: boolean;
  dir?: SortDir;
  onClick?: () => void;
  width?: number;
}) {
  return (
    <th
      onClick={onClick}
      style={{
        textAlign: align,
        padding: "10px 12px",
        fontSize: 11,
        fontWeight: 700,
        color: active ? S.text : S.muted,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        cursor: sortable ? "pointer" : "default",
        userSelect: "none",
        borderBottom: `1px solid ${S.border}`,
        whiteSpace: "nowrap",
        width,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {children}
        {sortable && (
          active
            ? (dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
            : <ArrowUpDown size={10} style={{ opacity: 0.5 }} />
        )}
      </span>
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      style={{
        padding: "9px 12px",
        textAlign: align,
        verticalAlign: "middle",
      }}
    >
      {children}
    </td>
  );
}

function ProductPill({ product }: { product: string }) {
  const cfg = productConfig(product);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: `${cfg.color}18`,
        color: cfg.color,
        border: `1px solid ${cfg.color}30`,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

/** Mapeo PRODUCT (de SHARED_COUNTERS_DYNAMO) → label legible + color del producto raíz. */
function productConfig(p: string): { label: string; color: string } {
  const slug = p.toLowerCase();
  if (slug === "validations")  return { label: "Validaciones",          color: "#00C9A7" };
  if (slug === "checks")       return { label: "Checks",                color: "#6C3FC5" };
  if (slug === "outbound")     return { label: "Mensajes salientes",    color: "#0891B2" };
  if (slug === "inbound")      return { label: "Conversaciones entrantes", color: "#22C55E" };
  if (slug === "notification") return { label: "Notificaciones",        color: "#94A3B8" };
  // fallback: title-case
  return {
    label: p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
    color: "#7C4DFF",
  };
}

/** "hace 4 horas" / "hace 2 días". Para el meta del header. */
function fmtRelTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `hace ${diffD} ${diffD === 1 ? "día" : "días"}`;
  return d.toISOString().slice(0, 10);
}

const errorBoxStyle: React.CSSProperties = {
  background: "rgba(239,68,68,0.10)",
  border: "1px solid rgba(239,68,68,0.30)",
  borderRadius: 10,
  fontSize: 13,
  color: "#FCA5A5",
};
