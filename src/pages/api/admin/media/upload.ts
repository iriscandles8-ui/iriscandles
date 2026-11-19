import type { APIRoute } from 'astro';
import { getAdminActor } from '../../../../lib/admin-auth';
import { isUploadedFile, json, logAudit, text, validateImage } from '../../../../lib/media-api';
import {
  getMediaAssets,
  isMediaBucket,
  makeStoragePath,
  sanitizeBaseName,
} from '../../../../lib/media-library';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

export const prerender = false;

const MAX_FILES = 12;

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

  const files = form.getAll('files').filter((entry): entry is File => isUploadedFile(entry) && entry.size > 0);
  if (files.length === 0) return json({ error: 'Selecciona al menos una imagen.' }, 400);
  if (files.length > MAX_FILES) {
    return json({ error: `Sube como máximo ${MAX_FILES} imágenes a la vez.` }, 400);
  }

  const bucketValue = form.get('bucket');
  const bucket = isMediaBucket(bucketValue) ? bucketValue : 'product-images';
  const commonAlt = text(form.get('alt'), 200);
  const insertedIds: string[] = [];
  const errors: string[] = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const invalid = validateImage(file);
    if (invalid) {
      errors.push(`${file.name || `Archivo ${index + 1}`}: ${invalid}`);
      continue;
    }

    const path = makeStoragePath(file.name, file.type);
    if (!path) {
      errors.push(`${file.name}: no se pudo determinar la extensión.`);
      continue;
    }

    const { error: uploadError } = await admin.storage.from(bucket).upload(
      path,
      await file.arrayBuffer(),
      { contentType: file.type, cacheControl: '3600', upsert: false },
    );

    if (uploadError) {
      console.error('[admin/media/upload] Storage:', uploadError);
      errors.push(`${file.name}: no se pudo guardar el archivo.`);
      continue;
    }

    const { data: publicUrl } = admin.storage.from(bucket).getPublicUrl(path);
    const name = text(form.get(`name-${index}`), 120) || sanitizeBaseName(file.name);

    const { data: asset, error: dbError } = await admin
      .from('media_assets')
      .insert({
        name,
        file_name: file.name.slice(0, 200),
        bucket,
        path,
        url: publicUrl.publicUrl,
        alt: commonAlt || null,
        mime_type: file.type,
        size_bytes: file.size,
        created_by: actor.userId,
      })
      .select('id')
      .single();

    if (dbError || !asset) {
      console.error('[admin/media/upload] DB:', dbError);
      await admin.storage.from(bucket).remove([path]);
      errors.push(`${file.name}: no se pudo registrar en la biblioteca.`);
      continue;
    }

    insertedIds.push(String(asset.id));
  }

  if (insertedIds.length === 0) {
    return json({ error: errors[0] ?? 'No se pudo subir ninguna imagen.', errors }, 400);
  }

  const allAssets = await getMediaAssets(admin);
  const assets = allAssets.filter((asset) => insertedIds.includes(asset.id));

  await logAudit(admin, actor, 'media.upload', insertedIds.join(', '), {
    bucket,
    count: assets.length,
    names: assets.map((asset) => asset.name),
  });

  return json({ ok: true, assets, errors }, 201);
};
