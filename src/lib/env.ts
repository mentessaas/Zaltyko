/**
 * Validación de variables de entorno usando Zod
 * Garantiza que todas las variables requeridas estén presentes y tengan el tipo correcto
 *
 * Importamos la configuración de dotenv aquí para asegurarnos de que
 * las variables de entorno de `.env` y `.env.local` estén cargadas
 * antes de que Zod las valide, independientemente del orden de imports.
 */
import "dotenv/config";
import { z } from "zod";

/**
 * Schema de validación para variables de entorno del servidor
 */
const serverEnvSchema = z.object({
  // Base de datos (no usar .url() porque PostgreSQL URLs no son válidas para el validador URL estándar)
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_URL_POOL: z.string().min(1).optional(),
  DATABASE_URL_DIRECT: z.string().min(1).optional(),

  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Mailgun
  MAILGUN_API_KEY: z.string().min(1).optional(),
  MAILGUN_DOMAIN: z.string().min(1).optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  // Webhook de cuentas conectadas (Stripe Connect) — secret de firma propio.
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // Lemon Squeezy
  LEMONSQUEEZY_API_KEY: z.string().min(1).optional(),
  LEMONSQUEEZY_WEBHOOK_SECRET: z.string().min(1).optional(),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Feature flags
  DISABLE_ONBOARDING_AUTOMATIONS: z.string().optional(),
  NEXT_PUBLIC_DISABLE_ANALYTICS: z.string().optional(),

  // Sentry
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),

  // Cron Jobs
  CRON_SECRET: z.string().min(1).optional(),

  // Seed overrides
  SEED_STRIPE_PRICE_PRO: z.string().optional(),
  SEED_STRIPE_PRODUCT_PRO: z.string().optional(),
  SEED_STRIPE_PRICE_PREMIUM: z.string().optional(),
  SEED_STRIPE_PRODUCT_PREMIUM: z.string().optional(),
});

/**
 * Schema de validación para variables de entorno públicas (cliente)
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_DISABLE_ANALYTICS: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
});

/**
 * Valida y parsea las variables de entorno del servidor
 * Usa safeParse para no fallar si faltan variables opcionales
 */
function validateServerEnv() {
  // Limpiar valores que puedan tener comillas extra
  const cleanedEnv = Object.fromEntries(
    Object.entries(process.env).map(([key, value]) => [
      key,
      typeof value === "string" ? value.replace(/^["']|["']$/g, "") : value,
    ])
  );

  const result = serverEnvSchema.safeParse(cleanedEnv);
  if (!result.success) {
    // Solo lanzar error si hay variables requeridas faltantes
    // Las variables opcionales no causarán error
    const requiredErrors = result.error.errors.filter(
      (err) => err.code === "invalid_type" && err.received === "undefined"
    );
    if (requiredErrors.length > 0) {
      const missingVars = requiredErrors.map((err) => err.path.join(".")).join(", ");
      throw new Error(`Required environment variables missing: ${missingVars}`);
    }
    // Si hay errores de validación pero no son de variables requeridas, usar los valores
    // originales pero loguear los errores en desarrollo
    if (process.env.NODE_ENV === "development") {
      console.warn("Algunas variables de entorno tienen problemas de validación:", result.error.errors);
    }
    return cleanedEnv as z.infer<typeof serverEnvSchema>;
  }
  // Advertir sobre variables críticas no configuradas
  const criticalMissing = [
    ["STRIPE_SECRET_KEY", result.data.STRIPE_SECRET_KEY],
    ["DATABASE_URL_POOL o DATABASE_URL", result.data.DATABASE_URL_POOL ?? result.data.DATABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", result.data.SUPABASE_SERVICE_ROLE_KEY],
  ]
    .filter(([, val]) => !val)
    .map(([key]) => key);

  if (criticalMissing.length > 0 && process.env.NODE_ENV === "production") {
    console.warn(`[env] Variables críticas no configuradas en producción: ${criticalMissing.join(", ")}`);
  }

  // Retornar valores parseados
  return result.data;
}

/**
 * Valida y parsea las variables de entorno públicas
 * Usa safeParse para no fallar si faltan variables opcionales
 */
function validatePublicEnv() {
  const result = publicEnvSchema.safeParse(process.env);
  if (!result.success) {
    // Solo lanzar error si hay variables requeridas faltantes
    const requiredErrors = result.error.errors.filter(
      (err) => err.code === "invalid_type" && err.received === "undefined"
    );
    if (requiredErrors.length > 0) {
      const missingVars = requiredErrors.map((err) => err.path.join(".")).join(", ");
      throw new Error(`Required public environment variables missing: ${missingVars}`);
    }
  }
  // Retornar valores parseados o valores por defecto
  return result.success ? result.data : publicEnvSchema.parse({});
}

/**
 * Variables de entorno validadas del servidor
 *
 * Este módulo puede terminar en el bundle del cliente si algo lo importa
 * transitivamente (p.ej. logger.ts, usado desde error.tsx). En el navegador
 * las variables server-only nunca están presentes (Next.js no las inyecta),
 * así que validarlas ahí solo produce falsos positivos ruidosos en consola.
 */
export const serverEnv =
  typeof window === "undefined"
    ? validateServerEnv()
    : ({ NODE_ENV: process.env.NODE_ENV } as z.infer<typeof serverEnvSchema>);

/**
 * Variables de entorno públicas validadas
 */
export const publicEnv = validatePublicEnv();

/**
 * Helper para obtener variables de entorno con valores por defecto seguros
 */
export function getEnvVar(key: keyof typeof serverEnv, defaultValue?: string): string {
  const value = serverEnv[key];
  if (value) {
    return value;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Environment variable ${key} is required but not set`);
}

/**
 * Helper para obtener variables de entorno opcionales
 */
export function getOptionalEnvVar(key: keyof typeof serverEnv): string | undefined {
  return serverEnv[key];
}

/**
 * Helper para verificar si estamos en producción
 */
export function isProduction(): boolean {
  return serverEnv.NODE_ENV === "production";
}

/**
 * Helper para verificar si estamos en desarrollo
 */
export function isDevelopment(): boolean {
  return serverEnv.NODE_ENV === "development";
}

/**
 * Helper para verificar si estamos en modo test
 */
export function isTest(): boolean {
  return serverEnv.NODE_ENV === "test";
}

/**
 * Obtiene la URL de conexión a la base de datos según el entorno
 * Durante el build o desarrollo sin variables, retorna un valor dummy si no hay variables configuradas
 */
export function getDatabaseUrl(): string {
  // Durante el build de Next.js, puede que no haya variables de entorno
  // Retornar un valor dummy para permitir que el build continúe
  const isBuildTime =
    typeof window === "undefined" &&
    (process.env.NEXT_PHASE === "phase-production-build" ||
      process.env.NEXT_PHASE === "phase-development-build");
  
  // En desarrollo, permitir valor dummy si no hay variables configuradas
  const allowDummyInDev = isDevelopment() && !serverEnv.DATABASE_URL_DIRECT && !serverEnv.DATABASE_URL;
  
  if (isProduction()) {
    // En producción, usar el pooler por defecto
    const url = serverEnv.DATABASE_URL_POOL ?? serverEnv.DATABASE_URL;
    if (!url) {
      if (isBuildTime) {
        return "postgresql://dummy:dummy@localhost:5432/dummy";
      }
      throw new Error("DATABASE_URL_POOL or DATABASE_URL must be set in production");
    }
    return url;
  }
  // En desarrollo, intentar primero el pooler (más compatible con IPv4)
  // y luego la conexión directa como fallback
  // Si DATABASE_URL_DIRECT contiene "db." (conexión directa IPv6), preferir el pooler
  const hasDirectConnection = serverEnv.DATABASE_URL_DIRECT?.includes("db.") && serverEnv.DATABASE_URL_DIRECT?.includes(".supabase.co:5432");
  const url = (hasDirectConnection && serverEnv.DATABASE_URL_POOL) 
    ? serverEnv.DATABASE_URL_POOL 
    : (serverEnv.DATABASE_URL_POOL ?? serverEnv.DATABASE_URL_DIRECT ?? serverEnv.DATABASE_URL);
  if (!url) {
    if (isBuildTime || allowDummyInDev) {
      // Retornar un valor dummy que no causará errores de conexión inmediatos
      // pero permitirá que el código se ejecute
      return "postgresql://dummy:dummy@localhost:5432/dummy";
    }
    throw new Error("DATABASE_URL_POOL, DATABASE_URL_DIRECT or DATABASE_URL must be set");
  }
  return url;
}

/**
 * Obtiene la URL base de la aplicación
 */
export function getAppUrl(): string {
  return serverEnv.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
