/**
 * Sanitiza un parámetro `next`/`callbackUrl` de post-autenticación.
 *
 * Reglas: debe ser path absoluto del mismo origen. Se rechazan:
 * - URLs protocol-relative (`//evil.com`)
 * - Backslashes (`/\evil.com`): los browsers normalizan `\` a `/` en el
 *   header Location, convirtiéndolo en protocol-relative → open redirect
 * - Cualquier cosa que no empiece por `/`
 */
export function getSafeAuthNextPath(next: string | null, fallback = "/auth/redirect"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }

  // Control de caracteres de control que podrían confundir el parseo del header
  // eslint-disable-next-line no-control-regex
  if (/[\r\n\u0000-\u001f]/.test(next)) {
    return fallback;
  }

  return next;
}
