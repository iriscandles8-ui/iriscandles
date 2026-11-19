-- ============================================================
-- Iris Candles · Productos gestionables
-- Ejecutar DESPUÉS de db/schema.sql, db/admin.sql y db/collections.sql.
-- Idempotente: se puede volver a ejecutar.
--
-- Diseño importante:
--   * Un producto puede pertenecer a VARIAS colecciones mediante
--     `product_collections` (tabla puente).
--   * `is_active = false`  → borrador / desactivado (oculto de la tienda).
--   * `archived_at` no nulo → archivado (fuera del panel activo, recuperable).
--   * La eliminación es definitiva y va por el panel con confirmación.
--   * Las fotos de producto viven SOLO en `product_images` y en el bucket
--     `product-images`. Nunca se escribe en `collection_images`.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. AMPLIAR `products`
-- ------------------------------------------------------------
alter table products
  add column if not exists tagline     text,
  add column if not exists is_new      boolean not null default false,
  add column if not exists sort_order  int not null default 0,
  add column if not exists archived_at timestamptz,
  add column if not exists theme       jsonb not null default '{}'::jsonb,
  add column if not exists updated_at  timestamptz not null default now();

create index if not exists products_sort_idx    on products(sort_order);
create index if not exists products_active_idx  on products(is_active, archived_at);

-- ------------------------------------------------------------
-- 2. AMPLIAR `product_variants`
-- ------------------------------------------------------------
alter table product_variants
  add column if not exists cost_cop    int not null default 0 check (cost_cop >= 0),
  add column if not exists sort_order  int not null default 0,
  add column if not exists updated_at  timestamptz not null default now();

create index if not exists product_variants_product_idx
  on product_variants(product_id, sort_order);

-- ------------------------------------------------------------
-- 3. PRODUCTOS POR COLECCIÓN (muchos a muchos)
--    (idempotente: también está en db/collections.sql)
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
create index if not exists product_collections_product_idx
  on product_collections(product_id);

-- ------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table product_collections enable row level security;

-- Catálogo público: activos, no archivados.
drop policy if exists "products_public_read" on products;
create policy "products_public_read" on products
  for select using (is_active and archived_at is null);

drop policy if exists "variants_public_read" on product_variants;
create policy "variants_public_read" on product_variants
  for select using (is_active);

drop policy if exists "images_public_read" on product_images;
create policy "images_public_read" on product_images
  for select using (true);

-- Vínculos: solo se leen si la colección es visible. Si collections.sql está
-- aplicado se respeta la ventana de fechas; si no, se usa `is_active`.
drop policy if exists "product_collections_public_read" on product_collections;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collections' and column_name = 'status'
  ) then
    execute $p$
      create policy "product_collections_public_read" on product_collections
        for select using (
          exists (
            select 1 from collections c
            where c.id = product_collections.collection_id
              and c.status = 'published'
              and (c.publish_at is null or c.publish_at <= now())
              and (c.unpublish_at is null or c.unpublish_at > now())
          )
        )
    $p$;
  else
    execute $p$
      create policy "product_collections_public_read" on product_collections
        for select using (
          exists (
            select 1 from collections c
            where c.id = product_collections.collection_id
              and c.is_active
          )
        )
    $p$;
  end if;
end $$;

-- El personal con permisos de productos gestiona todo (incluidos borradores).
drop policy if exists "staff_products_all" on products;
create policy "staff_products_all" on products
  for all using (public.has_permission('products', 'read'))
  with check (public.has_permission('products', 'write'));

drop policy if exists "staff_variants_all" on product_variants;
create policy "staff_variants_all" on product_variants
  for all using (public.has_permission('products', 'read'))
  with check (public.has_permission('products', 'write'));

drop policy if exists "staff_images_all" on product_images;
create policy "staff_images_all" on product_images
  for all using (public.has_permission('products', 'read'))
  with check (public.has_permission('products', 'write'));

drop policy if exists "staff_product_collections_all" on product_collections;
create policy "staff_product_collections_all" on product_collections
  for all using (public.has_permission('products', 'read'))
  with check (public.has_permission('products', 'write'));

-- ------------------------------------------------------------
-- 5. STORAGE: bucket exclusivo para fotos de producto
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product_images_storage_read" on storage.objects;
create policy "product_images_storage_read" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "product_images_storage_write" on storage.objects;
create policy "product_images_storage_write" on storage.objects
  for all
  using (bucket_id = 'product-images' and public.has_permission('products', 'write'))
  with check (bucket_id = 'product-images' and public.has_permission('products', 'write'));

-- ------------------------------------------------------------
-- 6. updated_at automático
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists products_touch_updated_at on products;
create trigger products_touch_updated_at
  before update on products
  for each row execute function public.touch_updated_at();

drop trigger if exists product_variants_touch_updated_at on product_variants;
create trigger product_variants_touch_updated_at
  before update on product_variants
  for each row execute function public.touch_updated_at();

revoke all on function public.touch_updated_at() from public;
revoke all on function public.touch_updated_at() from anon;
revoke all on function public.touch_updated_at() from authenticated;

-- ------------------------------------------------------------
-- 7. SEED: los cuatro productos del catálogo (solo si está vacío)
--    Variantes: 120 g ($89.000) y 240 g ($139.000), precios con IVA.
-- ------------------------------------------------------------
do $$
declare
  v_count      int;
  v_collection uuid;
  v_product    uuid;
  item         record;
begin
  select count(*) into v_count from products;
  if v_count > 0 then
    return;
  end if;

  for item in
    select * from (values
      ('otono-dorado', 'OTONO', 'Otoño Dorado', 'Manzana & Canela',
       'El calor de una tarde que se alarga.',
       'Manzana horneada, canela en rama y un fondo de madera dulce. Una vela para las tardes frías, las conversaciones lentas y la luz que se vuelve dorada antes de apagarse.',
       'Nació de una sobremesa de octubre: el olor de la manzana en el horno mezclado con canela y el primer frío de la tarde. La vertimos en pequeños lotes para que el aroma no se pierda en el camino.',
       'especiado', 4, 45, 1, true, false,
       '{"accent":"#B85E37","soft":"#F3E9D6","deep":"#8F4526"}'::jsonb,
       array['Manzana roja','Naranja'], array['Canela','Clavo'], array['Madera dulce','Vainilla'],
       24, 11, 34500, 52800),
      ('esencia-del-valle', 'VALLE', 'Esencia del Valle', 'Chontaduro & Durazno',
       'Lo tropical y lo dulce, en equilibrio.',
       'Chontaduro del Pacífico y durazno maduro sobre una base de panela suave. Un aroma que huele a mercado, a casa de abuela y a fruta recién cortada.',
       'Quisimos llevar el Pacífico colombiano al centro de una vela. El chontaduro aporta cuerpo y el durazno lo aligera; juntos huelen a un valle que todavía no se ha ido.',
       'frutal', 3, 40, 2, true, false,
       '{"accent":"#0E6B52","soft":"#E7F1EC","deep":"#064B3B"}'::jsonb,
       array['Durazno','Mandarina'], array['Chontaduro','Jazmín'], array['Panela','Vainilla'],
       18, 7, 35200, 53400),
      ('loto-esmeralda', 'LOTO', 'Loto Esmeralda', 'Flor de Loto',
       'Serenidad que se respira despacio.',
       'Flor de loto, hojas verdes y un soplo de aire fresco sobre almizcle limpio. Una vela para bajar el ritmo, ordenar la casa y ordenar la cabeza.',
       'La flor de loto crece en el barro y florece hacia arriba. Esa idea nos gustó para una colección que busca calma sin volverse fría: agua, verde y un fondo suave que abraza.',
       'floral', 2, 40, 3, false, true,
       '{"accent":"#D9917F","soft":"#F7E4DA","deep":"#8F4526"}'::jsonb,
       array['Hojas verdes','Bergamota'], array['Flor de loto','Té verde'], array['Almizcle blanco','Madera clara'],
       16, 9, 34800, 52600),
      ('luz-serena', 'LUZ', 'Luz Serena', 'Vainilla & Jazmín',
       'Una luz cálida al final del día.',
       'Vainilla cremosa, jazmín blanco y un fondo de ámbar suave. Dulce sin empalagar, floral sin ser intensa: la vela de la última hora de la noche.',
       'Es la colección más cercana a una lámpara encendida: luz baja, silencio y una manta. La pensamos para acompañar la lectura, la ducha larga y el momento de apagar el teléfono.',
       'floral', 3, 45, 4, false, false,
       '{"accent":"#B85E37","soft":"#F3E9D6","deep":"#064B3B"}'::jsonb,
       array['Jazmín blanco','Pera'], array['Vainilla','Flor de azahar'], array['Ámbar','Sándalo'],
       20, 3, 34600, 53100)
    ) as t(slug, sku_prefix, name, aroma, tagline, description, story, family, intensity, burn_hours,
            sort_order, is_featured, is_new, theme, notes_top, notes_heart, notes_base,
            stock120, stock240, cost120, cost240)
  loop
    -- Colección principal (si collections.sql ya creó las columnas extra,
    -- el resto de datos los aporta el catálogo estático del sitio).
    select id into v_collection from collections where slug = item.slug;

    insert into products (
      collection_id, slug, name, aroma, family, intensity,
      tagline, short_description, description, story,
      notes_top, notes_heart, notes_base,
      burn_hours, theme, is_featured, is_new, sort_order,
      is_active, archived_at
    ) values (
      v_collection, item.slug, item.name, item.aroma, item.family, item.intensity,
      item.tagline, item.tagline, item.description, item.story,
      item.notes_top, item.notes_heart, item.notes_base,
      item.burn_hours, item.theme, item.is_featured, item.is_new, item.sort_order,
      true, null
    )
    returning id into v_product;

    insert into product_variants (product_id, size_label, weight_g, sku, price_cop, cost_cop, stock, sort_order, is_active)
    values
      (v_product, '120 g', 120, 'IRIS-' || item.sku_prefix || '-120', 89000, item.cost120, item.stock120, 0, true),
      (v_product, '240 g', 240, 'IRIS-' || item.sku_prefix || '-240', 139000, item.cost240, item.stock240, 1, true);

    -- Vínculo con su colección (si existe).
    if v_collection is not null then
      insert into product_collections (product_id, collection_id, sort_order)
      values (v_product, v_collection, item.sort_order)
      on conflict do nothing;
    end if;
  end loop;
end $$;
