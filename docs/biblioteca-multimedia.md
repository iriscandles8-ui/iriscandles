# Biblioteca multimedia

Panel en **`/admin/medios`** (Catálogo → Biblioteca). Centraliza las fotografías de la tienda usando el almacenamiento existente de Supabase Storage; no crea un bucket nuevo.

## 1. Instalación

En Supabase → SQL Editor, en este orden:

1. `db/setup.sql` (o `db/schema.sql` + `db/admin.sql`)
2. `db/collections.sql` — crea el bucket `collection-images` y la tabla `collection_images`
3. `db/manual-payments.sql`
4. **`db/media-library.sql`** — crea `media_assets` y sus políticas

`db/media-library.sql` es idempotente y también garantiza que ambos buckets existan y sean públicos. Requiere `public.has_permission()`, definido en `db/admin.sql`.

## 2. Buckets y separación de fotos

| Tipo | Tabla de referencia | Bucket |
|---|---|---|
| Fotos de producto | `product_images` | `product-images` |
| Galería de colección | `collection_images` | `collection-images` |
| Foto principal de colección | `collections.hero_image_url` | cualquiera de los dos |
| Fotos de reseñas | `reviews.photo_url` | gestionadas por el cliente |

La biblioteca respeta esa separación: al subir eliges **Fotos de producto** o **Fotos de colección**, y el archivo se guarda en el bucket correspondiente. Cada fila de `media_assets` guarda `bucket`, `path` y `url`.

## 3. Qué permite el panel

- **Subir** hasta 12 imágenes a la vez, con vista previa y nombre editable antes de guardar.
- **Visualizar** en cuadrícula con miniatura, tamaño, tipo, fecha y bucket.
- **Buscar** por nombre y filtrar por *En uso* / *Sin usar*.
- **Reemplazar** con vista previa de la imagen nueva antes de guardar.
- **Ver usos**: productos, galerías de colección, portadas y reseñas que referencian la imagen.
- **Reutilizar** la misma imagen en varios productos o colecciones sin duplicar el archivo.
- **Quitar referencias** desde el modal de usos (no borra el archivo).
- **Eliminar** solo archivos sin referencias; si están en uso, devuelve la lista de lugares.

## 4. Clave: reemplazar conserva las referencias

Reemplazar hace un `upload` con `upsert: true` **sobre la misma ruta `path`** y actualiza la ficha (`mime_type`, `size_bytes`, `name`, `alt`, `updated_at`). La URL pública no cambia, por lo que las filas existentes en `product_images`, `collection_images` y `collections.hero_image_url` siguen apuntando al archivo nuevo. No hace falta editar productos ni colecciones.

Para forzar una recarga en navegadores con caché, el reemplazo usa `cache-control: 0`.

## 5. Endpoints (todos exigen sesión de personal y permiso `products.write`)

| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/admin/media/upload` | Subir imágenes (`multipart`: `files`, `name-i`, `alt`, `bucket`) |
| POST | `/api/admin/media/replace` | Reemplazar (`assetId`, `file`, `name`, `alt`) |
| POST | `/api/admin/media/update` | Renombrar / cambiar `alt` |
| POST | `/api/admin/media/delete` | Borrar solo si no tiene usos |
| POST | `/api/admin/media/attach` | Reutilizar (`targetType`: `product`, `collection`, `collection-hero`) |
| POST | `/api/admin/media/detach` | Quitar una referencia |

Todas las escrituras pasan por la service role key en el servidor y se registran en `audit_log` (`media.upload`, `media.replace`, `media.update`, `media.delete`, `media.attach`, `media.detach`).

## 6. Seguridad

- Validación de MIME (`image/jpeg`, `png`, `webp`, `gif`, `avif`) y tamaño máximo de 10 MB.
- Nombres de archivo normalizados; rutas bajo `library/AAAA-MM/<nombre>-<sufijo>.<ext>`.
- La clave de servicio nunca llega al navegador; la sesión se valida con `getAdminActor`.
- La ficha JSON incrustada en la página escapa `<`, `>` y `&` para evitar inyección.
- La lectura sigue la política `has_permission('products', 'read')`; la escritura exige `products.write` (o rol owner/admin).

## 7. Verificación rápida

```sql
select name, bucket, path, size_bytes from media_assets order by created_at desc;

-- Imágenes sin usar (candidatas a eliminar)
select ma.name, ma.path
from media_assets ma
where not exists (select 1 from product_images pi where pi.url like '%' || ma.path)
  and not exists (select 1 from collection_images ci where ci.url like '%' || ma.path)
  and not exists (select 1 from collections c where c.hero_image_url like '%' || ma.path);
```

## 8. Verificación automática

```bash
npm run verify:media        # solo lectura: archivos, rutas compiladas, BD, buckets y RLS
npm run verify:media:write  # además: sube un PNG de prueba, lo reemplaza, comprueba
                            # que la URL no cambia y limpia el archivo y el registro
```

El modo `--write` es la prueba del requisito clave: sube un archivo a una ruta temporal, crea su ficha en `media_assets`, vuelve a subir un contenido distinto **sobre la misma ruta**, descarga la URL pública y confirma que sirve el contenido nuevo sin que la URL haya cambiado. Al terminar elimina tanto el objeto de Storage como la fila.

También se puede verificar en el panel: subir una imagen, pulsar **Usos** (debe decir «Sin usar»), asociarla desde **Reutilizar** a un producto, volver a pulsar **Usos** (debe mostrar el producto) y comprobar que **Eliminar** queda deshabilitado hasta que se quite la referencia.
