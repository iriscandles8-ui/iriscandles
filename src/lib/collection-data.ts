import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  collections as staticCollections,
  type Collection,
  type OlfactoryNotes,
  type ProductSize,
} from '../data/collections';
import { PROVISIONAL_PRICES } from '../data/pricing';

/**
 * Capa de datos de colecciones.
 *
 * Las fotos de colección se leen de `collection_images` / bucket
 * `collection-images`. Nunca se toc `product_images`: las fotos individuales
 * de los productos son independientes y se gestionan desde el producto.
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

const strList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export type CollectionStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export type CollectionImageData = {
  id: string;
  url: string;
  alt: string;
  sortOrder: number;
};

export type CollectionProductData = {
  productId: string;
  name: string;
  slug: string;
  sku: string;
  sortOrder: number;
};

export type ManagedCollection = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  story: string;
  aroma: string;
  family: string;
  intensity: number;
  burnHours: string;
  notes: OlfactoryNotes;
  theme: { accent: string; soft: string; deep: string };
  number: string;
  sortOrder: number;
  status: CollectionStatus;
  publishAt: string | null;
  unpublishAt: string | null;
  isSeasonal: boolean;
  seasonLabel: string;
  isActive: boolean;
  heroImageUrl: string;
  images: CollectionImageData[];
  products: CollectionProductData[];
};

const DEFAULT_THEME = { accent: '#B85E37', soft: '#F3E9D6', deep: '#8F4526' };

function staticBySlug(slug: string): Collection | undefined {
  return staticCollections.find((item) => item.slug === slug);
}

function mapNotes(value: unknown, fallback: OlfactoryNotes): OlfactoryNotes {
  const source = asRow(value);
  const top = strList(source.top);
  const heart = strList(source.heart);
  const base = strList(source.base);
  return {
    top: top.length ? top : fallback.top,
    heart: heart.length ? heart : fallback.heart,
    base: base.length ? base : fallback.base,
  };
}

function mapTheme(value: unknown, fallback: { accent: string; soft: string; deep: string }) {
  const source = asRow(value);
  return {
    accent: text(source.accent, fallback.accent),
    soft: text(source.soft, fallback.soft),
    deep: text(source.deep, fallback.deep),
  };
}

function statusOf(value: unknown): CollectionStatus {
  switch (value) {
    case 'draft':
    case 'scheduled':
    case 'published':
    case 'archived':
      return value;
    default:
      return 'draft';
  }
}

/* ---------------------------- Panel (admin) ---------------------------- */

export async function getManagedCollections(
  supabase: SupabaseClient,
): Promise<ManagedCollection[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error || !data) return [];

  const ids = data.map((row) => text(asRow(row).id)).filter(Boolean);

  const [imagesResult, linksResult] = await Promise.all([
    ids.length
      ? supabase
          .from('collection_images')
          .select('id, collection_id, url, alt, sort_order')
          .in('collection_id', ids)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as Row[] }),
    ids.length
      ? supabase
          .from('product_collections')
          .select('collection_id, product_id, sort_order, products(id, slug, name, product_variants(sku))')
          .in('collection_id', ids)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  const imagesByCollection = new Map<string, CollectionImageData[]>();
  for (const row of (imagesResult.data ?? []) as Row[]) {
    const collectionId = text(row.collection_id);
    if (!collectionId) continue;
    const list = imagesByCollection.get(collectionId) ?? [];
    list.push({
      id: text(row.id),
      url: text(row.url),
      alt: text(row.alt),
      sortOrder: num(row.sort_order),
    });
    imagesByCollection.set(collectionId, list);
  }

  const productsByCollection = new Map<string, CollectionProductData[]>();
  for (const row of (linksResult.data ?? []) as Row[]) {
    const collectionId = text(row.collection_id);
    if (!collectionId) continue;
    const product = asRow(row.products);
    const variants = Array.isArray(product.product_variants)
      ? (product.product_variants as Row[])
      : [];
    const list = productsByCollection.get(collectionId) ?? [];
    list.push({
      productId: text(row.product_id),
      name: text(product.name, 'Producto'),
      slug: text(product.slug),
      sku: text(asRow(variants[0]).sku),
      sortOrder: num(row.sort_order),
    });
    productsByCollection.set(collectionId, list);
  }

  return (data as Row[]).map((row, index) => {
    const id = text(row.id);
    const slug = text(row.slug, `coleccion-${index + 1}`);
    const fallback = staticBySlug(slug);
    const theme = mapTheme(row.theme, fallback?.theme ?? DEFAULT_THEME);

    return {
      id,
      slug,
      name: text(row.name, fallback?.name ?? 'Nueva colección'),
      tagline: text(row.tagline, fallback?.tagline ?? ''),
      description: text(row.description, fallback?.description ?? ''),
      story: text(row.story, fallback?.story ?? ''),
      aroma: text(row.aroma, fallback?.aroma ?? ''),
      family: text(row.family, fallback?.family ?? ''),
      intensity: num(row.intensity, fallback?.intensity ?? 3),
      burnHours: text(row.burn_hours, fallback?.burnHours ?? ''),
      notes: mapNotes(row.notes, fallback?.notes ?? { top: [], heart: [], base: [] }),
      theme,
      number: text(row.number, fallback?.number ?? String(index + 1).padStart(2, '0')),
      sortOrder: num(row.sort_order, index),
      status: statusOf(row.status),
      publishAt: typeof row.publish_at === 'string' ? row.publish_at : null,
      unpublishAt: typeof row.unpublish_at === 'string' ? row.unpublish_at : null,
      isSeasonal: Boolean(row.is_seasonal),
      seasonLabel: text(row.season_label),
      isActive: Boolean(row.is_active),
      heroImageUrl: text(row.hero_image_url),
      images: (imagesByCollection.get(id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
      products: (productsByCollection.get(id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
    } satisfies ManagedCollection;
  });
}

export async function getManagedCollection(
  supabase: SupabaseClient,
  id: string,
): Promise<ManagedCollection | null> {
  const all = await getManagedCollections(supabase);
  return all.find((item) => item.id === id) ?? null;
}

/* ---------------------------- Tienda (público) ---------------------------- */

function publicClient(): SupabaseClient | null {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const isStoreDynamic = Boolean(
  import.meta.env.PUBLIC_SUPABASE_URL && import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
);

export async function getStoreCollections(): Promise<Collection[]> {
  const supabase = publicClient();
  if (!supabase) return staticCollections;

  // RLS devuelve solo colecciones publicadas y dentro de su ventana de fechas.
  const { data, error } = await supabase
    .from('collections')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error || !data || data.length === 0) return [];

  const ids = (data as Row[]).map((row) => text(row.id)).filter(Boolean);
  const [imagesResult, linksResult] = await Promise.all([
    ids.length
      ? supabase
          .from('collection_images')
          .select('collection_id, url, sort_order')
          .in('collection_id', ids)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as Row[] }),
    ids.length
      ? supabase
          .from('product_collections')
          .select(
            'collection_id, sort_order, products(id, product_variants(sku, size_label, weight_g, price_cop))',
          )
          .in('collection_id', ids)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  const imageByCollection = new Map<string, string>();
  for (const row of (imagesResult.data ?? []) as Row[]) {
    const id = text(row.collection_id);
    if (id && !imageByCollection.has(id)) imageByCollection.set(id, text(row.url));
  }

  const sizesByCollection = new Map<string, ProductSize[]>();
  for (const row of (linksResult.data ?? []) as Row[]) {
    const id = text(row.collection_id);
    if (!id) continue;
    const product = asRow(row.products);
    const variants = Array.isArray(product.product_variants)
      ? (product.product_variants as Row[])
      : [];
    const list = sizesByCollection.get(id) ?? [];
    for (const variant of variants) {
      const source = asRow(variant);
      const weightG = num(source.weight_g);
      const rawPrice = num(source.price_cop);
      list.push({
        label: text(source.size_label, `${weightG} g`),
        weightG,
        sku: text(source.sku),
        priceCop: rawPrice > 0 ? rawPrice : (PROVISIONAL_PRICES[weightG] ?? null),
      });
    }
    sizesByCollection.set(id, list);
  }

  return (data as Row[]).map((row, index) => {
    const id = text(row.id);
    const slug = text(row.slug);
    const fallback = staticBySlug(slug);
    const theme = mapTheme(row.theme, fallback?.theme ?? DEFAULT_THEME);
    const sizes = sizesByCollection.get(id) ?? fallback?.sizes ?? [];
    const hero = text(row.hero_image_url) || imageByCollection.get(id) || '';

    return {
      slug,
      name: text(row.name, fallback?.name ?? 'Colección'),
      aroma: text(row.aroma, fallback?.aroma ?? ''),
      tagline: text(row.tagline, fallback?.tagline ?? ''),
      description: text(row.description, fallback?.description ?? ''),
      story: text(row.story, fallback?.story ?? ''),
      family: text(row.family, fallback?.family ?? ''),
      intensity: num(row.intensity, fallback?.intensity ?? 3),
      burnHours: text(row.burn_hours, fallback?.burnHours ?? ''),
      notes: mapNotes(row.notes, fallback?.notes ?? { top: [], heart: [], base: [] }),
      sizes,
      theme,
      number: text(row.number, fallback?.number ?? String(index + 1).padStart(2, '0')),
      // Campo extra para que los componentes puedan mostrar la foto principal.
      ...(hero ? { heroImageUrl: hero } : {}),
    } as Collection;
  });
}

export async function getStoreCollectionBySlug(slug: string): Promise<Collection | null> {
  const all = await getStoreCollections();
  return all.find((item) => item.slug === slug) ?? null;
}
