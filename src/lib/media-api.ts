import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminActor } from './admin-auth';
import { ALLOWED_MIME, MAX_UPLOAD_BYTES } from './media-library';

/* Utilidades compartidas por los endpoints de la biblioteca multimedia. */

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

export const asRow = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

export const text = (value: unknown, max = 200): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** `File` no es global en todos los runtimes; usa duck-typing como respaldo. */
export function isUploadedFile(value: FormDataEntryValue | null): value is File {
  if (!value || typeof value === 'string') return false;
  if (typeof File !== 'undefined' && value instanceof File) return true;
  return typeof (value as File).arrayBuffer === 'function';
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const payload = await request.json();
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Valida tipo MIME y tamaño. Devuelve null cuando el archivo es válido. */
export function validateImage(file: File): string | null {
  if (!ALLOWED_MIME[file.type]) {
    return 'Formato no admitido. Usa JPG, PNG, WebP, GIF o AVIF.';
  }
  if (file.size <= 0) return 'El archivo está vacío.';
  if (file.size > MAX_UPLOAD_BYTES) return 'El archivo supera el límite de 10 MB.';
  return null;
}

export async function logAudit(
  admin: SupabaseClient,
  actor: AdminActor,
  action: string,
  entityId: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action,
    entity: 'media_assets',
    entity_id: entityId,
    payload,
  });
}
