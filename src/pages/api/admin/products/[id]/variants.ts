import type { APIRoute } from 'astro';
import { getAdminEditor } from '../../../../../lib/admin-auth';
import { isUuid, json, parseVariants, syncVariants } from '../../../../../lib/product-api';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const prerender = false;

/**
 * Sincroniza las variantes (tamaños 120 g / 240 g) de un producto:
 * actualiza precios, costos y stock; crea las nuevas; retira las que ya no
 * están (borrándolas o desactivándolas si tienen pedidos).
 */
export const PATCH: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'No tienes permiso para editar variantes.' }, 403);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  const id = context.params.id ?? '';
  if (!isUuid(id)) return json({ error: 'Producto inválido.' }, 400);

  const { data: product } = await admin
    .from('products')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!product) return json({ error: 'El producto no existe.' }, 404);

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const parsed = await parseVariants(admin, body.variants, id);
  if (parsed.error || !parsed.variants) return json({ error: parsed.error }, 400);

  const result = await syncVariants(admin, id, parsed.variants);
  if (result.error) return json({ error: result.error }, 400);

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'product.variants',
    entity: 'products',
    entity_id: id,
    payload: { count: parsed.variants.length },
  });

  return json({ ok: true, count: parsed.variants.length });
};
