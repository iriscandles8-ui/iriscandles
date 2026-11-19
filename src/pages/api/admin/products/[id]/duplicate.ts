import type { APIRoute } from 'astro';
import { getAdminEditor } from '../../../../../lib/admin-auth';
import { asRow, isUuid, json, slugify, text, uniqueSlug } from '../../../../../lib/product-api';
import { createSupabaseAdmin } from '../../../../../lib/supabase-admin';

export const prerender = false;

type Row = Record<string, unknown>;

/**
 * Duplica un producto: campos, variantes (con SKU nuevos), vínculos de
 * colección y fotos (re-subidas al bucket). La copia nace como borrador
 * (`is_active = false`) y sin destacar, para que nunca aparezca publicada
 * por accidente.
 */
export const POST: APIRoute = async (context) => {
  const actor = await getAdminEditor(context, 'products');
  if (!actor) return json({ error: 'No tienes permiso para duplicar productos.' }, 403);

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  const id = context.params.id ?? '';
  if (!isUuid(id)) return json({ error: 'Producto inválido.' }, 400);

  const { data: source, error: sourceError } = await admin
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (sourceError || !source) return json({ error: 'El producto no existe.' }, 404);

  const original = asRow(source);
  const baseName = `${text(original.name, 120)} (copia)`;
  const slug = await uniqueSlug(admin, slugify(text(original.name)));

  const { data: copy, error: insertError } = await admin
    .from('products')
    .insert({
      collection_id: original.collection_id ?? null,
      slug,
      name: baseName,
      aroma: original.aroma,
      family: original.family ?? null,
      intensity: original.intensity ?? 3,
      tagline: original.tagline ?? null,
      short_description: original.short_description ?? null,
      description: original.description ?? null,
      story: original.story ?? null,
      notes_top: original.notes_top ?? [],
      notes_heart: original.notes_heart ?? [],
      notes_base: original.notes_base ?? [],
      ingredients: original.ingredients ?? null,
      care: original.care ?? null,
      burn_hours: original.burn_hours ?? null,
      theme: original.theme ?? {},
      is_featured: false,
      is_new: false,
      is_active: false,
      archived_at: null,
      sort_order: original.sort_order ?? 0,
    })
    .select('id, slug')
    .single();

  if (insertError || !copy) {
    console.error('[products/duplicate] Insert:', insertError?.code);
    return json({ error: 'No se pudo duplicar el producto.' }, 500);
  }

  const newId = text(asRow(copy).id);

  // Variantes con SKU nuevo para no chocar con la unicidad.
  const { data: variants } = await admin
    .from('product_variants')
    .select('size_label, weight_g, sku, price_cop, compare_at_price_cop, cost_cop, stock, sort_order')
    .eq('product_id', id)
    .order('sort_order');

  if (variants && variants.length) {
    const rows: Row[] = [];
    for (const variant of variants as Row[]) {
      const skuBase = text(variant.sku, 60) || 'IRIS-COPIA';
      let sku = `${skuBase}-C`;
      let attempt = 1;
      for (;;) {
        const { data: taken } = await admin
          .from('product_variants')
          .select('id')
          .eq('sku', sku)
          .limit(1);
        if (!taken || taken.length === 0) break;
        attempt += 1;
        sku = `${skuBase}-C${attempt}`;
        if (attempt > 30) {
          sku = `${skuBase}-C${Date.now().toString(36).toUpperCase().slice(-6)}`;
          break;
        }
      }

      rows.push({
        product_id: newId,
        size_label: variant.size_label,
        weight_g: variant.weight_g,
        sku,
        price_cop: variant.price_cop,
        compare_at_price_cop: variant.compare_at_price_cop ?? null,
        cost_cop: variant.cost_cop ?? 0,
        stock: 0,
        sort_order: variant.sort_order ?? 0,
        is_active: true,
      });
    }
    await admin.from('product_variants').insert(rows);
  }

  // Mismas colecciones que el original.
  const { data: links } = await admin
    .from('product_collections')
    .select('collection_id, sort_order')
    .eq('product_id', id);

  if (links && links.length) {
    await admin.from('product_collections').insert(
      (links as Row[]).map((link) => ({
        product_id: newId,
        collection_id: link.collection_id,
        sort_order: link.sort_order ?? 0,
      })),
    );
  }

  // Fotos: se re-suben los bytes al bucket para que cada producto sea dueño
  // de sus archivos (así borrar uno no rompe las fotos del otro).
  const { data: images } = await admin
    .from('product_images')
    .select('url, alt, sort_order')
    .eq('product_id', id)
    .order('sort_order');

  let copiedImages = 0;
  for (const image of (images ?? []) as Row[]) {
    const url = text(image.url);
    if (!url) continue;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const bytes = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const ext = contentType.includes('png')
        ? 'png'
        : contentType.includes('webp')
          ? 'webp'
          : contentType.includes('avif')
            ? 'avif'
            : 'jpg';
      const path = `${newId}/${Date.now().toString(36)}-${copiedImages}.${ext}`;

      const { error: uploadError } = await admin.storage
        .from('product-images')
        .upload(path, bytes, { contentType, cacheControl: '3600', upsert: false });
      if (uploadError) continue;

      const { data: publicUrl } = admin.storage.from('product-images').getPublicUrl(path);
      const { error: rowError } = await admin.from('product_images').insert({
        product_id: newId,
        url: publicUrl.publicUrl,
        alt: image.alt ?? null,
        sort_order: image.sort_order ?? 0,
      });
      if (!rowError) copiedImages += 1;
    } catch (error) {
      console.error('[products/duplicate] Imagen:', error);
    }
  }

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'product.duplicate',
    entity: 'products',
    entity_id: newId,
    payload: { from: id, name: baseName, slug },
  });

  return json({ ok: true, id: newId, slug, images: copiedImages }, 201);
};
