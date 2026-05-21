/**
 * Convierte un SQL template de n8n (con placeholders {{ }}) a una version
 * lista para pegar en la consola Snowflake.
 *
 * Reglas:
 * 1. Si el {{ ... }} esta ENTRE comillas simples (caso normal en SF, ej.
 *    `CAST('{{ $json.fecha_inicio }}' AS DATE)`), se consume el par de
 *    comillas + el placeholder y se reemplaza por `'<<VALOR>>'` (un solo
 *    par de comillas). Sin esto, agregar 'YYYY-MM-DD' adentro daba
 *    `''YYYY-MM-DD''` (4 comillas, SQL invalido).
 *
 * 2. Si el {{ ... }} esta crudo (sin comillas alrededor), se reemplaza por
 *    el valor segun el tipo de placeholder.
 *
 * 3. El texto de reemplazo usa marcadores claros `<<NOMBRE>>` para que el
 *    CSM identifique inmediatamente que cambiar. Snowflake va a fallar
 *    si el CSM intenta correr sin reemplazar (lo cual es deseable: forzar
 *    el cambio antes de ejecutar).
 */

export function n8nToSnowflake(sql: string): string {
  return sql.replace(
    /('?)\{\{\s*([^}]+?)\s*\}\}('?)/g,
    (_match, q1: string, inner: string, q2: string) => {
      const lower = inner.toLowerCase();
      const wrappedInQuotes = q1 === "'" && q2 === "'";

      // Decidir el valor de reemplazo segun el tipo de placeholder
      let value: string;
      let isStringLiteral = true;

      if (/fecha|date|periodo|inicio|fin|corte/.test(lower)) {
        value = "<<FECHA_YYYY-MM-DD>>";
      } else if (/client|tci|cliente_id|process_id|workflow_id/.test(lower)) {
        value = "<<TCI_DEL_CLIENTE>>";
      } else if (/_filter$|filtro|where_clause/.test(lower)) {
        value = "1=1 /* filtro opcional */";
        isStringLiteral = false;
      } else if (/array|ids|json|types/.test(lower)) {
        // Suele ser un JSON-array stringificado tipo '["x","y"]' o 'ALL'
        value = "ALL";
      } else {
        value = "<<VALOR>>";
      }

      if (wrappedInQuotes) {
        // Consume el par de comillas + el placeholder, devuelve un solo par
        // 'VALOR' (sin importar si es string literal o codigo — si vino entre
        // comillas en n8n, va entre comillas en SF).
        return `'${value}'`;
      }

      // Bare {{...}} sin comillas alrededor. Mantener q1 y q2 (vacios o
      // potencialmente una sola comilla descolgada que dejamos pasar).
      if (isStringLiteral) {
        return `${q1}'${value}'${q2}`;
      }
      return `${q1}${value}${q2}`;
    }
  );
}
