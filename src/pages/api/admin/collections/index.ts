import type { APIRoute } from 'astro';
import { getAdminEditor } from '../../../../lib/admin-auth';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';
import { getManagedCollections } from '../../../../lib/collection-data';

export const prerender = false;

type Row = Record<string, unknown>;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const asRow = (value: unknown): Row =>
  value && typeof value === 'object' ? (value as Row) : {};

const text = (value: unknown, max = 2000): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `coleccion-${Date.now().toString(36)}`;

const VALID_STATUS = new Set(['draft', 'scheduled', 'published', 'archived']);

export const GET: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'No tienes permiso para ver las colecciones.' }, 403);

  const supabase = await createSupabaseAdmin();
  if (!supabase) return json({ error: 'Supabase no está configurado.' }, 503);

  const collections = await getManagedCollections(supabase);
  return json({ collections });
};

export const POST: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'No tienes permiso para crear colecciones.' }, 403);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  const body = asRow(payload);
  const name = text(body.name, 120);
  if (name.length < 2) return json({ error: 'Escribe el nombre de la colección.' }, 400);

  const status = VALID_STATUS.has(String(body.status)) ? String(body.status) : 'draft';
  const publishAt = text(body.publishAt, 40) || null;
  const unpublishAt = text(body.unpublishAt, 40) || null;

  if (status === 'scheduled' && !publishAt) {
    return json({ error: 'Una colección programada necesita fecha de publicación.' }, 400);
  }
  if (publishAt && unpublishAt && new Date(unpublishAt) <= new Date(publishAt)) {
    return json({ error: 'La fecha de retiro debe ser posterior a la de publicación.' }, 400);
  }

  const slug = text(body.slug, 80) ? slugify(text(body.slug, 80)) : slugify(name);
  const theme = asRow(body.theme);
  const notes = asRow(body.notes);
  const productIds = Array.isArray(body.productIds)
    ? (body.productIds as unknown[]).filter((id): id is string => typeof id === 'string')
    : [];

  const { data: collection, error } = await admin
    .from('collections')
    .insert({
      slug,
      name,
      tagline: text(body.tagline, 200),
      description: text(body.description, 4000),
      story: text(body.story, 4000),
      aroma: text(body.aroma, 200),
      family: text(body.family, 200),
      intensity: Math.min(5, Math.max(1, Math.round(Number(body.intensity) || 3))),
      burn_hours: text(body.burnHours, 60),
      notes: { top: notes.top, heart: notes.heart, base: notes.base },
      theme: { accent: theme.accent, soft: theme.soft, deep: theme.deep },
      number: text(body.number, 10),
      sort_order: Math.round(Number(body.sortOrder) || 0),
      status,
      publish_at: publishAt,
      unpublish_at: unpublishAt,
      is_seasonal: Boolean(body.isSeasonal),
      season_label: text(body.seasonLabel, 120),
      hero_image_url: text(body.heroImageUrl, 1000),
      is_active: status === 'published',
    })
    .select('id, slug, name')
    .single();

  if (error || !collection) {
    if (error?.code === '23505') {
      return json({ error: 'Ya existe una colección con ese nombre o slug.' }, 409);
    }
    console.error('[collections] No se pudo crear:', error?.code);
    return json({ error: 'No se pudo crear la colección.' }, 500);
  }

  if (productIds.length) {
    const rows = Array.from(new Set(productIds)).map((productId, index) => ({
      product_id: productId,
      collection_id: collection.id,
      sort_order: index,
    }));
    const { error: linkError } = await admin.from('product_collections').insert(rows);
    if (linkError) {
      await admin.from('collections').delete().eq('id', collection.id);
      return json({ error: 'No se pudieron asociar los productos.' }, 500);
    }
  }

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'collection.create',
    entity: 'collections',
    entity_id: collection.id,
    payload: { name, slug, status },
  });

  return json({ ok: true, id: collection.id, slug: collection.slug }, 201);
};
