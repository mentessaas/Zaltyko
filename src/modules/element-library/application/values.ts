/** Ayudas internas de la aplicación de la biblioteca (lecturas y notas). */

/** Un id que no es uuid nunca llega a PostgreSQL: se trata como inexistente. */
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fecha de PostgreSQL (Date o texto) en ISO 8601. */
export function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
