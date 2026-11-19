-- ============================================================
-- Iris Candles · Biblioteca multimedia (Supabase Storage)
-- Ejecutar DESPUÉS de db/setup.sql (necesita public.has_permission()).
-- Idempotente: se puede volver a ejecutar sin perder datos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CATÁLOGO DE ARCHIVOS
-- ------------------------------------------------------------
-- Cada fila es un archivo real en el bucket público `product-images`.
-- `path` es la ruta canónica dentro del bucket y `url` su URL pública.
-- Las tablas de productos/colecciones guardan esa misma URL, por eso
-- reemplazar un archivo conserva todas sus referencias (se hace upload
-- sobre el MISMO `path` con upsert).
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

-- Por si la tabla ya existía antes de añadir el campo bucket.
alter table media_assets add column if not exists bucket text not null default 'product-images'
  check (bucket in ('product-images', 'collection-images'));

create index if not exists media_assets_path_idx on media_assets(path);
create index if not exists media_assets_name_idx on media_assets(name);

-- ------------------------------------------------------------
-- 2. RLS (mismo modelo de permisos que el resto del panel)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 3. STORAGE
-- ------------------------------------------------------------
-- El bucket `product-images` ya existe y es público (db/schema.sql).
-- `collection-images` se crea en db/collections.sql; se garantiza aquí también
-- para que la biblioteca funcione aunque ese script no se haya ejecutado aún.
insert into storage.buckets (id, name, public)
values ('collection-images', 'collection-images', true)
on conflict (id) do nothing;

drop policy if exists "collection_images_public_read" on storage.objects;
create policy "collection_images_public_read" on storage.objects
  for select using (bucket_id = 'collection-images');

-- La lectura pública ya estaba habilitada. Estas políticas añaden escritura
-- solo para el personal autorizado. Las operaciones del panel van por
-- endpoints del servidor con la service role key; se incluyen para que el
-- cliente autorizado también pueda usar Storage si hace falta.
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
-- 4. AUDITORÍA (opcional, se registra desde los endpoints)
--    Acciones usadas: media.upload, media.replace, media.update,
--    media.delete, media.attach, media.detach.
-- ------------------------------------------------------------

-- ============================================================
-- NOTAS
-- 1. Reemplazar = upload con upsert sobre la MISMA ruta `path`.
--    La URL pública no cambia, así que productos y colecciones que
--    ya referencian la imagen siguen funcionando sin editarlos.
-- 2. Eliminar solo se permite cuando la imagen no aparece en
--    product_images, collections.hero_image_url ni reviews.photo_url.
-- 3. Para reutilizar una imagen: crear otra referencia a la misma
--    URL en product_images, collection_images o collections.hero_image_url.
-- ============================================================
