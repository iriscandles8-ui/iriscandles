-- ============================================================
-- Campo de códigos de descuento en el carrito.
-- Ejecutar en el SQL Editor de Supabase después de setup.sql.
-- ============================================================

-- 1) El pedido guarda qué cupón se aplicó y cuánto descontó.
--    `subtotal_cop` sigue siendo el bruto (para reportes); `total_cop` ya
--    incluye el descuento. El envío se calcula sobre el subtotal neto.
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists discount_cop int not null default 0;

comment on column public.orders.coupon_code is 'Código del cupón aplicado en el checkout.';
comment on column public.orders.discount_cop is 'Descuento en COP aplicado antes del envío.';

-- 2) Cupones de ejemplo (la tabla no tiene acceso público: se validan
--    en /api/coupons/validate con la service role key).
insert into public.coupons (code, type, value, min_total_cop, starts_at, expires_at, max_uses, is_active) values
  ('BIENVENIDA10', 'percent', 10, 0, now(), null, null, true),
  ('OTONO15', 'percent', 15, 120000, now(), '2026-11-30T23:59:59Z', 50, true),
  ('ENVIOGRATIS', 'fixed', 12900, 180000, now(), null, null, true)
on conflict (code) do nothing;
