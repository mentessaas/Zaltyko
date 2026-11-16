/**
 * Conectar Stripe (cobro automático de cuotas, Fase 1): lectura del entorno.
 * Solo lee variables; la decisión de disponibilidad es pura y vive en
 * domain/availability.ts. Nunca devuelve ni registra el valor de la clave.
 */
import { pointsAtProductionSupabase } from "@/lib/launch/production-supabase";

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

/**
 * Segundo cerrojo de la Fase 1, independiente del prefijo de la clave: ¿la
 * base de este despliegue es la Supabase de producción? Mira la URL pública
 * de Supabase y las de conexión a PostgreSQL. Si cualquiera apunta a
 * producción, Conectar Stripe queda cerrado (`live_not_released`) y el webhook
 * ignora los eventos. No usa VERCEL_ENV: staging es un despliegue
 * «production» de su propio proyecto y quedaría bloqueado.
 */
export function isProductionDatabase(): boolean {
  return [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_POOL,
    process.env.DATABASE_URL_DIRECT,
  ].some(pointsAtProductionSupabase);
}
