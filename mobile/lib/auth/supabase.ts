// Cliente Supabase para la app móvil.
//
// Por qué NO usamos @supabase/ssr (que es lo que usa la web): esa lib
// depende de cookies HttpOnly del navegador. En móvil no hay cookies,
// persistimos tokens en SecureStore vía `secureStoreAdapter`.
//
// `detectSessionInUrl: false` porque manejamos deep links manualmente
// desde Expo Router para evitar race conditions con el browser in-app.
//
// Las EXPO_PUBLIC_* son inlined en build por Expo, disponibles como
// process.env.* incluso fuera del bundle principal.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { secureStoreAdapter } from './secure-store';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://app.zaltyko.com';

if (!supabaseUrl || !supabaseAnonKey) {
  // No throw para no romper el bundling; el cliente falla al primer uso
  // con un mensaje claro. Ver .env.example para configurar.
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY faltan. Auth no funcionará.'
  );
}

export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://invalid.supabase.co',
  supabaseAnonKey || 'invalid-anon-key',
  {
    auth: {
      storage: secureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // Access tokens de Supabase expiran en ~1h por defecto; refresh rotatorio.
    },
  }
);

// Exportar para api/client.ts y otros módulos que necesiten la URL base.
export const API_BASE = apiBaseUrl;