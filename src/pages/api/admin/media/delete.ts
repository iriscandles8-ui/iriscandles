import type { APIRoute } from 'astro';
import { getAdminActor } from '../../../../lib/admin-auth';
import { json, logAudit, readJson, text } from '../../../../lib/media-api';
import { getMediaAssets, isMediaBucket, isUuid } from '../../../../lib/media-library';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

export const prerender = false;

/**
 * Solo elimina archivos sin uso. Si aparece en product_images,
 * collection_images, collections.hero_image_url o reviews.photo_url,
 * devuelve 409 con la lista
 * de lugares para que la interfaz pueda explicar por qué no se puede borrar.
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
  if (!isUuid(assetId)) return json({ error: 'Imagen no válida.' }, 400);

  const asset = (await getMediaAssets(admin)).find((item) => item.id === assetId);
  if (!asset) return json({ error: 'La imagen ya no existe en la biblioteca.' }, 404);

  if (asset.usages.length > 0) {
    return json(
      {
        error: 'Esta imagen está en uso y no se puede eliminar.',
        usages: asset.usages,
      },
      409,
    );
  }

  const bucket = isMediaBucket(asset.bucket) ? asset.bucket : 'product-images';
  const { error: storageError } = await admin.storage.from(bucket).remove([asset.path]);
  if (storageError) {
    console.error('[admin/media/delete] Storage:', storageError);
    return json({ error: 'No se pudo eliminar el archivo del almacenamiento.' }, 500);
  }

  const { error: dbError } = await admin.from('media_assets').delete().eq('id', assetId);
  if (dbError) {
    console.error('[admin/media/delete] DB:', dbError);
    return json({ error: 'El archivo se eliminó, pero no se pudo quitar la ficha.' }, 500);
  }

  await logAudit(admin, actor, 'media.delete', assetId, {
    name: asset.name,
    path: asset.path,
    bytes: asset.sizeBytes,
  });

  return json({ ok: true, id: assetId });
};
