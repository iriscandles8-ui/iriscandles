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
 * El modo demo solo existe en desarrollo y con habilitación explícita.
 * En producción un error de configuración NUNCA debe abrir el panel.
 */
const allowDemo = import.meta.env.DEV && import.meta.env.ALLOW_DEMO_MODE === 'true';

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
    if (allowDemo) {
      context.locals.adminSession = DEMO_SESSION;
      return next();
    }
    return context.redirect('/admin/login?error=unconfigured');
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
