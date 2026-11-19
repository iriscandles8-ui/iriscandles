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

-- Seguridad: Postgres otorga EXECUTE a PUBLIC por defecto al crear una función.
-- Sin estos REVOKE, cualquier visitante podría llamar confirm_order() por RPC
-- y aprobar pedidos ajenos descontando stock. Solo el backend (service role)
-- debe poder invocarla. ALTER/CREATE OR REPLACE no restaura estos permisos.
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
