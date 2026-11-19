-- ============================================================
-- Iris Candles · Instalación completa (schema + admin)
-- Pegar todo en Supabase -> SQL Editor -> Run.
-- Es idempotente: se puede volver a ejecutar sin perder datos.
-- ============================================================

-- ============================================================
-- Iris Candles · Esquema PostgreSQL (Supabase)
-- Ejecutar en: Supabase -> SQL Editor -> New query -> Run
-- Moneda: COP (enteros, sin decimales). Precios con IVA incluido.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- CATÁLOGO
-- ------------------------------------------------------------
create table if not exists collections (
  id             uuid primary key default gen_random_uuid(),
  slug           text unique not null,
  name           text not null,
  tagline        text,
  description    text,
  hero_image_url text,
  sort_order     int not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists products (
  id                uuid primary key default gen_random_uuid(),
  collection_id     uuid references collections(id) on delete set null,
  slug              text unique not null,
  name              text not null,
  aroma             text not null,
  family            text check (family in ('floral','amaderado','gourmand','citrico','fresco','especiado','frutal')),
  intensity         smallint check (intensity between 1 and 5),
  short_description text,
  description       text,
  story             text,
  notes_top         text[] not null default '{}',
  notes_heart       text[] not null default '{}',
  notes_base        text[] not null default '{}',
  ingredients       text,
  care              text,
  burn_hours        int,
  is_featured       boolean not null default false,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create index if not exists products_collection_idx on products(collection_id);
create index if not exists products_family_idx on products(family);

create table if not exists product_variants (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references products(id) on delete cascade,
  size_label           text not null,
  weight_g             int not null check (weight_g > 0),
  sku                  text unique not null,
  price_cop            int not null check (price_cop >= 0),
  compare_at_price_cop int check (compare_at_price_cop >= 0),
  stock                int not null default 0 check (stock >= 0),
  is_active            boolean not null default true,
  unique (product_id, size_label)
);

create table if not exists product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  url        text not null,
  alt        text,
  sort_order int not null default 0
);

-- ------------------------------------------------------------
-- CLIENTES
-- ------------------------------------------------------------
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  role       text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);

create table if not exists addresses (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  label       text default 'Casa',
  recipient   text not null,
  phone       text not null,
  line1       text not null,
  line2       text,
  city        text not null,
  department  text not null,
  postal_code text,
  is_default  boolean not null default false
);

-- ------------------------------------------------------------
-- PEDIDOS
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum ('pending','paid','processing','shipped','delivered','cancelled','refunded');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('pending','approved','declined','voided','error');
  end if;
end
$$;

create sequence if not exists order_number_seq start 1001;

create table if not exists orders (
  id                   uuid primary key default gen_random_uuid(),
  order_number         text unique not null default ('IRIS-' || lpad(nextval('order_number_seq')::text, 5, '0')),
  profile_id           uuid references profiles(id) on delete set null,
  email                text not null,
  status               order_status not null default 'pending',
  payment_status       payment_status not null default 'pending',
  subtotal_cop         int not null check (subtotal_cop >= 0),
  shipping_cop         int not null default 0 check (shipping_cop >= 0),
  total_cop            int not null check (total_cop >= 0),
  wompi_reference      text unique,
  wompi_transaction_id text,
  payment_method       text,
  shipping_address     jsonb not null,
  notes                text,
  idempotency_key      text unique,
  created_at           timestamptz not null default now(),
  paid_at              timestamptz
);

create index if not exists orders_email_idx on orders(email);
create index if not exists orders_status_idx on orders(status);

create table if not exists order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  variant_id     uuid references product_variants(id) on delete set null,
  product_name   text not null,
  size_label     text not null,
  unit_price_cop int not null check (unit_price_cop >= 0),
  quantity       int not null check (quantity > 0),
  subtotal_cop   int not null check (subtotal_cop >= 0)
);

-- ------------------------------------------------------------
-- MARKETING Y CONTENIDO
-- ------------------------------------------------------------
create table if not exists wishlist (
  profile_id uuid not null references profiles(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, product_id)
);

create table if not exists reviews (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  profile_id  uuid references profiles(id) on delete set null,
  author_name text not null,
  rating      smallint not null check (rating between 1 and 5),
  title       text,
  body        text not null,
  photo_url   text,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now()
);

create table if not exists quiz_results (
  id                     uuid primary key default gen_random_uuid(),
  email                  text,
  answers                jsonb not null,
  recommended_product_id uuid references products(id) on delete set null,
  created_at             timestamptz not null default now()
);

create table if not exists event_requests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  phone      text not null,
  company    text,
  event_type text,
  quantity   int not null check (quantity >= 15),
  event_date date,
  message    text,
  status     text not null default 'new' check (status in ('new','contacted','quoted','won','lost')),
  created_at timestamptz not null default now()
);

create table if not exists newsletter_subscribers (
  email      text primary key,
  source     text,
  created_at timestamptz not null default now()
);

create table if not exists coupons (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  type          text not null check (type in ('percent','fixed')),
  value         int not null check (value > 0),
  min_total_cop int not null default 0,
  starts_at     timestamptz default now(),
  expires_at    timestamptz,
  max_uses      int,
  uses          int not null default 0,
  is_active     boolean not null default true
);

create table if not exists shipping_zones (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  departments   text[] not null default '{}',
  base_cop      int not null default 0,
  per_kg_cop    int not null default 0,
  free_from_cop int,
  eta_days      text
);

-- ------------------------------------------------------------
-- TRIGGERS
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Marca el pedido como pagado y descuenta stock de forma atómica.
-- Se llama desde el webhook de Wompi con la service role key.
create or replace function public.confirm_order(p_order_id uuid, p_transaction_id text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update orders
     set payment_status = 'approved',
         status = 'paid',
         paid_at = now(),
         wompi_transaction_id = p_transaction_id
   where id = p_order_id
     and payment_status = 'pending';

  if not found then
    return;
  end if;

  update product_variants v
     set stock = greatest(v.stock - i.quantity, 0)
    from order_items i
   where i.order_id = p_order_id
     and i.variant_id = v.id;
end;
$$;

-- Seguridad: ver db/schema.sql. Solo el backend puede confirmar pedidos.
revoke all on function public.confirm_order(uuid, text) from public;
revoke all on function public.confirm_order(uuid, text) from anon;
revoke all on function public.confirm_order(uuid, text) from authenticated;
grant execute on function public.confirm_order(uuid, text) to service_role;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table collections          enable row level security;
alter table products             enable row level security;
alter table product_variants     enable row level security;
alter table product_images       enable row level security;
alter table profiles             enable row level security;
alter table addresses            enable row level security;
alter table orders               enable row level security;
alter table order_items          enable row level security;
alter table wishlist             enable row level security;
alter table reviews              enable row level security;
alter table quiz_results         enable row level security;
alter table event_requests       enable row level security;
alter table newsletter_subscribers enable row level security;
alter table coupons              enable row level security;
alter table shipping_zones       enable row level security;

-- Catálogo: lectura pública solo de lo activo
drop policy if exists "collections_public_read" on collections;
create policy "collections_public_read" on collections
  for select using (is_active);

drop policy if exists "products_public_read" on products;
create policy "products_public_read" on products
  for select using (is_active);

drop policy if exists "variants_public_read" on product_variants;
create policy "variants_public_read" on product_variants
  for select using (is_active);

drop policy if exists "images_public_read" on product_images;
create policy "images_public_read" on product_images
  for select using (true);

drop policy if exists "shipping_public_read" on shipping_zones;
create policy "shipping_public_read" on shipping_zones
  for select using (true);

-- Perfiles: cada usuario ve y edita el suyo
drop policy if exists "profiles_own_read" on profiles;
create policy "profiles_own_read" on profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_own_update" on profiles;
create policy "profiles_own_update" on profiles
  for update using (auth.uid() = id);

-- Direcciones: solo el dueño
drop policy if exists "addresses_own_all" on addresses;
create policy "addresses_own_all" on addresses
  for all using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- Pedidos: el cliente ve los suyos; la creación va por servidor (service role)
drop policy if exists "orders_own_read" on orders;
create policy "orders_own_read" on orders
  for select using (auth.uid() = profile_id);

drop policy if exists "order_items_own_read" on order_items;
create policy "order_items_own_read" on order_items
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.profile_id = auth.uid()
    )
  );

-- Wishlist: solo el dueño
drop policy if exists "wishlist_own_all" on wishlist;
create policy "wishlist_own_all" on wishlist
  for all using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- Reseñas: lectura pública aprobada; escritura autenticada
drop policy if exists "reviews_public_read" on reviews;
create policy "reviews_public_read" on reviews
  for select using (status = 'approved');

drop policy if exists "reviews_auth_insert" on reviews;
create policy "reviews_auth_insert" on reviews
  for insert with check (auth.uid() = profile_id);

-- Formularios públicos
drop policy if exists "quiz_public_insert" on quiz_results;
create policy "quiz_public_insert" on quiz_results
  for insert with check (true);

drop policy if exists "events_public_insert" on event_requests;
create policy "events_public_insert" on event_requests
  for insert with check (true);

drop policy if exists "newsletter_public_insert" on newsletter_subscribers;
create policy "newsletter_public_insert" on newsletter_subscribers
  for insert with check (true);

-- Cupones y datos sensibles: sin acceso público.
-- Se validan en el servidor con la service role key.

-- ------------------------------------------------------------
-- STORAGE (imágenes de producto)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
  for select using (bucket_id = 'product-images');

-- ------------------------------------------------------------
-- DATOS INICIALES (las 4 colecciones de Iris Candles)
-- ------------------------------------------------------------
insert into collections (slug, name, tagline, description, sort_order)
values
  ('otono-dorado',   'Otoño Dorado',   'Manzana & canela',        'El calor de una tarde de otoño: manzana horneada, canela y un fondo amaderado.', 1),
  ('esencia-del-valle','Esencia del Valle','Chontaduro & durazno',  'Lo tropical y lo dulce en equilibrio: chontaduro del Pacífico y durazno maduro.', 2),
  ('loto-esmeralda', 'Loto Esmeralda', 'Flor de loto',            'Serenidad acuática: flor de loto, hojas verdes y un soplo de aire fresco.', 3),
  ('luz-serena',     'Luz Serena',     'Vainilla & jazmín',       'Luz cálida y envolvente: vainilla cremosa con jazmín blanco.', 4)
on conflict (slug) do nothing;

-- ============================================================
-- NOTAS
-- 1. El primer usuario que se registre debe promoverse a admin:
--    update profiles set role = 'admin' where id = '<uuid>';
-- 2. La service role key solo se usa en el servidor (webhook de Wompi,
--    panel de administración). Nunca en el navegador.
-- 3. Precios en COP con IVA incluido.
-- ============================================================


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

-- Cupones de ejemplo para probar el campo del carrito (sin acceso público).
insert into coupons (code, type, value, min_total_cop, starts_at, expires_at, max_uses, is_active) values
  ('BIENVENIDA10', 'percent', 10, 0, now(), null, null, true),
  ('OTONO15', 'percent', 15, 120000, now(), '2026-11-30T23:59:59Z', 50, true),
  ('ENVIOGRATIS', 'fixed', 12900, 180000, now(), null, null, true)
on conflict (code) do nothing;

-- ============================================================
-- 9. BIBLIOTECA MULTIMEDIA (db/media-library.sql)
-- ============================================================

create table if not exists media_assets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  file_name   text not null,
  bucket      text not null default 'product-images'
    check (bucket in ('product-images', 'collection-images')),
  path        text not null unique,
  url         text not null,
  alt         text,
  mime_type   text not null default 'image/jpeg',
  size_bytes  bigint not null default 0 check (size_bytes >= 0),
  width       int check (width is null or width > 0),
  height      int check (height is null or height > 0),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table media_assets add column if not exists bucket text not null default 'product-images'
  check (bucket in ('product-images', 'collection-images'));

create index if not exists media_assets_path_idx on media_assets(path);
create index if not exists media_assets_name_idx on media_assets(name);

alter table media_assets enable row level security;

drop policy if exists "staff_media_assets_read" on media_assets;
create policy "staff_media_assets_read" on media_assets
  for select using (public.has_permission('products', 'read'));

drop policy if exists "staff_media_assets_insert" on media_assets;
create policy "staff_media_assets_insert" on media_assets
  for insert with check (public.has_permission('products', 'write'));

drop policy if exists "staff_media_assets_update" on media_assets;
create policy "staff_media_assets_update" on media_assets
  for update using (public.has_permission('products', 'write'))
  with check (public.has_permission('products', 'write'));

drop policy if exists "staff_media_assets_delete" on media_assets;
create policy "staff_media_assets_delete" on media_assets
  for delete using (public.has_permission('products', 'write'));

insert into storage.buckets (id, name, public)
values ('collection-images', 'collection-images', true)
on conflict (id) do nothing;

drop policy if exists "collection_images_public_read" on storage.objects;
create policy "collection_images_public_read" on storage.objects
  for select using (bucket_id = 'collection-images');

drop policy if exists "staff_media_objects_insert" on storage.objects;
create policy "staff_media_objects_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.has_permission('products', 'write'));

drop policy if exists "staff_media_objects_update" on storage.objects;
create policy "staff_media_objects_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.has_permission('products', 'write'))
  with check (bucket_id = 'product-images' and public.has_permission('products', 'write'));

drop policy if exists "staff_media_objects_delete" on storage.objects;
create policy "staff_media_objects_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.has_permission('products', 'write'));

-- ------------------------------------------------------------
-- 10. CREAR EL PRIMER OWNER
-- 1) Crea el usuario en Supabase -> Authentication -> Users.
-- 2) Copia su UUID y ejecuta:
--    insert into admin_users (user_id, role)
--    values ('<UUID-DEL-USUARIO>', 'owner')
--    on conflict (user_id) do update set role = 'owner', is_active = true;
-- ------------------------------------------------------------
