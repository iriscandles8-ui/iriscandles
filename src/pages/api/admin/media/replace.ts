import type { APIRoute } from 'astro';
import { getAdminActor } from '../../../../lib/admin-auth';
import { asRow, isUploadedFile, json, logAudit, text, validateImage } from '../../../../lib/media-api';
import { getMediaAssets, isMediaBucket, isUuid, sanitizeBaseName } from '../../../../lib/media-library';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

export const prerender = false;

/**
 * Reemplaza el contenido del archivo en la MISMA ruta del bucket.
 * La URL pública no cambia: productos y colecciones que ya la referencian
 * siguen apuntando al archivo nuevo sin necesidad de editarlos.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const actor = await getAdminActor({ request, cookies });
  if (!actor) return json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }, 401);
  if (!actor.canWriteProducts) return json({ error: 'No tienes permiso para gestionar la biblioteca.' }, 403);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado en el servidor.' }, 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  const assetId = text(form.get('assetId'), 60);
  if (!isUuid(assetId)) return json({ error: 'Imagen no válida.' }, 400);

  const { data: current, error: findError } = await admin
    .from('media_assets')
    .select('id, name, bucket, path, alt')
    .eq('id', assetId)
    .maybeSingle();

  if (findError) return json({ error: 'No se pudo leer la imagen.' }, 500);
  if (!current) return json({ error: 'La imagen ya no existe en la biblioteca.' }, 404);

  const row = asRow(current);
  const file = form.get('file');
  if (!isUploadedFile(file) || file.size === 0) {
    return json({ error: 'Selecciona la imagen de reemplazo.' }, 400);
  }

  const invalid = validateImage(file);
  if (invalid) return json({ error: invalid }, 400);

  const path = text(row.path);
  if (!path) return json({ error: 'La imagen no tiene una ruta válida.' }, 400);
  const bucket = isMediaBucket(row.bucket) ? row.bucket : 'product-images';

  const { error: uploadError } = await admin.storage.from(bucket).upload(
    path,
    await file.arrayBuffer(),
    { contentType: file.type, cacheControl: '0', upsert: true },
  );

  if (uploadError) {
    console.error('[admin/media/replace] Storage:', uploadError);
    return json({ error: 'No se pudo reemplazar el archivo.' }, 500);
  }

  const name = text(form.get('name'), 120) || text(row.name) || sanitizeBaseName(file.name);
  const altValue = form.get('alt');
  const alt = altValue === null ? (text(row.alt, 200) || null) : text(altValue, 200) || null;

  const { error: updateError } = await admin
    .from('media_assets')
    .update({
      name,
      alt,
      file_name: file.name.slice(0, 200),
      mime_type: file.type,
      size_bytes: file.size,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assetId);

  if (updateError) {
    console.error('[admin/media/replace] DB:', updateError);
    return json({ error: 'El archivo cambió, pero no se pudo actualizar la ficha.' }, 500);
  }

  const asset = (await getMediaAssets(admin)).find((item) => item.id === assetId) ?? null;

  await logAudit(admin, actor, 'media.replace', assetId, {
    bucket,
    path,
    name,
    bytes: file.size,
  });

  return json({ ok: true, asset, preservedUrl: true });
};
