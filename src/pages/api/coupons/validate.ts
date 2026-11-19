import type { APIRoute } from 'astro';
import { lookupCoupon } from '../../../lib/coupon-lookup';
import { createSupabaseAdmin } from '../../../lib/supabase-admin';
import { isDemoMode } from '../../../lib/admin';

export const prerender = false;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

export const POST: APIRoute = async ({ request }) => {
  const admin = await createSupabaseAdmin();
  if (!admin && !isDemoMode) {
    return json(
      { ok: false, error: 'La validación de cupones no está disponible en este momento.' },
      503,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'No pudimos leer los datos.' }, 400);
  }

  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const subtotalRaw = Number(body.subtotalCop);
  if (!Number.isFinite(subtotalRaw) || subtotalRaw < 0 || subtotalRaw > 100_000_000) {
    return json({ ok: false, error: 'El subtotal del carrito no es válido.' }, 400);
  }

  const result = await lookupCoupon(body.code, Math.round(subtotalRaw), admin);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);

  return json({
    ok: true,
    coupon: result.coupon,
    discountCop: result.discountCop,
  });
};
