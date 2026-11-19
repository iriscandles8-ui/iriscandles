import type { SupabaseClient } from '@supabase/supabase-js';

/* Utilidades compartidas por los endpoints de productos (/api/admin/products). */

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

export type Row = Record<string, unknown>;

export const asRow = (value: unknown): Row =>
  value && typeof value === 'object' ? (value as Row) : {};

export const text = (value: unknown, max = 2000): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export const bool = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

export const int = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);

export const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `producto-${Date.now().toString(36)}`;

/** Slug único: agrega `-2`, `-3`… hasta que deje de existir. */
export async function uniqueSlug(
  supabase: SupabaseClient,
  base: string,
  excludeId?: string,
): Promise<string> {
  let candidate = base;
  let attempt = 1;

  for (;;) {
    let query = supabase.from('products').select('id').eq('slug', candidate).limit(1);
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query;
    if (!data || data.length === 0) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt}`;
    if (attempt > 50) return `${base}-${Date.now().toString(36)}`;
  }
}

/** SKU único en toda la tabla (para crear y sincronizar variantes). */
export async function skuTaken(
  supabase: SupabaseClient,
  sku: string,
  excludeVariantId?: string,
): Promise<boolean> {
  let query = supabase
    .from('product_variants')
    .select('id')
    .eq('sku', sku)
    .limit(1);
  if (excludeVariantId) query = query.neq('id', excludeVariantId);
  const { data, error } = await query;
  if (error) return false;
  return Boolean(data && data.length > 0);
}

export const VALID_FAMILIES = new Set([
  'floral',
  'amaderado',
  'gourmand',
  'citrico',
  'fresco',
  'especiado',
  'frutal',
]);

export type VariantInput = {
  id?: string;
  size: string;
  weight: number;
  sku: string;
  price: number;
  cost: number;
  stock: number;
  active: boolean;
  sortOrder: number;
};

/**
 * Valida las variantes del payload. Devuelve el error o la lista limpia
 * (ordenada por peso, sin duplicados de tamaño).
 */
export async function parseVariants(
  supabase: SupabaseClient,
  raw: unknown,
  productId?: string,
): Promise<{ error?: string; variants?: VariantInput[] }> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: 'Agrega al menos un tamaño con precio.' };
  }
  if (raw.length > 6) return { error: 'Un producto puede tener máximo 6 tamaños.' };

  const variants: VariantInput[] = [];
  const seenSizes = new Set<string>();
  const seenSkus = new Set<string>();

  for (const entry of raw) {
    const row = asRow(entry);
    const size = text(row.size, 60);
    const weight = int(row.weight);
    const sku = text(row.sku, 60).toUpperCase();
    const price = int(row.price, -1);
    const stock = int(row.stock, 0);

    if (!size) return { error: 'Cada tamaño necesita un nombre (por ejemplo "120 g").' };
    if (weight <= 0) return { error: `El peso de "${size}" debe ser mayor a 0.` };
    if (!sku) return { error: `Falta el SKU de "${size}".` };
    if (price < 0) return { error: `El precio de "${size}" no es válido.` };
    if (stock < 0) return { error: `El stock de "${size}" no puede ser negativo.` };

    const sizeKey = size.toLowerCase();
    if (seenSizes.has(sizeKey)) return { error: `El tamaño "${size}" está repetido.` };
    seenSizes.add(sizeKey);

    const skuKey = sku.toUpperCase();
    if (seenSkus.has(skuKey)) return { error: `El SKU ${sku} está repetido.` };
    seenSkus.add(skuKey);

    const variantId = isUuid(row.id) ? text(row.id, 60) : undefined;
    if (variantId && (await skuTaken(supabase, sku, variantId))) {
      return { error: `El SKU ${sku} ya pertenece a otro producto.` };
    }
    if (!variantId && (await skuTaken(supabase, sku))) {
      return { error: `El SKU ${sku} ya pertenece a otro producto.` };
    }

    variants.push({
      id: variantId,
      size,
      weight,
      sku: skuKey,
      price,
      cost: Math.max(0, int(row.cost)),
      stock,
      active: row.active === undefined ? true : bool(row.active, true),
      sortOrder: int(row.sortOrder),
    });
  }

  variants.sort((a, b) => a.weight - b.weight || a.sortOrder - b.sortOrder);
  variants.forEach((variant, index) => {
    variant.sortOrder = index;
  });

  void productId;
  return { variants };
}

/** Sincroniza las variantes de un producto: actualiza, crea y retira. */
export async function syncVariants(
  supabase: SupabaseClient,
  productId: string,
  variants: VariantInput[],
): Promise<{ error?: string }> {
  const { data: currentRows, error: currentError } = await supabase
    .from('product_variants')
    .select('id, sku')
    .eq('product_id', productId);

  if (currentError) return { error: 'No se pudieron leer las variantes actuales.' };

  const current = (currentRows ?? []) as Row[];
  const keepIds = new Set(variants.filter((variant) => variant.id).map((variant) => variant.id));

  for (const variant of variants) {
    const payload = {
      size_label: variant.size,
      weight_g: variant.weight,
      sku: variant.sku,
      price_cop: variant.price,
      cost_cop: variant.cost,
      stock: variant.stock,
      is_active: variant.active,
      sort_order: variant.sortOrder,
    };

    if (variant.id) {
      const { error } = await supabase
        .from('product_variants')
        .update(payload)
        .eq('id', variant.id)
        .eq('product_id', productId);
      if (error) {
        if (error.code === '23505') return { error: `El SKU ${variant.sku} ya existe.` };
        return { error: 'No se pudo guardar una variante.' };
      }
    } else {
      const { error } = await supabase
        .from('product_variants')
        .insert({ ...payload, product_id: productId });
      if (error) {
        if (error.code === '23505') return { error: `El SKU ${variant.sku} ya existe.` };
        return { error: 'No se pudo crear una variante.' };
      }
    }
  }

  // Variantes que ya no están en el formulario.
  for (const row of current) {
    const variantId = text(row.id);
    if (!variantId || keepIds.has(variantId)) continue;

    const { count } = await supabase
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('variant_id', variantId);

    if ((count ?? 0) > 0) {
      // Tiene pedidos: se desactiva para no romper el historial.
      await supabase.from('product_variants').update({ is_active: false }).eq('id', variantId);
    } else {
      await supabase.from('product_variants').delete().eq('id', variantId);
    }
  }

  return {};
}

/** Reemplaza los vínculos producto ↔ colección. */
export async function syncCollectionLinks(
  supabase: SupabaseClient,
  productId: string,
  collectionIds: string[],
): Promise<{ error?: string }> {
  const valid: string[] = [];
  if (collectionIds.length) {
    const { data } = await supabase
      .from('collections')
      .select('id')
      .in('id', collectionIds);
    for (const row of (data ?? []) as Row[]) {
      const id = text(row.id);
      if (id) valid.push(id);
    }
  }

  const { error: deleteError } = await supabase
    .from('product_collections')
    .delete()
    .eq('product_id', productId);
  if (deleteError) return { error: 'No se pudieron actualizar las colecciones.' };

  if (valid.length) {
    const rows = valid.map((collectionId, index) => ({
      product_id: productId,
      collection_id: collectionId,
      sort_order: index,
    }));
    const { error } = await supabase.from('product_collections').insert(rows);
    if (error && error.code !== '23505') {
      return { error: 'No se pudieron asociar las colecciones.' };
    }
  }

  return {};
}

/** Borra las filas de imagen y sus archivos del bucket. */
export async function deleteImages(
  supabase: SupabaseClient,
  imageIds: string[],
): Promise<void> {
  if (!imageIds.length) return;

  const { data } = await supabase
    .from('product_images')
    .select('id, url')
    .in('id', imageIds);

  const rows = (data ?? []) as Row[];
  if (!rows.length) return;

  const paths: string[] = [];
  for (const row of rows) {
    const url = text(row.url);
    const marker = '/product-images/';
    const index = url.indexOf(marker);
    if (index >= 0) {
      paths.push(decodeURIComponent(url.slice(index + marker.length).split('?')[0]));
    }
  }
  if (paths.length) {
    await supabase.storage.from('product-images').remove(paths);
  }

  await supabase.from('product_images').delete().in('id', rows.map((row) => text(row.id)));
}
