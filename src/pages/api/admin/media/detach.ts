import type { APIRoute } from 'astro';
import { getAdminActor } from '../../../../lib/admin-auth';
import { json, logAudit, readJson, text } from '../../../../lib/media-api';
import { getMediaAssets, isUuid } from '../../../../lib/media-library';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

export const prerender = false;

/** Quita una referencia sin borrar el archivo de la biblioteca. */
export const POST: APIRoute = async ({ request, cookies }) => {
  const actor = await getAdminActor({ request, cookies });
  if (!actor) return json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }, 401);
  if (!actor.canWriteProducts) return json({ error: 'No tienes permiso para gestionar la biblioteca.' }, 403);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado en el servidor.' }, 503);

  const body = await readJson(request);
  if (!body) return json({ error: 'Solicitud inválida.' }, 400);

  const assetId = text(body.assetId, 60);
  const targetType = text(body.targetType, 20);
  const targetId = text(body.targetId, 60);

  if (!isUuid(assetId)) return json({ error: 'Imagen no válida.' }, 400);
  if (targetType !== 'product' && targetType !== 'collection' && targetType !== 'collection-hero') {
    return json({ error: 'Selecciona un destino válido.' }, 400);
  }
  if (!isUuid(targetId)) return json({ error: 'Destino no válido.' }, 400);

  const { data: assetRow } = await admin
    .from('media_assets')
    .select('url')
    .eq('id', assetId)
    .maybeSingle();

  if (!assetRow) return json({ error: 'La imagen ya no existe en la biblioteca.' }, 404);

  const url = text(assetRow.url);

  if (targetType === 'product') {
    const { error } = await admin
      .from('product_images')
      .delete()
      .eq('product_id', targetId)
      .eq('url', url);

    if (error) {
      console.error('[admin/media/detach] product_images:', error);
      return json({ error: 'No se pudo quitar la referencia del producto.' }, 500);
    }
  } else if (targetType === 'collection') {
    // `targetId` es el id de la fila de collection_images (ver MediaUsage.id).
    const { error } = await admin
      .from('collection_images')
      .delete()
      .eq('id', targetId)
      .eq('url', url);

    if (error) {
      console.error('[admin/media/detach] collection_images:', error);
      return json({ error: 'No se pudo quitar la imagen de la galería.' }, 500);
    }
  } else {
    const { error } = await admin
      .from('collections')
      .update({ hero_image_url: null })
      .eq('id', targetId)
      .eq('hero_image_url', url);

    if (error) {
      console.error('[admin/media/detach] collections:', error);
      return json({ error: 'No se pudo quitar la imagen de la colección.' }, 500);
    }
  }

  const asset = (await getMediaAssets(admin)).find((item) => item.id === assetId) ?? null;

  await logAudit(admin, actor, 'media.detach', assetId, { targetType, targetId });
  return json({ ok: true, asset });
};
