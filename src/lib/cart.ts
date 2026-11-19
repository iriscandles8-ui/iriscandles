import { collections } from '../data/collections';
import { estimateShipping, formatCOP, resolveSize, shipping, type ResolvedSize } from '../data/pricing';

export type CartItem = {
  sku: string;
  qty: number;
};

export type CartLine = {
  sku: string;
  qty: number;
  slug: string;
  collectionName: string;
  collectionNumber: string;
  aroma: string;
  accent: string;
  soft: string;
  size: ResolvedSize;
  unitPriceCop: number;
  lineTotalCop: number;
};

export type CartTotals = {
  itemCount: number;
  /** Subtotal antes del descuento. */
  subtotalCop: number;
  discountCop: number;
  shippingCop: number;
  totalCop: number;
  isFreeShipping: boolean;
  missingForFreeCop: number;
};

const STORAGE_KEY = 'iris.cart.v1';
const COUPON_KEY = 'iris.coupon.v1';
const MAX_QTY = 24;

/** Evento que se dispara en `window` cada vez que cambia el carrito. */
export const CART_EVENT = 'iris:cart-change';

type Variant = {
  slug: string;
  collectionName: string;
  collectionNumber: string;
  aroma: string;
  accent: string;
  soft: string;
  size: ResolvedSize;
};

/* --------------------- Catálogo inyectado en Base.astro --------------------- */

type CatalogEntry = {
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

let catalogBySku: Map<string, CatalogEntry> | null = null;

/**
 * Lee `#iris-catalog` (JSON serializado en Base.astro con el catálogo real de
 * Supabase). Si no está, el carrito usa las colecciones estáticas.
 */
function catalog(): Map<string, CatalogEntry> | null {
  if (catalogBySku) return catalogBySku;
  if (typeof document === 'undefined') return null;
  const node = document.getElementById('iris-catalog');
  if (!node?.textContent) return null;
  try {
    const parsed: unknown = JSON.parse(node.textContent);
    if (!Array.isArray(parsed)) return null;
    const map = new Map<string, CatalogEntry>();
    for (const entry of parsed) {
      if (entry && typeof entry === 'object' && typeof (entry as CatalogEntry).sku === 'string') {
        map.set((entry as CatalogEntry).sku, entry as CatalogEntry);
      }
    }
    catalogBySku = map;
    return map;
  } catch {
    return null;
  }
}

function findVariant(sku: string): Variant | null {
  const live = catalog();
  if (live) {
    // Catálogo inyectado presente: es la fuente de verdad. Un SKU que no
    // aparece (o sin precio) ya no está disponible.
    const entry = live.get(sku);
    if (!entry || entry.priceCop == null) return null;
    return {
      slug: entry.slug,
      collectionName: entry.name,
      collectionNumber: entry.number,
      aroma: entry.aroma,
      accent: entry.accent,
      soft: entry.soft,
      size: {
        label: entry.sizeLabel,
        weightG: entry.weightG,
        sku: entry.sku,
        priceCop: entry.priceCop,
        // El precio ya viene resuelto desde la base de datos.
        provisional: false,
      },
    };
  }

  for (const collection of collections) {
    for (const size of collection.sizes) {
      if (size.sku !== sku) continue;
      return {
        slug: collection.slug,
        collectionName: collection.name,
        collectionNumber: collection.number,
        aroma: collection.aroma,
        accent: collection.theme.accent,
        soft: collection.theme.soft,
        size: resolveSize(size),
      };
    }
  }
  return null;
}

function clampQty(value: unknown): number {
  const qty = Math.round(Number(value));
  if (!Number.isFinite(qty)) return 1;
  return Math.min(MAX_QTY, Math.max(1, qty));
}

/** Deja solo SKUs reales y cantidades válidas, sumando duplicados. */
function normalize(items: CartItem[]): CartItem[] {
  const merged = new Map<string, number>();

  for (const item of items) {
    if (!item || typeof item.sku !== 'string') continue;
    const variant = findVariant(item.sku);
    if (!variant || variant.size.priceCop === null) continue;
    const qty = clampQty(item.qty);
    merged.set(item.sku, Math.min(MAX_QTY, (merged.get(item.sku) ?? 0) + qty));
  }

  return Array.from(merged, ([sku, qty]) => ({ sku, qty }));
}

export function readCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalize(parsed as CartItem[]);
  } catch {
    return [];
  }
}

function persist(items: CartItem[]): CartItem[] {
  const next = normalize(items);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Modo privado o almacenamiento lleno: el carrito vive solo en esta página. */
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT, { detail: next }));
  return next;
}

export function addToCart(sku: string, qty = 1): CartItem[] {
  const items = readCart();
  const existing = items.find((item) => item.sku === sku);
  if (existing) existing.qty = clampQty(existing.qty + qty);
  else items.push({ sku, qty: clampQty(qty) });
  return persist(items);
}

export function setQty(sku: string, qty: number): CartItem[] {
  const items = readCart();
  if (qty <= 0) return removeFromCart(sku);
  const item = items.find((entry) => entry.sku === sku);
  if (item) item.qty = clampQty(qty);
  return persist(items);
}

export function removeFromCart(sku: string): CartItem[] {
  return persist(readCart().filter((item) => item.sku !== sku));
}

export function clearCart(): CartItem[] {
  try {
    window.localStorage.removeItem(COUPON_KEY);
  } catch {
    /* sin almacenamiento */
  }
  return persist([]);
}

export function countItems(items: CartItem[] = readCart()): number {
  return items.reduce((total, item) => total + item.qty, 0);
}

export function getLines(items: CartItem[] = readCart()): CartLine[] {
  return items.flatMap((item) => {
    const variant = findVariant(item.sku);
    if (!variant || variant.size.priceCop === null) return [];
    const unitPriceCop = variant.size.priceCop;

    return [
      {
        sku: item.sku,
        qty: item.qty,
        slug: variant.slug,
        collectionName: variant.collectionName,
        collectionNumber: variant.collectionNumber,
        aroma: variant.aroma,
        accent: variant.accent,
        soft: variant.soft,
        size: variant.size,
        unitPriceCop,
        lineTotalCop: unitPriceCop * item.qty,
      },
    ];
  });
}

export function getTotals(lines: CartLine[] = getLines(), discountCop = 0): CartTotals {
  const subtotalCop = lines.reduce((total, line) => total + line.lineTotalCop, 0);
  const discount = Math.min(subtotalCop, Math.max(0, Math.round(discountCop)));
  // El descuento se resta antes de calcular el envío y el umbral de envío gratis.
  const netSubtotal = subtotalCop - discount;
  const estimate = estimateShipping(netSubtotal);

  return {
    itemCount: lines.reduce((total, line) => total + line.qty, 0),
    subtotalCop,
    discountCop: discount,
    shippingCop: estimate.costCop,
    totalCop: netSubtotal + estimate.costCop,
    isFreeShipping: estimate.isFree,
    missingForFreeCop: estimate.missingForFreeCop,
  };
}

/* ------------------------------ Cupón aplicado ------------------------------ */

export type StoredCoupon = {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  label: string;
};

/** El cupón se guarda solo como descriptor: el importe se recalcula con el subtotal. */
export function readCoupon(): StoredCoupon | null {
  try {
    const raw = window.localStorage.getItem(COUPON_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredCoupon>;
    if (
      typeof parsed.code !== 'string' ||
      !parsed.code ||
      (parsed.type !== 'percent' && parsed.type !== 'fixed') ||
      !Number.isFinite(Number(parsed.value))
    ) {
      return null;
    }
    return {
      code: parsed.code,
      type: parsed.type,
      value: Number(parsed.value),
      label: typeof parsed.label === 'string' ? parsed.label : parsed.code,
    };
  } catch {
    return null;
  }
}

export function saveCoupon(coupon: StoredCoupon): void {
  try {
    window.localStorage.setItem(COUPON_KEY, JSON.stringify(coupon));
  } catch {
    /* Sin almacenamiento: el cupón vive solo en esta página. */
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT));
}

export function clearCoupon(): void {
  try {
    window.localStorage.removeItem(COUPON_KEY);
  } catch {
    /* sin almacenamiento */
  }
  window.dispatchEvent(new CustomEvent(CART_EVENT));
}

/** Escucha cambios del carrito (incluidos los de otras pestañas). */
export function onCartChange(handler: () => void): void {
  window.addEventListener(CART_EVENT, handler);
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) handler();
  });
}

export { formatCOP, shipping };
