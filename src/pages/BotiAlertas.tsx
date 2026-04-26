import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Bell, Calendar, ChevronDown,
  TrendingDown, TrendingUp, Minus,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { MeshBackground } from "@/components/report-builder/MeshBackground";

type Severidad = "critica" | "fuerte" | "leve" | "estable" | "crecimiento";
type Producto = "DI" | "BGC" | "CE";

interface Alerta {
  id: string;
  cliente_id: string;
  client_id_externo: string;
  producto: Producto;
  periodo_actual_inicio: string;
  periodo_actual_fin: string;
  periodo_anterior_inicio: string;
  periodo_anterior_fin: string;
  valor_actual: number | null;
  valor_anterior: number | null;
  variacion_pct: number | null;
  variacion_abs: number | null;
  severidad: Severidad;
  metricas_extra: Record<string, unknown>;
  creado_en: string;
  cliente: { nombre: string } | null;
}

/* ── shell palette (matches WelcomeStep) ── */
const S = {
  surface: '#172840',
  surfaceHi: '#1B2F4D',
  border:   'rgba(255,255,255,0.09)',
  borderHi: 'rgba(255,255,255,0.16)',
  text:     '#EEF0FF',
  muted:    '#8892B8',
  dim:      '#4A5580',
};

const SEV_ORDER: Record<Severidad, number> = {
  critica: 0, fuerte: 1, crecimiento: 2, leve: 3, estable: 4,
};

const SEV_META: Record<Severidad, {
  label: string; color: string; bg: string; border: string;
  icon: typeof TrendingDown;
}> = {
  critica:     { label: 'Crítica',     color: '#EF4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)',  icon: TrendingDown },
  fuerte:      { label: 'Fuerte',      color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', icon: TrendingDown },
  crecimiento: { label: 'Crecimiento', color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', icon: TrendingUp },
  leve:        { label: 'Leve',        color: '#FBBF24', bg: 'rgba(251,191,36,0.10)', border: 'rgba(251,191,36,0.28)', icon: Minus },
  estable:     { label: 'Estable',     color: '#94A3B8', bg: 'rgba(148,163,184,0.10)',border: 'rgba(148,163,184,0.25)',icon: Minus },
};

const PROD_META: Record<Producto, { color: string; label: string }> = {
  DI:  { color: '#00C9A7', label: 'DI'  },
  BGC: { color: '#6C3FC5', label: 'BGC' },
  CE:  { color: '#0891B2', label: 'CE'  },
};

const SEV_LIST: Severidad[] = ["critica", "fuerte", "crecimiento", "leve", "estable"];
const PROD_LIST: Producto[] = ["DI", "BGC", "CE"];

function fmtNum(n: number | null) {
  if (n == null) return "—";
  return Math.round(Number(n)).toLocaleString("es-CO");
}

function fmtPct(p: number | null) {
  if (p == null) return "—";
  const s = p > 0 ? "+" : "";
  return `${s}${Number(p).toFixed(1)}%`;
}

function fmtRange(inicio: string, fin: string) {
  const i = new Date(inicio);
  const f = new Date(fin);
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  return `${i.toLocaleDateString("es-CO", opts)} – ${f.toLocaleDateString("es-CO", opts)}`;
}

function fmtWeek(fin: string) {
  return new Date(fin).toLocaleDateString("es-CO", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

export default function BotiAlertas() {
  const navigate = useNavigate();
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Alerta[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [filterProd, setFilterProd] = useState<"all" | Producto>("all");
  const [filterSev, setFilterSev] = useState<"all" | Severidad>("all");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) {
        navigate("/login");
        return;
      }
      setAuthChecked(true);

      const { data, error: qErr } = await supabase
        .from("boti_alertas" as never)
        .select("*, cliente:clientes!cliente_id(nombre)")
        .order("periodo_actual_fin", { ascending: false })
        .order("variacion_pct", { ascending: true });

      if (qErr) {
        setError(qErr.message);
      } else {
        const list = (data ?? []) as unknown as Alerta[];
        setRows(list);
        if (list.length > 0) setSelectedWeek(list[0].periodo_actual_fin);
      }
      setLoading(false);
    })();
  }, [navigate]);

  const weeks = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.periodo_actual_fin));
    return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
  }, [rows]);

  const visible = useMemo(() => {
    if (!selectedWeek) return [];
    return rows
      .filter((r) => r.periodo_actual_fin === selectedWeek)
      .filter((r) => filterProd === "all" || r.producto === filterProd)
      .filter((r) => filterSev === "all" || r.severidad === filterSev)
      .sort((a, b) => {
        const so = SEV_ORDER[a.severidad] - SEV_ORDER[b.severidad];
        if (so !== 0) return so;
        return (a.variacion_pct ?? 0) - (b.variacion_pct ?? 0);
      });
  }, [rows, selectedWeek, filterProd, filterSev]);

  const counts = useMemo(() => {
    const c: Record<Severidad, number> = {
      critica: 0, fuerte: 0, crecimiento: 0, leve: 0, estable: 0,
    };
    if (!selectedWeek) return c;
    rows
      .filter((r) => r.periodo_actual_fin === selectedWeek)
      .filter((r) => filterProd === "all" || r.producto === filterProd)
      .forEach((r) => c[r.severidad]++);
    return c;
  }, [rows, selectedWeek, filterProd]);

  const totalThisWeek = useMemo(() => {
    if (!selectedWeek) return 0;
    return rows.filter((r) => r.periodo_actual_fin === selectedWeek).length;
  }, [rows, selectedWeek]);

  if (!authChecked) return null;

  return (
    <>
      <MeshBackground />
      <div style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh', color: S.text,
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <TopBar
          onBack={() => navigate('/')}
          weeks={weeks}
          selectedWeek={selectedWeek}
          onSelectWeek={setSelectedWeek}
        />

        <main style={{
          maxWidth: 1280, margin: '0 auto',
          padding: '92px 28px 60px',
        }}>
          <Hero totalAlertas={totalThisWeek} />

          {loading && <EmptyCard text="Cargando alertas…" />}

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.10)',
              border: '1px solid rgba(239,68,68,0.30)',
              borderRadius: 14, padding: 16,
              fontSize: 13, color: '#FCA5A5',
            }}>
              Error al cargar: {error}
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <EmptyCard text="Aún no hay alertas. El flujo BotiAlertas corre los lunes a las 8:00 AM (hora Bogotá)." />
          )}

          {!loading && !error && rows.length > 0 && (
            <>
              <SeverityCounters
                counts={counts}
                active={filterSev}
                onToggle={(s) => setFilterSev(filterSev === s ? "all" : s)}
              />

              <FilterBar
                filterProd={filterProd}
                setFilterProd={setFilterProd}
                filterSev={filterSev}
                clearSev={() => setFilterSev("all")}
                visibleCount={visible.length}
              />

              {visible.length === 0 ? (
                <EmptyCard text="Sin alertas con los filtros seleccionados." />
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                  gap: 16,
                }}>
                  {visible.map((r, i) => (
                    <AlertCard key={r.id} alerta={r} index={i} />
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

/* ─────────────────────────── Top bar ─────────────────────────── */

function TopBar({
  onBack, weeks, selectedWeek, onSelectWeek,
}: {
  onBack: () => void;
  weeks: string[];
  selectedWeek: string | null;
  onSelectWeek: (w: string) => void;
}) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 24px',
      borderBottom: `0.5px solid ${S.border}`,
      background: 'rgba(8,12,31,0.7)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={onBack}
          title="Volver"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 600,
            color: S.muted, background: 'transparent',
            border: `1px solid ${S.border}`,
            cursor: 'pointer', padding: '6px 12px',
            borderRadius: 999, transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = S.text;
            e.currentTarget.style.borderColor = S.borderHi;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = S.muted;
            e.currentTarget.style.borderColor = S.border;
          }}
        >
          <ArrowLeft size={13} />
          <span>Volver</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #38BDF8, #0891B2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Bell size={14} color="white" strokeWidth={2.2} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: S.text, letterSpacing: '-0.01em' }}>
            BotiAlertas
          </span>
        </div>
      </div>

      <WeekDropdown weeks={weeks} selected={selectedWeek} onSelect={onSelectWeek} />
    </div>
  );
}

function WeekDropdown({
  weeks, selected, onSelect,
}: {
  weeks: string[];
  selected: string | null;
  onSelect: (w: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (weeks.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, fontWeight: 600,
          color: '#7DD3FC',
          background: 'rgba(56,189,248,0.10)',
          border: '1px solid rgba(56,189,248,0.30)',
          cursor: 'pointer', padding: '7px 14px',
          borderRadius: 999, transition: 'all 0.15s',
          minWidth: 220, justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={13} />
          <span>Semana del {selected ? fmtWeek(selected) : '—'}</span>
        </span>
        <ChevronDown size={13} style={{ transition: 'transform 0.18s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 8,
            minWidth: 260,
            background: S.surfaceHi,
            border: `1px solid ${S.borderHi}`,
            borderRadius: 12,
            boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
            padding: 6,
            maxHeight: 320, overflowY: 'auto',
            zIndex: 20,
          }}
        >
          {weeks.map((w, i) => {
            const isSel = w === selected;
            return (
              <button
                key={w}
                onClick={() => { onSelect(w); setOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '9px 12px', borderRadius: 8,
                  background: isSel ? 'rgba(56,189,248,0.12)' : 'transparent',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 12, color: isSel ? '#7DD3FC' : S.text,
                  fontWeight: isSel ? 600 : 500,
                  transition: 'background 0.12s',
                }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
              >
                <span>Semana del {fmtWeek(w)}</span>
                {i === 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: '#7DD3FC',
                    background: 'rgba(56,189,248,0.15)',
                    padding: '2px 6px', borderRadius: 4,
                  }}>
                    Última
                  </span>
                )}
              </button>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}

/* ─────────────────────────── Hero ─────────────────────────── */

function Hero({ totalAlertas }: { totalAlertas: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      style={{ marginBottom: 32 }}
    >
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        fontSize: 11, fontWeight: 600,
        color: '#7DD3FC',
        letterSpacing: '0.14em', textTransform: 'uppercase',
        marginBottom: 14,
      }}>
        <div style={{ width: 18, height: 1, background: '#7DD3FC', opacity: 0.6 }} />
        Alertas semanales
      </div>

      <h1 style={{
        fontSize: 36, fontWeight: 800, color: S.text,
        lineHeight: 1.1, letterSpacing: '-0.02em',
        margin: 0, marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        BotiAlertas
        {totalAlertas > 0 && (
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: '#7DD3FC',
            background: 'rgba(56,189,248,0.12)',
            border: '1px solid rgba(56,189,248,0.28)',
            padding: '4px 10px', borderRadius: 999,
            letterSpacing: 0,
          }}>
            {totalAlertas} esta semana
          </span>
        )}
      </h1>

      <p style={{ fontSize: 14, color: S.muted, margin: 0, lineHeight: 1.5 }}>
        Cambios semanales de consumo por cliente y producto · clasificación en 5 bandas de severidad.
      </p>
    </motion.div>
  );
}

/* ─────────────────────────── Counters ─────────────────────────── */

function SeverityCounters({
  counts, active, onToggle,
}: {
  counts: Record<Severidad, number>;
  active: "all" | Severidad;
  onToggle: (s: Severidad) => void;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 10,
      marginBottom: 20,
    }}>
      {SEV_LIST.map((s, i) => {
        const m = SEV_META[s];
        const isActive = active === s;
        return (
          <motion.button
            key={s}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05 + i * 0.04, ease: 'easeOut' }}
            onClick={() => onToggle(s)}
            style={{
              position: 'relative', overflow: 'hidden',
              background: isActive ? m.bg : S.surface,
              border: `1px solid ${isActive ? m.border : S.border}`,
              borderRadius: 14,
              padding: '14px 16px 14px 20px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 0.18s',
              outline: 'none',
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.borderColor = S.borderHi;
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.borderColor = S.border;
            }}
          >
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: 3, background: m.color,
              opacity: isActive ? 1 : 0.5,
            }} />
            <div style={{
              fontSize: 28, fontWeight: 800,
              color: isActive ? m.color : S.text,
              lineHeight: 1, letterSpacing: '-0.02em',
            }}>
              {counts[s]}
            </div>
            <div style={{
              fontSize: 10, color: S.muted, marginTop: 6,
              letterSpacing: '0.10em', textTransform: 'uppercase',
              fontWeight: 600,
            }}>
              {m.label}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Filter bar ─────────────────────────── */

function FilterBar({
  filterProd, setFilterProd, filterSev, clearSev, visibleCount,
}: {
  filterProd: "all" | Producto;
  setFilterProd: (p: "all" | Producto) => void;
  filterSev: "all" | Severidad;
  clearSev: () => void;
  visibleCount: number;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      flexWrap: 'wrap', marginBottom: 18,
    }}>
      <ProductChip
        active={filterProd === 'all'}
        color="#7C4DFF"
        label="Todos"
        onClick={() => setFilterProd('all')}
      />
      {PROD_LIST.map((p) => (
        <ProductChip
          key={p}
          active={filterProd === p}
          color={PROD_META[p].color}
          label={PROD_META[p].label}
          onClick={() => setFilterProd(p)}
        />
      ))}

      {filterSev !== 'all' && (
        <button
          onClick={clearSev}
          style={{
            fontSize: 11, color: S.muted, background: 'transparent',
            border: 'none', cursor: 'pointer', padding: '6px 10px',
            borderRadius: 6, transition: 'color 0.15s',
            marginLeft: 4,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = S.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = S.muted)}
        >
          Limpiar severidad
        </button>
      )}

      <span style={{
        marginLeft: 'auto', fontSize: 12, color: S.muted,
      }}>
        {visibleCount} alerta{visibleCount === 1 ? '' : 's'}
      </span>
    </div>
  );
}

function ProductChip({
  active, color, label, onClick,
}: {
  active: boolean;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12, fontWeight: 600,
        color: active ? color : S.muted,
        background: active ? `${color}18` : 'transparent',
        border: `1px solid ${active ? `${color}50` : S.border}`,
        cursor: 'pointer', padding: '6px 14px',
        borderRadius: 999, transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.color = S.text;
          e.currentTarget.style.borderColor = S.borderHi;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.color = S.muted;
          e.currentTarget.style.borderColor = S.border;
        }
      }}
    >
      {label}
    </button>
  );
}

/* ─────────────────────────── Empty / loading ─────────────────────────── */

function EmptyCard({ text }: { text: string }) {
  return (
    <div style={{
      background: S.surface,
      border: `1px solid ${S.border}`,
      borderRadius: 14,
      padding: '32px 24px',
      textAlign: 'center',
      color: S.muted,
      fontSize: 13,
    }}>
      {text}
    </div>
  );
}

/* ─────────────────────────── Alert card ─────────────────────────── */

function AlertCard({ alerta, index }: { alerta: Alerta; index: number }) {
  const sev = SEV_META[alerta.severidad];
  const prod = PROD_META[alerta.producto];
  const Icon = sev.icon;
  const [hover, setHover] = useState(false);

  const anterior = Number(alerta.valor_anterior ?? 0);
  const actual = Number(alerta.valor_actual ?? 0);
  const max = Math.max(anterior, actual, 1);
  const hAnt = (anterior / max) * 100;
  const hAct = (actual / max) * 100;

  const deltaColor =
    alerta.variacion_pct == null ? S.muted
      : alerta.variacion_pct < 0 ? '#EF4444'
        : alerta.variacion_pct > 0 ? '#10B981'
          : S.muted;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.04 + Math.min(index, 12) * 0.03, ease: 'easeOut' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', overflow: 'hidden',
        background: hover ? S.surfaceHi : S.surface,
        border: `1px solid ${hover ? sev.border : S.border}`,
        borderRadius: 16,
        padding: '18px 20px 16px 22px',
        transition: 'all 0.18s',
        boxShadow: hover ? `0 8px 28px rgba(0,0,0,0.35), 0 0 0 1px ${sev.border}` : '0 2px 10px rgba(0,0,0,0.18)',
        transform: hover ? 'translateY(-2px)' : 'translateY(0)',
      }}
    >
      {/* severity accent bar */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: 3, background: sev.color,
      }} />

      {/* badges row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em',
          textTransform: 'uppercase', color: prod.color,
          padding: '3px 8px', borderRadius: 4,
          background: `${prod.color}1A`, border: `1px solid ${prod.color}40`,
        }}>
          {prod.label}
        </span>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: sev.color,
          padding: '3px 8px', borderRadius: 4,
          background: sev.bg, border: `1px solid ${sev.border}`,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          <Icon size={10} strokeWidth={2.4} />
          {sev.label}
        </span>
      </div>

      {/* client name */}
      <div style={{
        fontSize: 16, fontWeight: 700, color: S.text,
        marginBottom: 2, letterSpacing: '-0.01em',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {alerta.cliente?.nombre ?? alerta.client_id_externo}
      </div>
      <div style={{
        fontSize: 10, color: S.dim, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        marginBottom: 16,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {alerta.client_id_externo}
      </div>

      {/* viz: bars + delta */}
      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 14,
        padding: '4px 0',
      }}>
        {/* mini bar chart */}
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-end',
          height: 76, paddingTop: 4,
        }}>
          <BarColumn
            label="Anterior" value={alerta.valor_anterior}
            heightPct={hAnt} color={S.muted} barBg="rgba(255,255,255,0.06)"
          />
          <BarColumn
            label="Actual" value={alerta.valor_actual}
            heightPct={hAct} color={sev.color} barBg={sev.bg}
          />
        </div>

        {/* big delta */}
        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{
            fontSize: 26, fontWeight: 800, color: deltaColor,
            lineHeight: 1, letterSpacing: '-0.02em',
          }}>
            {fmtPct(alerta.variacion_pct)}
          </div>
          <div style={{
            fontSize: 10, color: S.muted, marginTop: 8,
            letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600,
          }}>
            Variación
          </div>
        </div>
      </div>

      {/* footer: dates */}
      <div style={{
        marginTop: 14, paddingTop: 12,
        borderTop: `1px solid ${S.border}`,
        fontSize: 10.5, color: S.dim,
        display: 'flex', alignItems: 'center', gap: 6,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        <Calendar size={11} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {fmtRange(alerta.periodo_anterior_inicio, alerta.periodo_anterior_fin)}
          {' → '}
          {fmtRange(alerta.periodo_actual_inicio, alerta.periodo_actual_fin)}
        </span>
      </div>
    </motion.div>
  );
}

function BarColumn({
  label, value, heightPct, color, barBg,
}: {
  label: string;
  value: number | null;
  heightPct: number;
  color: string;
  barBg: string;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 4, width: 38,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color,
        lineHeight: 1, letterSpacing: '-0.01em',
      }}>
        {fmtNum(value)}
      </div>
      <div style={{
        position: 'relative',
        width: 26, height: 50,
        borderRadius: 6,
        background: 'rgba(255,255,255,0.03)',
        overflow: 'hidden',
        border: `1px solid ${S.border}`,
      }}>
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: `${Math.max(heightPct, value === 0 ? 0 : 4)}%` }}
          transition={{ duration: 0.6, ease: [0.34, 1.2, 0.64, 1], delay: 0.1 }}
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: `linear-gradient(to top, ${color}, ${barBg})`,
            borderTop: value && value > 0 ? `2px solid ${color}` : 'none',
          }}
        />
      </div>
      <div style={{
        fontSize: 9, color: S.dim, letterSpacing: '0.04em',
        textTransform: 'uppercase', fontWeight: 600,
      }}>
        {label}
      </div>
    </div>
  );
}
