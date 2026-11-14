import { createHash } from "node:crypto";

/** Solo servidor: hash de tokens, claves de auditoría y claves de avisos. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Clave de idempotencia de un aviso. El mismo cambio sobre la misma sesión
 * nunca crea dos avisos; un cambio distinto (otra hora, otra sustitución) sí.
 */
export function noticeDedupeKey(parts: readonly (string | number | null)[]): string {
  return sha256Hex(JSON.stringify(parts));
}
