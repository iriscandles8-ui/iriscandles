import type { APIRoute } from 'astro';
import { getAdminActor } from '../../../../lib/admin-auth';
import { json, logAudit, readJson, text } from '../../../../lib/media-api';
import { getMediaAssets, isUuid } from '../../../../lib/media-library';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

export const prerender = false;

/** Cambia el nombre y el texto alternativo sin tocar el archivo ni su URL. */
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

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = text(body.name, 120);
    if (!name) return json({ error: 'El nombre no puede estar vacío.' }, 400);
    update.name = name;
  }
  if (body.alt !== undefined) update.alt = text(body.alt, 200) || null;

  if (Object.keys(update).length === 0) {
    return json({ error: 'No hay cambios para guardar.' }, 400);
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from('media_assets')
    .update(update)
    .eq('id', assetId)
    .select('id');

  if (error) {
    console.error('[admin/media/update]', error);
    return json({ error: 'No se pudo actualizar la imagen.' }, 500);
  }
  if (!data?.length) return json({ error: 'La imagen ya no existe.' }, 404);

  const asset = (await getMediaAssets(admin)).find((item) => item.id === assetId) ?? null;

  await logAudit(admin, actor, 'media.update', assetId, update);
  return json({ ok: true, asset });
};
