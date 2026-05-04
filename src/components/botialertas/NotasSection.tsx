import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Pencil, Trash2, Check, X as XIcon, Loader2, AlertCircle, MessageSquareText } from "lucide-react";
import { S } from "./types";
import { useClienteNotas, type ClienteNota } from "@/hooks/useClienteNotas";

interface Props {
  tci: string;
  cliente_id?: string | null;
  currentUserEmail: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  csmByEmail: Record<string, { nombre: string }>;
}

const MAX_LEN = 2000;

/* =========================================================================
   NotasSection — lista de notas + form de creación/edición
   ========================================================================= */
export default function NotasSection({
  tci, cliente_id, currentUserEmail, isAdmin, isOwner, csmByEmail,
}: Props) {
  const { notas, loading, error, addNota, updateNota, deleteNota } = useClienteNotas(tci);

  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const canWrite = isAdmin || isOwner;

  const handleSubmit = async () => {
    const value = text.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    const result = await addNota({ contenido: value, cliente_id });
    setSubmitting(false);
    if (result) setText("");
  };

  const handleStartEdit = (n: ClienteNota) => {
    setEditingId(n.id);
    setEditingText(n.contenido);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const value = editingText.trim();
    if (!value) return;
    const ok = await updateNota(editingId, value);
    if (ok) {
      setEditingId(null);
      setEditingText("");
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const handleDelete = async (id: string) => {
    const ok = await deleteNota(id);
    if (ok) setConfirmDeleteId(null);
  };

  return (
    <div style={{
      background: S.surfaceLo,
      border: `1px solid ${S.border}`,
      borderRadius: 14,
      padding: 16,
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      {/* Header de la sección */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MessageSquareText size={14} color="#7DD3FC" strokeWidth={2.4} />
          <span style={{
            fontSize: 11, fontWeight: 700, color: "#7DD3FC",
            letterSpacing: "0.12em", textTransform: "uppercase",
          }}>
            Notas del equipo
          </span>
          <span style={{ fontSize: 11, color: S.dim }}>
            {loading ? "" : `· ${notas.length}`}
          </span>
        </div>
        {!canWrite && (
          <span style={{ fontSize: 10.5, color: S.dim, fontStyle: "italic" }}>
            Solo el CSM dueño y admins pueden escribir
          </span>
        )}
      </div>

      {/* Form de creación */}
      {canWrite && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
            placeholder="Escribí el motivo de la variación, una acción tomada o contexto relevante…"
            rows={3}
            disabled={submitting}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            style={{
              width: "100%",
              background: S.surface,
              border: `1px solid ${S.border}`,
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 13,
              color: S.text,
              fontFamily: "inherit",
              resize: "vertical",
              minHeight: 70,
              outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#7DD3FC55"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = S.border; }}
          />
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            fontSize: 10.5,
          }}>
            <span style={{ color: S.dim }}>
              {text.length}/{MAX_LEN} · ⌘/Ctrl + Enter para guardar
            </span>
            <button
              onClick={handleSubmit}
              disabled={submitting || text.trim().length === 0}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: text.trim() && !submitting ? "#7DD3FC" : S.surface,
                color: text.trim() && !submitting ? "#0F1B2D" : S.dim,
                border: `1px solid ${text.trim() && !submitting ? "#7DD3FC" : S.border}`,
                borderRadius: 999,
                padding: "6px 14px",
                fontSize: 12, fontWeight: 700,
                cursor: text.trim() && !submitting ? "pointer" : "not-allowed",
                transition: "all 0.15s",
              }}
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} strokeWidth={2.4} />}
              Guardar nota
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 8, padding: "8px 10px",
          fontSize: 11.5, color: "#FCA5A5",
        }}>
          <AlertCircle size={13} strokeWidth={2.2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div style={{ fontSize: 12, color: S.muted, padding: "12px 0", textAlign: "center" }}>
          Cargando notas…
        </div>
      ) : notas.length === 0 ? (
        <div style={{
          fontSize: 12, color: S.muted, padding: "16px 8px",
          textAlign: "center", fontStyle: "italic",
        }}>
          {canWrite
            ? "Aún no hay notas. Sé el primero en dejar contexto."
            : "Aún no hay notas para este cliente."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <AnimatePresence initial={false}>
            {notas.map((n) => {
              const isAuthor = n.autor_email === currentUserEmail;
              const canEdit = isAuthor;
              const canDelete = isAuthor || isAdmin;
              const isEditing = editingId === n.id;
              const autorNombre = csmByEmail[n.autor_email]?.nombre || n.autor_email;
              const fechaLabel = formatRelative(n.creado_en);
              const editado = !!n.editado_en;

              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.18 }}
                  style={{
                    background: S.surface,
                    border: `1px solid ${S.border}`,
                    borderRadius: 10,
                    padding: 12,
                    display: "flex", flexDirection: "column", gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12.5, color: S.text, fontWeight: 700 }}>
                        {autorNombre}
                      </span>
                      <span style={{ fontSize: 11, color: S.muted }}>
                        {fechaLabel}
                        {editado && <span style={{ color: S.dim, fontStyle: "italic", marginLeft: 4 }}>· editado</span>}
                      </span>
                    </div>

                    {/* Acciones */}
                    {!isEditing && (canEdit || canDelete) && (
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        {canEdit && (
                          <button
                            onClick={() => handleStartEdit(n)}
                            title="Editar"
                            style={iconBtnStyle}
                            onMouseEnter={(e) => { e.currentTarget.style.color = S.text; e.currentTarget.style.borderColor = S.borderHi; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = S.dim; e.currentTarget.style.borderColor = S.border; }}
                          >
                            <Pencil size={11} />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setConfirmDeleteId(n.id)}
                            title="Borrar"
                            style={iconBtnStyle}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "#EF4444"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = S.dim; e.currentTarget.style.borderColor = S.border; }}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Contenido o editor */}
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value.slice(0, MAX_LEN))}
                        rows={3}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSaveEdit(); }
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                        style={{
                          width: "100%", background: S.surfaceLo,
                          border: `1px solid ${S.borderHi}`, borderRadius: 8,
                          padding: "8px 10px", fontSize: 13, color: S.text,
                          fontFamily: "inherit", resize: "vertical", minHeight: 60, outline: "none",
                        }}
                      />
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                        <button
                          onClick={handleCancelEdit}
                          style={{
                            ...smallBtnStyle,
                            color: S.muted,
                            borderColor: S.border,
                            background: "transparent",
                          }}
                        >
                          <XIcon size={11} /> Cancelar
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={!editingText.trim()}
                          style={{
                            ...smallBtnStyle,
                            color: editingText.trim() ? "#0F1B2D" : S.dim,
                            background: editingText.trim() ? "#7DD3FC" : S.surface,
                            borderColor: editingText.trim() ? "#7DD3FC" : S.border,
                            cursor: editingText.trim() ? "pointer" : "not-allowed",
                          }}
                        >
                          <Check size={11} /> Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: S.text, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {n.contenido}
                    </div>
                  )}

                  {/* Confirmación de borrado inline */}
                  {confirmDeleteId === n.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.25)",
                        borderRadius: 8, padding: "8px 10px",
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                      }}
                    >
                      <span style={{ fontSize: 11.5, color: "#FCA5A5" }}>¿Borrar esta nota?</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          style={{ ...smallBtnStyle, color: S.muted, background: "transparent", borderColor: S.border }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleDelete(n.id)}
                          style={{ ...smallBtnStyle, color: "#fff", background: "#EF4444", borderColor: "#EF4444" }}
                        >
                          Sí, borrar
                        </button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 24, height: 24, borderRadius: 6,
  background: "transparent",
  border: `1px solid ${S.border}`,
  color: S.dim, cursor: "pointer",
  transition: "all 0.15s",
};

const smallBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  fontSize: 11, fontWeight: 600,
  padding: "5px 10px", borderRadius: 999,
  border: `1px solid ${S.border}`,
  cursor: "pointer", transition: "all 0.15s",
  fontFamily: "inherit",
};

/** "hace 5 min" / "hace 2 h" / "ayer" / "hace 3 d" / fecha exacta si > 7 días */
function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffSec = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "hace un momento";
  if (diffSec < 3600) return `hace ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `hace ${Math.floor(diffSec / 3600)} h`;
  const days = Math.floor(diffSec / 86400);
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}
