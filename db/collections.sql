-- ============================================================
-- Iris Candles · Colecciones gestionables
-- Ejecutar DESPUÉS de db/schema.sql y db/admin.sql.
-- Idempotente: se puede volver a ejecutar.
--
-- Diseño importante:
--   * Las fotos de colección viven SOLO en `collection_images` y en el bucket
--     `collection-images`. Nunca se escribe en `product_images`, que sigue
--     siendo exclusivo de las fotos individuales de cada producto.
--   * Un producto puede pertenecer a varias colecciones mediante
--     `product_collections`. Eliminar una colección NO elimina productos.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. AMPLIAR `collections`
-- ------------------------------------------------------------
alter table collections
  add column if not exists status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'published', 'archived')),
  add column if not exists publish_at timestamptz,
  add column if not exists unpublish_at timestamptz,
  add column if not exists is_seasonal boolean not null default false,
  add column if not exists season_label text,
  add column if not exists story text,
  add column if not exists aroma text,
  add column if not exists family text,
  add column if not exists intensity smallint,
  add column if not exists burn_hours text,
  add column if not exists notes jsonb not null default '{}'::jsonb,
  add column if not exists theme jsonb not null default '{}'::jsonb,
  add column if not exists number text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists collections_status_idx on collections(status);
create index if not exists collections_sort_idx on collections(sort_order);

-- `is_active` se mantiene por compatibilidad: el backend lo sincroniza con
-- `status = 'published'`. La visibilidad pública real se calcula abajo.

-- Continuidad: las colecciones que ya estaban activas pasan a publicadas.
update collections set status = 'published' where is_active and status = 'draft';

-- ------------------------------------------------------------
-- 2. FOTOS DE COLECCIÓN (independientes de las fotos de producto)
-- ------------------------------------------------------------
create table if not exists collection_images (
  id           uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections(id) on delete cascade,
  url          text not null,
  alt          text,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists collection_images_collection_idx
  on collection_images(collection_id, sort_order);

-- ------------------------------------------------------------
-- 3. PRODUCTOS POR COLECCIÓN (muchos a muchos)
-- ------------------------------------------------------------
create table if not exists product_collections (
  product_id    uuid not null references products(id) on delete cascade,
  collection_id uuid not null references collections(id) on delete cascade,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  primary key (product_id, collection_id)
);

create index if not exists product_collections_collection_idx
  on product_collections(collection_id, sort_order);

-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
alter table collection_images   enable row level security;
alter table product_collections enable row level security;

-- Una colección es visible públicamente solo si está publicada y dentro de
-- su ventana de fechas. Esto hace que programar/desprogramar funcione sin cron.
drop policy if exists "collections_public_read" on collections;
create policy "collections_public_read" on collections
  for select using (
    status = 'published'
    and (publish_at is null or publish_at <= now())
    and (unpublish_at is null or unpublish_at > now())
  );

drop policy if exists "collection_images_public_read" on collection_images;
create policy "collection_images_public_read" on collection_images
  for select using (
    exists (
      select 1 from collections c
      where c.id = collection_images.collection_id
        and c.status = 'published'
        and (c.publish_at is null or c.publish_at <= now())
        and (c.unpublish_at is null or c.unpublish_at > now())
    )
  );

drop policy if exists "product_collections_public_read" on product_collections;
create policy "product_collections_public_read" on product_collections
  for select using (
    exists (
      select 1 from collections c
      where c.id = product_collections.collection_id
        and c.status = 'published'
        and (c.publish_at is null or c.publish_at <= now())
        and (c.unpublish_at is null or c.unpublish_at > now())
    )
  );

-- El personal con permisos de productos gestiona todo (incluidos borradores).
drop policy if exists "staff_collection_images_all" on collection_images;
create policy "staff_collection_images_all" on collection_images
  for all using (public.has_permission('products', 'read'))
  with check (public.has_permission('products', 'write'));

drop policy if exists "staff_product_collections_all" on product_collections;
create policy "staff_product_collections_all" on product_collections
  for all using (public.has_permission('products', 'read'))
  with check (public.has_permission('products', 'write'));

-- ------------------------------------------------------------
-- 5. STORAGE: bucket exclusivo para fotos de colección
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('collection-images', 'collection-images', true)
on conflict (id) do nothing;

drop policy if exists "collection_images_storage_read" on storage.objects;
create policy "collection_images_storage_read" on storage.objects
  for select using (bucket_id = 'collection-images');

drop policy if exists "collection_images_storage_write" on storage.objects;
create policy "collection_images_storage_write" on storage.objects
  for all
  using (bucket_id = 'collection-images' and public.has_permission('products', 'write'))
  with check (bucket_id = 'collection-images' and public.has_permission('products', 'write'));

-- ------------------------------------------------------------
-- 6. Sincronizar is_active cuando cambie el estado
-- ------------------------------------------------------------
create or replace function public.sync_collection_active()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.is_active := (new.status = 'published');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists collections_sync_active on collections;
create trigger collections_sync_active
  before insert or update of status on collections
  for each row execute function public.sync_collection_active();

-- La función security definer no debe ser ejecutable por el público.
revoke all on function public.sync_collection_active() from public;
revoke all on function public.sync_collection_active() from anon;
revoke all on function public.sync_collection_active() from authenticated;
