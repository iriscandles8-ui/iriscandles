import type { APIRoute } from 'astro';
import { getAdminEditor } from '../../../../../lib/admin-auth';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const prerender = false;

type Row = Record<string, unknown>;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const asRow = (value: unknown): Row =>
  value && typeof value === 'object' ? (value as Row) : {};

const text = (value: unknown, max = 1000): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Registra una imagen ya subida al bucket `collection-images`. */
export const POST: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'Sin permiso.' }, 403);

  const collectionId = context.params.id ?? '';
  if (!UUID_RE.test(collectionId)) return json({ error: 'Colección inválida.' }, 400);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }
  const body = asRow(payload);
  const url = text(body.url, 1000);
  if (!url) return json({ error: 'Falta la URL de la imagen.' }, 400);

  const { data: image, error } = await admin
    .from('collection_images')
    .insert({
      collection_id: collectionId,
      url,
      alt: text(body.alt, 300),
      sort_order: Math.round(Number(body.sortOrder) || 0),
    })
    .select('id, url, alt, sort_order')
    .single();

  if (error || !image) {
    console.error('[collections/images] No se pudo registrar:', error?.code);
    return json({ error: 'No se pudo guardar la imagen.' }, 500);
  }

  if (body.hero) {
    await admin.from('collections').update({ hero_image_url: url }).eq('id', collectionId);
  }

  return json({ ok: true, image }, 201);
};

/** Elimina una imagen de colección y su archivo del bucket de colecciones. */
export const DELETE: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'Sin permiso.' }, 403);

  const collectionId = context.params.id ?? '';
  if (!UUID_RE.test(collectionId)) return json({ error: 'Colección inválida.' }, 400);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }
  const imageId = text(asRow(payload).imageId, 60);
  if (!UUID_RE.test(imageId)) return json({ error: 'Imagen inválida.' }, 400);

  const { data: image } = await admin
    .from('collection_images')
    .select('id, url')
    .eq('id', imageId)
    .eq('collection_id', collectionId)
    .maybeSingle();

  if (!image) return json({ error: 'La imagen no pertenece a esta colección.' }, 404);

  const path = text(asRow(image).url).split('/collection-images/')[1];
  if (path) await admin.storage.from('collection-images').remove([path]);

  await admin.from('collection_images').delete().eq('id', imageId);

  const { data: collection } = await admin
    .from('collections')
    .select('hero_image_url')
    .eq('id', collectionId)
    .maybeSingle();
  if (collection && asRow(collection).hero_image_url === asRow(image).url) {
    await admin.from('collections').update({ hero_image_url: null }).eq('id', collectionId);
  }

  return json({ ok: true });
};
