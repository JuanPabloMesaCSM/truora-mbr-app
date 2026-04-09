import { useState } from "react";
import { Sparkles, ThumbsUp, AlertTriangle, Lightbulb } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { MODULES, PRODUCT_COLORS, type Product } from "./moduleDefinitions";

type FeedbackType = "nueva_metrica" | "voto" | "error_numerico";
type Voto = "util" | "no_util";

const SUPABASE_URL = "https://cjrhxmfnmajxiwiiuwym.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqcmh4bWZubWFqeGl3aWl1d3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTI2OTIsImV4cCI6MjA4ODk2ODY5Mn0.6q8_uL8wOmgX1jDyQ8qbENRrC7vJRCcD0CBtQAVPoHw";
const N8N_WEBHOOK = "https://n8n.zapsign.com.br/webhook/metrics-lab";

const TYPE_CARDS: { type: FeedbackType; label: string; desc: string; Icon: typeof Sparkles }[] = [
  { type: "nueva_metrica", label: "Nueva métrica", desc: "Proponer una métrica nueva", Icon: Sparkles },
  { type: "voto", label: "Votar métrica", desc: "Dar feedback sobre una existente", Icon: ThumbsUp },
  { type: "error_numerico", label: "Reportar error", desc: "El número no cuadra con mis datos", Icon: AlertTriangle },
];

function getMetricas(product: Product) {
  const m = MODULES[product];
  return [m.base, ...m.optional].map(mod => ({ id: mod.id, label: mod.label }));
}

interface Props {
  open: boolean;
  onClose: () => void;
  product: Product;
  userEmail: string;
}

export function FeedbackModal({ open, onClose, product, userEmail }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [tipo, setTipo] = useState<FeedbackType | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [queryEjemplo, setQueryEjemplo] = useState("");
  const [metricaRef, setMetricaRef] = useState("");
  const [voto, setVoto] = useState<Voto | null>(null);
  const [porQue, setPorQue] = useState("");
  const [valorIncorrecto, setValorIncorrecto] = useState("");
  const [valorCorrecto, setValorCorrecto] = useState("");
  const [contexto, setContexto] = useState("");
  const [sending, setSending] = useState(false);

  const color = PRODUCT_COLORS[product];
  const metricas = getMetricas(product);

  const reset = () => {
    setStep(1);
    setTipo(null);
    setDescripcion("");
    setQueryEjemplo("");
    setMetricaRef("");
    setVoto(null);
    setPorQue("");
    setValorIncorrecto("");
    setValorCorrecto("");
    setContexto("");
  };

  const handleClose = () => { reset(); onClose(); };

  const selectType = (t: FeedbackType) => { setTipo(t); setStep(2); };

  const canSend = () => {
    if (!tipo) return false;
    if (tipo === "nueva_metrica") return descripcion.trim().length > 0;
    if (tipo === "voto") return !!metricaRef && !!voto;
    if (tipo === "error_numerico") return !!metricaRef && valorIncorrecto.trim().length > 0;
    return false;
  };

  const handleSend = async () => {
    if (!canSend()) return;
    setSending(true);

    const body: Record<string, any> = {
      csm_email: userEmail,
      producto: product,
      tipo,
      descripcion: tipo === "nueva_metrica" ? descripcion : tipo === "error_numerico" ? contexto || null : porQue || null,
      query_ejemplo: tipo === "nueva_metrica" && queryEjemplo.trim() ? queryEjemplo : null,
      metrica_ref: tipo !== "nueva_metrica" ? metricaRef : null,
      voto: tipo === "voto" ? voto : null,
      valor_incorrecto: tipo === "error_numerico" ? valorIncorrecto : null,
      valor_correcto: tipo === "error_numerico" && valorCorrecto.trim() ? valorCorrecto : null,
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || SUPABASE_ANON;

      const supaRes = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(body),
      });

      if (!supaRes.ok) throw new Error(`Supabase: ${supaRes.status}`);
      const [inserted] = await supaRes.json();

      // Fire-and-forget webhook
      fetch(N8N_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, id: inserted.id }),
      }).catch(console.error);

      toast.success("Feedback enviado. Lo revisaremos pronto.");
      handleClose();
    } catch (err) {
      console.error("Feedback error:", err);
      toast.error("Error al enviar feedback");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" style={{ color }} /> Metrics Lab
          </DialogTitle>
          <DialogDescription>Ayúdanos a mejorar el Report Builder</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="grid grid-cols-3 gap-3 py-4">
            {TYPE_CARDS.map(({ type, label, desc, Icon }) => (
              <button
                key={type}
                onClick={() => selectType(type)}
                className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all hover:shadow-md text-center ${
                  tipo === type ? "border-2 shadow-sm" : "border-border"
                }`}
                style={tipo === type ? { borderColor: color, background: `${color}08` } : undefined}
              >
                <Icon className="h-6 w-6" style={{ color }} />
                <span className="text-xs font-semibold">{label}</span>
                <span className="text-[10px] text-muted-foreground leading-snug">{desc}</span>
              </button>
            ))}
          </div>
        )}

        {step === 2 && tipo === "nueva_metrica" && (
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Descripción *</label>
              <Textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Describe la métrica que necesitas..." className="text-sm" rows={3} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Query de ejemplo (opcional)</label>
              <Textarea value={queryEjemplo} onChange={e => setQueryEjemplo(e.target.value)} placeholder="SELECT ..." className="text-sm font-mono" rows={3} />
            </div>
          </div>
        )}

        {step === 2 && tipo === "voto" && (
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Métrica *</label>
              <Select value={metricaRef} onValueChange={setMetricaRef}>
                <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Seleccionar métrica" /></SelectTrigger>
                <SelectContent>
                  {metricas.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">¿Es útil? *</label>
              <div className="flex gap-2">
                {(["util", "no_util"] as Voto[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setVoto(v)}
                    className={`flex-1 py-2 text-xs font-medium rounded-md border transition-all ${
                      voto === v ? "text-white" : "text-muted-foreground"
                    }`}
                    style={voto === v ? { background: color, borderColor: color } : undefined}
                  >
                    {v === "util" ? "👍 Útil" : "👎 No útil"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">¿Por qué? (opcional)</label>
              <Textarea value={porQue} onChange={e => setPorQue(e.target.value)} placeholder="Cuéntanos..." className="text-sm" rows={2} />
            </div>
          </div>
        )}

        {step === 2 && tipo === "error_numerico" && (
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium">Métrica *</label>
              <Select value={metricaRef} onValueChange={setMetricaRef}>
                <SelectTrigger className="text-xs h-9"><SelectValue placeholder="Seleccionar métrica" /></SelectTrigger>
                <SelectContent>
                  {metricas.map(m => <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Valor incorrecto *</label>
                <Input value={valorIncorrecto} onChange={e => setValorIncorrecto(e.target.value)} placeholder="Ej: 45%" className="text-xs h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Valor correcto</label>
                <Input value={valorCorrecto} onChange={e => setValorCorrecto(e.target.value)} placeholder="Ej: 52%" className="text-xs h-9" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Contexto adicional</label>
              <Textarea value={contexto} onChange={e => setContexto(e.target.value)} placeholder="Cuéntanos más..." className="text-sm" rows={2} />
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="mr-auto">
              ← Atrás
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleClose}>Cancelar</Button>
          {step === 2 && (
            <Button
              size="sm"
              disabled={!canSend() || sending}
              onClick={handleSend}
              style={{ background: color }}
              className="text-white"
            >
              {sending ? "Enviando..." : "Enviar feedback"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
