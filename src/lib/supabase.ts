import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.PUBLIC_SUPABASE_URL;
const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

/**
 * Cliente de navegador (clave anónima, protegida por RLS).
 * Usa cookies en lugar de localStorage para que el servidor pueda
 * validar la sesión del panel en cada petición (middleware).
 * Si no hay variables de entorno, la web funciona en modo demo
 * y los formularios simulan el envío.
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createBrowserClient(url, anonKey) : null;

export const isSupabaseConfigured = Boolean(url && anonKey);
