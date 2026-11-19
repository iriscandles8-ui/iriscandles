/**
 * Búsqueda y validación de cupones en servidor.
 * La tabla `coupons` no tiene acceso público (RLS): solo se lee con service
 * role desde un endpoint, nunca desde el navegador.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { demoPromos } from '../data/admin-demo';
import {
  couponDiscountCop,
  couponLabel,
  couponValidationError,
  type AppliedCoupon,
  type CouponRecord,
} from './coupons';

const normalizeCode = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toUpperCase().slice(0, 40) : '';

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asNullableNumber = (value: unknown): number | null =>
  value === undefined || value === null ? null : asNumber(value);

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Cupones del panel demo, limitados a los tipos que el checkout sabe aplicar. */
const demoCoupons = (): CouponRecord[] =>
  demoPromos.flatMap((promo): CouponRecord[] => {
    if (promo.type !== 'percent' && promo.type !== 'fixed') return [];
    return [
      {
        id: promo.id,
        code: promo.code,
        type: promo.type,
        value: promo.value,
        minTotalCop: promo.minTotal,
        startsAt: promo.startsAt,
        expiresAt: promo.endsAt,
        maxUses: promo.maxUses,
        uses: promo.uses,
        isActive: promo.active,
      },
    ];
  });

export type CouponLookupResult =
  | { ok: true; coupon: AppliedCoupon; record: CouponRecord; discountCop: number }
  | { ok: false; error: string };

export async function lookupCoupon(
  rawCode: unknown,
  subtotalCop: number,
  admin: SupabaseClient | null,
): Promise<CouponLookupResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: 'Escribe un código de descuento.' };
  if (!/^[A-Z0-9_-]+$/.test(code)) {
    return { ok: false, error: 'El código solo puede tener letras, números, guiones y guiones bajos.' };
  }

  let record: CouponRecord | undefined;

  if (admin) {
    const { data, error } = await admin
      .from('coupons')
      .select('id, code, type, value, min_total_cop, starts_at, expires_at, max_uses, uses, is_active')
      .eq('code', code)
      .maybeSingle();

    if (error) return { ok: false, error: 'No pudimos validar el cupón. Inténtalo de nuevo.' };
    if (!data) return { ok: false, error: 'Ese código de descuento no existe.' };

    const row = data as Record<string, unknown>;
    const type = asText(row.type) === 'fixed' ? 'fixed' : 'percent';
    record = {
      id: asText(row.id),
      code: asText(row.code),
      type,
      value: asNumber(row.value),
      minTotalCop: asNumber(row.min_total_cop),
      startsAt: asText(row.starts_at) || null,
      expiresAt: asText(row.expires_at) || null,
      maxUses: asNullableNumber(row.max_uses),
      uses: asNumber(row.uses),
      isActive: row.is_active !== false,
    };
  } else {
    record = demoCoupons().find((coupon) => coupon.code === code);
    if (!record) return { ok: false, error: 'Ese código de descuento no existe.' };
  }

  const invalidReason = couponValidationError(record, subtotalCop);
  if (invalidReason) return { ok: false, error: invalidReason };

  return {
    ok: true,
    coupon: {
      code: record.code,
      type: record.type,
      value: record.value,
      label: couponLabel(record),
    },
    record,
    discountCop: couponDiscountCop(record, subtotalCop),
  };
}

/** Incrementa los usos solo si nadie más agotó el cupón mientras se pagaba. */
export async function registerCouponUse(
  admin: SupabaseClient | null,
  record: CouponRecord,
): Promise<void> {
  if (!admin) return;
  await admin
    .from('coupons')
    .update({ uses: record.uses + 1 })
    .eq('id', record.id)
    .eq('uses', record.uses);
}
