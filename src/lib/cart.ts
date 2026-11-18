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
  subtotalCop: number;
  shippingCop: number;
  totalCop: number;
  isFreeShipping: boolean;
  missingForFreeCop: number;
};

const STORAGE_KEY = 'iris.cart.v1';
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

function findVariant(sku: string): Variant | null {
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

export function getTotals(lines: CartLine[] = getLines()): CartTotals {
  const subtotalCop = lines.reduce((total, line) => total + line.lineTotalCop, 0);
  const estimate = estimateShipping(subtotalCop);

  return {
    itemCount: lines.reduce((total, line) => total + line.qty, 0),
    subtotalCop,
    shippingCop: estimate.costCop,
    totalCop: subtotalCop + estimate.costCop,
    isFreeShipping: estimate.isFree,
    missingForFreeCop: estimate.missingForFreeCop,
  };
}

/** Escucha cambios del carrito (incluidos los de otras pestañas). */
export function onCartChange(handler: () => void): void {
  window.addEventListener(CART_EVENT, handler);
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) handler();
  });
}

export { formatCOP, shipping };
