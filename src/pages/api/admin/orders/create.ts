import type { APIRoute } from 'astro';
import { getAdminActor } from '../../../../lib/admin-auth';
import { mapOrderRow, ORDER_SELECT } from '../../../../lib/admin-data';
import { findCatalogVariant } from '../../../../lib/order-pricing';
import { createSupabaseAdmin } from '../../../../lib/supabase-admin';

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const POST: APIRoute = async ({ request, cookies }) => {
  const actor = await getAdminActor({ request, cookies });
  if (!actor) return json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }, 401);
  if (!actor.canWriteOrders) {
    return json({ error: 'No tienes permiso para crear pedidos.' }, 403);
  }

  const admin = await createSupabaseAdmin();
  if (!admin) return json({ error: 'Supabase no está configurado en el servidor.' }, 503);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Solicitud inválida.' }, 400);
  }

  const body = asRow(payload);
  const name = text(body.name, 90);
  const email = text(body.email, 140).toLowerCase();
  const phone = text(body.phone, 30);
  const city = text(body.city, 90);
  const address = text(body.address, 180);
  const addressNotes = text(body.addressNotes, 180);
  const notes = text(body.notes, 1000);
  const variantId = text(body.variantId, 60);
  const quantity = Math.round(Number(body.quantity));

  if (name.length < 2) return json({ error: 'Escribe el nombre del cliente.' }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: 'Escribe un correo válido.' }, 400);
  if (!city) return json({ error: 'Escribe la ciudad de entrega.' }, 400);
  if (address.length < 5) return json({ error: 'Escribe la dirección de entrega.' }, 400);
  if (!UUID_RE.test(variantId)) return json({ error: 'Selecciona un producto válido.' }, 400);
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 200) {
    return json({ error: 'La cantidad debe estar entre 1 y 200 unidades.' }, 400);
  }

  const { data: variantData, error: variantError } = await admin
    .from('product_variants')
    .select('id, sku, size_label, price_cop, products(name)')
    .eq('id', variantId)
    .maybeSingle();

  if (variantError || !variantData) {
    return json({ error: 'El producto seleccionado no existe en el catálogo.' }, 400);
  }

  const variant = asRow(variantData);
  const product = asRow(variant.products);
  const sku = text(variant.sku);
  const catalogVariant = findCatalogVariant(sku);
  const unitPrice = Number(variant.price_cop) || catalogVariant?.unitPriceCop || 0;

  if (!unitPrice) {
    return json({ error: 'El producto no tiene precio configurado.' }, 400);
  }

  const productName = text(product.name) || catalogVariant?.productName || 'Producto';
  const sizeLabel = text(variant.size_label) || catalogVariant?.sizeLabel || '';
  const subtotal = unitPrice * quantity;

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      email,
      status: 'pending',
      payment_status: 'pending',
      subtotal_cop: subtotal,
      shipping_cop: 0,
      total_cop: subtotal,
      payment_method: 'Manual',
      shipping_address: {
        full_name: name,
        phone,
        line1: address,
        line2: addressNotes,
        department: '',
        city,
      },
      notes: null,
      internal_notes: notes || null,
    })
    .select('id')
    .single();

  if (orderError || !order) {
    console.error('[admin/orders/create] No se pudo crear el pedido:', orderError);
    return json({ error: 'No pudimos crear el pedido.' }, 500);
  }

  const { error: itemError } = await admin.from('order_items').insert({
    order_id: order.id,
    variant_id: variantId,
    product_name: productName,
    size_label: sizeLabel,
    unit_price_cop: unitPrice,
    quantity,
    subtotal_cop: subtotal,
  });

  if (itemError) {
    console.error('[admin/orders/create] No se pudo crear el ítem:', itemError);
    await admin.from('orders').delete().eq('id', order.id);
    return json({ error: 'No pudimos guardar el producto del pedido.' }, 500);
  }

  const { data: created, error: fetchError } = await admin
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', order.id)
    .single();

  if (fetchError || !created) {
    return json({ error: 'Pedido creado. Recarga la página para verlo.' }, 500);
  }

  await admin.from('audit_log').insert({
    user_id: actor.userId,
    action: 'order.create',
    entity: 'orders',
    entity_id: order.id,
    payload: { order_number: created.order_number, total_cop: subtotal, units: quantity },
  });

  return json({ ok: true, order: mapOrderRow(created) }, 201);
};
