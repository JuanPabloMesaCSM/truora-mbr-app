import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Sparkles, User } from "lucide-react";
import type { Message } from "./types";
import { OPPY_COLORS, SHELL } from "./types";

interface Props { message: Message }

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      style={{
        display: "flex",
        gap: 10,
        flexDirection: isUser ? "row-reverse" : "row",
        marginBottom: 14,
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isUser
            ? "rgba(124,77,255,0.20)"
            : `linear-gradient(135deg, ${OPPY_COLORS.primary}, ${OPPY_COLORS.accent})`,
          color: isUser ? "#C4B3FF" : "#FFFFFF",
        }}
      >
        {isUser ? <User size={14} /> : <Sparkles size={14} />}
      </div>

      {/* Bubble */}
      <div
        style={{
          maxWidth: "85%",
          padding: "10px 12px",
          borderRadius: 12,
          background: isUser ? "rgba(124,77,255,0.10)" : SHELL.surface,
          border: `1px solid ${isUser ? "rgba(124,77,255,0.25)" : SHELL.border}`,
          color: SHELL.text,
          fontSize: 13.5,
          lineHeight: 1.55,
          whiteSpace: "normal",
          wordBreak: "break-word",
        }}
      >
        <ContentRenderer text={message.content} />
      </div>
    </motion.div>
  );
}

/* Parser muy simple: separa code blocks ```...``` y aplica formato a inline `code` + saltos de linea. */
function ContentRenderer({ text }: { text: string }) {
  const parts = splitByCodeBlocks(text);
  return (
    <>
      {parts.map((part, i) =>
        part.type === "code" ? (
          <CodeBlock key={i} code={part.content} lang={part.lang} />
        ) : (
          <InlineText key={i} text={part.content} />
        )
      )}
    </>
  );
}

function InlineText({ text }: { text: string }) {
  // Tokenize por backticks de inline code
  const tokens: { kind: "text" | "code"; value: string }[] = [];
  const re = /`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) tokens.push({ kind: "text", value: text.slice(last, m.index) });
    tokens.push({ kind: "code", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ kind: "text", value: text.slice(last) });

  return (
    <span>
      {tokens.map((t, i) =>
        t.kind === "code" ? (
          <code
            key={i}
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12.5,
              padding: "1px 6px",
              background: "rgba(167,139,250,0.12)",
              border: `1px solid ${OPPY_COLORS.borderPill}`,
              borderRadius: 4,
              color: "#D8C5FF",
              whiteSpace: "nowrap",
            }}
          >
            {t.value}
          </code>
        ) : (
          <FormattedText key={i} text={t.value} />
        )
      )}
    </span>
  );
}

/* Maneja saltos de linea, bold con **, listas con - al inicio de linea */
function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const isBullet = /^\s*[-*]\s+/.test(line);
        const bulletContent = isBullet ? line.replace(/^\s*[-*]\s+/, "") : line;
        const withBold = renderBold(bulletContent);

        if (isBullet) {
          return (
            <div key={i} style={{ display: "flex", gap: 6, marginLeft: 2 }}>
              <span style={{ color: OPPY_COLORS.primary, fontWeight: 700 }}>•</span>
              <span>{withBold}</span>
            </div>
          );
        }
        return <div key={i} style={{ minHeight: line === "" ? 8 : undefined }}>{withBold}</div>;
      })}
    </>
  );
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i} style={{ color: SHELL.text, fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
    }
    if (p.startsWith("*") && p.endsWith("*") && p.length > 2) {
      return <em key={i} style={{ color: SHELL.muted, fontStyle: "italic" }}>{p.slice(1, -1)}</em>;
    }
    return <span key={i}>{p}</span>;
  });
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      style={{
        position: "relative",
        margin: "8px 0",
        background: "#0F1B2E",
        border: `1px solid ${SHELL.border}`,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 10px",
          background: "rgba(255,255,255,0.04)",
          borderBottom: `1px solid ${SHELL.border}`,
          fontSize: 10.5, fontWeight: 600,
          color: SHELL.muted, letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        <span>{lang || "code"}</span>
        <button
          onClick={onCopy}
          title="Copiar"
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "transparent", border: "none", cursor: "pointer",
            color: copied ? "#22C55E" : SHELL.muted,
            fontSize: 11, fontWeight: 600,
            padding: "2px 6px", borderRadius: 4,
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copiado" : "Copiar"}</span>
        </button>
      </div>
      <pre
        style={{
          margin: 0, padding: "10px 12px",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 11.5, lineHeight: 1.5,
          color: "#D8E0F0",
          overflowX: "auto",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

function splitByCodeBlocks(text: string): { type: "text" | "code"; content: string; lang?: string }[] {
  const out: { type: "text" | "code"; content: string; lang?: string }[] = [];
  const re = /```(\w+)?\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: "text", content: text.slice(last, m.index) });
    out.push({ type: "code", content: m[2].trim(), lang: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", content: text.slice(last) });
  return out;
}
