-- Lista de client_id_ce para el query BotiAlertas CE.
-- Pegar en el nodo Supabase previo al nodo Snowflake.
-- Devuelve los TCIs (u legacy IDs) de clientes activos que usan CE
-- segun la tabla `clientes` reconciliada (2026-04-24).

SELECT DISTINCT client_id_ce AS client_id
FROM public.clientes
WHERE activo = true
  AND client_id_ce IS NOT NULL
  AND client_id_ce <> ''
ORDER BY client_id_ce;
