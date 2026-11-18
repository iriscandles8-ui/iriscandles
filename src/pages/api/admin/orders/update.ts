import type { APIRoute } from 'astro';
import { getAdminActor } from '../../../../lib/admin-auth';
import { mapOrderRow, ORDER_SELECT } from '../../../../lib/admin-data';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

export const prerender = false;

const ORDER_STATUSES = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
] as const;

const PAYMENT_STATUSES = ['pending', 'approved', 'declined', 'voided', 'error'] as const;

type OrderStatus = (typeof ORDER_STATUSES)[number];
type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

type Row = Record<string, unknown>;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

const asRow = (value: unknown): Row =>
  value && typeof value === 'object' ? (value as Row) : {};

const text = (value: unknown, max = 200): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const optionalText = (value: unknown, max = 300): string | null => {
  if (value === null) return null;
  const parsed = text(value, max);
  return parsed || null;
};

const isOrderStatus = (value: unknown): value is OrderStatus =>
  typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);

const isPaymentStatus = (value: unknown): value is PaymentStatus =>
  typeof value === 'string' && (PAYMENT_STATUSES as readonly string[]).includes(value);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Descuenta stock una sola vez, cuando el pago pasa a "aprobado".
 * La condición `.neq('payment_status', 'approved')` del update principal
 * garantiza que dos clics simultáneos no descuenten dos veces.
 */
async function decrementStock(
  admin: Awaited<ReturnType<typeof createSupabaseAdmin>>,
  orderId: string,
  orderNumber: string,
  userId: string,
) {
  if (!admin) return;

  const { data: items } = await admin
    .from('order_items')
    .select('variant_id, quantity')
    .eq('order_id', orderId)
    .not('variant_id', 'is', null);

  for (const row of items ?? []) {
    const item = asRow(row);
    const variantId = text(item.variant_id);
    const quantity = Math.max(0, Number(item.quantity) || 0);
    if (!variantId || quantity === 0) continue;

    const { data: variant } = await admin
      .from('product_variants')
      .select('stock')
      .eq('id', variantId)
      .maybeSingle();

    if (!variant) continue;

    const nextStock = Math.max(0, Number(variant.stock) - quantity);
    await admin.from('product_variants').update({ stock: nextStock }).eq('id', variantId);
    await admin.from('stock_movements').insert({
      variant_id: variantId,
      type: 'out',
      quantity,
      reason: `Pedido ${orderNumber}`,
      created_by: userId,
    });
  }
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const actor = await getAdminActor({ request, cookies });
  if (!actor) {
    return json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }, 401);
  }
  if (!actor.canWriteOrders) {
    return json({ error: 'No tienes permiso para modificar pedidos.' }, 403);
  }

  const admin = await createSupabaseAdmin();
  if (!admin) {
    return json({ error: 'Supabase no está configurado en el servidor.' }, 503);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  const body = asRow(payload);
  const orderId = text(body.orderId, 60);
  if (!UUID_RE.test(orderId)) return json({ error: 'Pedido inválido.' }, 400);

  const { data: currentData, error: currentError } = await admin
    .from('orders')
    .select(
      'id, order_number, status, payment_status, paid_at, shipped_at, tracking_number, carrier, internal_notes, notes',
    )
    .eq('id', orderId)
    .maybeSingle();

  if (currentError) {
    console.error('[admin/orders] No se pudo leer el pedido:', currentError);
    return json({ error: 'No pudimos leer el pedido.' }, 500);
  }
  if (!currentData) return json({ error: 'El pedido no existe.' }, 404);

  const current = asRow(currentData);
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!isOrderStatus(body.status)) return json({ error: 'Estado de pedido inválido.' }, 400);
    update.status = body.status;
    if (body.status === 'shipped' && current.status !== 'shipped') {
      update.shipped_at = now;
    }
  }

  if (body.paymentStatus !== undefined) {
    if (!isPaymentStatus(body.paymentStatus)) {
      return json({ error: 'Estado de pago inválido.' }, 400);
    }
    update.payment_status = body.paymentStatus;
  }

  if (body.tracking !== undefined) update.tracking_number = optionalText(body.tracking, 80);
  if (body.carrier !== undefined) update.carrier = optionalText(body.carrier, 80);
  if (body.internalNotes !== undefined) update.internal_notes = optionalText(body.internalNotes, 1000);
  if (body.notes !== undefined) update.notes = optionalText(body.notes, 1000);

  if (Object.keys(update).length === 0) {
    return json({ error: 'No hay cambios para guardar.' }, 400);
  }

  const previouslyApproved = current.payment_status === 'approved';
  const approving = update.payment_status === 'approved' && !previouslyApproved;

  if (approving) {
    update.paid_at = now;
    if (!update.status || update.status === 'pending') update.status = 'paid';
  }

  let firstApproval = false;

  if (approving) {
    const { data: transitioned, error: transitionError } = await admin
      .from('orders')
      .update(update)
      .eq('id', orderId)
      .neq('payment_status', 'approved')
      .select('id')
      .maybeSingle();

    if (transitionError) {
      console.error('[admin/orders] No se pudo aprobar el pago:', transitionError);
      return json({ error: 'No pudimos actualizar el pago del pedido.' }, 500);
    }

    firstApproval = Boolean(transitioned);
  }

  if (!firstApproval) {
    const { paid_at: _ignoredPaidAt, ...withoutPaidAt } = update;
    const { error: updateError } = await admin
      .from('orders')
      .update(withoutPaidAt)
      .eq('id', orderId);

    if (updateError) {
      console.error('[admin/orders] No se pudo actualizar el pedido:', updateError);
      return json({ error: 'No pudimos guardar los cambios del pedido.' }, 500);
    }
  }

  if (firstApproval) {
    await decrementStock(admin, orderId, text(current.order_number), actor.userId);
  }

  const { data: updatedData, error: fetchError } = await admin
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .single();

  if (fetchError || !updatedData) {
    console.error('[admin/orders] Pedido actualizado, pero no se pudo releer:', fetchError);
    return json(
      { ok: true, order: null, message: 'Cambios guardados. Recarga la página para ver el detalle.' },
      200,
    );
  }

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'order.update',
    entity: 'orders',
    entity_id: orderId,
    payload: {
      before: {
        status: current.status,
        payment_status: current.payment_status,
        tracking_number: current.tracking_number,
        carrier: current.carrier,
      },
      after: {
        status: updatedData.status,
        payment_status: updatedData.payment_status,
        tracking_number: updatedData.tracking_number,
        carrier: updatedData.carrier,
      },
      stock_adjusted: firstApproval,
    },
  });

  return json({
    ok: true,
    order: mapOrderRow(updatedData),
    stockAdjusted: firstApproval,
  });
};
