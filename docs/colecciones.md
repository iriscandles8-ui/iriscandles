# Colecciones gestionables

La pestaña **Colecciones** vive dentro de `/admin/productos`, junto a **Productos**. Permite gestionar el contenido editorial, las fotografías, los productos asociados y la publicación de cada colección.

## 1. Instalación (una vez)

En Supabase → SQL Editor ejecuta:

```sql
db/collections.sql
```

Es idempotente. Hace cuatro cosas:

1. Amplía `collections` con `status`, `publish_at`, `unpublish_at`, `is_seasonal`, `season_label`, `story`, `aroma`, `family`, `intensity`, `burn_hours`, `notes`, `theme`, `number` y `updated_at`.
2. Crea **`collection_images`**: tabla exclusiva de fotos de colección.
3. Crea **`product_collections`**: relación muchos-a-muchos entre productos y colecciones, con `sort_order`.
4. Crea el bucket **`collection-images`** en Storage y sus políticas RLS.

Las colecciones que ya estaban activas se migran automáticamente a `status = 'published'` para que la tienda no quede vacía.

> Si vuelves a ejecutar `db/schema.sql` o `db/setup.sql`, ejecuta también `db/collections.sql` justo después: esos scripts recrean la política pública antigua y hay que restaurar la nueva.

## 2. Fotos: separación garantizada

| Tipo de foto | Tabla | Bucket |
|---|---|---|
| Fotos de un producto | `product_images` | `product-images` |
| Fotos de una colección | `collection_images` | `collection-images` |

El panel de Colecciones **nunca escribe** en `product_images` ni en el bucket `product-images`. Cambiar, reemplazar o eliminar la foto principal de una colección no modifica las fotografías individuales de ningún producto.

Dentro del modal puedes:
- subir la **fotografía principal** (marca la colección como `hero_image_url`);
- subir **fotografías adicionales** (varias a la vez);
- **reemplazar** una foto existente;
- **quitar** fotos;
- **ordenar** con las flechas ↑/↓;
- marcar cualquier foto **Como principal** (★).

## 3. Productos en varias colecciones

La relación vive en `product_collections`, así que un producto puede pertenecer a varias colecciones simultáneamente. En el modal:
- marca/desmarca productos con el checkbox;
- usa ↑/↓ para definir el orden dentro de esa colección.

**Eliminar una colección no elimina sus productos**: solo se borran sus relaciones y sus fotos. El diálogo de confirmación indica cuántos productos se conservan.

## 4. Publicación y programación

| Estado | Efecto |
|---|---|
| `draft` | No visible en la tienda |
| `scheduled` | Se publica sola cuando llega `publish_at` |
| `published` | Visible de inmediato (o desde `publish_at`) |
| `archived` | No visible, conservada para el panel |

- **Guardar borrador** guarda el contenido sin publicar.
- **Publicar / Despublicar** cambia el estado directamente desde la tabla o el modal.
- **Fecha de retiro** (`unpublish_at`) despublica automáticamente pasado ese momento.
- **Colección temporal o de temporada**: marca `is_seasonal` y escribe una etiqueta (p. ej. *Navidad 2026*).

Las reglas de visibilidad están en las políticas RLS de `collections`: no hace falta un cron. Las páginas públicas (`/`, `/tienda`, `/producto/[slug]`, `/encuentra-tu-aroma`) son **SSR** y consultan la base de datos en cada petición, así que programar o despublicar se refleja de inmediato.

## 5. Compatibilidad con la biblioteca de medios

El panel de Medios (`/admin/medios`) está integrado con este modelo. Comparte `collections.hero_image_url` y también sabe leer/escribir `collection_images`, por lo que puede:

- detectar una imagen de la biblioteca aunque esté en la galería de una colección;
- reutilizarla como foto de producto, foto de galería o foto principal (`collection-hero`);
- quitar una referencia sin borrar el archivo;
- impedir el borrado de un archivo que sigue referenciado desde una colección.

Ambas vías son válidas: la foto principal que elijas en Colecciones se muestra en la tienda y la que asignes desde Medios también. Los archivos subidos desde Medios al bucket `collection-images` se registran en `media_assets`; los que se suben directamente desde el modal de Colecciones siguen gestionándose solo en `collection_images`. Ver [`docs/biblioteca-multimedia.md`](biblioteca-multimedia.md).

## 6. Verificación rápida

```sql
-- Colecciones y su estado
select name, status, publish_at, unpublish_at, is_seasonal
from collections order by sort_order;

-- Un producto en varias colecciones
select p.name, c.name
from product_collections pc
join products p on p.id = pc.product_id
join collections c on c.id = pc.collection_id
order by p.name;

-- Las fotos de producto no se tocaron
select count(*) from product_images;
```
