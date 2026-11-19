import type { APIRoute } from 'astro';
import { getAdminEditor } from '../../../../lib/admin-auth';
import {
  asRow,
  bool,
  deleteImages,
  int,
  isUuid,
  json,
  syncCollectionLinks,
  text,
  uniqueSlug,
  VALID_FAMILIES,
} from '../../../../lib/product-api';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

export const prerender = false;

async function readProduct(admin: Awaited<ReturnType<typeof createSupabaseAdmin>>, id: string) {
  if (!admin) return null;
  const { data } = await admin
    .from('products')
    .select('id, slug, name, is_active, archived_at')
    .eq('id', id)
    .maybeSingle();
  return data;
}

export const PATCH: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'No tienes permiso para editar productos.' }, 403);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  const id = context.params.id ?? '';
  if (!isUuid(id)) return json({ error: 'Producto inválido.' }, 400);

  const current = await readProduct(admin, id);
  if (!current) return json({ error: 'El producto no existe.' }, 404);

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  const body = asRow(payload);
  const update: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = text(body.name, 120);
    if (name.length < 2) return json({ error: 'Escribe el nombre del producto.' }, 400);
    update.name = name;
  }
  if (body.aroma !== undefined) update.aroma = text(body.aroma, 120) || null;
  if (body.tagline !== undefined) update.tagline = text(body.tagline, 200);
  if (body.shortDescription !== undefined) {
    update.short_description = text(body.shortDescription, 400);
  }
  if (body.description !== undefined) update.description = text(body.description, 4000);
  if (body.story !== undefined) update.story = text(body.story, 4000);

  if (body.family !== undefined) {
    const familyRaw = text(body.family, 40).toLowerCase();
    update.family = VALID_FAMILIES.has(familyRaw) ? familyRaw : null;
  }
  if (body.intensity !== undefined) {
    update.intensity = Math.min(5, Math.max(1, int(body.intensity, 3)));
  }

  if (body.status !== undefined) {
    update.is_active = text(body.status, 10) !== 'draft';
  }
  if (body.isFeatured !== undefined) update.is_featured = bool(body.isFeatured);
  if (body.isNew !== undefined) update.is_new = bool(body.isNew);
  if (body.sortOrder !== undefined) update.sort_order = int(body.sortOrder);

  if (body.archived !== undefined) {
    update.archived_at = bool(body.archived) ? new Date().toISOString() : null;
  }

  if (body.slug !== undefined) {
    const requested = slugSafe(text(body.slug, 80));
    if (requested) {
      const slug = await uniqueSlug(admin, requested, id);
      update.slug = slug;
    }
  }

  if (Object.keys(update).length === 0 && body.collectionIds === undefined) {
    return json({ error: 'No hay cambios para guardar.' }, 400);
  }

  if (Object.keys(update).length > 0) {
    const { error } = await admin.from('products').update(update).eq('id', id);
    if (error) {
      if (error.code === '23505') return json({ error: 'Ese slug ya está en uso.' }, 409);
      console.error('[products] No se pudo actualizar:', error.code);
      return json({ error: 'No se pudieron guardar los cambios.' }, 500);
    }
  }

  if (Array.isArray(body.collectionIds)) {
    const ids = (body.collectionIds as unknown[]).filter(isUuid);
    const linkError = await syncCollectionLinks(admin, id, ids);
    if (linkError.error) return json({ error: linkError.error }, 400);
  }

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'product.update',
    entity: 'products',
    entity_id: id,
    payload: { fields: Object.keys(update), collections: Array.isArray(body.collectionIds) },
  });

  return json({ ok: true });
};

export const DELETE: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'No tienes permiso para eliminar productos.' }, 403);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  const id = context.params.id ?? '';
  if (!isUuid(id)) return json({ error: 'Producto inválido.' }, 400);

  const current = await readProduct(admin, id);
  if (!current) return json({ error: 'El producto no existe.' }, 404);

  // Fotos: se borran también los archivos del bucket.
  const { data: imageRows } = await admin
    .from('product_images')
    .select('id')
    .eq('product_id', id);
  await deleteImages(
    admin,
    (imageRows ?? []).map((row) => text(asRow(row).id)),
  );

  // Variantes: se limpia su historial de stock (si no, los movimientos
  // huérfanos impiden eliminar el producto) y las que tengan pedidos
  // quedan en `order_items` con variant_id en null (FK on delete set null).
  const { data: variantRows } = await admin
    .from('product_variants')
    .select('id')
    .eq('product_id', id);
  const variantIds = (variantRows ?? []).map((row) => text(asRow(row).id));
  if (variantIds.length) {
    await admin.from('stock_movements').delete().in('variant_id', variantIds);
  }

  const { error } = await admin.from('products').delete().eq('id', id);
  if (error) {
    console.error('[products] No se pudo eliminar:', error.code);
    return json(
      { error: 'No se pudo eliminar el producto. Tiene pedidos asociados; archívalo en su lugar.' },
      409,
    );
  }

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'product.delete',
    entity: 'products',
    entity_id: id,
    payload: { name: current.name, slug: current.slug },
  });

  return json({ ok: true });
};

function slugSafe(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
