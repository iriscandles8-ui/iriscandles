import { supabase, isSupabaseConfigured } from './supabase';

/* ------------------------------------------------------------------
   Panel de administración · utilidades compartidas
   ------------------------------------------------------------------ */

/**
 * El modo demo es una herramienta de desarrollo explícita, NO un fallback de
 * configuración. En producción (o sin la bandera) el panel permanece cerrado
 * cuando Supabase no está configurado.
 */
export const isDemoMode =
  import.meta.env.DEV &&
  import.meta.env.ALLOW_DEMO_MODE === 'true' &&
  !isSupabaseConfigured;

export type AdminRole = 'owner' | 'admin' | 'manager' | 'viewer';

export type AdminModule =
  | 'orders'
  | 'products'
  | 'inventory'
  | 'customers'
  | 'reviews'
  | 'stats'
  | 'promotions'
  | 'settings';

export type AdminSession = {
  userId: string;
  email: string;
  fullName?: string;
  role: AdminRole;
  permissions: Record<string, Record<string, boolean>>;
  demo: boolean;
};

export type AdminNavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
  group: 'Operación' | 'Catálogo' | 'Negocio';
  badge?: 'orders' | 'reviews' | 'stock';
};

export const ADMIN_NAV: AdminNavItem[] = [
  { id: 'dashboard', label: 'Panel', href: '/admin', icon: 'grid', group: 'Operación' },
  { id: 'pedidos', label: 'Pedidos', href: '/admin/pedidos', icon: 'bag', group: 'Operación', badge: 'orders' },
  { id: 'clientes', label: 'Clientes', href: '/admin/clientes', icon: 'users', group: 'Operación' },
  { id: 'resenas', label: 'Reseñas', href: '/admin/resenas', icon: 'star', group: 'Operación', badge: 'reviews' },
  { id: 'productos', label: 'Productos', href: '/admin/productos', icon: 'tag', group: 'Catálogo' },
  { id: 'inventario', label: 'Inventario', href: '/admin/inventario', icon: 'box', group: 'Catálogo', badge: 'stock' },
  { id: 'promociones', label: 'Promociones', href: '/admin/promociones', icon: 'percent', group: 'Catálogo' },
  { id: 'estadisticas', label: 'Estadísticas', href: '/admin/estadisticas', icon: 'chart', group: 'Negocio' },
  { id: 'configuracion', label: 'Configuración', href: '/admin/configuracion', icon: 'settings', group: 'Negocio' },
];

export const MODULE_LABELS: Record<AdminModule, string> = {
  orders: 'Pedidos',
  products: 'Productos',
  inventory: 'Inventario',
  customers: 'Clientes',
  reviews: 'Reseñas',
  stats: 'Estadísticas',
  promotions: 'Promociones',
  settings: 'Configuración',
};

export const MODULE_ACTIONS: Record<AdminModule, string[]> = {
  orders: ['read', 'write'],
  products: ['read', 'write'],
  inventory: ['read', 'write'],
  customers: ['read', 'write'],
  reviews: ['read', 'write'],
  stats: ['read'],
  promotions: ['read', 'write'],
  settings: ['read', 'write'],
};

/* ---------------------------- Sesión ---------------------------- */

const demoSession: AdminSession = {
  userId: 'demo-owner',
  email: 'hola@iriscandles.com',
  fullName: 'Iris Candles',
  role: 'owner',
  permissions: {},
  demo: true,
};

/**
 * Devuelve la sesión de administración o null si el usuario no
 * pertenece al personal autorizado. En modo demo (sin variables de
 * Supabase) retorna una sesión local de propietaria.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  if (!supabase) return isDemoMode ? demoSession : null;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return null;

  const { data: admin, error } = await supabase
    .from('admin_users')
    .select('role, permissions, is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !admin || !admin.is_active) return null;

  return {
    userId: user.id,
    email: user.email ?? '',
    fullName: (user.user_metadata?.full_name as string | undefined) ?? undefined,
    role: admin.role as AdminRole,
    permissions: (admin.permissions ?? {}) as Record<string, Record<string, boolean>>,
    demo: false,
  };
}

export function canAccess(
  session: AdminSession | null,
  module: AdminModule,
  action: 'read' | 'write' = 'read',
): boolean {
  if (!session) return false;
  if (session.demo) return true;
  if (session.role === 'owner' || session.role === 'admin') return true;
  if (session.role === 'viewer') return action === 'read';
  return Boolean(session.permissions?.[module]?.[action]);
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  owner: 'Propietaria',
  admin: 'Administración',
  manager: 'Gestión',
  viewer: 'Solo lectura',
};

/* --------------------------- Formatos --------------------------- */

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

export const formatCOP = (value: number): string => cop.format(value).replace(/\s/g, ' ');

export const formatNumber = (value: number): string => new Intl.NumberFormat('es-CO').format(value);

export const formatCompactCOP = (value: number): string => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)} M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)} K`;
  return formatCOP(value);
};

export const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    date,
  );
};

export const formatDateShort = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short' }).format(date);
};

export const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const initials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

/* ------------------------ Estados / etiquetas ------------------------ */

export type Tone = 'jade' | 'terracotta' | 'amber' | 'rose' | 'slate' | 'blush' | 'blue';

type Meta = { label: string; tone: Tone };

export const ORDER_STATUS: Record<string, Meta> = {
  pending: { label: 'Pendiente', tone: 'amber' },
  paid: { label: 'Pagado', tone: 'jade' },
  processing: { label: 'En preparación', tone: 'blue' },
  shipped: { label: 'Enviado', tone: 'terracotta' },
  delivered: { label: 'Entregado', tone: 'jade' },
  cancelled: { label: 'Cancelado', tone: 'slate' },
  refunded: { label: 'Reembolsado', tone: 'rose' },
};

export const PAYMENT_STATUS: Record<string, Meta> = {
  pending: { label: 'En proceso de pago', tone: 'amber' },
  approved: { label: 'Pagado', tone: 'jade' },
  declined: { label: 'Rechazado', tone: 'rose' },
  voided: { label: 'Anulado', tone: 'slate' },
  error: { label: 'Error', tone: 'rose' },
};

export const REVIEW_STATUS: Record<string, Meta> = {
  pending: { label: 'Pendiente', tone: 'amber' },
  approved: { label: 'Publicada', tone: 'jade' },
  rejected: { label: 'Rechazada', tone: 'slate' },
};

export const EVENT_STATUS: Record<string, Meta> = {
  new: { label: 'Nueva', tone: 'amber' },
  contacted: { label: 'Contactada', tone: 'blue' },
  quoted: { label: 'Cotizada', tone: 'terracotta' },
  won: { label: 'Ganada', tone: 'jade' },
  lost: { label: 'Perdida', tone: 'slate' },
};

export const PROMO_TYPES: Record<string, string> = {
  percent: 'Porcentaje',
  fixed: 'Monto fijo',
  bundle: 'Combo',
  birthday: 'Cumpleaños',
  points: 'Puntos',
};

/* --------------------------- CSV --------------------------- */

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          return /[",;\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(';'),
    )
    .join('\n');

  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
