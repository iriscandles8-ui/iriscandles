import type { APIRoute } from 'astro';
import { getAdminActor } from '../../../../lib/admin-auth';
import { asRow, json, logAudit, readJson, text } from '../../../../lib/media-api';
import { getMediaAssets, isUuid } from '../../../../lib/media-library';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

export const prerender = false;

/**
 * Reutiliza una imagen sin duplicar el archivo: crea una referencia a su URL
 * en product_images, en collection_images o en collections.hero_image_url.
 */
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
  if (!isUuid(targetId)) return json({ error: 'Selecciona un producto o colección válido.' }, 400);

  const { data: assetRow, error: assetError } = await admin
    .from('media_assets')
    .select('id, url, alt')
    .eq('id', assetId)
    .maybeSingle();

  if (assetError) return json({ error: 'No se pudo leer la imagen.' }, 500);
  if (!assetRow) return json({ error: 'La imagen ya no existe en la biblioteca.' }, 404);

  const url = text(assetRow.url);
  const alt = text(assetRow.alt) || null;

  if (targetType === 'product') {
    const { data: product, error: productError } = await admin
      .from('products')
      .select('id')
      .eq('id', targetId)
      .maybeSingle();

    if (productError) return json({ error: 'No se pudo verificar el producto.' }, 500);
    if (!product) return json({ error: 'El producto ya no existe.' }, 404);

    const { data: existing } = await admin
      .from('product_images')
      .select('id')
      .eq('product_id', targetId)
      .eq('url', url)
      .maybeSingle();

    if (existing) {
      const asset = (await getMediaAssets(admin)).find((item) => item.id === assetId) ?? null;
      return json({ ok: true, alreadyLinked: true, asset });
    }

    const { data: last } = await admin
      .from('product_images')
      .select('sort_order')
      .eq('product_id', targetId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = last ? Number(last.sort_order ?? 0) + 1 : 0;

    const { error: insertError } = await admin.from('product_images').insert({
      product_id: targetId,
      url,
      alt,
      sort_order: nextOrder,
    });

    if (insertError) {
      console.error('[admin/media/attach] product_images:', insertError);
      return json({ error: 'No se pudo asociar la imagen al producto.' }, 500);
    }
  } else {
    const { data: collection, error: collectionError } = await admin
      .from('collections')
      .select('id, hero_image_url')
      .eq('id', targetId)
      .maybeSingle();

    if (collectionError) return json({ error: 'No se pudo verificar la colección.' }, 500);
    if (!collection) return json({ error: 'La colección ya no existe.' }, 404);

    if (targetType === 'collection') {
      // Galería de la colección: tabla collection_images / bucket collection-images.
      const { data: existing } = await admin
        .from('collection_images')
        .select('id')
        .eq('collection_id', targetId)
        .eq('url', url)
        .maybeSingle();

      if (existing) {
        const asset = (await getMediaAssets(admin)).find((item) => item.id === assetId) ?? null;
        return json({ ok: true, alreadyLinked: true, asset });
      }

      const { data: last } = await admin
        .from('collection_images')
        .select('sort_order')
        .eq('collection_id', targetId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error: insertError } = await admin.from('collection_images').insert({
        collection_id: targetId,
        url,
        alt,
        sort_order: last ? Number(last.sort_order ?? 0) + 1 : 0,
      });

      if (insertError) {
        console.error('[admin/media/attach] collection_images:', insertError);
        return json({ error: 'No se pudo asociar la imagen a la colección.' }, 500);
      }
    } else {
      // Foto principal: se comparte con el panel de Colecciones.
      if (text(asRow(collection).hero_image_url) === url) {
        const asset = (await getMediaAssets(admin)).find((item) => item.id === assetId) ?? null;
        return json({ ok: true, alreadyLinked: true, asset });
      }

      const { error: updateError } = await admin
        .from('collections')
        .update({ hero_image_url: url })
        .eq('id', targetId);

      if (updateError) {
        console.error('[admin/media/attach] collections:', updateError);
        return json({ error: 'No se pudo asignar la imagen a la colección.' }, 500);
      }
    }
  }

  const asset = (await getMediaAssets(admin)).find((item) => item.id === assetId) ?? null;

  await logAudit(admin, actor, 'media.attach', assetId, { targetType, targetId });
  return json({ ok: true, alreadyLinked: false, asset });
};
