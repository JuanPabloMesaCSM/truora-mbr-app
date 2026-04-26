-- BotiAlertas v2 — fetch unico de clientes desde Supabase.
-- Pegar en el primer nodo Supabase del flujo v2.
--
-- Devuelve la cartera completa con los 3 client_ids y el csm_email,
-- de modo que el Code node siguiente pueda construir las 3 whitelists
-- (DI / BGC / CE) y, mas adelante, mapear de client_id_X -> cliente_id (uuid)
-- + csm_email para los upserts en boti_alertas y el routing Telegram.
--
-- Filtro: solo clientes activos. NULLs en client_id_X son normales (cliente
-- no usa ese producto) y se filtran en el Code node por producto.

SELECT
  id            AS cliente_id,    -- uuid para FK boti_alertas.cliente_id
  nombre,
  client_id_di,
  client_id_bgc,
  client_id_ce,
  csm_email
FROM public.clientes
WHERE activo = true
ORDER BY nombre;
