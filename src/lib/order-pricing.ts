import { collections } from '../data/collections';
import { estimateShipping, resolveSize } from '../data/pricing';

/**
 * Cálculo de pedidos del lado del servidor.
 * Nunca confía en los precios que envía el navegador: busca el SKU en el
 * catálogo, resuelve el precio real y vuelve a sumar subtotal, envío y total.
 */

export const MAX_ITEM_QTY = 24;
export const MAX_TOTAL_UNITS = 60;

export type IncomingOrderItem = {
  sku?: unknown;
  qty?: unknown;
};

export type PricedOrderItem = {
  sku: string;
  productName: string;
  sizeLabel: string;
  unitPriceCop: number;
  quantity: number;
  subtotalCop: number;
};

export type PricedOrder = {
  items: PricedOrderItem[];
  subtotalCop: number;
  shippingCop: number;
  totalCop: number;
  totalUnits: number;
};

type CatalogVariant = {
  sku: string;
  productName: string;
  sizeLabel: string;
  weightG: number;
  unitPriceCop: number;
};

export function findCatalogVariant(sku: string): CatalogVariant | null {
  for (const collection of collections) {
    for (const size of collection.sizes) {
      if (size.sku !== sku) continue;
      const resolved = resolveSize(size);
      if (resolved.priceCop === null) continue;
      return {
        sku,
        productName: collection.name,
        sizeLabel: size.label,
        weightG: size.weightG,
        unitPriceCop: resolved.priceCop,
      };
    }
  }
  return null;
}

type PriceResult = { ok: true; order: PricedOrder } | { ok: false; error: string };

export function priceOrderItems(rawItems: unknown): PriceResult {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: 'Tu carrito está vacío.' };
  }

  const merged = new Map<string, number>();

  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== 'object') {
      return { ok: false, error: 'Hay un producto inválido en el carrito.' };
    }
    const item = rawItem as IncomingOrderItem;
    if (typeof item.sku !== 'string' || !item.sku.trim()) {
      return { ok: false, error: 'Hay un producto inválido en el carrito.' };
    }
    const sku = item.sku.trim();
    const qty = Math.round(Number(item.qty));
    if (!Number.isFinite(qty) || qty < 1) {
      return { ok: false, error: 'Hay una cantidad inválida en el carrito.' };
    }
    merged.set(sku, (merged.get(sku) ?? 0) + Math.min(MAX_ITEM_QTY, qty));
  }

  const items: PricedOrderItem[] = [];

  for (const [sku, qty] of merged) {
    const variant = findCatalogVariant(sku);
    if (!variant) {
      return {
        ok: false,
        error: 'Uno de los productos ya no está disponible. Actualiza tu carrito e inténtalo de nuevo.',
      };
    }

    const quantity = Math.min(MAX_ITEM_QTY, qty);
    items.push({
      sku,
      productName: variant.productName,
      sizeLabel: variant.sizeLabel,
      unitPriceCop: variant.unitPriceCop,
      quantity,
      subtotalCop: variant.unitPriceCop * quantity,
    });
  }

  if (items.length === 0) {
    return { ok: false, error: 'Tu carrito está vacío.' };
  }

  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  if (totalUnits > MAX_TOTAL_UNITS) {
    return {
      ok: false,
      error: `El máximo es ${MAX_TOTAL_UNITS} unidades por pedido. Para eventos, escríbenos para una cotización.`,
    };
  }

  const subtotalCop = items.reduce((sum, item) => sum + item.subtotalCop, 0);
  const shipping = estimateShipping(subtotalCop);

  return {
    ok: true,
    order: {
      items,
      subtotalCop,
      shippingCop: shipping.costCop,
      totalCop: subtotalCop + shipping.costCop,
      totalUnits,
    },
  };
}
