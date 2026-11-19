import type { SupabaseClient } from '@supabase/supabase-js';

/* ------------------------------------------------------------------
   Biblioteca multimedia · tipos y consultas compartidas
   ------------------------------------------------------------------ */

/** Buckets existentes del proyecto (db/schema.sql y db/collections.sql). */
export const MEDIA_BUCKETS = {
  'product-images': 'Fotos de producto',
  'collection-images': 'Fotos de colección',
} as const;

export type MediaBucket = keyof typeof MEDIA_BUCKETS;

export const isMediaBucket = (value: unknown): value is MediaBucket =>
  typeof value === 'string' && value in MEDIA_BUCKETS;

/** Límite por archivo. El bucket público sigue aplicando su propio límite. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export type MediaUsageType = 'product' | 'collection' | 'collection-hero' | 'review';

export type MediaUsage = {
  type: MediaUsageType;
  id: string;
  name: string;
  href: string;
};

export type MediaAsset = {
  id: string;
  name: string;
  fileName: string;
  bucket: MediaBucket;
  path: string;
  url: string;
  alt: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
  usages: MediaUsage[];
};

export type MediaTargetProduct = {
  id: string;
  name: string;
  slug: string;
  collection: string;
};

export type MediaTargetCollection = {
  id: string;
  name: string;
  slug: string;
};

export type MediaTargets = {
  products: MediaTargetProduct[];
  collections: MediaTargetCollection[];
};

type Row = Record<string, unknown>;

const asRow = (value: unknown): Row =>
  value && typeof value === 'object' ? (value as Row) : {};

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);

/** Normaliza un nombre de archivo a un slug corto y seguro. */
export function sanitizeBaseName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'imagen';
}

/** Extensión derivada del MIME (se confía en el MIME, no en el nombre). */
export function extensionFor(mimeType: string, fileName = ''): string | null {
  if (ALLOWED_MIME[mimeType]) return ALLOWED_MIME[mimeType];
  const match = /\.([a-z0-9]+)$/i.exec(fileName);
  const ext = match?.[1]?.toLowerCase() ?? '';
  const byName: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', avif: 'avif' };
  return byName[ext] ?? null;
}

/**
 * Ruta canónica dentro del bucket. Incluye año/mes para evitar carpetas
 * planas gigantes y un sufijo aleatorio para no sobrescribir archivos.
 */
export function makeStoragePath(fileName: string, mimeType: string): string | null {
  const ext = extensionFor(mimeType, fileName);
  if (!ext) return null;
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const base = sanitizeBaseName(fileName);
  const suffix = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`)
    .replace(/-/g, '')
    .slice(0, 8);
  return `library/${period}/${base}-${suffix}.${ext}`;
}

/** Compara una URL guardada en products/collections con la ruta del asset. */
export function referencesPath(url: unknown, path: string): boolean {
  const value = text(url);
  if (!value || !path) return false;
  try {
    const decoded = decodeURIComponent(value);
    return decoded.includes(path) || value.includes(path);
  } catch {
    return value.includes(path);
  }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function mapAsset(row: Row, usages: MediaUsage[]): MediaAsset {
  return {
    id: text(row.id),
    name: text(row.name, 'Sin nombre'),
    fileName: text(row.file_name),
    bucket: isMediaBucket(row.bucket) ? row.bucket : 'product-images',
    path: text(row.path),
    url: text(row.url),
    alt: text(row.alt),
    mimeType: text(row.mime_type, 'image/jpeg'),
    sizeBytes: num(row.size_bytes),
    width: row.width == null ? null : num(row.width),
    height: row.height == null ? null : num(row.height),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at) || text(row.created_at),
    usages,
  };
}

/**
 * Devuelve los archivos de la biblioteca junto con todos los lugares donde
 * se usan. Las referencias se detectan por la ruta canónica, así que también
 * se encuentran URLs guardadas antes de existir la biblioteca.
 */
export async function getMediaAssets(supabase: SupabaseClient): Promise<MediaAsset[]> {
  const [assetsRes, imagesRes, collectionsRes, collectionImagesRes, reviewsRes] = await Promise.all([
    supabase.from('media_assets').select('*').order('created_at', { ascending: false }),
    supabase.from('product_images').select('product_id, url, products(id, name, slug)'),
    supabase.from('collections').select('id, name, slug, hero_image_url'),
    supabase
      .from('collection_images')
      .select('id, collection_id, url, collections(id, name, slug)'),
    supabase.from('reviews').select('id, photo_url, products(name)'),
  ]);

  if (assetsRes.error || !assetsRes.data) return [];

  const push = (usages: MediaUsage[], usage: MediaUsage) => {
    if (!usages.some((item) => item.type === usage.type && item.id === usage.id)) {
      usages.push(usage);
    }
  };

  return (assetsRes.data as Row[]).map((row) => {
    const assetPath = text(row.path);
    const usages: MediaUsage[] = [];

    // Fotos individuales de productos (bucket product-images).
    for (const raw of ((imagesRes.data ?? []) as Row[])) {
      if (!referencesPath(raw.url, assetPath)) continue;
      const product = asRow(raw.products);
      push(usages, {
        type: 'product',
        id: text(raw.product_id),
        name: text(product.name, 'Producto'),
        href: text(product.slug) ? `/producto/${text(product.slug)}` : '/admin/productos',
      });
    }

    // Galería de colecciones (bucket collection-images).
    for (const raw of ((collectionImagesRes.data ?? []) as Row[])) {
      if (!referencesPath(raw.url, assetPath)) continue;
      const collection = asRow(raw.collections);
      const slug = text(collection.slug);
      push(usages, {
        type: 'collection',
        id: text(raw.id), // id de collection_images, para poder quitar la referencia
        name: text(collection.name, 'Colección'),
        href: slug ? `/producto/${slug}` : '/admin/productos',
      });
    }

    // Foto principal de colección (collections.hero_image_url).
    for (const col of ((collectionsRes.data ?? []) as Row[])) {
      if (!referencesPath(col.hero_image_url, assetPath)) continue;
      const slug = text(col.slug);
      push(usages, {
        type: 'collection-hero',
        id: text(col.id),
        name: text(col.name, 'Colección'),
        href: slug ? `/producto/${slug}` : '/admin/productos',
      });
    }

    // Fotos de reseñas (también cuentan para no borrar un archivo en uso).
    for (const review of ((reviewsRes.data ?? []) as Row[])) {
      if (!referencesPath(review.photo_url, assetPath)) continue;
      const product = asRow(review.products);
      push(usages, {
        type: 'review',
        id: text(review.id),
        name: `Reseña · ${text(product.name, 'Producto')}`,
        href: '/admin/resenas',
      });
    }

    return mapAsset(row, usages);
  });
}

/** Catálogo real para el selector "Reutilizar en…". */
export async function getMediaTargets(supabase: SupabaseClient): Promise<MediaTargets> {
  const [productsRes, collectionsRes] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, slug, collections(name)')
      .order('name'),
    supabase.from('collections').select('id, name, slug').order('name'),
  ]);

  const products = ((productsRes.data ?? []) as Row[]).map((row) => ({
    id: text(row.id),
    name: text(row.name),
    slug: text(row.slug),
    collection: text(asRow(row.collections).name, 'Sin colección'),
  }));

  const collections = ((collectionsRes.data ?? []) as Row[]).map((row) => ({
    id: text(row.id),
    name: text(row.name),
    slug: text(row.slug),
  }));

  return { products, collections };
}
