import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Datos del catálogo para el panel (incluye borradores y archivados).
 * Los endpoints de escritura usan la service role; esta capa sirve para
 * renderizar la página, que valida la sesión con RLS del personal.
 */

type Row = Record<string, unknown>;

const asRow = (value: unknown): Row =>
  value && typeof value === 'object' ? (value as Row) : {};

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export type AdminProductVariant = {
  id: string;
  size: string;
  weight: number;
  sku: string;
  price: number;
  cost: number;
  stock: number;
  active: boolean;
  sortOrder: number;
};

export type AdminProductImage = {
  id: string;
  url: string;
  alt: string;
  sortOrder: number;
};

export type AdminProductCollectionLink = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

export type AdminProduct = {
  id: string;
  slug: string;
  name: string;
  aroma: string;
  tagline: string;
  shortDescription: string;
  description: string;
  family: string;
  intensity: number;
  status: 'active' | 'draft';
  archived: boolean;
  isFeatured: boolean;
  isNew: boolean;
  sortOrder: number;
  collections: AdminProductCollectionLink[];
  variants: AdminProductVariant[];
  images: AdminProductImage[];
  updatedAt: string;
};

const PRODUCT_SELECT =
  'id, slug, name, aroma, tagline, short_description, description, family, intensity, ' +
  'is_active, archived_at, is_featured, is_new, sort_order, updated_at, ' +
  'product_collections(collection_id, sort_order, collections(id, name, slug)), ' +
  'product_variants(id, size_label, weight_g, sku, price_cop, cost_cop, stock, is_active, sort_order), ' +
  'product_images(id, url, alt, sort_order)';

export async function getAdminProducts(supabase: SupabaseClient): Promise<AdminProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error || !data) {
    if (error) console.error('[admin-products] No se pudo leer el catálogo:', error.code);
    return [];
  }

  return (data as Row[]).map((row) => {
    const links = Array.isArray(row.product_collections)
      ? (row.product_collections as Row[])
      : [];

    return {
      id: text(row.id),
      slug: text(row.slug),
      name: text(row.name),
      aroma: text(row.aroma),
      tagline: text(row.tagline),
      shortDescription: text(row.short_description),
      description: text(row.description),
      family: text(row.family),
      intensity: num(row.intensity, 3),
      status: row.is_active ? 'active' : 'draft',
      archived: row.archived_at != null,
      isFeatured: Boolean(row.is_featured),
      isNew: Boolean(row.is_new),
      sortOrder: num(row.sort_order),
      collections: links
        .map((link) => {
          const collection = asRow(link.collections);
          return {
            id: text(collection.id) || text(link.collection_id),
            name: text(collection.name),
            slug: text(collection.slug),
            sortOrder: num(link.sort_order),
          };
        })
        .filter((collection) => collection.id)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      variants: (Array.isArray(row.product_variants) ? (row.product_variants as Row[]) : [])
        .map((variant) => ({
          id: text(variant.id),
          size: text(variant.size_label),
          weight: num(variant.weight_g),
          sku: text(variant.sku),
          price: num(variant.price_cop),
          cost: num(variant.cost_cop),
          stock: num(variant.stock),
          active: Boolean(variant.is_active),
          sortOrder: num(variant.sort_order),
        }))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.weight - b.weight),
      images: (Array.isArray(row.product_images) ? (row.product_images as Row[]) : [])
        .map((image) => ({
          id: text(image.id),
          url: text(image.url),
          alt: text(image.alt),
          sortOrder: num(image.sort_order),
        }))
        .filter((image) => image.url)
        .sort((a, b) => a.sortOrder - b.sortOrder),
      updatedAt: text(row.updated_at),
    } satisfies AdminProduct;
  });
}
