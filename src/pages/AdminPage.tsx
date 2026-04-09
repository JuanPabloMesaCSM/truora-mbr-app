import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { ShieldX, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PRODUCT_COLORS, ADMIN_EMAIL, type Product } from "@/components/report-builder/moduleDefinitions";

const SUPABASE_URL = "https://cjrhxmfnmajxiwiiuwym.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqcmh4bWZubWFqeGl3aWl1d3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTI2OTIsImV4cCI6MjA4ODk2ODY5Mn0.6q8_uL8wOmgX1jDyQ8qbENRrC7vJRCcD0CBtQAVPoHw";

type FeedbackStatus = "pendiente" | "en_revision" | "implementado" | "descartado";
type FeedbackType = "nueva_metrica" | "voto" | "error_numerico";

interface Feedback {
  id: string;
  csm_email: string;
  producto: string;
  tipo: FeedbackType;
  descripcion: string | null;
  query_ejemplo: string | null;
  metrica_ref: string | null;
  voto: string | null;
  valor_incorrecto: string | null;
  valor_correcto: string | null;
  estado: FeedbackStatus;
  analisis_ia: string | null;
  creado_en: string;
}

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  implementado: "Implementado",
  descartado: "Descartado",
};

const TYPE_LABELS: Record<FeedbackType, string> = {
  nueva_metrica: "Nueva métrica",
  voto: "Voto",
  error_numerico: "Error numérico",
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

function productColor(p: string): string {
  return PRODUCT_COLORS[p as Product] || "#6B7280";
}

export default function AdminPage() {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [filterProduct, setFilterProduct] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedAi, setExpandedAi] = useState<Set<string>>(new Set());

  const loadFeedbacks = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || SUPABASE_ANON;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/feedback?select=*&order=creado_en.desc`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (res.ok) setFeedbacks(await res.json());
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { navigate("/login"); return; }
      if (session.user.email !== ADMIN_EMAIL) { setAuthorized(false); return; }
      setAuthorized(true);
      loadFeedbacks();
    };
    init();
  }, [navigate, loadFeedbacks]);

  const updateStatus = async (id: string, estado: FeedbackStatus) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || SUPABASE_ANON;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/feedback?id=eq.${id}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ estado }),
    });
    if (res.ok) {
      setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, estado } : f));
      toast.success("Estado actualizado");
    } else {
      toast.error("Error al actualizar");
    }
  };

  const filtered = feedbacks.filter(f => {
    if (filterProduct !== "all" && f.producto !== filterProduct) return false;
    if (filterType !== "all" && f.tipo !== filterType) return false;
    if (filterStatus !== "all" && f.estado !== filterStatus) return false;
    return true;
  });

  const toggleExpand = (id: string) => setExpandedIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });
  const toggleAi = (id: string) => setExpandedAi(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  if (authorized === null) return <div className="flex items-center justify-center h-screen" style={{ background: "#F4F6FC" }}><p className="text-muted-foreground">Cargando...</p></div>;
  if (authorized === false) return (
    <div className="flex flex-col items-center justify-center h-screen gap-4" style={{ background: "#F4F6FC" }}>
      <ShieldX className="h-16 w-16 text-muted-foreground" />
      <p className="text-lg font-semibold text-foreground">Acceso restringido</p>
      <p className="text-sm text-muted-foreground">Solo el administrador puede acceder a esta vista.</p>
      <Button variant="outline" onClick={() => navigate("/")}>Volver al inicio</Button>
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: "#F4F6FC" }}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Metrics Lab — Admin</h1>
            <p className="text-xs text-muted-foreground">Gestión de feedback del Report Builder</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-6 flex-wrap">
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger className="w-[130px] text-xs h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos</SelectItem>
              <SelectItem value="DI" className="text-xs">DI</SelectItem>
              <SelectItem value="BGC" className="text-xs">BGC</SelectItem>
              <SelectItem value="CE" className="text-xs">CE</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px] text-xs h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos los tipos</SelectItem>
              <SelectItem value="nueva_metrica" className="text-xs">Nueva métrica</SelectItem>
              <SelectItem value="voto" className="text-xs">Voto</SelectItem>
              <SelectItem value="error_numerico" className="text-xs">Error numérico</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px] text-xs h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos los estados</SelectItem>
              <SelectItem value="pendiente" className="text-xs">Pendiente</SelectItem>
              <SelectItem value="en_revision" className="text-xs">En revisión</SelectItem>
              <SelectItem value="implementado" className="text-xs">Implementado</SelectItem>
              <SelectItem value="descartado" className="text-xs">Descartado</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground self-center">{filtered.length} resultados</span>
        </div>

        {/* Cards */}
        <div className="space-y-3">
          {filtered.map(f => {
            const isDescExpanded = expandedIds.has(f.id);
            const isAiExpanded = expandedAi.has(f.id);
            return (
              <div key={f.id} className="bg-white rounded-lg border p-4 space-y-2" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="text-[10px] text-white" style={{ background: productColor(f.producto) }}>{f.producto}</Badge>
                  <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[f.tipo] || f.tipo}</Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">{f.csm_email} · {timeAgo(f.creado_en)}</span>
                </div>

                {f.descripcion && (
                  <div>
                    <p className={`text-sm text-foreground ${!isDescExpanded ? "line-clamp-2" : ""}`}>{f.descripcion}</p>
                    {f.descripcion.length > 120 && (
                      <button onClick={() => toggleExpand(f.id)} className="text-[10px] text-primary hover:underline">
                        {isDescExpanded ? "Menos" : "Más"}
                      </button>
                    )}
                  </div>
                )}

                {f.metrica_ref && <p className="text-xs text-muted-foreground">Métrica: <span className="font-medium text-foreground">{f.metrica_ref}</span></p>}
                {f.voto && <p className="text-xs text-muted-foreground">Voto: {f.voto === "util" ? "👍 Útil" : "👎 No útil"}</p>}
                {f.valor_incorrecto && <p className="text-xs text-muted-foreground">Incorrecto: <span className="font-medium">{f.valor_incorrecto}</span> → Correcto: <span className="font-medium">{f.valor_correcto || "—"}</span></p>}
                {f.query_ejemplo && <pre className="text-[10px] bg-muted p-2 rounded font-mono overflow-x-auto">{f.query_ejemplo}</pre>}

                {f.analisis_ia && (
                  <div>
                    <button onClick={() => toggleAi(f.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      {isAiExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      Análisis IA
                    </button>
                    {isAiExpanded && <p className="text-xs text-foreground mt-1 pl-4 border-l-2 border-muted">{f.analisis_ia}</p>}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-muted-foreground">Estado:</span>
                  <Select value={f.estado} onValueChange={(v) => updateStatus(f.id, v as FeedbackStatus)}>
                    <SelectTrigger className="w-[140px] text-xs h-7"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-12">No hay feedbacks con estos filtros.</p>
          )}
        </div>
      </div>
    </div>
  );
}
