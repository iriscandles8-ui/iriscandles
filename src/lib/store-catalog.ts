import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  collections as staticCollections,
  type OlfactoryNotes,
  type ProductSize,
} from '../data/collections';
import { PROVISIONAL_PRICES } from '../data/pricing';

/**
 * Catálogo público de productos (tienda y ficha de producto).
 *
 * Lee de Supabase con la clave anónima: RLS devuelve únicamente productos
 * activos, no archivados y con variantes activas. Si la base aún no tiene
 * productos (o no está configurada), el catálogo se deriva de los datos
 * estáticos para que la tienda nunca quede vacía.
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

const DEFAULT_THEME = { accent: '#B85E37', soft: '#F3E9D6', deep: '#8F4526' };

export type StoreVariant = {
  id: string;
  label: string;
  weightG: number;
  sku: string;
  priceCop: number | null;
  stock: number;
};

export type StoreImage = {
  url: string;
  alt: string;
};

export type StoreProduct = {
  id: string;
  slug: string;
  name: string;
  aroma: string;
  tagline: string;
  description: string;
  story: string;
  family: string;
  intensity: number;
  burnHours: string;
  notes: OlfactoryNotes;
  theme: { accent: string; soft: string; deep: string };
  number: string;
  /** Forma `Collection` para que las tarjetas y el carrito sigan funcionando. */
  sizes: ProductSize[];
  variants: StoreVariant[];
  images: StoreImage[];
  heroImageUrl: string;
  collections: { slug: string; name: string }[];
  isFeatured: boolean;
  isNew: boolean;
  sortOrder: number;
};

function publicClient(): SupabaseClient | null {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapTheme(value: unknown, fallback: { accent: string; soft: string; deep: string }) {
  const source = asRow(value);
  if (!text(source.accent)) return fallback;
  return {
    accent: text(source.accent, fallback.accent),
    soft: text(source.soft, fallback.soft),
    deep: text(source.deep, fallback.deep),
  };
}

function staticBySlug(slug: string) {
  return staticCollections.find((item) => item.slug === slug);
}

function priceFor(weightG: number, priceCop: number): number | null {
  if (priceCop > 0) return priceCop;
  return PROVISIONAL_PRICES[weightG] ?? null;
}

/* ---------------------------- Tienda (público) ---------------------------- */

/** Caché corto por instancia: evita repetir la consulta en cada render. */
const CACHE_TTL_MS = 15_000;
let productsCache: { at: number; items: StoreProduct[] } | null = null;

const PRODUCT_SELECT =
  'id, slug, name, aroma, tagline, short_description, description, story, family, intensity, ' +
  'burn_hours, notes_top, notes_heart, notes_base, theme, is_featured, is_new, sort_order, ' +
  'product_images(url, alt, sort_order), ' +
  'product_variants(id, size_label, weight_g, sku, price_cop, stock, sort_order), ' +
  'product_collections(sort_order, collections(slug, name))';

function mapProductRow(row: Row, index: number): StoreProduct {
  const slug = text(row.slug, `producto-${index + 1}`);
  const fallback = staticBySlug(slug);

  const links = Array.isArray(row.product_collections)
    ? (row.product_collections as Row[])
    : [];
  const firstLink = links
    .slice()
    .sort((a, b) => num(a.sort_order) - num(b.sort_order))[0];
  const linkedCollection = asRow(firstLink?.collections);

  const images = (Array.isArray(row.product_images) ? (row.product_images as Row[]) : [])
    .map((image) => ({
      url: text(image.url),
      alt: text(image.alt, text(row.name)),
      sortOrder: num(image.sort_order),
    }))
    .filter((image) => image.url)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ url, alt }) => ({ url, alt }));

  const variants: StoreVariant[] = (
    Array.isArray(row.product_variants) ? (row.product_variants as Row[]) : []
  )
    .map((variant) => {
      const weightG = num(variant.weight_g);
      const rawPrice = num(variant.price_cop);
      return {
        id: text(variant.id),
        label: text(variant.size_label, `${weightG} g`),
        weightG,
        sku: text(variant.sku),
        priceCop: priceFor(weightG, rawPrice),
        stock: Math.max(0, num(variant.stock)),
      };
    })
    .filter((variant) => variant.sku)
    .sort((a, b) => a.weightG - b.weightG);

  const notes: OlfactoryNotes = {
    top: strList(row.notes_top).length ? strList(row.notes_top) : (fallback?.notes.top ?? []),
    heart: strList(row.notes_heart).length ? strList(row.notes_heart) : (fallback?.notes.heart ?? []),
    base: strList(row.notes_base).length ? strList(row.notes_base) : (fallback?.notes.base ?? []),
  };

  const burnHours = num(row.burn_hours, 0);
  const heroImageUrl = images[0]?.url ?? '';

  return {
    id: text(row.id, slug),
    slug,
    name: text(row.name, fallback?.name ?? 'Vela'),
    aroma: text(row.aroma, fallback?.aroma ?? ''),
    tagline: text(row.tagline, fallback?.tagline ?? ''),
    description: text(row.description, fallback?.description ?? ''),
    story: text(row.story, fallback?.story ?? ''),
    family: text(row.family, fallback?.family ?? ''),
    intensity: num(row.intensity, fallback?.intensity ?? 3),
    burnHours: burnHours > 0 ? `${burnHours} h` : (fallback?.burnHours ?? ''),
    notes,
    theme: mapTheme(row.theme, fallback?.theme ?? DEFAULT_THEME),
    number: text(linkedCollection.number) || fallback?.number || '',
    sizes: variants.map((variant) => ({
      label: variant.label,
      weightG: variant.weightG,
      sku: variant.sku,
      priceCop: variant.priceCop,
    })),
    variants,
    images,
    heroImageUrl,
    collections: links
      .map((link) => {
        const collection = asRow(link.collections);
        return { slug: text(collection.slug), name: text(collection.name) };
      })
      .filter((collection) => collection.slug),
    isFeatured: Boolean(row.is_featured),
    isNew: Boolean(row.is_new),
    sortOrder: num(row.sort_order, index),
  };
}

/** Catálogo de respaldo cuando la base aún no tiene productos. */
function staticProducts(): StoreProduct[] {
  return staticCollections.map((collection, index) => {
    const variants: StoreVariant[] = collection.sizes.map((size) => ({
      id: `${collection.slug}-${size.weightG}`,
      label: size.label,
      weightG: size.weightG,
      sku: size.sku,
      priceCop: size.priceCop ?? PROVISIONAL_PRICES[size.weightG] ?? null,
      // Sin datos de stock en el modo estático: no marcar como agotado.
      stock: 999,
    }));

    return {
      id: collection.slug,
      slug: collection.slug,
      name: collection.name,
      aroma: collection.aroma,
      tagline: collection.tagline,
      description: collection.description,
      story: collection.story,
      family: collection.family,
      intensity: collection.intensity,
      burnHours: collection.burnHours,
      notes: collection.notes,
      theme: collection.theme,
      number: collection.number,
      sizes: collection.sizes,
      variants,
      images: collection.heroImageUrl ? [{ url: collection.heroImageUrl, alt: collection.name }] : [],
      heroImageUrl: collection.heroImageUrl ?? '',
      collections: [{ slug: collection.slug, name: collection.name }],
      isFeatured: index < 2,
      isNew: index === 2,
      sortOrder: index,
    } satisfies StoreProduct;
  });
}

/**
 * Productos visibles en la tienda, ordenados para aparecer en la tienda.
 * Si la consulta falla o no hay filas, se usa el catálogo estático.
 */
export async function getStoreProducts(): Promise<StoreProduct[]> {
  if (productsCache && Date.now() - productsCache.at < CACHE_TTL_MS) {
    return productsCache.items;
  }

  const supabase = publicClient();
  if (!supabase) return staticProducts();

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error || !data || data.length === 0) {
    const fallback = staticProducts();
    productsCache = { at: Date.now(), items: fallback };
    return fallback;
  }

  const items = (data as Row[]).map((row, index) => mapProductRow(row, index));
  productsCache = { at: Date.now(), items };
  return items;
}

/** Un producto por slug (o null si no existe / no está publicado). */
export async function getStoreProduct(slug: string): Promise<StoreProduct | null> {
  const products = await getStoreProducts();
  return products.find((product) => product.slug === slug) ?? null;
}

/** Productos destacados para portada y secciones destacadas. */
export async function getFeaturedStoreProducts(limit = 4): Promise<StoreProduct[]> {
  const products = await getStoreProducts();
  const featured = products.filter((product) => product.isFeatured);
  return (featured.length ? featured : products).slice(0, limit);
}

/* ------------------------- Catálogo para el carrito ------------------------- */

export type CartCatalogEntry = {
  sku: string;
  slug: string;
  name: string;
  number: string;
  aroma: string;
  accent: string;
  soft: string;
  sizeLabel: string;
  weightG: number;
  priceCop: number | null;
  stock: number;
};

/**
 * Catálogo compacto (por SKU) que se inyecta en `Base.astro` como JSON para
 * que el carrito del navegador resuelva nombre, tema y precio sin consulta.
 * Si el precio es `null` el SKU no está disponible.
 */
export async function getCartCatalog(): Promise<CartCatalogEntry[]> {
  const products = await getStoreProducts();
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      sku: variant.sku,
      slug: product.slug,
      name: product.name,
      number: product.number,
      aroma: product.aroma,
      accent: product.theme.accent,
      soft: product.theme.soft,
      sizeLabel: variant.label,
      weightG: variant.weightG,
      priceCop: variant.priceCop,
      stock: variant.stock,
    })),
  );
}
