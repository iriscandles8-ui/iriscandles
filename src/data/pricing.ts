import { collections, type Collection, type ProductSize } from './collections';

/**
 * Precios de referencia por tamaño, en pesos colombianos con IVA incluido.
 *
 * Mientras `ProductSize.priceCop` sea `null`, el sitio usa estos valores y marca
 * el precio como provisional. Cuando la marca defina los precios definitivos,
 * basta con llenar `priceCop` en `src/data/collections.ts`: el aviso desaparece
 * y estos valores dejan de usarse.
 */
export const PROVISIONAL_PRICES: Record<number, number> = {
  120: 89000,
  220: 139000,
};

export const shipping = {
  /** Subtotal desde el cual el envío es gratis. */
  freeFromCop: 180000,
  /** Tarifa plana estimada mientras no haya cálculo por transportadora. */
  flatCop: 12900,
  etaLabel: '1–3 días hábiles',
  carrier: 'Envía',
  freeCitiesNote: 'Aplica en ciudades principales',
} as const;

export type ResolvedSize = ProductSize & {
  priceCop: number | null;
  /** `true` cuando el precio viene de `PROVISIONAL_PRICES`. */
  provisional: boolean;
};

export function resolveSize(size: ProductSize): ResolvedSize {
  const priceCop = size.priceCop ?? PROVISIONAL_PRICES[size.weightG] ?? null;
  return { ...size, priceCop, provisional: size.priceCop === null };
}

export function resolveSizes(collection: Collection): ResolvedSize[] {
  return collection.sizes.map(resolveSize);
}

/** Precio más bajo disponible en una colección, para las tarjetas del catálogo. */
export function fromPrice(collection: Collection): number | null {
  const prices = resolveSizes(collection)
    .map((size) => size.priceCop)
    .filter((price): price is number => price !== null);
  return prices.length > 0 ? Math.min(...prices) : null;
}

/** `true` si algún tamaño del catálogo sigue usando precios de referencia. */
export const pricesAreProvisional = collections.some((collection) =>
  collection.sizes.some((size) => size.priceCop === null),
);

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export const formatCOP = (value: number): string => cop.format(value).replace(/\s/g, ' ');

export type ShippingEstimate = {
  costCop: number;
  isFree: boolean;
  missingForFreeCop: number;
};

export function estimateShipping(subtotalCop: number): ShippingEstimate {
  const isFree = subtotalCop >= shipping.freeFromCop;
  return {
    costCop: isFree ? 0 : shipping.flatCop,
    isFree,
    missingForFreeCop: Math.max(0, shipping.freeFromCop - subtotalCop),
  };
}
