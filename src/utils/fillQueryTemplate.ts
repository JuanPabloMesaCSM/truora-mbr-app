/**
 * fillQueryTemplate — sustituye en VIVO los placeholders de un sql_template
 * con los valores que el CSM escribe (Client ID, fechas), para que pueda
 * copiar SQL listo para correr en consola sin cazar placeholders a mano.
 *
 * Soporta los dos formatos de placeholder del catálogo:
 *   1. n8n  : {{ $("Preparar Params").first().json.fecha_inicio }}   (a veces 'envuelto')
 *   2. CH   : {client_id:String} / {fecha_inicio:Date} / {tci_list:Array(String)}
 *
 * Filosofía heredada de n8nToSnowflake: si un campo requerido NO se completó,
 * dejamos un marcador <<...>> bien visible — la consola va a fallar a propósito
 * hasta que el CSM ponga el valor real.
 */

export type ParamRole =
  | "clientId"
  | "fechaInicio"
  | "fechaFin"
  | "fechaCorte"
  | "customTypes"
  | "flow"
  | "filter"
  | "other";

/** Deriva el "rol" de un nombre de parámetro o del contenido de un placeholder. */
export function roleOf(rawName: string): ParamRole {
  const l = rawName.toLowerCase();
  if (/custom_types|_types|^types|tipos/.test(l)) return "customTypes";
  if (/_filter\b|filter\b|filtro|where_clause/.test(l)) return "filter";
  if (/flow_id|flow_name|flujo|^flow\b/.test(l)) return "flow";
  if (/client|tci|cliente_id/.test(l)) return "clientId";
  if (/fecha_corte|^corte|^fecha$/.test(l)) return "fechaCorte";
  if (/fecha_inicio|_inicio|^inicio|desde|^from$|mes_actual_inicio/.test(l)) return "fechaInicio";
  if (/fecha_fin|_fin\b|^fin|hasta|^to$|mes_actual_fin/.test(l)) return "fechaFin";
  if (/fecha|date|periodo/.test(l)) return "fechaInicio"; // fecha genérica → inicio
  return "other";
}

/** Marcador de "todavía falta este campo" por rol. */
function fallbackMarker(role: ParamRole): string {
  switch (role) {
    case "clientId":
      return "<<CLIENT_ID>>";
    case "fechaInicio":
      return "<<DESDE_YYYY-MM-DD>>";
    case "fechaFin":
      return "<<HASTA_YYYY-MM-DD>>";
    case "fechaCorte":
      return "<<FECHA_YYYY-MM-DD>>";
    case "customTypes":
      return "ALL";
    case "flow":
      return "<<FLOW_ID>>";
    default:
      return "<<VALOR>>";
  }
}

export interface FillResult {
  sql: string;
  /** roles que aparecen en el SQL y todavía no tienen valor (excluye filter/customTypes). */
  missing: ParamRole[];
}

/**
 * @param sql       el sql_template crudo
 * @param values    valores por rol que el CSM completó (ej {clientId:'TCIxxx', fechaInicio:'2026-05-01'})
 */
export function fillQueryTemplate(
  sql: string,
  values: Partial<Record<ParamRole, string>>
): FillResult {
  const presentRoles = new Set<ParamRole>();
  const filledRoles = new Set<ParamRole>();

  const resolve = (role: ParamRole): { text: string; quoted: boolean } | null => {
    presentRoles.add(role);
    if (role === "filter") {
      return { text: "1=1 /* filtro opcional */", quoted: false };
    }
    const raw = (values[role] ?? "").trim();
    if (!raw) {
      if (role === "customTypes") {
        filledRoles.add(role);
        return { text: "ALL", quoted: true };
      }
      return null; // sin valor → caller pone marcador
    }
    filledRoles.add(role);
    return { text: raw, quoted: true };
  };

  /* ── 1) Placeholders n8n: {{ ... }} (posiblemente entre comillas simples) ── */
  let out = sql.replace(
    /('?)\{\{\s*([^}]+?)\s*\}\}('?)/g,
    (_m, q1: string, inner: string, q2: string) => {
      const role = roleOf(inner);
      const wrappedInQuotes = q1 === "'" && q2 === "'";
      const resolved = resolve(role);
      const value = resolved ? resolved.text : fallbackMarker(role);
      const asStringLiteral = resolved ? resolved.quoted : role !== "filter";

      if (wrappedInQuotes) return `'${value}'`;
      if (asStringLiteral) return `${q1}'${value}'${q2}`;
      return `${q1}${value}${q2}`;
    }
  );

  /* ── 2) Placeholders ClickHouse: {name:Type} ── */
  out = out.replace(
    /\{(\w+)\s*:\s*([A-Za-z0-9()\s]+?)\}/g,
    (_m, name: string, type: string) => {
      const role = roleOf(name);
      const isArray = /array/i.test(type);
      const resolved = resolve(role);

      if (!resolved) {
        const mk = fallbackMarker(role);
        return isArray ? `[${mk === "ALL" ? "" : `'${mk}'`}]` : `'${mk}'`;
      }
      if (isArray) {
        // tci_list multilinea / coma-separado → ['a','b']
        const items = resolved.text
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => `'${s}'`);
        return `[${items.join(", ")}]`;
      }
      const numeric = /int|float|decimal|uint/i.test(type);
      return numeric ? resolved.text : `'${resolved.text}'`;
    }
  );

  const missing = [...presentRoles].filter(
    (r) => r !== "filter" && r !== "customTypes" && !filledRoles.has(r)
  );

  return { sql: out, missing };
}
