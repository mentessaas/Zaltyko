// Helpers puros para parsear el deep link que devuelve Supabase al cerrar
// el flujo Google OAuth: `zaltyko://auth/callback?code=...&error_description=...`.
//
// Aislados de `google-oauth.ts` para que vitest pueda testearlos sin
// arrastrar `expo-web-browser` ni el cliente Supabase (sus entrypoints
// traen Flow/native bindings que el sandbox de vitest no parsea).

export const OAUTH_REDIRECT_PATH = 'auth/callback';

export interface OAuthCallbackResult {
  /** Auth code PKCE devuelto por Supabase tras canjear el token de Google. */
  code?: string;
  /** Mensaje de error devuelto por Supabase o Google (p.ej. `access_denied`). */
  error?: string;
}

/**
 * Parsea el deep link `zaltyko://auth/callback?code=...&error_description=...`
 * que devuelve Supabase al cerrar el OAuth. Aislado como función pura para
 * poder testearlo sin browser real.
 */
export function parseOAuthCallback(url: string): OAuthCallbackResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: 'URL de callback inválida' };
  }

  const code = parsed.searchParams.get('code') ?? undefined;
  // Supabase usa `error_description` (RFC 6749); algunos proveedores usan
  // `error`. Aceptamos ambos.
  const error =
    parsed.searchParams.get('error_description') ??
    parsed.searchParams.get('error') ??
    undefined;

  return { code, error };
}