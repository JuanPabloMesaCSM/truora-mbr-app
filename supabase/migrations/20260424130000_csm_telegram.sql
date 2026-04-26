-- Agregar Telegram chat_id y handle a tabla csm para retirar el Google Sheet
-- "Base Oppy Alertas de consumo 2025" del flujo BotiAlertas en n8n.
-- Match por email (UNIQUE, estable). Ana Milena y Soporte quedan sin chat_id a proposito.

ALTER TABLE public.csm
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS telegram_handle  text;

-- CSMs heredados del Sheet viejo (siguen activos)
UPDATE public.csm SET telegram_chat_id='6415029059', telegram_handle='@DanielaTibaquiraM'
  WHERE email='dtibaquira@truora.com';

UPDATE public.csm SET telegram_chat_id='7340483725', telegram_handle='@elisavarela'
  WHERE email='evarela@truora.com';

UPDATE public.csm SET telegram_chat_id='5395911053', telegram_handle='@JuanDiazro'
  WHERE email='jdiaz@truora.com';

UPDATE public.csm SET telegram_chat_id='2130222411', telegram_handle='@sebastianduranb'
  WHERE email='sduran@truora.com';

UPDATE public.csm SET telegram_chat_id='6718989570', telegram_handle='@valeria_lopezv'
  WHERE email='vlopez@truora.com';

-- Nuevos chat_ids y handles entregados 2026-04-24
UPDATE public.csm SET telegram_chat_id='1888371325', telegram_handle='@juanpablomesa'
  WHERE email='jpmesa@truora.com';

UPDATE public.csm SET telegram_chat_id='7726951923', telegram_handle='@juanpotoya'
  WHERE email='jpotoya@truora.com';

UPDATE public.csm SET telegram_chat_id='1670284194', telegram_handle='@NataliaGI12'
  WHERE email='nagutierrez@truora.com';

UPDATE public.csm SET telegram_chat_id='8214561624', telegram_handle='@varango13'
  WHERE email='varango@truora.com';

-- Verificacion: estado final
SELECT nombre, email, activo, telegram_handle, telegram_chat_id
FROM public.csm
ORDER BY activo DESC, nombre;
