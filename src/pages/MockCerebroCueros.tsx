/* ─────────────────────────────────────────────────────────────
   MOCK — Cerebro de Cliente (Visión) · Cueros Vélez
   Página de concepto para alinear la visión del "cerebro de clientes":
   alerta proactiva + health score + 5 fuentes + red flags + insights
   + plan de retención + preview de "pregúntale a Oppy".
   Datos hardcodeados del MVP Cueros Vélez (2026-07). Sin login.
   Ruta: /cerebro-cueros
   NO es producción — es un mockup visual sobre el shell del CSM Center.
───────────────────────────────────────────────────────────── */
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, AlertTriangle, TrendingDown, HeartPulse, Activity, Brain,
  MessageSquareText, CalendarClock, FileText, Sparkles, ShieldAlert,
  CheckCircle2, Target, ThumbsUp, ChevronRight, Flame, Ban, Bot,
  LayoutTemplate, Wand2, Lock, TrendingUp, ScanText, ArrowRight,
} from "lucide-react";
import { MeshBackground } from "@/components/report-builder/MeshBackground";

/* Paleta shell (idéntica a WelcomeStep / BotiAlertas) */
const S = {
  surface: "#172840",
  surfaceHi: "#1B2F4D",
  border: "rgba(255,255,255,0.09)",
  borderHi: "rgba(255,255,255,0.16)",
  text: "#EEF0FF",
  muted: "#8892B8",
  dim: "#4A5580",
};
const DI = "#00C9A7";
const VIOLET = "#7C4DFF";
const CYAN = "#7DD3FC";
const RED = "#EF4444";
const AMBER = "#F59E0B";
const GREEN = "#22C55E";

const scoreColor = (s: number) => (s <= 3 ? RED : s <= 6 ? AMBER : GREEN);

/* ── datos MVP Cueros ────────────────────────────────────── */
const CONSUMO = [
  { m: "Nov", v: 114 },
  { m: "Dic", v: 78 },
  { m: "Ene", v: 4064 },
  { m: "Feb", v: 7799 },
  { m: "Mar", v: 1385 },
  { m: "Abr", v: 1571 },
  { m: "May", v: 357 },
  { m: "Jun", v: 36 },
];
const MAXV = Math.max(...CONSUMO.map((d) => d.v));

const EJES = [
  { label: "Consumo / tendencia", peso: 40, score: 2, nota: "Cayendo · apagándose" },
  { label: "Adopción / amplitud", peso: 20, score: 3, nota: "Estrecha · core sin iniciar" },
  { label: "Relación / sentimiento", peso: 25, score: 7, nota: "Cordial · NPS 8" },
  { label: "Riesgo operativo", peso: 15, score: 3, nota: "No renovación + bloqueo legal" },
];

const FUENTES = [
  { icon: Target, label: "Caso de uso", estado: "Captura rostro+datos para personalización en tienda — NO KYC bancario", ok: true },
  { icon: CalendarClock, label: "Reuniones (Fathom)", estado: "5 reuniones · 27-may: decisión de no renovar", ok: true },
  { icon: TrendingDown, label: "Consumo facturable", estado: "↓ 95% Jun vs Feb · se está apagando", ok: true },
  { icon: ThumbsUp, label: "NPS", estado: "8 (pasivo) · valora la plataforma, pide mejor tiempo de respuesta", ok: true },
  { icon: MessageSquareText, label: "Grupo WhatsApp", estado: "Cordial · reordenar flujo dio mejora · Truora Pass en pausa por legal", ok: true },
];

const REDFLAGS = [
  { t: "Consumo apagándose", d: "Validaciones: Feb 7.799 → Jun 36. El pico fue estacional (bases de refuerzo), no adopción sostenida." },
  { t: "Proyecto core congelado", d: "El reconocimiento facial en tienda (el ROI real) no ha arrancado: bloqueado por legal (habeas data) + integración." },
  { t: "No renovación decidida", d: "Contrato hasta nov-2026. Hoy consumen el mínimo por obligación, no por valor percibido." },
  { t: "Adopción estrecha", d: "Solo DI + Forms; Checks casi nulos. CE y Truora Pass fueron evaluados y descartados." },
];

const INSIGHTS = [
  {
    t: "El churn es de fit/ROI, NO relacional → recuperable",
    d: "NPS 8 y un grupo de WhatsApp cordial conviven con la decisión de no renovar. No es desconfianza: es 'no obtuve lo que esperaba'. Se revierte atacando el fit, no con más acompañamiento (que ya valoran).",
  },
  {
    t: "El caso de uso real nunca arrancó",
    d: "Cueros necesita capturar rostro para fidelización en tienda, no KYC. El paso de documento es la fricción #1 y el discovery no involucró a los dueños del proceso — por eso el producto quedó a medio encajar.",
  },
  {
    t: "El bloqueo es legal, no de producto",
    d: "El ROI está frenado por la fundamentación de habeas data para descargar imágenes. Ningún ajuste táctico salva la cuenta si eso no se destraba — es la palanca de mayor impacto.",
  },
];

const PLAN = [
  { palanca: "Fijar el reordenamiento de flujo", dueno: "JP", eta: "Esta semana", msg: "El nuevo orden ya levantó validaciones (186 DOC + 87 Face). Dejémoslo fijo y midámoslo un mes completo.", tipo: "quick-win" },
  { palanca: "Bajar umbral de rostro + benchmark retail", dueno: "JP + Producto", eta: "2 semanas", msg: "Te comparto cómo otros retail capturan rostro con menos fricción y bajamos el umbral para subir conversión.", tipo: "quick-win" },
  { palanca: "Acompañar el desbloqueo legal (rostros en tienda)", dueno: "JP + Legal Truora", eta: "30 días", msg: "Ayudémoste con la fundamentación de habeas data para activar el proyecto de fidelización — ese es tu ROI.", tipo: "estructural" },
];

/* ── UI helpers ──────────────────────────────────────────── */
function Card({ children, style = {}, accent }: any) {
  return (
    <div
      style={{
        position: "relative",
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: 16,
        padding: 20,
        overflow: "hidden",
        ...style,
      }}
    >
      {accent && (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
      )}
      {children}
    </div>
  );
}

const fade = (i = 0) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay: 0.04 + i * 0.05, ease: "easeOut" as const },
});

const label = (t: string) => (
  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" as const, color: S.muted, marginBottom: 12 }}>{t}</div>
);

/* ─────────────────────────────────────────────────────────── */
export default function MockCerebroCueros() {
  const navigate = useNavigate();

  return (
    <>
      <MeshBackground />
      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", color: S.text, fontFamily: "Inter, system-ui, sans-serif" }}>
        {/* TOP BAR */}
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 10,
            display: "flex", alignItems: "center", gap: 14,
            padding: "14px 24px",
            background: "rgba(8,12,31,0.7)", backdropFilter: "blur(12px)",
            borderBottom: `0.5px solid ${S.border}`,
          }}
        >
          <button
            onClick={() => navigate("/")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: S.muted, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            <ArrowLeft size={16} /> Volver
          </button>
          <div style={{ width: 1, height: 20, background: S.border }} />
          <Brain size={18} color={VIOLET} />
          <div style={{ fontSize: 15, fontWeight: 700 }}>Cerebro de Cliente</div>
          <span style={{ padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, color: VIOLET, background: `${VIOLET}18`, border: `1px solid ${VIOLET}44` }}>
            VISIÓN · MOCKUP
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {["Salud de cuenta", "Insights Report Builder", "Alertas proactivas"].map((t, i) => (
              <span key={t} style={{
                padding: "6px 13px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                color: i === 0 ? CYAN : S.muted,
                background: i === 0 ? `${CYAN}14` : "transparent",
                border: `1px solid ${i === 0 ? `${CYAN}40` : S.border}`,
              }}>{t}</span>
            ))}
          </div>
        </div>

        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "108px 24px 80px" }}>
          {/* HERO ALERT */}
          <motion.div {...fade(0)}>
            <Card accent={AMBER} style={{ borderColor: `${AMBER}44`, background: "linear-gradient(120deg, rgba(245,158,11,0.08), rgba(23,40,64,0.9))" }}>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: "1 1 480px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <AlertTriangle size={20} color={AMBER} />
                    <div style={{ fontSize: 20, fontWeight: 800 }}>Cueros Vélez — señales de churn, actuar ahora</div>
                  </div>
                  <div style={{ fontSize: 14, color: S.muted, lineHeight: 1.6, maxWidth: 640 }}>
                    Decisión de <b style={{ color: S.text }}>no renovación</b> tomada, pero el churn es de <b style={{ color: S.text }}>fit/ROI y es recuperable</b>: la relación está sana (NPS 8) y el proyecto de mayor valor sigue sin arrancar. Contrato hasta nov-2026 → hay ventana para revertirlo.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 11, color: S.muted, fontWeight: 600 }}>PRODUCTOS</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>DI · Forms · <span style={{ color: S.dim }}>BGC residual</span></div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: S.muted, fontWeight: 600 }}>CONTRATO</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>hasta nov-2026</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: S.muted, fontWeight: 600 }}>CSM</div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>Juan Pablo Mesa</div>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* KPI STRIP */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginTop: 16 }}>
            {[
              { icon: HeartPulse, k: "Health Score", v: "4 / 10", sub: "Riesgo alto", color: RED },
              { icon: Flame, k: "Tipo de churn", v: "Fit / ROI", sub: "Recuperable", color: AMBER },
              { icon: ThumbsUp, k: "NPS", v: "8", sub: "Pasivo positivo", color: GREEN },
              { icon: TrendingDown, k: "Consumo (tendencia)", v: "↓ 95%", sub: "Jun vs Feb", color: RED },
            ].map((kpi, i) => (
              <motion.div key={kpi.k} {...fade(i + 1)}>
                <Card accent={kpi.color} style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: S.muted, fontSize: 12, fontWeight: 600 }}>
                    <kpi.icon size={15} color={kpi.color} /> {kpi.k}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: kpi.color }}>{kpi.v}</div>
                  <div style={{ fontSize: 12, color: S.muted, marginTop: 2 }}>{kpi.sub}</div>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* HEALTH DESGLOSE + CONSUMO */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <motion.div {...fade(2)}>
              <Card style={{ height: "100%" }}>
                {label("Health score · 4 ejes ponderados")}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {EJES.map((e) => (
                    <div key={e.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{e.label} <span style={{ color: S.dim, fontWeight: 500 }}>· {e.peso}%</span></div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: scoreColor(e.score) }}>{e.score}/10</div>
                      </div>
                      <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${e.score * 10}%` }}
                          transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
                          style={{ height: "100%", background: scoreColor(e.score), borderRadius: 999 }}
                        />
                      </div>
                      <div style={{ fontSize: 11.5, color: S.muted, marginTop: 4 }}>{e.nota}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>

            <motion.div {...fade(3)}>
              <Card style={{ height: "100%" }}>
                {label("Consumo facturable · validaciones/mes")}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 150, padding: "8px 0" }}>
                  {CONSUMO.map((d, i) => {
                    const h = Math.max(4, (d.v / MAXV) * 130);
                    const isPeak = d.v === MAXV;
                    const isLow = i >= CONSUMO.length - 2;
                    const col = isPeak ? DI : isLow ? RED : `${DI}88`;
                    return (
                      <div key={d.m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <div style={{ fontSize: 10, color: S.muted, fontWeight: 600 }}>{d.v.toLocaleString()}</div>
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: h }}
                          transition={{ duration: 0.6, delay: 0.3 + i * 0.05, ease: "easeOut" }}
                          style={{ width: "100%", maxWidth: 30, background: col, borderRadius: "6px 6px 0 0" }}
                        />
                        <div style={{ fontSize: 11, color: S.dim, fontWeight: 600 }}>{d.m}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, color: S.muted, marginTop: 8, lineHeight: 1.5 }}>
                  Pico de <b style={{ color: DI }}>febrero (7.799)</b> por bases de refuerzo, no adopción sostenida. Desde marzo se apaga hasta <b style={{ color: RED }}>36 en junio</b>.
                </div>
              </Card>
            </motion.div>
          </div>

          {/* RED FLAGS */}
          <motion.div {...fade(4)} style={{ marginTop: 16 }}>
            <Card accent={RED}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <ShieldAlert size={17} color={RED} />
                <div style={{ fontSize: 14, fontWeight: 700 }}>Red flags</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {REDFLAGS.map((f) => (
                  <div key={f.t} style={{ display: "flex", gap: 10 }}>
                    <div style={{ marginTop: 3, width: 8, height: 8, borderRadius: 999, background: RED, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{f.t}</div>
                      <div style={{ fontSize: 12.5, color: S.muted, marginTop: 2, lineHeight: 1.5 }}>{f.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>

          {/* 5 FUENTES */}
          <motion.div {...fade(5)} style={{ marginTop: 16 }}>
            {label("Las 5 fuentes de verdad")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
              {FUENTES.map((f) => (
                <Card key={f.label} style={{ padding: 15 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <f.icon size={16} color={CYAN} />
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{f.label}</div>
                    <CheckCircle2 size={13} color={GREEN} style={{ marginLeft: "auto" }} />
                  </div>
                  <div style={{ fontSize: 12, color: S.muted, lineHeight: 1.5 }}>{f.estado}</div>
                </Card>
              ))}
            </div>
          </motion.div>

          {/* INSIGHTS */}
          <motion.div {...fade(6)} style={{ marginTop: 20 }}>
            {label("Insights — causa raíz (no síntoma)")}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
              {INSIGHTS.map((ins, i) => (
                <Card key={i} accent={VIOLET}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <Sparkles size={16} color={VIOLET} />
                    <div style={{ fontSize: 12, fontWeight: 800, color: VIOLET }}>INSIGHT {i + 1}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, lineHeight: 1.4 }}>{ins.t}</div>
                  <div style={{ fontSize: 12.5, color: S.muted, lineHeight: 1.55 }}>{ins.d}</div>
                </Card>
              ))}
            </div>
          </motion.div>

          {/* PLAN DE RETENCIÓN */}
          <motion.div {...fade(7)} style={{ marginTop: 20 }}>
            <Card accent={GREEN}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <CheckCircle2 size={17} color={GREEN} />
                <div style={{ fontSize: 14, fontWeight: 700 }}>Plan de retención — acciones recomendadas</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {PLAN.map((p, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 12, paddingBottom: 12, borderBottom: i < PLAN.length - 1 ? `1px solid ${S.border}` : "none" }}>
                    <div style={{ width: 24, height: 24, borderRadius: 999, background: `${GREEN}18`, color: GREEN, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>{i + 1}</div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{p.palanca}</div>
                        <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 10.5, fontWeight: 700, color: p.tipo === "estructural" ? AMBER : CYAN, background: p.tipo === "estructural" ? `${AMBER}18` : `${CYAN}14`, border: `1px solid ${p.tipo === "estructural" ? `${AMBER}40` : `${CYAN}40`}` }}>
                          {p.tipo === "estructural" ? "DESBLOQUEO ESTRUCTURAL" : "QUICK-WIN"}
                        </span>
                        <span style={{ fontSize: 11.5, color: S.muted }}>· {p.dueno} · <b style={{ color: S.text }}>{p.eta}</b></span>
                      </div>
                      <div style={{ fontSize: 12.5, color: S.muted, marginTop: 5, lineHeight: 1.5, fontStyle: "italic" }}>💬 "{p.msg}"</div>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2, padding: "10px 12px", borderRadius: 10, background: `${RED}0D`, border: `1px solid ${RED}30` }}>
                  <Ban size={15} color={RED} />
                  <div style={{ fontSize: 12.5, color: S.muted }}>
                    <b style={{ color: S.text }}>No hacer:</b> insistir en Customer Engagement ni Truora Pass — ya fueron evaluados y descartados. Insistir quema confianza.
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* OPPY PREVIEW */}
          <motion.div {...fade(8)} style={{ marginTop: 20 }}>
            <Card style={{ background: "linear-gradient(120deg, rgba(124,77,255,0.10), rgba(23,40,64,0.9))", borderColor: `${VIOLET}33` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <Bot size={17} color={VIOLET} />
                <div style={{ fontSize: 14, fontWeight: 700 }}>Pregúntale a Oppy</div>
                <span style={{ fontSize: 11, color: S.muted }}>— el mismo cerebro, en lenguaje natural</span>
              </div>
              {/* user bubble */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                <div style={{ maxWidth: "70%", padding: "10px 14px", borderRadius: "14px 14px 4px 14px", background: `${VIOLET}22`, border: `1px solid ${VIOLET}44`, fontSize: 13.5 }}>
                  ¿Qué le llevo a Cueros a la reunión del jueves?
                </div>
              </div>
              {/* oppy bubble */}
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 999, background: `${VIOLET}22`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Bot size={15} color={VIOLET} />
                </div>
                <div style={{ maxWidth: "82%", padding: "12px 15px", borderRadius: "4px 14px 14px 14px", background: S.surfaceHi, border: `1px solid ${S.border}`, fontSize: 13, lineHeight: 1.6, color: S.text }}>
                  Su churn es de <b>fit/ROI, no relacional</b> (NPS 8, trato cordial) → recuperable. <b>No insistas</b> en CE ni Truora Pass (los descartaron). Lleva: (1) el reordenamiento de flujo ya subió validaciones, propón dejarlo fijo y medirlo un mes; (2) bajar el umbral de rostro con un benchmark retail; (3) lo más importante, <b>ofrecer acompañar el desbloqueo legal</b> de los rostros en tienda — ahí está su ROI real.
                  <div style={{ fontSize: 11, color: S.muted, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <FileText size={12} /> Fuentes: 5 reuniones · NPS · consumo CH · grupo WhatsApp · KB de producto
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* ═══ REPORT BUILDER — INSIGHTS IA ANCLADOS AL CEREBRO ═══ */}
          <motion.div {...fade(9)} style={{ marginTop: 34 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <LayoutTemplate size={18} color={DI} />
              <div style={{ fontSize: 17, fontWeight: 800 }}>Cómo se ve dentro del Report Builder</div>
            </div>
            <div style={{ fontSize: 13.5, color: S.muted, lineHeight: 1.6, maxWidth: 760, marginBottom: 16 }}>
              Al reactivar los <b style={{ color: S.text }}>Insights con IA</b>, el agente los genera <b style={{ color: S.text }}>anclados a la hoja de vida del cliente</b> — no leyendo solo el gráfico. El mismo panel del slide, pero el texto ahora conoce el caso de uso, el churn y la palanca de renovación.
            </div>

            {/* selector de modo: hoy vs con cerebro */}
            <Card style={{ marginBottom: 16 }}>
              {label("Selector de insight (LeftPanel)")}
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 11, color: S.muted, marginBottom: 7 }}>Hoy</div>
                  <div style={{ display: "flex", gap: 7 }}>
                    <span style={{ padding: "7px 13px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: S.dim, background: "transparent", border: `1px solid ${S.border}`, display: "flex", alignItems: "center", gap: 6, opacity: 0.65 }}>
                      <Lock size={12} /> Con IA
                    </span>
                    <span style={{ padding: "7px 13px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: "#22C55E", background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)" }}>Escribirlo</span>
                    <span style={{ padding: "7px 13px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: S.muted, border: `1px solid ${S.border}` }}>Sin insight</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: S.dim, marginTop: 6, fontStyle: "italic" }}>"Con IA" deshabilitado — "Aún no disponible"</div>
                </div>
                <ChevronRight size={20} color={S.dim} />
                <div>
                  <div style={{ fontSize: 11, color: VIOLET, marginBottom: 7, fontWeight: 700 }}>Con el cerebro</div>
                  <div style={{ display: "flex", gap: 7 }}>
                    <span style={{ padding: "7px 13px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: VIOLET, background: `${VIOLET}22`, border: `1px solid ${VIOLET}55`, display: "flex", alignItems: "center", gap: 6 }}>
                      <Wand2 size={12} /> Con IA + Cerebro
                    </span>
                    <span style={{ padding: "7px 13px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: S.muted, border: `1px solid ${S.border}` }}>Escribirlo</span>
                    <span style={{ padding: "7px 13px", borderRadius: 999, fontSize: 12, fontWeight: 600, color: S.muted, border: `1px solid ${S.border}` }}>Sin insight</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: S.dim, marginTop: 6, fontStyle: "italic" }}>Reactivado y anclado a la hoja de vida del cliente</div>
                </div>
              </div>
            </Card>

            {/* SLIDE PREVIEW (canvas Truora Core) */}
            <div style={{ position: "relative", width: "100%", aspectRatio: "1280 / 720", background: "#0D1137", borderRadius: 12, overflow: "hidden", border: `1px solid ${S.border}`, boxShadow: "0 12px 40px rgba(0,0,0,0.45)" }}>
              {/* left content 65% */}
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, right: "35%", padding: "34px 40px", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "#6B7BA8", textTransform: "uppercase" }}>Digital Identity · Conversión general</div>
                <div style={{ fontSize: 30, fontWeight: 800, color: "#fff", marginTop: 6 }}>Cueros Vélez</div>
                <div style={{ fontSize: 13, color: "#8892B8", marginTop: 2 }}>Abril 2026</div>

                <div style={{ display: "flex", gap: 30, marginTop: 30 }}>
                  <div>
                    <div style={{ fontSize: 40, fontWeight: 800, color: DI }}>1.805</div>
                    <div style={{ fontSize: 12, color: "#8892B8" }}>Procesos iniciados</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 40, fontWeight: 800, color: "#fff" }}>1.571</div>
                    <div style={{ fontSize: 12, color: "#8892B8" }}>Validaciones facturables</div>
                  </div>
                </div>

                {/* mini bars */}
                <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120, marginTop: "auto" }}>
                  {CONSUMO.slice(2).map((d) => {
                    const h = Math.max(6, (d.v / MAXV) * 108);
                    return (
                      <div key={d.m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                        <div style={{ width: "100%", maxWidth: 34, height: h, background: `${DI}99`, borderRadius: "5px 5px 0 0" }} />
                        <div style={{ fontSize: 11, color: "#5A6890" }}>{d.m}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* InsightPanel 35% (réplica del real) */}
              <div style={{ position: "absolute", top: "10%", bottom: "5%", right: 0, width: "35%", background: "rgba(255,255,255,0.04)", borderLeft: "3px solid #4B6FFF", padding: "20px 24px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8892B8", textTransform: "uppercase", letterSpacing: "0.08em" }}>✦ Análisis</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.06em", background: "rgba(75,111,255,0.2)", color: "#818CF8" }}>Generado con IA</span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.06em", background: `${VIOLET}2A`, color: "#C4B5FD", display: "flex", alignItems: "center", gap: 4 }}>
                    <Brain size={10} /> Anclado a la hoja de vida
                  </span>
                </div>
                <p style={{ fontSize: 14, color: "#EEF0FF", lineHeight: 1.6, margin: 0 }}>
                  La conversión DI se sostiene, pero el <b>volumen se apaga</b> (feb 7.799 → jun 36): el pico fue estacional, no adopción. El caso de uso real —<b>rostro en tienda para fidelización</b>— sigue sin arrancar por el bloqueo legal de habeas data. De cara a la renovación (nov-2026), la palanca no es más DI transaccional, sino <b>destrabar ese proyecto</b>: ahí está el ROI que Cueros espera.
                </p>
                <div style={{ fontSize: 10, color: "#6B7BA8", marginTop: 12, display: "flex", alignItems: "center", gap: 5 }}>
                  <FileText size={11} /> 5 reuniones · NPS 8 · consumo CH · WhatsApp
                </div>
              </div>
            </div>

            {/* contraste genérico vs cerebro */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
              <Card style={{ opacity: 0.85 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: S.dim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <Sparkles size={13} /> Insight genérico (solo lee el gráfico)
                </div>
                <p style={{ fontSize: 13, color: S.muted, lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
                  "En abril la conversión general de DI fue del 72%, una leve caída frente a marzo. Los procesos declinados se concentran en documento. Se recomienda revisar la calidad de captura."
                </p>
                <div style={{ fontSize: 11, color: S.dim, marginTop: 8 }}>→ Correcto pero intercambiable: no sabe quién es Cueros ni qué está en juego.</div>
              </Card>
              <Card accent={VIOLET}>
                <div style={{ fontSize: 11, fontWeight: 700, color: VIOLET, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <Wand2 size={13} /> Insight anclado al cerebro
                </div>
                <p style={{ fontSize: 13, color: S.text, lineHeight: 1.6, margin: 0, fontStyle: "italic" }}>
                  "…la palanca no es más DI transaccional, sino destrabar el proyecto de rostro en tienda — ahí está el ROI que Cueros espera de cara a la renovación."
                </p>
                <div style={{ fontSize: 11, color: VIOLET, marginTop: 8 }}>→ Específico y accionable: conoce el churn, el caso de uso y la palanca real.</div>
              </Card>
            </div>
          </motion.div>

          {/* ═══ MOTIVOS DE RECHAZO → ACCIÓN (CONOCIMIENTO DE PRODUCTO) ═══ */}
          <motion.div {...fade(10)} style={{ marginTop: 34 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <ScanText size={18} color={DI} />
              <div style={{ fontSize: 17, fontWeight: 800 }}>Motivos de rechazo → acción realista</div>
            </div>
            <div style={{ fontSize: 13.5, color: S.muted, lineHeight: 1.6, maxWidth: 780, marginBottom: 16 }}>
              El agente cruza <b style={{ color: S.text }}>3 conocimientos</b>: (1) <b style={{ color: DI }}>qué significa</b> cada motivo de rechazo, (2) <b style={{ color: DI }}>la tendencia</b> mes a mes, y (3) <b style={{ color: DI }}>qué puede hacer Truora</b> realmente al respecto. Así el accionable no es genérico — es ejecutable y ataca el cuello de botella del cliente.
            </div>

            <Card>
              {/* header de tabla */}
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 1.6fr 2fr", gap: 12, padding: "0 4px 10px", borderBottom: `1px solid ${S.border}`, fontSize: 10.5, fontWeight: 700, color: S.dim, textTransform: "uppercase", letterSpacing: 0.5 }}>
                <div>Motivo</div>
                <div>Mes vs anterior</div>
                <div>Qué significa</div>
                <div>Acción Truora realista</div>
              </div>
              {[
                { motivo: "Imagen borrosa del documento", prev: 112, cur: 132, delta: 18, mean: "La foto del documento salió desenfocada; el usuario no logra una captura nítida.", accion: "Activar chequeo de nitidez + captura asistida (auto-capture) del SDK y hint en pantalla \"acerca y enfoca\".", worse: true, hot: true },
                { motivo: "Documento no reconocido", prev: 61, cur: 65, delta: 7, mean: "El tipo o el encuadre del documento no se identifica.", accion: "Ampliar tipos de documento aceptados + guía visual de encuadre en el flujo.", worse: true },
                { motivo: "No se detectó rostro", prev: 94, cur: 88, delta: -6, mean: "No se capturó un rostro válido en el paso biométrico.", accion: "Mejora sostenida: el reordenamiento del flujo ya la redujo. Mantener el nuevo orden.", worse: false },
              ].map((r, i, arr) => (
                <div key={r.motivo} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.7fr 1.6fr 2fr", gap: 12, padding: "13px 4px", borderBottom: i < arr.length - 1 ? `1px solid ${S.border}` : "none", alignItems: "start" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    {r.hot && <Flame size={13} color={RED} />}{r.motivo}
                  </div>
                  <div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 999, fontSize: 12, fontWeight: 800, color: r.worse ? RED : GREEN, background: r.worse ? `${RED}18` : `${GREEN}18`, border: `1px solid ${r.worse ? `${RED}40` : `${GREEN}40`}` }}>
                      {r.worse ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{r.delta > 0 ? "+" : ""}{r.delta}%
                    </span>
                    <div style={{ fontSize: 10.5, color: S.dim, marginTop: 3 }}>{r.prev} → {r.cur}</div>
                  </div>
                  <div style={{ fontSize: 12, color: S.muted, lineHeight: 1.5 }}>{r.mean}</div>
                  <div style={{ fontSize: 12, color: S.text, lineHeight: 1.5, display: "flex", gap: 6 }}>
                    <ArrowRight size={13} color={DI} style={{ flexShrink: 0, marginTop: 2 }} />
                    {r.accion}
                  </div>
                </div>
              ))}
            </Card>

            {/* síntesis → cómo llega al MBR / Oppy */}
            <Card accent={VIOLET} style={{ marginTop: 12, background: "linear-gradient(120deg, rgba(124,77,255,0.08), rgba(23,40,64,0.9))" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: VIOLET, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <Wand2 size={13} /> Cómo lo dice en el MBR (o al preguntarle a Oppy)
              </div>
              <p style={{ fontSize: 14, color: S.text, lineHeight: 1.65, margin: 0 }}>
                "Este mes los rechazos por <b>imagen borrosa subieron 18%</b> y ya son el motivo #1 de tus declinados de documento. Es fricción de captura, <b>no fraude</b> — y el paso de documento es justo tu cuello de botella. Activando el <b>chequeo de nitidez + captura asistida del SDK</b> podemos subir tu conversión y allanar el camino al <b>proyecto de rostro en tienda</b> que buscas con nosotros."
              </p>
              <div style={{ fontSize: 11, color: S.muted, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <Brain size={12} /> Cruza: motivos de rechazo (DI) · tendencia MoM · KB de producto Truora · caso de uso del cliente
              </div>
            </Card>
          </motion.div>

          {/* footer note */}
          <div style={{ marginTop: 26, textAlign: "center", fontSize: 12, color: S.dim, lineHeight: 1.6 }}>
            <Activity size={13} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Mockup de visión · datos del MVP Cueros Vélez (jul-2026). Lo cualitativo vive en el cerebro (Obsidian/Supabase); lo cuantitativo se lee en vivo de ClickHouse. Nada de esto está en producción todavía.
          </div>
        </main>
      </div>
    </>
  );
}
