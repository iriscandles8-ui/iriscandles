import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServer, isSupabaseServerConfigured } from './lib/supabase-server';
import type { AdminSession } from './lib/admin';

const DEMO_SESSION: AdminSession = {
  userId: 'demo-owner',
  email: 'hola@iriscandles.com',
  fullName: 'Iris Candles',
  role: 'owner',
  permissions: {},
  demo: true,
};

/**
 * Protege el panel: valida la sesión de Supabase y la pertenencia al
 * equipo autorizado antes de renderizar cualquier página de /admin.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;

  if (
    !pathname.startsWith('/admin') ||
    pathname.startsWith('/admin/login') ||
    pathname.startsWith('/admin/recuperar')
  ) {
    return next();
  }

  if (!isSupabaseServerConfigured) {
    context.locals.adminSession = DEMO_SESSION;
    return next();
  }

  const supabase = createSupabaseServer(context);
  if (!supabase) {
    return context.redirect('/admin/login');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect(`/admin/login?next=${encodeURIComponent(pathname + search)}`);
  }

  const { data: admin, error } = await supabase
    .from('admin_users')
    .select('role, permissions, is_active')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !admin || !admin.is_active) {
    return context.redirect('/admin/login?error=unauthorized');
  }

  context.locals.adminSession = {
    userId: user.id,
    email: user.email ?? '',
    fullName: (user.user_metadata?.full_name as string | undefined) ?? undefined,
    role: admin.role as AdminSession['role'],
    permissions: (admin.permissions ?? {}) as AdminSession['permissions'],
    demo: false,
  };

  return next();
});
