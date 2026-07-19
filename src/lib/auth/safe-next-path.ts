export function getSafeAuthNextPath(next: string | null, fallback = "/auth/redirect"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return fallback;
  }

  return next;
}
