import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DemoCustomer,
  DemoMaterial,
  DemoMonth,
  DemoMovement,
  DemoOrder,
  DemoProduct,
  DemoPromo,
  DemoReview,
} from '../data/admin-demo';

export type AdminEventRequest = {
  id: string;
  name: string;
  company: string;
  type: string;
  quantity: number;
  date: string;
  status: 'new' | 'contacted' | 'quoted' | 'won' | 'lost';
  createdAt: string;
};

/* ------------------------------------------------------------------
   Consultas reales del panel (Supabase + RLS).
   Devuelven las mismas formas que `admin-demo.ts` para que las
   páginas no cambien su marcado.
   ------------------------------------------------------------------ */

type Row = Record<string, unknown>;

const asRow = (value: unknown): Row =>
  value && typeof value === 'object' ? (value as Row) : {};

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const orderStatus = (value: unknown): DemoOrder['status'] => {
  switch (value) {
    case 'paid':
    case 'processing':
    case 'shipped':
    case 'delivered':
    case 'cancelled':
    case 'refunded':
      return value;
    default:
      return 'pending';
  }
};

const paymentStatus = (value: unknown): DemoOrder['payment'] => {
  switch (value) {
    case 'approved':
    case 'pending':
    case 'declined':
    case 'voided':
    case 'error':
      return value;
    default:
      return 'pending';
  }
};

function addressLines(address: Row): { name: string; phone: string; city: string; line: string } {
  const name = text(address.full_name) || text(address.name) || text(address.recipient);
  const phone = text(address.phone);
  const city = text(address.city);
  const line = [text(address.line1), text(address.line2), text(address.department)]
    .filter(Boolean)
    .join(' · ');
  return { name, phone, city, line };
}

/* ------------------------------ Pedidos ------------------------------ */

export const ORDER_SELECT =
  'id, order_number, email, status, payment_status, subtotal_cop, shipping_cop, total_cop, shipping_address, notes, internal_notes, tracking_number, carrier, created_at, order_items(product_name, size_label, unit_price_cop, quantity)';

/** Convierte una fila de `orders` (con `order_items`) a la forma del panel. */
export function mapOrderRow(row: unknown): DemoOrder {
  const source = asRow(row);
  const address = addressLines(asRow(source.shipping_address));
  const items = (Array.isArray(source.order_items) ? source.order_items : []).map((item) => {
    const line = asRow(item);
    return {
      name: text(line.product_name, 'Producto'),
      size: text(line.size_label),
      quantity: num(line.quantity, 1),
      unitPrice: num(line.unit_price_cop),
    };
  });

  return {
    id: text(source.id),
    number: text(source.order_number),
    customer: address.name || text(source.email),
    email: text(source.email),
    phone: address.phone,
    city: address.city,
    address: address.line,
    status: orderStatus(source.status),
    payment: paymentStatus(source.payment_status),
    total: num(source.total_cop),
    shipping: num(source.shipping_cop),
    items,
    createdAt: text(source.created_at),
    notes: text(source.notes) || undefined,
    internalNotes: text(source.internal_notes) || undefined,
    tracking: text(source.tracking_number) || undefined,
    carrier: text(source.carrier) || undefined,
  } satisfies DemoOrder;
}

export async function getOrders(supabase: SupabaseClient): Promise<DemoOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !data) return [];

  return data.map(mapOrderRow);
}

/* ----------------------------- Productos ----------------------------- */

export async function getProducts(supabase: SupabaseClient): Promise<DemoProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select(
      'id, slug, name, aroma, family, intensity, description, is_active, collections(name), product_variants(id, size_label, weight_g, sku, price_cop, cost_cop, stock)',
    )
    .order('name');

  if (error || !data) return [];

  return data.map((row) => {
    const collection = asRow(row.collections);
    const variants = (Array.isArray(row.product_variants) ? row.product_variants : []).map((variant) => {
      const item = asRow(variant);
      return {
        id: text(item.id),
        size: text(item.size_label),
        weight: num(item.weight_g),
        sku: text(item.sku),
        price: num(item.price_cop),
        cost: num(item.cost_cop),
        stock: num(item.stock),
      };
    });

    return {
      id: text(row.id),
      slug: text(row.slug),
      name: text(row.name),
      aroma: text(row.aroma),
      collection: text(collection.name, '—'),
      family: text(row.family, '—'),
      intensity: num(row.intensity, 0),
      status: row.is_active ? 'active' : 'draft',
      variants,
      description: text(row.description),
    } satisfies DemoProduct;
  });
}

/* ------------------------------ Clientes ------------------------------ */

export async function getCustomers(supabase: SupabaseClient): Promise<DemoCustomer[]> {
  const { data, error } = await supabase
    .from('admin_customer_stats')
    .select('id, full_name, email, phone, birth_date, created_at, orders_count, total_spent_cop, last_order_at')
    .order('total_spent_cop', { ascending: false });

  if (error || !data) return [];

  const ids = data.map((row) => text(row.id)).filter(Boolean);
  const [addresses, points, staff] = await Promise.all([
    ids.length
      ? supabase.from('addresses').select('profile_id, city, is_default').in('profile_id', ids)
      : Promise.resolve({ data: [] as Row[] }),
    ids.length
      ? supabase.from('loyalty_points').select('profile_id, points').in('profile_id', ids)
      : Promise.resolve({ data: [] as Row[] }),
    supabase.from('admin_users').select('user_id'),
  ]);

  const staffIds = new Set(((staff.data ?? []) as Row[]).map((row) => text(row.user_id)));

  const cityByProfile = new Map<string, string>();
  for (const row of (addresses.data ?? []) as Row[]) {
    const profile = text(row.profile_id);
    const city = text(row.city);
    if (!profile || !city) continue;
    if (row.is_default || !cityByProfile.has(profile)) cityByProfile.set(profile, city);
  }

  const pointsByProfile = new Map<string, number>();
  for (const row of (points.data ?? []) as Row[]) {
    pointsByProfile.set(text(row.profile_id), num(row.points));
  }

  return data
    .filter((row) => !staffIds.has(text(row.id)))
    .map((row) => {
      const id = text(row.id);
      return {
        id,
        name: text(row.full_name) || text(row.email) || 'Cliente',
        email: text(row.email),
        phone: text(row.phone),
        city: cityByProfile.get(id) ?? '—',
        orders: num(row.orders_count),
        spent: num(row.total_spent_cop),
        lastOrder: text(row.last_order_at) || null,
        birthday: text(row.birth_date) || '—',
        points: pointsByProfile.get(id) ?? 0,
        createdAt: text(row.created_at),
      } satisfies DemoCustomer;
    });
}

/* ------------------------------- Reseñas ------------------------------- */

export async function getReviews(supabase: SupabaseClient): Promise<DemoReview[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, author_name, rating, title, body, status, created_at, admin_reply, profile_id, products(name)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !data) return [];

  return data.map((row) => {
    const product = asRow(row.products);
    return {
      id: text(row.id),
      product: text(product.name, 'Producto'),
      author: text(row.author_name, 'Cliente'),
      rating: num(row.rating),
      title: text(row.title),
      body: text(row.body),
      status:
        row.status === 'approved' || row.status === 'rejected' ? row.status : 'pending',
      createdAt: text(row.created_at),
      reply: text(row.admin_reply) || undefined,
      verified: Boolean(row.profile_id),
    } satisfies DemoReview;
  });
}

/* ----------------------------- Inventario ----------------------------- */

export async function getMaterials(supabase: SupabaseClient): Promise<DemoMaterial[]> {
  const { data, error } = await supabase
    .from('materials')
    .select('id, name, unit, stock, min_stock, cost_per_unit_cop, supplier')
    .order('name');

  if (error || !data) return [];

  return data.map((row) => ({
    id: text(row.id),
    name: text(row.name),
    unit: row.unit === 'ml' || row.unit === 'unidad' ? row.unit : 'g',
    stock: num(row.stock),
    minStock: num(row.min_stock),
    cost: num(row.cost_per_unit_cop),
    supplier: text(row.supplier, '—'),
  }));
}

const quantityFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

export async function getMovements(supabase: SupabaseClient): Promise<DemoMovement[]> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select(
      'id, created_at, type, quantity, reason, materials(name, unit), product_variants(size_label, products(name))',
    )
    .order('created_at', { ascending: false })
    .limit(80);

  if (error || !data) return [];

  return data.map((row) => {
    const material = asRow(row.materials);
    const variant = asRow(row.product_variants);
    const product = asRow(variant.products);
    const unit = text(material.unit);
    const quantity = num(row.quantity);
    const sign = row.type === 'in' ? '+' : '−';
    const unitLabel = unit === 'unidad' ? '' : ` ${unit}`;
    const item =
      text(material.name) ||
      [text(product.name), text(variant.size_label)].filter(Boolean).join(' · ') ||
      'Insumo';

    return {
      id: String(row.id ?? ''),
      date: text(row.created_at),
      type: row.type === 'in' || row.type === 'adjustment' ? row.type : 'out',
      item,
      quantity: `${sign}${quantityFormatter.format(quantity)}${unitLabel}`,
      reason: text(row.reason, '—'),
      user: '—',
    } satisfies DemoMovement;
  });
}

/* ---------------------------- Estadísticas ---------------------------- */

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export async function getMonths(supabase: SupabaseClient): Promise<DemoMonth[]> {
  const { data, error } = await supabase
    .from('admin_sales_daily')
    .select('day, orders, revenue_cop')
    .order('day');

  if (error || !data) return [];

  const buckets = new Map<string, DemoMonth>();
  for (const row of data) {
    const day = text(row.day);
    if (!day) continue;
    const date = new Date(`${day}T12:00:00`);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MONTH_LABELS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`;
    const bucket = buckets.get(key) ?? { label, revenue: 0, orders: 0 };
    bucket.revenue += num(row.revenue_cop);
    bucket.orders += num(row.orders);
    buckets.set(key, bucket);
  }

  return [...buckets.values()].slice(-12);
}

export async function getTopProducts(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('admin_top_products')
    .select('product_name, size_label, units, revenue_cop')
    .order('units', { ascending: false })
    .limit(5);

  if (error || !data) return [];

  return data.map((row) => ({
    name: text(row.product_name),
    size: text(row.size_label),
    units: num(row.units),
    revenue: num(row.revenue_cop),
  }));
}

export async function getCities(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('orders')
    .select('shipping_address')
    .eq('payment_status', 'approved')
    .limit(500);

  if (error || !data) return [];

  const counts = new Map<string, number>();
  for (const row of data) {
    const city = text(asRow(row.shipping_address).city, 'Sin ciudad');
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, orders]) => ({ name, orders, share: Math.round((orders / total) * 100) }));
}

export async function getChannels(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('orders')
    .select('payment_method, total_cop')
    .eq('payment_status', 'approved')
    .limit(500);

  if (error || !data) return [];

  const totals = new Map<string, number>();
  for (const row of data) {
    const method = text(row.payment_method, 'Otro');
    totals.set(method, (totals.get(method) ?? 0) + num(row.total_cop));
  }

  const grandTotal = [...totals.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount, share: Math.round((amount / grandTotal) * 100) }));
}

export async function getStatsRanges(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('orders')
    .select('total_cop, created_at')
    .eq('payment_status', 'approved')
    .limit(1000);

  const empty = { revenue: 0, orders: 0, ticket: 0, conversion: 0, delta: 0, series: [] as number[] };
  if (error || !data) {
    return { '7d': empty, '30d': empty, '90d': empty, year: empty };
  }

  const now = Date.now();
  const ranges: Record<string, { days: number; buckets: number }> = {
    '7d': { days: 7, buckets: 7 },
    '30d': { days: 30, buckets: 12 },
    '90d': { days: 90, buckets: 12 },
    year: { days: 365, buckets: 12 },
  };

  const result: Record<string, typeof empty> = {};

  for (const [key, config] of Object.entries(ranges)) {
    const from = now - config.days * 86_400_000;
    const rows = data.filter((row) => new Date(text(row.created_at)).getTime() >= from);
    const revenue = rows.reduce((sum, row) => sum + num(row.total_cop), 0);
    const orders = rows.length;
    const series = new Array(config.buckets).fill(0) as number[];

    for (const row of rows) {
      const age = now - new Date(text(row.created_at)).getTime();
      const index = Math.min(
        config.buckets - 1,
        Math.max(0, config.buckets - 1 - Math.floor((age / (config.days * 86_400_000)) * config.buckets)),
      );
      series[index] += num(row.total_cop);
    }

    const previousFrom = from - config.days * 86_400_000;
    const previous = data.filter((row) => {
      const time = new Date(text(row.created_at)).getTime();
      return time >= previousFrom && time < from;
    });
    const previousRevenue = previous.reduce((sum, row) => sum + num(row.total_cop), 0);
    const delta = previousRevenue > 0 ? ((revenue - previousRevenue) / previousRevenue) * 100 : 0;

    result[key] = {
      revenue,
      orders,
      ticket: orders ? Math.round(revenue / orders) : 0,
      conversion: 0,
      delta: Math.round(delta * 10) / 10,
      series,
    };
  }

  return result;
}

/* ---------------------------- Promociones ---------------------------- */

export async function getPromotions(supabase: SupabaseClient): Promise<DemoPromo[]> {
  const { data, error } = await supabase
    .from('promotions')
    .select('id, name, type, value, code, min_total_cop, ends_at, is_active, metadata')
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const metadata = asRow(row.metadata);
    return {
      id: text(row.id),
      name: text(row.name),
      code: text(row.code),
      type:
        row.type === 'fixed' ||
        row.type === 'bundle' ||
        row.type === 'birthday' ||
        row.type === 'points'
          ? row.type
          : 'percent',
      value: num(row.value),
      minTotal: num(row.min_total_cop),
      uses: num(metadata.uses),
      maxUses: metadata.max_uses === undefined || metadata.max_uses === null ? null : num(metadata.max_uses),
      endsAt: text(row.ends_at) || null,
      active: Boolean(row.is_active),
    } satisfies DemoPromo;
  });
}

/* -------------------------- Eventos y equipo -------------------------- */

export async function getEventRequests(supabase: SupabaseClient): Promise<AdminEventRequest[]> {
  const { data, error } = await supabase
    .from('event_requests')
    .select('id, name, company, event_type, quantity, event_date, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data) return [];

  return data.map((row) => ({
    id: text(row.id),
    name: text(row.name),
    company: text(row.company, '—'),
    type: text(row.event_type, '—'),
    quantity: num(row.quantity),
    date: text(row.event_date) || '—',
    status:
      row.status === 'contacted' || row.status === 'quoted' || row.status === 'won' || row.status === 'lost'
        ? row.status
        : 'new',
    createdAt: text(row.created_at),
  }));
}

export async function getAdminUsers(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id, role, is_active, created_at')
    .order('created_at');

  if (error || !data) return [];

  const ids = data.map((row) => text(row.user_id));
  const { data: profiles } = ids.length
    ? await supabase.from('profiles').select('id, full_name, email, last_seen_at').in('id', ids)
    : { data: [] as Row[] };

  const byId = new Map<string, Row>();
  for (const profile of (profiles ?? []) as Row[]) byId.set(text(profile.id), profile);

  return data.map((row) => {
    const id = text(row.user_id);
    const profile = byId.get(id) ?? {};
    return {
      id,
      name: text(profile.full_name) || text(profile.email) || 'Sin nombre',
      email: text(profile.email),
      role: text(row.role, 'manager'),
      active: Boolean(row.is_active),
      lastSeen: text(profile.last_seen_at) || null,
    };
  });
}

/* --------------------------- Configuración --------------------------- */

export async function getSettings(supabase: SupabaseClient): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from('settings').select('key, value');
  if (error || !data) return {};
  return Object.fromEntries(data.map((row) => [text(row.key), row.value]));
}

export async function getShippingZones(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('shipping_zones')
    .select('id, name, base_cop, per_kg_cop, eta_days, free_from_cop')
    .order('base_cop');

  if (error || !data) return [];

  return data.map((row) => ({
    id: text(row.id),
    name: text(row.name),
    base: num(row.base_cop),
    perKg: num(row.per_kg_cop),
    eta: text(row.eta_days, '—'),
    freeFrom: num(row.free_from_cop),
  }));
}

/* ------------------------------ Resumen ------------------------------ */

export async function getBadges(supabase: SupabaseClient) {
  const [orders, reviews, stock] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('admin_low_stock').select('id', { count: 'exact', head: true }),
  ]);

  return {
    orders: orders.count ?? 0,
    reviews: reviews.count ?? 0,
    stock: stock.count ?? 0,
  };
}
