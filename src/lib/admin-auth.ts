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
  const canWriteOrders =
    role === 'owner' || role === 'admin' || Boolean(permissions.orders?.write);

  return {
    userId: user.id,
    email: user.email ?? '',
    role,
    canWriteOrders,
  };
}
