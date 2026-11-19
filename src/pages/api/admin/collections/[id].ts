import type { APIRoute } from 'astro';
import { getAdminEditor } from '../../../../lib/admin-auth';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { getManagedCollection } from '../../../../lib/collection-data';

export const prerender = false;

type Row = Record<string, unknown>;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const asRow = (value: unknown): Row =>
  value && typeof value === 'object' ? (value as Row) : {};

const text = (value: unknown, max = 4000): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_STATUS = new Set(['draft', 'scheduled', 'published', 'archived']);

export const GET: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'Sin permiso.' }, 403);

  const id = context.params.id ?? '';
  if (!UUID_RE.test(id)) return json({ error: 'Colección inválida.' }, 400);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  const collection = await getManagedCollection(admin, id);
  if (!collection) return json({ error: 'La colección no existe.' }, 404);
  return json({ collection });
};

export const PATCH: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'Sin permiso.' }, 403);

  const id = context.params.id ?? '';
  if (!UUID_RE.test(id)) return json({ error: 'Colección inválida.' }, 400);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }
  const body = asRow(payload);

  const current = await getManagedCollection(admin, id);
  if (!current) return json({ error: 'La colección no existe.' }, 404);

  const update: Row = {};
  if (body.name !== undefined) {
    const name = text(body.name, 120);
    if (name.length < 2) return json({ error: 'El nombre es demasiado corto.' }, 400);
    update.name = name;
  }
  if (body.slug !== undefined) {
    const slug = text(body.slug, 80)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (slug) update.slug = slug;
  }
  for (const [key, max] of [
    ['tagline', 200],
    ['description', 4000],
    ['story', 4000],
    ['aroma', 200],
    ['family', 200],
    ['burnHours', 60],
    ['number', 10],
    ['seasonLabel', 120],
    ['heroImageUrl', 1000],
  ] as const) {
    if (body[key] !== undefined) update[key === 'burnHours' ? 'burn_hours' : key === 'seasonLabel' ? 'season_label' : key === 'heroImageUrl' ? 'hero_image_url' : key] = text(body[key], max);
  }
  if (body.intensity !== undefined) {
    update.intensity = Math.min(5, Math.max(1, Math.round(Number(body.intensity) || 3)));
  }
  if (body.sortOrder !== undefined) update.sort_order = Math.round(Number(body.sortOrder) || 0);
  if (body.notes !== undefined) {
    const notes = asRow(body.notes);
    update.notes = { top: notes.top, heart: notes.heart, base: notes.base };
  }
  if (body.theme !== undefined) {
    const theme = asRow(body.theme);
    update.theme = { accent: theme.accent, soft: theme.soft, deep: theme.deep };
  }
  if (body.isSeasonal !== undefined) update.is_seasonal = Boolean(body.isSeasonal);

  const status = body.status !== undefined ? String(body.status) : current.status;
  if (!VALID_STATUS.has(status)) return json({ error: 'Estado inválido.' }, 400);
  const publishAt = body.publishAt !== undefined ? text(body.publishAt, 40) || null : current.publishAt;
  const unpublishAt = body.unpublishAt !== undefined ? text(body.unpublishAt, 40) || null : current.unpublishAt;

  if (status === 'scheduled' && !publishAt) {
    return json({ error: 'Una colección programada necesita fecha de publicación.' }, 400);
  }
  if (publishAt && unpublishAt && new Date(unpublishAt) <= new Date(publishAt)) {
    return json({ error: 'La fecha de retiro debe ser posterior a la de publicación.' }, 400);
  }

  update.status = status;
  update.publish_at = publishAt;
  update.unpublish_at = unpublishAt;
  // El trigger sincroniza is_active, pero lo enviamos para evitar ventanas.
  update.is_active = status === 'published';

  const { error } = await admin.from('collections').update(update).eq('id', id);
  if (error) {
    console.error('[collections] No se pudo actualizar:', error.code);
    return json({ error: 'No se pudo guardar la colección.' }, 500);
  }

  if (body.productIds !== undefined) {
    const productIds = Array.isArray(body.productIds)
      ? (body.productIds as unknown[]).filter((item): item is string => typeof item === 'string')
      : [];
    await admin.from('product_collections').delete().eq('collection_id', id);
    if (productIds.length) {
      const rows = Array.from(new Set(productIds)).map((productId, index) => ({
        product_id: productId,
        collection_id: id,
        sort_order: index,
      }));
      const { error: linkError } = await admin.from('product_collections').insert(rows);
      if (linkError) return json({ error: 'No se pudieron actualizar los productos.' }, 500);
    }
  }

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'collection.update',
    entity: 'collections',
    entity_id: id,
    payload: { name: update.name ?? current.name, status },
  });

  return json({ ok: true });
};

export const DELETE: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'Sin permiso.' }, 403);

  const id = context.params.id ?? '';
  if (!UUID_RE.test(id)) return json({ error: 'Colección inválida.' }, 400);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  const collection = await getManagedCollection(admin, id);
  if (!collection) return json({ error: 'La colección no existe.' }, 404);

  // Borrar solo los archivos del bucket de colecciones. Nunca `product-images`.
  const paths = collection.images
    .map((image) => image.url.split('/collection-images/')[1])
    .filter(Boolean);
  if (paths.length) {
    await admin.storage.from('collection-images').remove(paths);
  }

  // ON DELETE CASCADE limpia collection_images y product_collections.
  // Los productos NO se eliminan: solo se retiran de esta colección.
  const { error } = await admin.from('collections').delete().eq('id', id);
  if (error) {
    console.error('[collections] No se pudo eliminar:', error.code);
    return json({ error: 'No se pudo eliminar la colección.' }, 500);
  }

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'collection.delete',
    entity: 'collections',
    entity_id: id,
    payload: { name: collection.name, products_kept: collection.products.length },
  });

  return json({ ok: true, productsKept: collection.products.length });
};
