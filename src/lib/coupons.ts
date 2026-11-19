/**
 * Lógica pura de cupones, compartida entre carrito (navegador) y checkout
 * (servidor). No accede a base de datos: la validación de existencia se hace
 * en `coupon-lookup.ts`, siempre desde el servidor con service role.
 */
import { formatCOP } from '../data/pricing';

export type CouponType = 'percent' | 'fixed';

export type CouponRecord = {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minTotalCop: number;
  startsAt: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  isActive: boolean;
};

export type AppliedCoupon = {
  code: string;
  type: CouponType;
  value: number;
  label: string;
};

/** Descuento en COP, nunca mayor que el subtotal ni negativo. */
export function couponDiscountCop(
  coupon: Pick<CouponRecord, 'type' | 'value'>,
  subtotalCop: number,
): number {
  const gross = Math.max(0, Math.round(subtotalCop));
  const raw = coupon.type === 'percent' ? (gross * coupon.value) / 100 : coupon.value;
  return Math.min(gross, Math.max(0, Math.round(raw)));
}

export function couponLabel(coupon: Pick<CouponRecord, 'code' | 'type' | 'value'>): string {
  const amount = coupon.type === 'percent' ? `${coupon.value}%` : formatCOP(coupon.value);
  return `${coupon.code} · ${amount}`;
}

/** Todas las condiciones configurables del cupón, sin tocar la base de datos. */
export function couponValidationError(
  coupon: CouponRecord,
  subtotalCop: number,
  now: Date = new Date(),
): string | null {
  if (!coupon.isActive) return 'Este cupón está inactivo.';
  if (coupon.startsAt && now.getTime() < Date.parse(coupon.startsAt)) {
    return 'Este cupón todavía no está vigente.';
  }
  if (coupon.expiresAt && now.getTime() > Date.parse(coupon.expiresAt)) {
    return 'Este cupón venció.';
  }
  if (subtotalCop < coupon.minTotalCop) {
    return `La compra mínima para este cupón es ${formatCOP(coupon.minTotalCop)}.`;
  }
  if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) {
    return 'Se agotaron los usos disponibles de este cupón.';
  }
  if (couponDiscountCop(coupon, subtotalCop) <= 0) {
    return 'Este cupón no genera descuento sobre el subtotal actual.';
  }
  return null;
}
