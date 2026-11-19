-- ============================================================
-- Iris Candles · Endurecimiento Oleada A (2026-11)
-- Ejecutar UNA VEZ en Supabase -> SQL Editor en instalaciones
-- que ya corrieron db/schema.sql / db/setup.sql.
-- Idempotente: se puede volver a ejecutar.
-- ============================================================

-- 1. Idempotencia del checkout: evita pedidos duplicados por reintentos.
alter table orders add column if not exists idempotency_key text unique;

create index if not exists orders_created_at_idx on orders(created_at);

-- 2. Reafirmar que confirm_order() solo puede ser llamada por el backend.
--    (CREATE OR REPLACE FUNCTION no restaura permisos previamente revocados,
--     pero una instalación antigua pudo omitir este paso.)
revoke all on function public.confirm_order(uuid, text) from public;
revoke all on function public.confirm_order(uuid, text) from anon;
revoke all on function public.confirm_order(uuid, text) from authenticated;
grant execute on function public.confirm_order(uuid, text) to service_role;

-- 3. Verificación rápida: solo debe aparecer `service_role`.
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'confirm_order'
order by grantee;
