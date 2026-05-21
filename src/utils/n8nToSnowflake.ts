/**
 * Convierte un SQL template de n8n (con placeholders {{ }}) a una version
 * lista para pegar en la consola Snowflake.
 *
 * Estrategia (Opcion A — replace literal, sin magia):
 * - Cualquier {{ ... }} se reemplaza por un literal facil de buscar/editar:
 *     - placeholders de fechas       → 'YYYY-MM-DD'
 *     - placeholders de IDs/clientes → 'TCI_AQUI'
 *     - filtros / arrays SQL inline  → /* TODO: filtro * /
 *     - default                      → 'VALOR_AQUI'
 *
 * El CSM ve que reemplazo y edita lo que necesita. Sin lookup de defaults
 * de parametros para evitar sorpresas con defaults desactualizados.
 */

export function n8nToSnowflake(sql: string): string {
  return sql.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, inner: string) => {
    const lower = inner.toLowerCase();
    if (/fecha|date|periodo|inicio|fin|corte/.test(lower)) return "'YYYY-MM-DD'";
    if (/client|tci|cliente_id|process_id|workflow_id/.test(lower)) return "'TCI_AQUI'";
    if (/_filter$|filtro|where_clause/.test(lower)) return "/* TODO: filtro opcional */ 1=1";
    if (/array|ids/.test(lower)) return "/* TODO: lista de IDs */ ARRAY['ID_AQUI']";
    return "'VALOR_AQUI'";
  });
}
