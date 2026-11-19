import type { APIRoute } from 'astro';
import { getAdminEditor } from '../../../../lib/admin-auth';
import { getAdminProducts } from '../../../../lib/admin-product-data';
import {
  asRow,
  bool,
  int,
  isUuid,
  json,
  parseVariants,
  slugify,
  syncCollectionLinks,
  syncVariants,
  text,
  uniqueSlug,
  VALID_FAMILIES,
} from '../../../../lib/product-api';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'No tienes permiso para ver el catálogo.' }, 403);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  const products = await getAdminProducts(admin);
  return json({ products });
};

export const POST: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'No tienes permiso para crear productos.' }, 403);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  const body = asRow(payload);
  const name = text(body.name, 120);
  if (name.length < 2) return json({ error: 'Escribe el nombre del producto.' }, 400);

  const aroma = text(body.aroma, 120);
  const familyRaw = text(body.family, 40).toLowerCase();
  const family = VALID_FAMILIES.has(familyRaw) ? familyRaw : null;
  const intensity = Math.min(5, Math.max(1, int(body.intensity, 3)));

  const parsed = await parseVariants(admin, body.variants);
  if (parsed.error || !parsed.variants) return json({ error: parsed.error }, 400);

  const requestedSlug = text(body.slug, 80);
  const baseSlug = slugify(requestedSlug || name);
  const slug = await uniqueSlug(admin, baseSlug);

  const collectionIds = Array.isArray(body.collectionIds)
    ? (body.collectionIds as unknown[]).filter(isUuid)
    : [];

  const { data: product, error } = await admin
    .from('products')
    .insert({
      slug,
      name,
      aroma: aroma || name,
      family,
      intensity,
      tagline: text(body.tagline, 200),
      short_description: text(body.shortDescription, 400),
      description: text(body.description, 4000),
      story: text(body.story, 4000),
      is_featured: bool(body.isFeatured),
      is_new: bool(body.isNew),
      sort_order: int(body.sortOrder),
      is_active: text(body.status, 10) !== 'draft',
      archived_at: null,
    })
    .select('id, slug')
    .single();

  if (error || !product) {
    console.error('[products] No se pudo crear:', error?.code);
    return json({ error: 'No se pudo crear el producto.' }, 500);
  }

  const productId = text(product.id);

  const variantError = await syncVariants(admin, productId, parsed.variants);
  if (variantError.error) {
    await admin.from('products').delete().eq('id', productId);
    return json({ error: variantError.error }, 400);
  }

  if (collectionIds.length) {
    const linkError = await syncCollectionLinks(admin, productId, collectionIds);
    if (linkError.error) {
      await admin.from('products').delete().eq('id', productId);
      return json({ error: linkError.error }, 400);
    }
  }

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'product.create',
    entity: 'products',
    entity_id: productId,
    payload: { name, slug, variants: parsed.variants.length },
  });

  return json({ ok: true, id: productId, slug }, 201);
};
