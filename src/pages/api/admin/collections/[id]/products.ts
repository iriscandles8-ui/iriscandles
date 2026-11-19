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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Sincroniza la lista de productos de una colección: agrega, retira y reordena.
 * Solo toca `product_collections`; los productos nunca se eliminan.
 */
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

  const rawProducts = Array.isArray(body.products)
    ? (body.products as unknown[])
    : Array.isArray(body.productIds)
      ? (body.productIds as unknown[]).map((productId) => ({ productId }))
      : [];

  const products: { productId: string; sortOrder: number }[] = [];
  for (const [index, item] of rawProducts.entries()) {
    const source = asRow(item);
    const productId =
      typeof source.productId === 'string'
        ? source.productId
        : typeof item === 'string'
          ? item
          : '';
    if (!UUID_RE.test(productId)) {
      return json({ error: 'Hay un producto inválido en la lista.' }, 400);
    }
    products.push({
      productId,
      sortOrder: Math.round(Number(source.sortOrder ?? index) || 0),
    });
  }

  const { data: collection } = await admin
    .from('collections')
    .select('id')
    .eq('id', collectionId)
    .maybeSingle();
  if (!collection) return json({ error: 'La colección no existe.' }, 404);

  const ids = Array.from(new Set(products.map((item) => item.productId)));
  if (ids.length) {
    const { data: found, error: findError } = await admin
      .from('products')
      .select('id')
      .in('id', ids);
    if (findError || !found || found.length !== ids.length) {
      return json({ error: 'Uno de los productos no existe en el catálogo.' }, 400);
    }
  }

  const { error: deleteError } = await admin
    .from('product_collections')
    .delete()
    .eq('collection_id', collectionId);
  if (deleteError) return json({ error: 'No se pudo actualizar la colección.' }, 500);

  if (products.length) {
    const seen = new Set<string>();
    const rows = products
      .filter((item) => !seen.has(item.productId) && seen.add(item.productId))
      .map((item) => ({
        product_id: item.productId,
        collection_id: collectionId,
        sort_order: item.sortOrder,
      }));
    const { error: insertError } = await admin.from('product_collections').insert(rows);
    if (insertError) {
      return json({ error: 'No se pudieron guardar los productos de la colección.' }, 500);
    }
  }

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'collection.products',
    entity: 'collections',
    entity_id: collectionId,
    payload: { count: products.length },
  });

  return json({ ok: true, count: products.length });
};
