// Login/signup nativo con Google OAuth en mobile.
//
// Paridad con la web (RegisterForm.tsx / login-form.tsx): usa el proveedor
// Google del proyecto Supabase compartido. La web hace `signInWithOAuth`
// y deja que el navegador redirija; aquí el navegador es un Custom Tab /
// ASWebAuthenticationSession efímero y el retorno llega por deep link.
//
// Flujo:
//   1. signInWithOAuth({ provider: 'google', redirectTo, skipBrowserRedirect: true })
//      devuelve la URL de Google. NO se abre el browser automáticamente.
//   2. WebBrowser.openAuthSessionAsync(data.url, redirectTo) abre el browser
//      del sistema y escucha el deep link `zaltyko://auth/callback?code=...`
//      que Supabase genera al cerrar el flujo.
//   3. La URL viene como `result.url`. Extraemos el `code` (PKCE) o un
//      `error_description` (si Supabase/Google devolvieron error).
//   4. supabase.auth.exchangeCodeForSession(code) canjea el code por la
//      sesión usando el code_verifier que supabase-js guardó en storage.
//      El cambio de sesión dispara el redirect vía (auth)/_layout, igual
//      que en el login con password.
//
// Notas:
//   - `detectSessionInUrl: false` en supabase.ts: por eso NO basta con dejar
//     que supabase-js parsee el URL; hay que llamar exchangeCodeForSession.
//   - `Linking.createURL` devuelve `zaltyko://auth/callback` en builds
//     standalone (incluido dev-client) sin necesidad de expo-auth-session.
//   - La redirección a `zaltyko://` requiere que Expo genere el intent
//     filter / CFBundleURLSchemes, cosa que hace automáticamente porque
//     app.json tiene `"scheme": "zaltyko"`. No requiere tocar
//     AndroidManifest.xml ni Info.plist ni rebuild de EAS — el cambio es
//     puramente JS/TS y se sirve por Metro en el dev-client actual.
//
// Lo que SÍ queda fuera de este código:
//   - Registrar `zaltyko://auth/callback` (y/o wildcard `zaltyko://**`)
//     en Supabase Auth > URL Configuration > Redirect URLs. Si el
//     wildcard ya cubre el scheme, no hace falta; si no, Platform &
//     Security lo agrega. Sin eso Supabase rechaza el inicio OAuth
//     antes de siquiera abrir el browser.

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from './supabase';
import { OAUTH_REDIRECT_PATH, parseOAuthCallback } from './oauth-callback';

// Cierra el browser in-app si la app se abrió vía el deep link de OAuth
// (caso "el usuario vuelve desde fuera"). Es idempotente; seguro llamarlo
// en cada import.
WebBrowser.maybeCompleteAuthSession();

export function getGoogleRedirectUrl(): string {
  return Linking.createURL(OAUTH_REDIRECT_PATH, { scheme: 'zaltyko' });
}

export interface SignInWithGoogleResult {
  /** Mensaje de error listo para mostrar al usuario; undefined si OK. */
  error?: string;
  /** true si el usuario canceló / cerró el browser antes de completar. */
  cancelled?: boolean;
}

/**
 * Inicia el flujo Google OAuth. Devuelve cuando hay sesión activa o cuando
 * el flujo termina con error o cancelación. NO lanza excepciones: cualquier
 * fallo se mapea a `{ error }` para que el caller solo muestre un toast.
 */
export async function signInWithGoogle(): Promise<SignInWithGoogleResult> {
  const redirectTo = getGoogleRedirectUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    return { error: error.message };
  }
  if (!data?.url) {
    return { error: 'No se pudo iniciar el flujo de Google' };
  }

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'No se pudo abrir el navegador',
    };
  }

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return { cancelled: true };
  }
  if (result.type !== 'success' || !result.url) {
    return { error: 'No se pudo completar la autenticación' };
  }

  const { code, error: callbackError } = parseOAuthCallback(result.url);
  if (callbackError) {
    return { error: callbackError };
  }
  if (!code) {
    return { error: 'No se recibió código de autenticación' };
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return { error: exchangeError.message };
  }

  return {};
}