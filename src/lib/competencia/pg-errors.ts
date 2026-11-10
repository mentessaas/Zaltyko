/**
 * Códigos de error de PostgreSQL que el panel de competencia traduce a
 * respuestas concretas. Drizzle puede envolver el error original en `cause`.
 */
export function pgErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if ("code" in error && typeof error.code === "string") return error.code;
  if (
    "cause" in error &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause
  ) {
    return String((error.cause as { code: unknown }).code);
  }
  return null;
}

/** 42P01: la tabla no existe (falta aplicar la migración candidata). */
export const isMissingTableError = (error: unknown) =>
  pgErrorCode(error) === "42P01";

/** 23505: clave única duplicada. */
export const isUniqueViolation = (error: unknown) =>
  pgErrorCode(error) === "23505";

/** 23503: la fila referenciada no existe. */
export const isForeignKeyViolation = (error: unknown) =>
  pgErrorCode(error) === "23503";

/** 23514: viola un CHECK (por ejemplo, una URL que no es http/https). */
export const isCheckViolation = (error: unknown) =>
  pgErrorCode(error) === "23514";
