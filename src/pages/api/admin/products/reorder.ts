import type { APIRoute } from 'astro';
import { getAdminEditor } from '../../../../lib/admin-auth';
import { isUuid, json } from '../../../../lib/product-api';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

export const prerender = false;

/**
 * Reordena los productos de la tienda: recibe los ids en el orden deseado
 * y les asigna `sort_order` 0, 1, 2… (el orden en que aparecen en /tienda).
 */
export const POST: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'No tienes permiso para ordenar productos.' }, 403);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const orderedIds = Array.isArray(body.orderedIds)
    ? (body.orderedIds as unknown[]).map((value) => String(value)).filter(isUuid)
    : [];

  if (!orderedIds.length) return json({ error: 'Orden inválido.' }, 400);
  if (orderedIds.length > 200) return json({ error: 'Demasiados productos.' }, 400);

  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await admin
      .from('products')
      .update({ sort_order: index })
      .eq('id', orderedIds[index]);
    if (error) {
      console.error('[products/reorder]', error.code);
      return json({ error: 'No se pudo guardar el orden.' }, 500);
    }
  }

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'product.reorder',
    entity: 'products',
    entity_id: null,
    payload: { count: orderedIds.length },
  });

  return json({ ok: true, count: orderedIds.length });
};
