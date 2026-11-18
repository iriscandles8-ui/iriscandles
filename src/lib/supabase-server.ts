import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseServerConfigured = Boolean(url && anonKey);

type CookieContext = {
  request: Request;
  cookies: AstroCookies;
};

/**
 * Cliente de Supabase para peticiones del servidor (middleware y páginas
 * renderizadas en el servidor). Lee y refresca la sesión desde las cookies.
 * Nunca usa la service role key.
 */
export function createSupabaseServer(context: CookieContext) {
  if (!url || !anonKey) return null;

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(context.request.headers.get('cookie') ?? '').map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(cookies) {
        for (const { name, value, options } of cookies) {
          context.cookies.set(name, value, { ...options, path: options?.path ?? '/' });
        }
      },
    },
  });
}
