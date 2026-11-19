import type { APIRoute } from 'astro';
import { getAdminEditor } from '../../../../../lib/admin-auth';
import { validateImage } from '../../../../../lib/media-api';
import { makeStoragePath, sanitizeBaseName } from '../../../../../lib/media-library';
import { deleteImages, isUuid, json, text, UUID_RE } from '../../../../../lib/product-api';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const prerender = false;

const MAX_IMAGES = 8;

/**
 * Gestión de fotos de un producto sobre el bucket `product-images`:
 *  - POST multipart  → agrega fotos nuevas o reemplaza una existente (`replaceId`)
 *  - DELETE JSON     → quita una foto (fila + archivo)
 *  - PATCH JSON      → reordena (`orderedIds`) o actualiza el alt (`imageId`, `alt`)
 */
export const POST: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'No tienes permiso para editar fotos.' }, 403);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  const productId = context.params.id ?? '';
  if (!isUuid(productId)) return json({ error: 'Producto inválido.' }, 400);

  const { data: product } = await admin
    .from('products')
    .select('id, name')
    .eq('id', productId)
    .maybeSingle();
  if (!product) return json({ error: 'El producto no existe.' }, 404);

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  const rawFiles = form.getAll('files');
  const files = rawFiles.filter((entry): entry is File => {
    if (!entry || typeof entry === 'string') return false;
    if (typeof File !== 'undefined' && entry instanceof File) return entry.size > 0;
    return typeof (entry as File).arrayBuffer === 'function' && (entry as File).size > 0;
  });

  const replaceId = text(form.get('replaceId'), 60);
  const commonAlt = text(form.get('alt'), 300) || text(product.name, 300);

  if (!files.length) return json({ error: 'Selecciona al menos una imagen.' }, 400);
  if (files.length > MAX_IMAGES) {
    return json({ error: `Sube como máximo ${MAX_IMAGES} imágenes por lote.` }, 400);
  }

  // Reemplazo: se cambia el archivo de una foto existente sin tocar el resto.
  if (replaceId) {
    if (!UUID_RE.test(replaceId)) return json({ error: 'Imagen inválida.' }, 400);
    const { data: existing } = await admin
      .from('product_images')
      .select('id, url')
      .eq('id', replaceId)
      .eq('product_id', productId)
      .maybeSingle();
    if (!existing) return json({ error: 'La imagen no pertenece a este producto.' }, 404);

    const file = files[0];
    const invalid = validateImage(file);
    if (invalid) return json({ error: invalid }, 400);

    const path = makeStoragePath(file.name, file.type);
    if (!path) return json({ error: 'Formato de archivo no admitido.' }, 400);
    const storagePath = `${productId}/${path}`;

    const { error: uploadError } = await admin.storage
      .from('product-images')
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadError) {
      console.error('[products/images] Storage:', uploadError);
      return json({ error: 'No se pudo subir la imagen.' }, 500);
    }

    const { data: publicUrl } = admin.storage.from('product-images').getPublicUrl(storagePath);
    const { error: updateError } = await admin
      .from('product_images')
      .update({ url: publicUrl.publicUrl })
      .eq('id', replaceId);

    if (updateError) {
      await admin.storage.from('product-images').remove([storagePath]);
      return json({ error: 'No se pudo reemplazar la imagen.' }, 500);
    }

    // Archivo anterior: se borra solo si otra foto no lo usa.
    const oldUrl = text(asRowLite(existing).url);
    await removeFileIfUnused(admin, oldUrl, replaceId);

    const { data: updated } = await admin
      .from('product_images')
      .select('id, url, alt, sort_order')
      .eq('id', replaceId)
      .maybeSingle();

    return json({ ok: true, image: updated ?? null });
  }

  // Alta de fotos nuevas.
  const { count } = await admin
    .from('product_images')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId);
  const remaining = MAX_IMAGES - (count ?? 0);
  if (remaining <= 0) {
    return json({ error: `Este producto ya tiene ${MAX_IMAGES} fotos (máximo).` }, 400);
  }

  const toUpload = files.slice(0, remaining);
  const errors: string[] = [];
  const inserted: string[] = [];
  let sortOrder = count ?? 0;

  for (const file of toUpload) {
    const invalid = validateImage(file);
    if (invalid) {
      errors.push(`${file.name || 'Imagen'}: ${invalid}`);
      continue;
    }

    const path = makeStoragePath(file.name, file.type);
    if (!path) {
      errors.push(`${file.name}: extensión no admitida.`);
      continue;
    }
    const storagePath = `${productId}/${path}`;

    const { error: uploadError } = await admin.storage
      .from('product-images')
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadError) {
      console.error('[products/images] Storage:', uploadError);
      errors.push(`${file.name}: no se pudo guardar.`);
      continue;
    }

    const { data: publicUrl } = admin.storage.from('product-images').getPublicUrl(storagePath);
    const { data: row, error: dbError } = await admin
      .from('product_images')
      .insert({
        product_id: productId,
        url: publicUrl.publicUrl,
        alt: text(form.get(`alt-${inserted.length}`), 300) || commonAlt,
        sort_order: sortOrder,
      })
      .select('id, url, alt, sort_order')
      .single();

    if (dbError || !row) {
      await admin.storage.from('product-images').remove([storagePath]);
      errors.push(`${file.name}: no se pudo registrar.`);
      continue;
    }

    inserted.push(text(row.id));
    sortOrder += 1;
  }

  if (!inserted.length) {
    return json({ error: errors[0] ?? 'No se pudo subir ninguna imagen.', errors }, 400);
  }

  const { data: images } = await admin
    .from('product_images')
    .select('id, url, alt, sort_order')
    .eq('product_id', productId)
    .order('sort_order');

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'product.images.add',
    entity: 'products',
    entity_id: productId,
    payload: { count: inserted.length, names: toUpload.map((file) => sanitizeBaseName(file.name)) },
  });

  return json({ ok: true, images: images ?? [], errors }, 201);
};

export const DELETE: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'No tienes permiso para editar fotos.' }, 403);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  const productId = context.params.id ?? '';
  if (!isUuid(productId)) return json({ error: 'Producto inválido.' }, 400);

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

  const imageIds = Array.isArray(body.imageIds)
    ? (body.imageIds as unknown[]).filter((value): value is string => UUID_RE.test(String(value)))
    : [];
  if (!imageIds.length && UUID_RE.test(String(body.imageId ?? ''))) {
    imageIds.push(String(body.imageId));
  }
  if (!imageIds.length) return json({ error: 'Imagen inválida.' }, 400);

  // Verificar pertenencia al producto antes de borrar.
  const { data: owned } = await admin
    .from('product_images')
    .select('id')
    .eq('product_id', productId)
    .in('id', imageIds);
  const ownedIds = (owned ?? []).map((row) => text((row as { id: unknown }).id));
  if (!ownedIds.length) return json({ error: 'La imagen no pertenece a este producto.' }, 404);

  await deleteImages(admin, ownedIds);

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'product.images.remove',
    entity: 'products',
    entity_id: productId,
    payload: { count: ownedIds.length },
  });

  return json({ ok: true });
};

export const PATCH: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'No tienes permiso para editar fotos.' }, 403);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  const productId = context.params.id ?? '';
  if (!isUuid(productId)) return json({ error: 'Producto inválido.' }, 400);

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

  if (Array.isArray(body.orderedIds)) {
    const ids = (body.orderedIds as unknown[])
      .map((value) => String(value))
      .filter((value) => UUID_RE.test(value));
    if (!ids.length) return json({ error: 'Orden inválido.' }, 400);

    for (let index = 0; index < ids.length; index += 1) {
      await admin
        .from('product_images')
        .update({ sort_order: index })
        .eq('id', ids[index])
        .eq('product_id', productId);
    }
  } else if (body.imageId !== undefined) {
    const imageId = text(body.imageId, 60);
    if (!UUID_RE.test(imageId)) return json({ error: 'Imagen inválida.' }, 400);
    await admin
      .from('product_images')
      .update({ alt: text(body.alt, 300) })
      .eq('id', imageId)
      .eq('product_id', productId);
  } else {
    return json({ error: 'Nada que actualizar.' }, 400);
  }

  const { data: images } = await admin
    .from('product_images')
    .select('id, url, alt, sort_order')
    .eq('product_id', productId)
    .order('sort_order');

  return json({ ok: true, images: images ?? [] });
};

function asRowLite(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Borra el archivo anterior del reemplazo si ninguna otra foto lo referencia. */
async function removeFileIfUnused(
  admin: NonNullable<Awaited<ReturnType<typeof createSupabaseAdmin>>>,
  oldUrl: string,
  exceptImageId: string,
): Promise<void> {
  if (!oldUrl) return;

  const marker = '/product-images/';
  const index = oldUrl.indexOf(marker);
  if (index < 0) return;
  const path = decodeURIComponent(oldUrl.slice(index + marker.length).split('?')[0]);
  if (!path) return;

  const { data: others } = await admin
    .from('product_images')
    .select('id, url')
    .neq('id', exceptImageId)
    .like('url', `%${path}%`)
    .limit(1);

  if (!others || others.length === 0) {
    await admin.storage.from('product-images').remove([path]);
  }
}
