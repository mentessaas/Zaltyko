/**
 * Referencia del proyecto Supabase de producción de Zaltyko.
 *
 * Fuente única para quien necesite saber si un despliegue apunta a la base de
 * producción: el middleware (bloquea mutaciones de las previews que apuntan a
 * producción) y Conectar Stripe (Fase 1: cerrado siempre contra producción).
 * Módulo sin dependencias, seguro en el runtime edge del middleware.
 *
 * No se usa VERCEL_ENV para esto: staging es un despliegue «production» del
 * proyecto zaltyko-staging y quedaría tratado como producción.
 */
export const PRODUCTION_SUPABASE_PROJECT_REF = "jegxfahsvugilbthbked";

/**
 * ¿Esta URL (de Supabase o de conexión a PostgreSQL) apunta al proyecto de
 * producción? Mira el host, el usuario (el pooler usa `postgres.<ref>`) y la
 * ruta. Un valor vacío o que no es una URL no apunta a producción.
 */
export function pointsAtProductionSupabase(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    const target = new URL(value);
    const identity = `${target.hostname} ${decodeURIComponent(target.username)} ${target.pathname}`;
    return identity.includes(PRODUCTION_SUPABASE_PROJECT_REF);
  } catch {
    return false;
  }
}
