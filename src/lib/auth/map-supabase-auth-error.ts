/**
 * Mapea los errores de Supabase Auth (mensajes en inglés del SDK) a cadenas
 * localizadas en español, para mantener la consistencia i18n en los toasts y
 * formularios de autenticación de Zaltyko.
 *
 * Contexto (ZAL-138 seguimiento, bug i18n magic link reportado por L11 el
 * 2026-08-24, confirmado visualmente 2026-08-31):
 *
 *   `supabase.auth.signInWithOtp({ email: "test@test.c" })` → `AuthApiError {
 *     message: 'Email address "test@test.c" is invalid', ... }`
 *
 *   Antes: el `description` del toast mostraba el mensaje crudo en EN.
 *   Ahora: cae en este mapeo y muestra un mensaje 100% en ES.
 *
 * Reglas:
 * 1. Matching por **substring** sobre el `message` (case-insensitive) para
 *    tolerar variaciones entre versiones del SDK (`@supabase/auth-js` v2.84.0
 *    al momento de escribir esto).
 * 2. Si no hay match, devolvemos un fallback genérico. NUNCA devolvemos el
 *    mensaje crudo — el objetivo es 100% ES para el usuario final.
 * 3. La función es **pura** (sin I/O, sin side-effects), testeable con vitest
 *    sin mocks.
 *
 * Uso:
 *
 *   ```ts
 *   const { error } = await supabase.auth.signInWithOtp({ email });
 *   if (error) {
 *     toast.pushToast({
 *       title: "Error al enviar enlace mágico",
 *       description: mapSupabaseAuthError(error),  // ← antes: error.message
 *       variant: "error",
 *     });
 *   }
 *   ```
 */

/**
 * Forma mínima de un error de Supabase Auth compatible con este mapeo.
 * Compatible con `AuthError`, `AuthApiError`, `AuthSessionMissingError`,
 * `AuthRetryableFetchError`, etc. (todos extienden `AuthError` y exponen
 * `message` + opcionalmente `code` / `status`).
 */
export interface SupabaseAuthErrorLike {
  message?: string | null;
  code?: string | null;
  status?: number | null;
}

/** Mensaje fallback que se muestra cuando ningún patrón coincide. */
const FALLBACK_MESSAGE =
  "No pudimos completar la operación. Inténtalo de nuevo en unos segundos.";

/**
 * Tabla de patrones → mensaje en español.
 * El primer substring (case-insensitive) que matchea gana.
 * Añadir entradas nuevas **arriba** de `FALLBACK_MESSAGE` en orden de
 * especificidad (más específico primero).
 */
const PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Email inválido (Supabase GoTrue valida formato tras pasar la validación local)
  [/email address .* is invalid/i, "La dirección de correo no es válida."],
  [/invalid email/i, "La dirección de correo no es válida."],

  // Email ya registrado / usuario existe
  [/user already registered/i, "Este correo ya está registrado. Prueba a iniciar sesión."],
  [/already registered/i, "Este correo ya está registrado. Prueba a iniciar sesión."],
  [/email already exists/i, "Este correo ya está registrado. Prueba a iniciar sesión."],

  // Credenciales incorrectas
  [/invalid login credentials/i, "Correo o contraseña incorrectos."],
  [/invalid credentials/i, "Correo o contraseña incorrectos."],

  // Cuenta no confirmada
  [/email not confirmed/i, "Revisa tu correo para confirmar la cuenta antes de iniciar sesión."],

  // Rate limit / demasiados intentos
  [/email rate limit/i, "Demasiados intentos. Espera un minuto antes de reintentar."],
  [/rate limit/i, "Demasiados intentos. Espera un minuto antes de reintentar."],
  [/too many requests/i, "Demasiados intentos. Espera un minuto antes de reintentar."],

  // Registro cerrado
  [/signups not allowed/i, "El registro está cerrado en este momento. Contacta con soporte."],
  [/signup disabled/i, "El registro está cerrado en este momento. Contacta con soporte."],

  // OTP / magic link caducado
  [/otp expired/i, "El enlace ha caducado. Solicita uno nuevo."],
  [/token expired/i, "El enlace ha caducado. Solicita uno nuevo."],

  // OAuth / proveedor
  [/provider .* not enabled/i, "Este proveedor de acceso no está habilitado."],
  [/oauth error/i, "No pudimos completar el acceso con el proveedor externo."],

  // Red / servidor (genérico, pero más amable que el mensaje técnico)
  [/network/i, "Problema de conexión. Comprueba tu red e inténtalo de nuevo."],
  [/fetch failed/i, "Problema de conexión. Comprueba tu red e inténtalo de nuevo."],
  [/internal server error/i, "Error interno del servidor. Inténtalo en unos minutos."],
];

/**
 * Convierte un error de Supabase Auth a un mensaje localizado en español.
 *
 * @param error Error o null/undefined. Si es null/undefined, devuelve el fallback.
 * @returns Cadena en español lista para mostrar al usuario.
 */
export function mapSupabaseAuthError(error: SupabaseAuthErrorLike | null | undefined): string {
  if (!error) return FALLBACK_MESSAGE;

  const message = (error.message ?? "").toString();
  if (!message.trim()) return FALLBACK_MESSAGE;

  for (const [pattern, localized] of PATTERNS) {
    if (pattern.test(message)) return localized;
  }

  return FALLBACK_MESSAGE;
}