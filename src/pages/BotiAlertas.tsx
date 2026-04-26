import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const SEV_ORDER: Record<Severidad, number> = {
  critica: 0,
  fuerte: 1,
  crecimiento: 2,
  leve: 3,
  estable: 4,
};

const SEV_LABEL: Record<Severidad, string> = {
  critica: "Crítica",
  fuerte: "Fuerte",
  crecimiento: "Crecimiento",
  leve: "Leve",
  estable: "Estable",
};

const SEV_BADGE: Record<Severidad, string> = {
  critica: "bg-red-500 text-white hover:bg-red-500",
  fuerte: "bg-orange-500 text-white hover:bg-orange-500",
  crecimiento: "bg-emerald-500 text-white hover:bg-emerald-500",
  leve: "bg-amber-300 text-amber-950 hover:bg-amber-300",
  estable: "bg-slate-300 text-slate-700 hover:bg-slate-300",
};

const PROD_BADGE: Record<Producto, string> = {
  DI: "bg-blue-600 text-white hover:bg-blue-600",
  BGC: "bg-violet-600 text-white hover:bg-violet-600",
  CE: "bg-cyan-600 text-white hover:bg-cyan-600",
};

const SEV_LIST: Severidad[] = [
  "critica",
  "fuerte",
  "crecimiento",
  "leve",
  "estable",
];

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
    day: "2-digit",
    month: "long",
    year: "numeric",
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
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
      critica: 0,
      fuerte: 0,
      crecimiento: 0,
      leve: 0,
      estable: 0,
    };
    if (!selectedWeek) return c;
    rows
      .filter((r) => r.periodo_actual_fin === selectedWeek)
      .filter((r) => filterProd === "all" || r.producto === filterProd)
      .forEach((r) => c[r.severidad]++);
    return c;
  }, [rows, selectedWeek, filterProd]);

  if (!authChecked) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/")}
              className="-ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Volver
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">
                BotiAlertas
              </h1>
              <p className="text-sm text-slate-500">
                Cambios semanales de consumo por cliente y producto.
              </p>
            </div>
          </div>

          {weeks.length > 0 && (
            <Select
              value={selectedWeek ?? undefined}
              onValueChange={(v) => setSelectedWeek(v)}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weeks.map((w, i) => (
                  <SelectItem key={w} value={w}>
                    Semana del {fmtWeek(w)}
                    {i === 0 ? " · más reciente" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-4">
        {loading && (
          <div className="bg-white rounded-lg border p-8 text-center text-slate-500">
            Cargando alertas…
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 text-sm">
            Error al cargar: {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="bg-white rounded-lg border p-8 text-center text-slate-500">
            Aún no hay alertas. El flujo BotiAlertas corre los lunes a las 8:00 AM
            (hora Bogotá).
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {SEV_LIST.map((s) => {
                const active = filterSev === s;
                return (
                  <button
                    key={s}
                    onClick={() => setFilterSev(active ? "all" : s)}
                    className={`rounded-lg p-3 text-left border-2 transition bg-white ${
                      active ? "border-slate-900" : "border-transparent"
                    }`}
                  >
                    <div className="text-2xl font-bold text-slate-900">
                      {counts[s]}
                    </div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      {SEV_LABEL[s]}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={filterProd}
                onValueChange={(v) => setFilterProd(v as "all" | Producto)}
              >
                <SelectTrigger className="w-44 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los productos</SelectItem>
                  <SelectItem value="DI">DI</SelectItem>
                  <SelectItem value="BGC">BGC</SelectItem>
                  <SelectItem value="CE">CE</SelectItem>
                </SelectContent>
              </Select>
              {filterSev !== "all" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterSev("all")}
                >
                  Limpiar severidad
                </Button>
              )}
              <span className="ml-auto text-sm text-slate-500">
                {visible.length} alerta{visible.length === 1 ? "" : "s"}
              </span>
            </div>

            {visible.length === 0 ? (
              <div className="bg-white rounded-lg border p-8 text-center text-slate-500">
                Sin alertas con los filtros seleccionados.
              </div>
            ) : (
              <div className="space-y-2">
                {visible.map((r) => (
                  <AlertCard key={r.id} alerta={r} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function AlertCard({ alerta }: { alerta: Alerta }) {
  const variacionColor =
    alerta.variacion_pct == null
      ? "text-slate-500"
      : alerta.variacion_pct < 0
        ? "text-red-600"
        : "text-emerald-600";

  return (
    <div className="bg-white rounded-lg border p-4 flex items-start gap-4">
      <div className="flex flex-col gap-1 min-w-[110px]">
        <Badge className={PROD_BADGE[alerta.producto]}>{alerta.producto}</Badge>
        <Badge className={SEV_BADGE[alerta.severidad]}>
          {SEV_LABEL[alerta.severidad]}
        </Badge>
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-slate-900 truncate">
          {alerta.cliente?.nombre ?? alerta.client_id_externo}
        </div>
        <div className="text-xs text-slate-400 font-mono truncate">
          {alerta.client_id_externo}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          {fmtRange(alerta.periodo_anterior_inicio, alerta.periodo_anterior_fin)}{" "}
          → {fmtRange(alerta.periodo_actual_inicio, alerta.periodo_actual_fin)}
        </div>
      </div>

      <div className="text-right min-w-[160px]">
        <div className="text-sm text-slate-600">
          {fmtNum(alerta.valor_anterior)} →{" "}
          <span className="font-semibold text-slate-900">
            {fmtNum(alerta.valor_actual)}
          </span>
        </div>
        <div className={`text-lg font-bold ${variacionColor}`}>
          {fmtPct(alerta.variacion_pct)}
        </div>
      </div>
    </div>
  );
}
