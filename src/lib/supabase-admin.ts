import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase con la service role key.
 *
 * ⚠️ Solo para endpoints del servidor (`src/pages/api`).
 * Salta RLS, así que cada endpoint debe validar la sesión, los permisos y
 * los datos antes de escribir. Nunca importar desde un componente o script
 * que se ejecute en el navegador.
 *
 * Las variables se leen del runtime de Cloudflare (`cloudflare:workers`)
 * y, como respaldo, de `import.meta.env` en desarrollo o build.
 */

type EnvBag = Record<string, string | undefined>;

const clients = new Map<string, SupabaseClient>();

async function runtimeEnv(): Promise<EnvBag> {
  try {
    const { env } = await import('cloudflare:workers');
    return (env ?? {}) as EnvBag;
  } catch {
    return {};
  }
}

export async function createSupabaseAdmin(): Promise<SupabaseClient | null> {
  const env = await runtimeEnv();
  const url =
    env.PUBLIC_SUPABASE_URL || env.SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  const cacheKey = `${url}:${serviceRoleKey.slice(-10)}`;
  const cached = clients.get(cacheKey);
  if (cached) return cached;

  const client = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { 'X-Client-Info': 'iris-candles-server' },
    },
  });

  clients.set(cacheKey, client);
  return client;
}
