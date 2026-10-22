/**
 * Escapes special characters in a string for use in SQL LIKE clauses.
 * Escapes: % _ \
 */
export function escapeLikeSearch(str: string): string {
  return str.replace(/[%_\\]/g, (char) => `\\${char}`);
}
