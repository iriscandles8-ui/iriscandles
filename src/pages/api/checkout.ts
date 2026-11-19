import type { APIRoute } from 'astro';
import { DEPARTMENTS } from '../../data/departments';
import { isPaymentMethodLabel } from '../../data/payment';
import { priceOrderItems } from '../../lib/order-pricing';
import { createSupabaseAdmin } from '../../lib/supabase-admin';

export const prerender = false;

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

/** Respuesta para reintentos con la misma clave de idempotencia. */
const existingOrderResponse = (value: unknown): Response => {
  const row = asRow(value);
  return json({
    ok: true,
    duplicate: true,
    orderId: row.id,
    orderNumber: row.order_number,
    totals: {
      subtotalCop: row.subtotal_cop,
      shippingCop: row.shipping_cop,
      totalCop: row.total_cop,
    },
  });
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const DEPARTMENTS_SET = new Set<string>(DEPARTMENTS);

// Protección básica contra abuso: como máximo 5 pedidos por correo cada 10 min.
// El límite en el edge (Cloudflare) se recomienda además de este control.
const MAX_ORDERS_PER_EMAIL = 5;
const ORDER_WINDOW_MS = 10 * 60 * 1000;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{16,64}$/;

const newReference = (): string =>
  `IRIS-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

export const POST: APIRoute = async ({ request }) => {
  const admin = await createSupabaseAdmin();
  if (!admin) {
    return json(
      {
        error:
          'El checkout no está disponible en este momento. Escríbenos por WhatsApp para completar tu pedido.',
      },
      503,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'No pudimos leer los datos del pedido.' }, 400);
  }

  const body = asRow(payload);
  const customer = asRow(body.customer);
  const delivery = asRow(body.shipping);

  const name = text(customer.name, 90);
  const email = text(customer.email, 140).toLowerCase();
  const phone = text(customer.phone, 30);
  const address = text(delivery.address, 180);
  const addressNotes = text(delivery.addressNotes, 180);
  const city = text(delivery.city, 90);
  const department = text(delivery.department, 60);
  const notes = text(body.notes, 600);
  const payment = text(body.payment, 30);

  if (name.length < 2) return json({ error: 'Escribe tu nombre completo.' }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: 'Escribe un correo válido.' }, 400);

  // Idempotencia: un reintento (o un doble clic) reutiliza el mismo pedido.
  const idempotencyKey = text(request.headers.get('idempotency-key') ?? body.idempotencyKey, 64);
  if (idempotencyKey && !IDEMPOTENCY_RE.test(idempotencyKey)) {
    return json({ error: 'Clave de idempotencia inválida.' }, 400);
  }

  if (idempotencyKey) {
    const { data: existing } = await admin
      .from('orders')
      .select('id, order_number, subtotal_cop, shipping_cop, total_cop')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) return existingOrderResponse(existing);
  }

  // Límite de frecuencia basado en datos persistidos (funciona en Workers,
  // donde la memoria del proceso no es compartida entre instancias).
  const since = new Date(Date.now() - ORDER_WINDOW_MS).toISOString();
  const { count, error: countError } = await admin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .gte('created_at', since);

  if (countError) {
    console.error('[checkout] No se pudo verificar el límite de pedidos:', countError.code);
  } else if ((count ?? 0) >= MAX_ORDERS_PER_EMAIL) {
    return json(
      {
        error:
          'Has enviado muchos pedidos en poco tiempo. Espera unos minutos o escríbenos por WhatsApp.',
      },
      429,
    );
  }

  const phoneDigits = phone.replace(/\D/g, '');
  if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    return json({ error: 'Escribe un teléfono de 7 a 15 dígitos.' }, 400);
  }

  if (address.length < 5) return json({ error: 'Escribe una dirección de entrega.' }, 400);
  if (!city) return json({ error: 'Escribe tu ciudad o municipio.' }, 400);
  if (!DEPARTMENTS_SET.has(department)) {
    return json({ error: 'Selecciona un departamento válido.' }, 400);
  }

  const pricing = priceOrderItems(body.items);
  if (!pricing.ok) return json({ error: pricing.error }, 400);

  const skus = pricing.order.items.map((item) => item.sku);
  const { data: variantRows } = await admin
    .from('product_variants')
    .select('id, sku')
    .in('sku', skus);

  const variantBySku = new Map<string, string>();
  for (const row of variantRows ?? []) {
    const source = asRow(row);
    const sku = text(source.sku);
    const id = text(source.id);
    if (sku && id) variantBySku.set(sku, id);
  }

  const reference = newReference();
  const paymentMethod = isPaymentMethodLabel(payment) ? payment : 'Por definir';

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      email,
      status: 'pending',
      payment_status: 'pending',
      subtotal_cop: pricing.order.subtotalCop,
      shipping_cop: pricing.order.shippingCop,
      total_cop: pricing.order.totalCop,
      wompi_reference: reference,
      payment_method: paymentMethod,
      shipping_address: {
        full_name: name,
        phone,
        line1: address,
        line2: addressNotes,
        department,
        city,
      },
      notes: notes || null,
      idempotency_key: idempotencyKey || null,
    })
    .select('id, order_number, subtotal_cop, shipping_cop, total_cop')
    .single();

  // Carrera entre dos peticiones con la misma clave: la restricción unique
  // decide y devolvemos el pedido ganador en lugar de un error 500.
  if (orderError?.code === '23505' && idempotencyKey) {
    const { data: existing } = await admin
      .from('orders')
      .select('id, order_number, subtotal_cop, shipping_cop, total_cop')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) return existingOrderResponse(existing);
  }

  if (orderError || !order) {
    console.error('[checkout] No se pudo crear el pedido:', orderError?.code ?? 'unknown');
    return json(
      { error: 'No pudimos guardar tu pedido. Inténtalo de nuevo o escríbenos por WhatsApp.' },
      500,
    );
  }

  const { error: itemsError } = await admin.from('order_items').insert(
    pricing.order.items.map((item) => ({
      order_id: order.id,
      variant_id: variantBySku.get(item.sku) ?? null,
      product_name: item.productName,
      size_label: item.sizeLabel,
      unit_price_cop: item.unitPriceCop,
      quantity: item.quantity,
      subtotal_cop: item.subtotalCop,
    })),
  );

  if (itemsError) {
    console.error('[checkout] No se pudieron guardar los productos:', itemsError);
    await admin.from('orders').delete().eq('id', order.id);
    return json(
      { error: 'No pudimos guardar los productos del pedido. Inténtalo de nuevo.' },
      500,
    );
  }

  return json(
    {
      ok: true,
      orderId: order.id,
      orderNumber: order.order_number,
      reference,
      totals: {
        subtotalCop: order.subtotal_cop,
        shippingCop: order.shipping_cop,
        totalCop: order.total_cop,
      },
    },
    201,
  );
};
