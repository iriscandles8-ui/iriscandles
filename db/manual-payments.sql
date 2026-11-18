-- ============================================================
-- Iris Candles · Pagos manuales (seguridad)
-- ------------------------------------------------------------
-- Ejecutar UNA VEZ en Supabase → SQL Editor después de
-- db/schema.sql y db/admin.sql.
--
-- Qué hace:
--   1. Cierra `confirm_order()` para que nadie desde el
--      navegador (anon / authenticated) pueda marcar pedidos
--      como pagados ni descontar stock.
--   2. Deja la función disponible solo para `service_role`,
--      que es el rol que usa el servidor (webhook de Wompi).
--
-- Sin este paso, cualquier visitante podría llamar
--   rpc('confirm_order', { p_order_id: '<uuid>', ... })
-- y aprobar pedidos ajenos.
-- ============================================================

-- 1. Quitar los permisos heredados de PUBLIC (Postgres otorga
--    EXECUTE a PUBLIC por defecto en funciones nuevas).
revoke all on function public.confirm_order(uuid, text) from public;
revoke all on function public.confirm_order(uuid, text) from anon;
revoke all on function public.confirm_order(uuid, text) from authenticated;

-- 2. Permitir la ejecución únicamente al backend (service role).
grant execute on function public.confirm_order(uuid, text) to service_role;

-- 3. Verificación rápida: solo debe aparecer `service_role`.
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'confirm_order'
order by grantee;
