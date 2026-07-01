import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Search, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw,
  ChevronRight, ChevronDown, Info,
} from "lucide-react";
import { S, fmtNum, ADMIN_EMAILS } from "@/components/botialertas/types";
import type { ClienteRow, PeriodoSeleccion } from "./types";
import type { PortfolioRow, PortfolioMeta } from "@/hooks/usePortfolioConsumption";

/**
 * Vista panorámica de la cartera CSM en el panel principal del Dashboard.
 *
 * Desde 2026-06-11 el grano es SUB-PRODUCTO: cada fila-header es un
 * (cliente, producto) con el total del rango, y se EXPANDE para ver el
 * desglose por sub-producto (document validation / passive liveness / truface /
 * ocr / país en checks / inbound-outbound-notif en CE / forms / ...).
 * El total del producto = suma de sus sub-productos (las filas-total
 * 'checks completos'/'interacciones' no se persisten).
 *
 * Filtros: Producto y Sub-producto (multi-select) + búsqueda libre.
 *
 * Click en la fila-header (no en el chevron) → drill-down del cliente.
 * Las filas cuyo TCI no matchea un cliente de Supabase se muestran tenues
 * y sin click.
 */

type SortField = "client_name" | "csm_owner" | "product" | "usage";
type SortDir = "asc" | "desc";

/** Un (cliente, producto) con su total del rango y el detalle por sub-producto. */
interface GroupRow {
  key: string;          // `${client_id}|${product}`
  client_id: string;
  client_name: string | null;
  csm_owner: string | null;
  product: string;
  total: number;
  subRows: PortfolioRow[];
}

export default function PortfolioTable({
  rows,
  meta,
  loading,
  error,
  clientes,
  csmNombres,
  periodo,
  onClickCliente,
  titleOverride,
  subtitleOverride,
  footerOverride,
  disableDrilldown = false,
  dimUnassigned = true,
  filter: filterProp,
  onFilterChange,
  hideSearch = false,
}: {
  rows: PortfolioRow[];
  meta: PortfolioMeta;
  loading: boolean;
  error: string | null;
  clientes: ClienteRow[];
  /** Mapeo email → nombre legible. Cargado desde la tabla `csm` en Dashboard.tsx. */
  csmNombres: Map<string, string>;
  periodo: PeriodoSeleccion;
  onClickCliente?: (c: ClienteRow) => void;
  /** Modo lookup (consulta efímera de un TCI externo): overrides cosméticos
   *  para reusar la misma tabla sin la semántica de cartera. */
  titleOverride?: string;
  subtitleOverride?: React.ReactNode;
  footerOverride?: React.ReactNode;
  /** Desactiva el drill-down al click (lookup externo no tiene cliente local). */
  disableDrilldown?: boolean;
  /** Atenúa filas cuyo TCI no matchea un cliente local. En lookup = false. */
  dimUnassigned?: boolean;
  /** Filtro controlado desde fuera (tarjeta "Mi cartera"). Si se omite, usa estado interno. */
  filter?: string;
  onFilterChange?: (v: string) => void;
  /** Oculta el input de búsqueda interno (cuando la tarjeta externa lo maneja). */
  hideSearch?: boolean;
}) {
  // Filtro: controlado desde Dashboard (tarjeta "Mi cartera") o estado interno
  // como fallback (modo lookup u otros usos).
  const [filterInternal, setFilterInternal] = useState("");
  const filter = filterProp !== undefined ? filterProp : filterInternal;
  const setFilter = onFilterChange ?? setFilterInternal;
  const [sortField, setSortField] = useState<SortField>("usage");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Filtros multi-select (default: todos seleccionados = sin filtro).
  const [prodSel, setProdSel] = useState<Set<string> | null>(null);
  const [subSel, setSubSel] = useState<Set<string> | null>(null);

  // TCI → ClienteRow para clickability + datos de display. Filtramos admins
  // (Ana, JD) ANTES del map: comparten TCIs con el CSM real (RLS pattern) y el
  // .set() los sobreescribiría. Ver feedback_admin_duplicate_pattern.md.
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

  // Universo de productos y sub-productos presentes (para los dropdowns).
  const allProducts = useMemo(
    () => Array.from(new Set(rows.map((r) => r.product))).sort(),
    [rows]
  );
  const allSubProducts = useMemo(
    () => Array.from(new Set(rows.map((r) => r.sub_product))).sort(),
    [rows]
  );

  // Resuelve nombre y CSM visibles de un TCI (canonical desde Supabase).
  const visibleName = (r: PortfolioRow): string =>
    tciToCliente.get(r.client_id)?.nombre ?? r.client_name ?? "";
  const visibleCsm = (r: PortfolioRow): string => {
    const email = tciToCliente.get(r.client_id)?.csm_email ?? "";
    if (email) return csmNombres.get(email) ?? email;
    // Viewers @truora.com sin acceso a `clientes`: el cron llenó csm_owner con el
    // email del CSM dueño; lo mapeamos a nombre vía la tabla `csm` (legible por todos).
    const owner = r.csm_owner ?? "";
    return owner ? (csmNombres.get(owner) ?? owner) : "";
  };

  // 1) Filtrar filas planas por producto + sub-producto + búsqueda.
  const filteredRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (prodSel && !prodSel.has(r.product)) return false;
      if (subSel && !subSel.has(r.sub_product)) return false;
      if (!q) return true;
      const nombre = visibleName(r).toLowerCase();
      const csm = visibleCsm(r).toLowerCase();
      return (
        r.client_id.toLowerCase().includes(q) ||
        nombre.includes(q) ||
        (r.client_name ?? "").toLowerCase().includes(q) ||
        csm.includes(q) ||
        r.product.toLowerCase().includes(q) ||
        r.sub_product.toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, prodSel, subSel, tciToCliente, csmNombres]);

  // 2) Agrupar por (cliente, producto). Total = suma de sub-productos mostrados.
  const groups = useMemo(() => {
    const m = new Map<string, GroupRow>();
    for (const r of filteredRows) {
      const key = `${r.client_id}|${r.product}`;
      const g = m.get(key);
      if (g) {
        g.total += r.usage;
        g.subRows.push(r);
      } else {
        m.set(key, {
          key,
          client_id: r.client_id,
          client_name: r.client_name,
          csm_owner: r.csm_owner,
          product: r.product,
          total: r.usage,
          subRows: [r],
        });
      }
    }
    for (const g of m.values()) g.subRows.sort((a, b) => b.usage - a.usage);
    return Array.from(m.values());
  }, [filteredRows]);

  // 3) Ordenar grupos.
  const sorted = useMemo(() => {
    const arr = groups.slice();
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "usage":
          cmp = a.total - b.total;
          break;
        case "client_name":
          cmp = (tciToCliente.get(a.client_id)?.nombre ?? a.client_name ?? "")
            .localeCompare(tciToCliente.get(b.client_id)?.nombre ?? b.client_name ?? "");
          break;
        case "csm_owner": {
          const ca = visibleCsm(a.subRows[0]);
          const cb = visibleCsm(b.subRows[0]);
          cmp = ca.localeCompare(cb);
          break;
        }
        case "product":
          cmp = a.product.localeCompare(b.product);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, sortField, sortDir, tciToCliente, csmNombres]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "usage" ? "desc" : "asc");
    }
  };

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
            {periodo.inicio} → {periodo.fin}. Prueba ampliar el rango o esperar la próxima
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
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: S.text }}>
              {titleOverride ?? "Consumo de cartera"}
            </div>
            <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>
              {subtitleOverride ?? (
                <>
                  {sorted.length} {sorted.length === 1 ? "línea" : "líneas"} (cliente × producto) ·
                  {" "}suma del rango {periodo.inicio} → {periodo.fin}
                  {meta.ultimaActualizacion && (
                    <>
                      {" · "}
                      <RefreshCw size={10} style={{ display: "inline", marginRight: 3 }} />
                      Actualizado {fmtRelTime(meta.ultimaActualizacion)}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {!hideSearch && (
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
              placeholder="Filtrar por nombre, TCI, CSM, producto o sub-producto…"
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
          )}
        </div>

        {/* Filtros multi-select Producto / Sub-producto */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <MultiSelectDropdown
            label="Producto"
            options={allProducts}
            selected={prodSel}
            onChange={setProdSel}
            renderOption={(p) => productConfig(p).label}
          />
          <MultiSelectDropdown
            label="Sub-producto"
            options={allSubProducts}
            selected={subSel}
            onChange={setSubSel}
            renderOption={fmtSubProduct}
          />
        </div>

        {/* Tabla scroll vertical */}
        <div style={{ overflow: "auto", maxHeight: 580, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: S.surface, zIndex: 1 }}>
                <Th align="left" width={28} />
                <Th align="left" width={230}>Client ID</Th>
                <Th align="left" sortable active={sortField === "client_name"} dir={sortDir}
                  onClick={() => handleSort("client_name")}>Cliente</Th>
                <Th align="left" sortable active={sortField === "csm_owner"} dir={sortDir}
                  onClick={() => handleSort("csm_owner")}>CSM</Th>
                <Th align="left" sortable active={sortField === "product"} dir={sortDir}
                  onClick={() => handleSort("product")}>Producto</Th>
                <Th align="right" sortable active={sortField === "usage"} dir={sortDir}
                  onClick={() => handleSort("usage")}>Consumo</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((g) => {
                const cliente = tciToCliente.get(g.client_id);
                const isClickable = !disableDrilldown && !!cliente;
                const isDim = dimUnassigned && !cliente;
                const goCliente = () => { if (isClickable && cliente) onClickCliente?.(cliente); };
                const isOpen = expanded.has(g.key);
                const cfg = productConfig(g.product);
                return (
                  <FragmentGroup key={g.key}>
                    {/* Fila-header (cliente, producto) */}
                    <tr
                      style={{
                        borderTop: `1px solid ${S.border}`,
                        cursor: isClickable ? "pointer" : "default",
                        opacity: isDim ? 0.5 : 1,
                        transition: "background-color 120ms ease",
                        background: isOpen ? "rgba(124,77,255,0.05)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (isClickable && !isOpen) e.currentTarget.style.background = "rgba(124,77,255,0.08)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = isOpen ? "rgba(124,77,255,0.05)" : "transparent";
                      }}
                    >
                      {/* Chevron expand — stopPropagation para no disparar el drill-down */}
                      <Td>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleExpand(g.key); }}
                          title={isOpen ? "Colapsar sub-productos" : "Ver sub-productos"}
                          style={{
                            background: "transparent", border: "none", cursor: "pointer",
                            color: S.muted, padding: 2, display: "inline-flex", alignItems: "center",
                          }}
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </Td>
                      <Td onClick={goCliente}>
                        <code style={{ fontSize: 10, color: S.muted, fontFamily: "ui-monospace, SFMono-Regular, monospace" }}>
                          {g.client_id}
                        </code>
                      </Td>
                      <Td onClick={goCliente}>
                        <span style={{ color: S.text, fontWeight: 600 }}>
                          {cliente?.nombre ?? g.client_name ?? <em style={{ color: S.dim }}>—</em>}
                        </span>
                      </Td>
                      <Td onClick={goCliente}>
                        <span style={{ color: S.muted }}>
                          {(() => {
                            const email = cliente?.csm_email ?? null;
                            const nombre = email ? csmNombres.get(email) : null;
                            if (nombre) return nombre;
                            if (email) return email;
                            // Viewer sin `clientes`: csm_owner trae el email del CSM (cron) → mapear a nombre.
                            if (g.csm_owner) return csmNombres.get(g.csm_owner) ?? g.csm_owner;
                            return <em style={{ color: S.dim }}>—</em>;
                          })()}
                        </span>
                      </Td>
                      <Td onClick={goCliente}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <ProductPill product={g.product} />
                          <span style={{ fontSize: 10, color: S.dim }}>
                            {g.subRows.length} {g.subRows.length === 1 ? "sub" : "subs"}
                          </span>
                        </span>
                      </Td>
                      <Td align="right" onClick={goCliente}>
                        <span style={{ color: S.text, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                          {fmtNum(g.total)}
                        </span>
                      </Td>
                    </tr>

                    {/* Sub-filas (sub-productos) */}
                    {isOpen && g.subRows.map((sr, j) => {
                      const nota = (sr.nota ?? "").trim();
                      return (
                        <tr key={`${g.key}|${sr.sub_product}|${j}`} style={{ background: "rgba(255,255,255,0.015)" }}>
                          <Td />
                          <Td />
                          <Td>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, paddingLeft: 8 }}>
                              <span style={{ width: 3, height: 14, borderRadius: 2, background: `${cfg.color}88` }} />
                              <span style={{ color: S.text, fontSize: 12 }}>{fmtSubProduct(sr.sub_product)}</span>
                              {nota && (
                                <span title={nota} style={{ display: "inline-flex", color: S.dim, cursor: "help" }}>
                                  <Info size={12} />
                                </span>
                              )}
                            </span>
                          </Td>
                          <Td colSpan={2}>
                            {nota && (
                              <span style={{ color: S.dim, fontSize: 10.5, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                                {nota.replace(/\n/g, "  ·  ")}
                              </span>
                            )}
                          </Td>
                          <Td align="right">
                            <span style={{ color: S.muted, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                              {fmtNum(sr.usage)}
                            </span>
                          </Td>
                        </tr>
                      );
                    })}
                  </FragmentGroup>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div style={{ fontSize: 11, color: S.dim, marginTop: 10, lineHeight: 1.5 }}>
          {footerOverride ?? (
            <>
              ▸ expandí una fila para ver el desglose por sub-producto · click en la fila → drill-down del cliente.
              La <Info size={10} style={{ display: "inline", verticalAlign: "middle" }} /> NOTA muestra el detalle
              fino (revisión manual, categoría de mensaje, tipo de check por país) del mes más reciente del rango.
              Filas atenuadas = TCIs sin cliente asignado en CSM Center.
            </>
          )}
        </div>
      </Card>
    </motion.div>
  );
}

/* ─────────────────────────── Subcomponentes ─────────────────────────── */

/** Wrapper para devolver múltiples <tr> sin nodo extra en el DOM de la tabla. */
function FragmentGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 14, padding: "16px 18px 14px" }}>
      {children}
    </div>
  );
}

function Th({
  children, align = "left", sortable = false, active = false, dir, onClick, width,
}: {
  children?: React.ReactNode;
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
        textAlign: align, padding: "10px 12px", fontSize: 11, fontWeight: 700,
        color: active ? S.text : S.muted, letterSpacing: "0.04em", textTransform: "uppercase",
        cursor: sortable ? "pointer" : "default", userSelect: "none",
        borderBottom: `1px solid ${S.border}`, whiteSpace: "nowrap", width,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {children}
        {sortable && (active ? (dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={10} style={{ opacity: 0.5 }} />)}
      </span>
    </th>
  );
}

function Td({
  children, align = "left", onClick, colSpan,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  onClick?: () => void;
  colSpan?: number;
}) {
  return (
    <td onClick={onClick} colSpan={colSpan} style={{ padding: "9px 12px", textAlign: align, verticalAlign: "middle" }}>
      {children}
    </td>
  );
}

function ProductPill({ product }: { product: string }) {
  const cfg = productConfig(product);
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px",
        borderRadius: 999, fontSize: 11, fontWeight: 600,
        background: `${cfg.color}18`, color: cfg.color, border: `1px solid ${cfg.color}30`,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

/** Dropdown custom multi-select (estilo shell: pill + ChevronDown + panel absolute
 *  con checkboxes + Todos/Ninguno, click-outside y ESC). `selected = null` = todos. */
function MultiSelectDropdown({
  label, options, selected, onChange, renderOption,
}: {
  label: string;
  options: string[];
  selected: Set<string> | null;
  onChange: (s: Set<string> | null) => void;
  renderOption: (o: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = selected === null ? options.length : selected.size;
  const activeFilter = selected !== null && selected.size !== options.length;

  const toggle = (o: string) => {
    const base = selected === null ? new Set(options) : new Set(selected);
    if (base.has(o)) base.delete(o);
    else base.add(o);
    // Si quedan todos → volver a null (sin filtro).
    onChange(base.size === options.length ? null : base);
  };

  const color = "#7C4DFF";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 600,
          background: activeFilter ? `${color}18` : "transparent",
          color: activeFilter ? color : S.muted,
          border: `1px solid ${activeFilter ? `${color}50` : S.border}`,
          cursor: "pointer",
        }}
      >
        {label} {activeFilter ? `(${count}/${options.length})` : "(Todos)"}
        <ChevronDown size={13} />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.12 }}
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 20,
            minWidth: 220, maxHeight: 320, overflow: "auto",
            background: S.surfaceHi ?? "#1B2F4D", border: `1px solid ${S.border}`,
            borderRadius: 12, padding: 8, boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
          }}
        >
          <div style={{ display: "flex", gap: 8, padding: "4px 6px 8px", borderBottom: `1px solid ${S.border}`, marginBottom: 6 }}>
            <button onClick={() => onChange(null)} style={miniBtn(color)}>Todos</button>
            <button onClick={() => onChange(new Set())} style={miniBtn(S.muted)}>Ninguno</button>
          </div>
          {options.map((o) => {
            const checked = selected === null || selected.has(o);
            return (
              <label
                key={o}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 6px",
                  fontSize: 12, color: S.text, cursor: "pointer", borderRadius: 8,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <input type="checkbox" checked={checked} onChange={() => toggle(o)} style={{ accentColor: color, cursor: "pointer" }} />
                {renderOption(o)}
              </label>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

function miniBtn(color: string): React.CSSProperties {
  return {
    background: "transparent", border: `1px solid ${color}40`, color,
    borderRadius: 999, fontSize: 11, fontWeight: 600, padding: "3px 10px", cursor: "pointer",
  };
}

/** Mapeo PRODUCT → label legible + color del producto raíz. */
export function productConfig(p: string): { label: string; color: string } {
  const slug = p.toLowerCase();
  if (slug === "validations")          return { label: "Validations",         color: "#00C9A7" };
  if (slug === "checks")               return { label: "Checks",              color: "#6C3FC5" };
  if (slug === "premium checks")       return { label: "Premium checks",      color: "#A855F7" };
  if (slug === "continuous checks")    return { label: "Continuous checks",   color: "#8B5CF6" };
  if (slug === "truconnect")           return { label: "Truconnect",          color: "#0891B2" };
  if (slug === "zapsign")              return { label: "Zapsign",             color: "#F59E0B" };
  if (slug === "document recognition") return { label: "Document recognition", color: "#38BDF8" };
  if (slug === "forms")                return { label: "Forms",               color: "#EC4899" };
  // legacy buckets (validations/checks/outbound/inbound/notification) por si quedan filas viejas
  if (slug === "outbound")     return { label: "Mensajes salientes",      color: "#0891B2" };
  if (slug === "inbound")      return { label: "Conversaciones entrantes", color: "#22C55E" };
  if (slug === "notification") return { label: "Notificaciones",          color: "#94A3B8" };
  return { label: p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(), color: "#7C4DFF" };
}

/** Formato del sub-producto: códigos de país (2-3 letras) en MAYÚSCULA, resto
 *  con capitalización suave. Ej: "co" → "CO", "passive liveness" → "Passive liveness". */
function fmtSubProduct(s: string): string {
  if (!s) return "—";
  if (s.length <= 3 && /^[a-z]+$/.test(s)) return s.toUpperCase(); // país: co, mx, all
  return s.charAt(0).toUpperCase() + s.slice(1);
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
