-- ============================================================
-- Iris Candles · Panel de administración
-- Ejecutar DESPUÉS de db/schema.sql, en Supabase -> SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PERSONAL AUTORIZADO Y PERMISOS
-- ------------------------------------------------------------
create table if not exists admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'manager' check (role in ('owner','admin','manager','viewer')),
  permissions jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where user_id = auth.uid() and is_active
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where user_id = auth.uid() and is_active and role in ('owner','admin')
  );
$$;

create or replace function public.has_permission(p_module text, p_action text default 'read')
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where user_id = auth.uid()
      and is_active
      and (
        role in ('owner','admin')
        or coalesce((permissions -> p_module ->> p_action)::boolean, false)
      )
  );
$$;

-- ------------------------------------------------------------
-- 2. COLUMNAS NUEVAS
-- ------------------------------------------------------------
alter table profiles add column if not exists email text;
alter table profiles add column if not exists birth_date date;
alter table profiles add column if not exists last_seen_at timestamptz;

alter table orders add column if not exists internal_notes text;
alter table orders add column if not exists accepted_at timestamptz;
alter table orders add column if not exists shipped_at timestamptz;
alter table orders add column if not exists carrier text;
alter table orders add column if not exists tracking_number text;
alter table orders add column if not exists payment_method text;
alter table orders add column if not exists coupon_code text;
alter table orders add column if not exists discount_cop int not null default 0;

alter table reviews add column if not exists admin_reply text;
alter table reviews add column if not exists replied_at timestamptz;
alter table reviews add column if not exists replied_by uuid references auth.users(id);

alter table event_requests add column if not exists internal_notes text;
alter table event_requests add column if not exists consent_at timestamptz;

alter table product_variants add column if not exists cost_cop int;

-- Sincroniza el email al crear la cuenta y rellena los perfiles existentes.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

update profiles p
   set email = u.email
  from auth.users u
 where p.id = u.id
   and p.email is null;

-- ------------------------------------------------------------
-- 3. INVENTARIO Y MATERIAS PRIMAS
-- ------------------------------------------------------------
create table if not exists materials (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  unit               text not null default 'g' check (unit in ('g','ml','unidad')),
  stock              numeric(12,2) not null default 0 check (stock >= 0),
  min_stock          numeric(12,2) not null default 0,
  cost_per_unit_cop  int not null default 0 check (cost_per_unit_cop >= 0),
  supplier           text,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create table if not exists stock_movements (
  id          bigserial primary key,
  material_id uuid references materials(id) on delete set null,
  variant_id  uuid references product_variants(id) on delete set null,
  type        text not null check (type in ('in','out','adjustment')),
  quantity    numeric(12,2) not null,
  reason      text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  check (material_id is not null or variant_id is not null)
);

create table if not exists product_materials (
  variant_id  uuid not null references product_variants(id) on delete cascade,
  material_id uuid not null references materials(id) on delete cascade,
  quantity    numeric(12,2) not null check (quantity > 0),
  primary key (variant_id, material_id)
);

-- ------------------------------------------------------------
-- 4. PROMOCIONES Y FIDELIZACIÓN
-- ------------------------------------------------------------
create table if not exists promotions (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  type           text not null check (type in ('percent','fixed','bundle','birthday','points')),
  value          int not null default 0,
  code           text unique,
  min_total_cop  int not null default 0,
  starts_at      timestamptz default now(),
  ends_at        timestamptz,
  is_active      boolean not null default true,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create table if not exists loyalty_points (
  profile_id uuid primary key references profiles(id) on delete cascade,
  points     int not null default 0 check (points >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists points_transactions (
  id         bigserial primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  points     int not null,
  reason     text,
  order_id   uuid references orders(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. CONFIGURACIÓN Y AUDITORÍA
-- ------------------------------------------------------------
create table if not exists settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists audit_log (
  id         bigserial primary key,
  user_id    uuid references auth.users(id),
  action     text not null,
  entity     text not null,
  entity_id  text,
  payload    jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 6. RLS PARA EL PERSONAL
-- ------------------------------------------------------------
alter table admin_users         enable row level security;
alter table materials           enable row level security;
alter table stock_movements     enable row level security;
alter table product_materials   enable row level security;
alter table promotions          enable row level security;
alter table loyalty_points      enable row level security;
alter table points_transactions enable row level security;
alter table settings            enable row level security;
alter table audit_log           enable row level security;

-- Personal: cada uno ve su fila; owner/admin gestionan todo.
drop policy if exists "admin_users_self_read" on admin_users;
create policy "admin_users_self_read" on admin_users
  for select using (auth.uid() = user_id or public.is_owner());

drop policy if exists "admin_users_owner_write" on admin_users;
create policy "admin_users_owner_write" on admin_users
  for all using (public.is_owner()) with check (public.is_owner());

-- Catálogo: el personal puede leer y escribir todo.
drop policy if exists "staff_collections_all" on collections;
create policy "staff_collections_all" on collections
  for all using (public.has_permission('products','read'))
  with check (public.has_permission('products','write'));

drop policy if exists "staff_products_all" on products;
create policy "staff_products_all" on products
  for all using (public.has_permission('products','read'))
  with check (public.has_permission('products','write'));

drop policy if exists "staff_variants_all" on product_variants;
create policy "staff_variants_all" on product_variants
  for all using (public.has_permission('products','read'))
  with check (public.has_permission('products','write'));

drop policy if exists "staff_images_all" on product_images;
create policy "staff_images_all" on product_images
  for all using (public.has_permission('products','read'))
  with check (public.has_permission('products','write'));

-- Pedidos
drop policy if exists "staff_orders_read" on orders;
create policy "staff_orders_read" on orders
  for select using (public.has_permission('orders','read'));

drop policy if exists "staff_orders_update" on orders;
create policy "staff_orders_update" on orders
  for update using (public.has_permission('orders','write'))
  with check (public.has_permission('orders','write'));

drop policy if exists "staff_order_items_read" on order_items;
create policy "staff_order_items_read" on order_items
  for select using (public.has_permission('orders','read'));

-- Clientes
drop policy if exists "staff_profiles_read" on profiles;
create policy "staff_profiles_read" on profiles
  for select using (public.has_permission('customers','read'));

drop policy if exists "staff_profiles_update" on profiles;
create policy "staff_profiles_update" on profiles
  for update using (public.has_permission('customers','write'))
  with check (public.has_permission('customers','write'));

-- Reseñas
drop policy if exists "staff_reviews_all" on reviews;
create policy "staff_reviews_all" on reviews
  for all using (public.has_permission('reviews','read'))
  with check (public.has_permission('reviews','write'));

-- Eventos
drop policy if exists "staff_events_all" on event_requests;
create policy "staff_events_all" on event_requests
  for all using (public.has_permission('orders','read'))
  with check (public.has_permission('orders','write'));

-- Inventario
drop policy if exists "staff_materials_all" on materials;
create policy "staff_materials_all" on materials
  for all using (public.has_permission('inventory','read'))
  with check (public.has_permission('inventory','write'));

drop policy if exists "staff_movements_all" on stock_movements;
create policy "staff_movements_all" on stock_movements
  for all using (public.has_permission('inventory','read'))
  with check (public.has_permission('inventory','write'));

drop policy if exists "staff_product_materials_all" on product_materials;
create policy "staff_product_materials_all" on product_materials
  for all using (public.has_permission('inventory','read'))
  with check (public.has_permission('inventory','write'));

-- Promociones
drop policy if exists "staff_promotions_all" on promotions;
create policy "staff_promotions_all" on promotions
  for all using (public.has_permission('promotions','read'))
  with check (public.has_permission('promotions','write'));

drop policy if exists "staff_coupons_all" on coupons;
create policy "staff_coupons_all" on coupons
  for all using (public.has_permission('promotions','read'))
  with check (public.has_permission('promotions','write'));

drop policy if exists "staff_loyalty_all" on loyalty_points;
create policy "staff_loyalty_all" on loyalty_points
  for all using (public.has_permission('promotions','read'))
  with check (public.has_permission('promotions','write'));

drop policy if exists "staff_points_all" on points_transactions;
create policy "staff_points_all" on points_transactions
  for all using (public.has_permission('promotions','read'))
  with check (public.has_permission('promotions','write'));

-- Configuración: lectura para el personal, escritura para owner/admin.
drop policy if exists "staff_settings_read" on settings;
create policy "staff_settings_read" on settings
  for select using (public.is_staff());

drop policy if exists "owner_settings_write" on settings;
create policy "owner_settings_write" on settings
  for all using (public.is_owner()) with check (public.is_owner());

-- Auditoría: el personal registra, solo owner/admin lee.
drop policy if exists "staff_audit_insert" on audit_log;
create policy "staff_audit_insert" on audit_log
  for insert with check (public.is_staff());

drop policy if exists "owner_audit_read" on audit_log;
create policy "owner_audit_read" on audit_log
  for select using (public.is_owner());

-- ------------------------------------------------------------
-- 7. VISTAS DE ESTADÍSTICAS
-- ------------------------------------------------------------
create or replace view admin_sales_daily
with (security_invoker = true) as
select
  (paid_at at time zone 'America/Bogota')::date as day,
  count(*) as orders,
  sum(total_cop) as revenue_cop
from orders
where payment_status = 'approved' and paid_at is not null
group by 1
order by 1;

create or replace view admin_top_products
with (security_invoker = true) as
select
  oi.product_name,
  oi.size_label,
  sum(oi.quantity) as units,
  sum(oi.subtotal_cop) as revenue_cop
from order_items oi
join orders o on o.id = oi.order_id
where o.payment_status = 'approved'
group by 1, 2
order by units desc;

create or replace view admin_customer_stats
with (security_invoker = true) as
select
  p.id,
  p.full_name,
  p.email,
  p.phone,
  p.birth_date,
  p.created_at,
  count(o.id) filter (where o.payment_status = 'approved') as orders_count,
  coalesce(sum(o.total_cop) filter (where o.payment_status = 'approved'), 0) as total_spent_cop,
  max(o.created_at) filter (where o.payment_status = 'approved') as last_order_at
from profiles p
left join orders o on o.profile_id = p.id
group by p.id;

create or replace view admin_low_stock
with (security_invoker = true) as
select
  v.id,
  p.name as product_name,
  v.size_label,
  v.sku,
  v.stock,
  5 as threshold
from product_variants v
join products p on p.id = v.product_id
where v.is_active and v.stock <= 5
order by v.stock asc;

-- ------------------------------------------------------------
-- 8. CONFIGURACIÓN INICIAL
-- ------------------------------------------------------------
insert into settings (key, value) values
  ('store', '{"name":"Iris Candles","email":"hola@iriscandles.com","whatsapp":"","city":"Bogotá","country":"Colombia"}'::jsonb),
  ('shipping', '{"free_from_cop":180000,"default_eta":"1-3 días hábiles","zones":[]}'::jsonb),
  ('payments', '{"provider":"wompi","methods":["PSE","Nequi","Daviplata","Tarjetas"],"sandbox":true}'::jsonb),
  ('policies', '{"returns_days":5,"privacy_version":"2026-11","warranty":"Reemplazo por daños en transporte"}'::jsonb),
  ('loyalty', '{"enabled":true,"points_per_1000":1,"point_value_cop":100,"birthday_discount_percent":15,"birthday_only_registered":true,"birthday_days_ahead":3,"birthday_validity_days":7,"birthday_once_per_birthday":true,"birthday_email_enabled":true,"points_expire_months":12,"points_min_redeem":500,"points_earn_on":"approved_orders"}'::jsonb),
  ('promotions.campaigns', '[{"id":"cmp-1","name":"Navidad","type":"percent","value":15,"application":"store","targets":[],"minTotalCop":0,"startsAt":"2026-12-01T00:00","endsAt":"2026-12-31T23:59","usageLimit":null,"uses":0,"customers":"all","customerIds":[],"state":"enabled","createdAt":"2026-10-20T09:00:00"},{"id":"cmp-2","name":"San Valentín","type":"percent","value":20,"application":"collection","targets":["esencia-del-valle"],"minTotalCop":120000,"startsAt":"2027-02-01T00:00","endsAt":"2027-02-14T23:59","usageLimit":200,"uses":0,"customers":"all","customerIds":[],"state":"enabled","createdAt":"2026-10-22T11:30:00"},{"id":"cmp-3","name":"Día de la Madre","type":"percent","value":15,"application":"product","targets":["IRIS-LUZ-120","IRIS-LUZ-220"],"minTotalCop":0,"startsAt":"2027-05-01T00:00","endsAt":"2027-05-09T23:59","usageLimit":150,"uses":0,"customers":"all","customerIds":[],"state":"enabled","createdAt":"2026-10-25T16:15:00"},{"id":"cmp-4","name":"Temporada especial de otoño","type":"fixed","value":12000,"application":"store","targets":[],"minTotalCop":180000,"startsAt":"2026-09-01T00:00","endsAt":"2026-11-30T23:59","usageLimit":100,"uses":64,"customers":"all","customerIds":[],"state":"enabled","createdAt":"2026-08-28T10:00:00"},{"id":"cmp-5","name":"Preventa colección Ámbar","type":"percent","value":10,"application":"collection","targets":["otono-dorado"],"minTotalCop":0,"startsAt":"2026-10-01T00:00","endsAt":"2026-10-31T23:59","usageLimit":null,"uses":37,"customers":"selected","customerIds":["cus-1","cus-3","cus-7"],"state":"paused","createdAt":"2026-09-20T14:45:00"}]'::jsonb)
on conflict (key) do nothing;

insert into coupons (code, type, value, min_total_cop, starts_at, expires_at, max_uses, is_active) values
  ('BIENVENIDA10', 'percent', 10, 0, now(), null, null, true),
  ('OTONO15', 'percent', 15, 120000, now(), '2026-11-30T23:59:59Z', 50, true),
  ('ENVIOGRATIS', 'fixed', 12900, 180000, now(), null, null, true)
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- 9. CREAR EL PRIMER OWNER
-- 1) Crea el usuario en Supabase -> Authentication -> Users.
-- 2) Copia su UUID y ejecuta:
--    insert into admin_users (user_id, role)
--    values ('<UUID-DEL-USUARIO>', 'owner')
--    on conflict (user_id) do update set role = 'owner', is_active = true;
-- ------------------------------------------------------------
