import type { AstroCookies } from 'astro';
import { createSupabaseServer } from './supabase-server';

type CookieContext = {
  request: Request;
  cookies: AstroCookies;
};

export type AdminActor = {
  userId: string;
  email: string;
  role: string;
  canWriteOrders: boolean;
  canWriteProducts: boolean;
  canReadProducts: boolean;
};

/**
 * Valida la sesión del personal y devuelve quién intenta escribir.
 * Se usa en los endpoints de administración antes de tocar la service role.
 */
export async function getAdminActor(context: CookieContext): Promise<AdminActor | null> {
  const supabase = createSupabaseServer(context);
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: admin, error } = await supabase
    .from('admin_users')
    .select('role, permissions, is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !admin || !admin.is_active) return null;

  const role = String(admin.role ?? 'viewer');
  const permissions = (admin.permissions ?? {}) as Record<string, Record<string, boolean>>;
  const isPrivileged = role === 'owner' || role === 'admin';
  const canWriteOrders = isPrivileged || Boolean(permissions.orders?.write);
  const canWriteProducts = isPrivileged || Boolean(permissions.products?.write);
  const canReadProducts =
    isPrivileged || role === 'viewer' || Boolean(permissions.products?.read);

  return {
    userId: user.id,
    email: user.email ?? '',
    role,
    canWriteOrders,
    canWriteProducts,
    canReadProducts,
  };
}

/**
 * Igual que getAdminActor, pero exige permiso de escritura sobre un módulo
 * concreto (p. ej. 'products'). Se usa en los endpoints de colecciones.
 */
export async function getAdminEditor(
  context: CookieContext,
  module: string,
): Promise<AdminActor | null> {
  const actor = await getAdminActor(context);
  if (!actor) return null;
  if (actor.role === 'owner' || actor.role === 'admin') return actor;

  const supabase = createSupabaseServer(context);
  if (!supabase) return null;

  const { data: admin } = await supabase
    .from('admin_users')
    .select('permissions')
    .eq('user_id', actor.userId)
    .maybeSingle();

  const permissions = (admin?.permissions ?? {}) as Record<string, Record<string, boolean>>;
  return permissions[module]?.write ? actor : null;
}
