/**
 * Conectar Stripe (cobro automático de cuotas, Fase 1): lectura del entorno.
 * Solo lee variables; la decisión de disponibilidad es pura y vive en
 * domain/availability.ts. Nunca devuelve ni registra el valor de la clave.
 */

export const CONNECT_ONBOARDING_FLAG_ENV = "ZALTYKO_CONNECT_ONBOARDING_ENABLED";

/** Apagada por defecto: solo el texto exacto "true" la enciende. */
export function isConnectOnboardingFlagEnabled(): boolean {
  return process.env[CONNECT_ONBOARDING_FLAG_ENV] === "true";
}

/**
 * Entorno de Stripe deducido solo del prefijo de STRIPE_SECRET_KEY.
 * Cualquier otro valor (o la ausencia de clave) es «desconocido».
 */
export function resolveConnectEnvironment(): "test" | "live" | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (typeof key !== "string") return null;
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  return null;
}
