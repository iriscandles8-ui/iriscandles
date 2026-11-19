import type { APIRoute } from 'astro';
import { paymentConfirmedEmail, sendEmail } from '../../../lib/resend';
import { createSupabaseAdmin } from '../../../lib/supabase-admin';
import { isWompiConfigured, verifyWompiEvent } from '../../../lib/wompi';

export const prerender = false;

type Row = Record<string, unknown>;

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const asRow = (value: unknown): Row =>
  value && typeof value === 'object' ? (value as Row) : {};

/**
 * Webhook de Wompi · esqueleto listo para activar.
 *
 * Hoy queda desactivado mientras los pagos sean manuales: sin las llaves de
 * Wompi responde 503 y no toca la base de datos.
 *
 * Cuando se conecte Wompi:
 *   1. Llenar WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY_SECRET y WOMPI_EVENTS_SECRET.
 *   2. Registrar esta URL en el panel de Wompi:
 *      https://TU-DOMINIO/api/webhooks/wompi
 *   3. Al recibir APPROVED, `confirm_order` marca el pedido como pagado y
 *      descuenta stock una sola vez.
 */
/**
 * Avisa al cliente que el pago quedó confirmado. Comparte el mismo criterio
 * que el panel: solo corre en la primera aprobación y jamás rompe el webhook.
 */
async function notifyPaymentConfirmed(
  admin: Awaited<ReturnType<typeof createSupabaseAdmin>>,
  orderId: string,
) {
  if (!admin) return;

  const { data } = await admin
    .from('orders')
    .select(
      'order_number, email, subtotal_cop, shipping_cop, total_cop, shipping_address, payment_method, order_items(product_name, size_label, quantity, subtotal_cop)',
    )
    .eq('id', orderId)
    .maybeSingle();
  if (!data) return;

  const order = (data ?? {}) as Record<string, unknown>;
  const shipping = (order.shipping_address ?? {}) as Record<string, unknown>;
  const email = String(order.email ?? '').trim().toLowerCase();
  if (!email) return;

  const payload = paymentConfirmedEmail({
    orderNumber: String(order.order_number ?? ''),
    customerName: String(shipping.full_name ?? ''),
    customerEmail: email,
    items: (Array.isArray(order.order_items) ? order.order_items : []).map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      return {
        productName: String(item.product_name ?? ''),
        sizeLabel: String(item.size_label ?? ''),
        quantity: Number(item.quantity) || 0,
        subtotalCop: Number(item.subtotal_cop) || 0,
      };
    }),
    subtotalCop: Number(order.subtotal_cop) || 0,
    shippingCop: Number(order.shipping_cop) || 0,
    totalCop: Number(order.total_cop) || 0,
    paymentMethod: String(order.payment_method ?? '') || 'Por definir',
    city: String(shipping.city ?? ''),
    department: String(shipping.department ?? ''),
  });

  await sendEmail({
    to: email,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    replyTo: 'hola@iriscandles.com',
  });
}

export const POST: APIRoute = async ({ request }) => {
  if (!(await isWompiConfigured())) {
    return json({ error: 'Wompi no está configurado.' }, 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Evento inválido.' }, 400);
  }

  const valid = await verifyWompiEvent(body);
  if (!valid) return json({ error: 'Firma del evento inválida.' }, 401);

  const event = asRow(body);
  const transaction = asRow(asRow(event.data).transaction);
  const reference = typeof transaction.reference === 'string' ? transaction.reference : '';
  const status = typeof transaction.status === 'string' ? transaction.status.toUpperCase() : '';
  const transactionId = transaction.id === undefined ? '' : String(transaction.id);

  if (!reference) return json({ ok: true, ignored: true });

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado.' }, 503);

  const { data: order, error } = await admin
    .from('orders')
    .select('id, payment_status')
    .eq('wompi_reference', reference)
    .maybeSingle();

  if (error) {
    console.error('[wompi] No se pudo buscar el pedido:', error);
    return json({ error: 'No se pudo procesar el evento.' }, 500);
  }
  if (!order) return json({ ok: true, ignored: true });

  if (status === 'APPROVED' && order.payment_status !== 'approved') {
    const { error: confirmError } = await admin.rpc('confirm_order', {
      p_order_id: order.id,
      p_transaction_id: transactionId,
    });
    if (confirmError) {
      console.error('[wompi] No se pudo confirmar el pedido:', confirmError);
      return json({ error: 'No se pudo confirmar el pedido.' }, 500);
    }
    await notifyPaymentConfirmed(admin, order.id);
  }

  if (status === 'DECLINED' || status === 'VOIDED' || status === 'ERROR') {
    await admin
      .from('orders')
      .update({ payment_status: status.toLowerCase() })
      .eq('id', order.id)
      .neq('payment_status', 'approved');
  }

  return json({ ok: true });
};
