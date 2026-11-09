/** Public scope of the first release. Historical implementations stay in Git. */
export const ESSENTIAL_PUBLIC_ROUTES = [
  "/", "/features", "/pricing", "/faq", "/contact", "/ayuda",
  "/terminos", "/politica-privacidad", "/integraciones",
] as const;

function atSegment(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function decodedPath(pathname: string): string {
  try { return decodeURIComponent(pathname); } catch { return pathname; }
}

export function isOutsideEssentialLaunch(pathname: string): boolean {
  pathname = decodedPath(pathname);
  if ([
    "/owner/insights", "/owner/health-score", "/marketplace",
    "/academy-marketplace", "/dashboard/marketplace", "/api/marketplace",
    "/academias", "/coaches", "/events", "/empleo",
  ].some(prefix => atSegment(pathname, prefix))) return true;
  return /^\/app\/[^/]+\/marketplace(?:\/|$)/.test(pathname);
}

export function isRetiredLaunchMarketing(pathname: string): boolean {
  pathname = decodedPath(pathname);
  if (["/modules", "/comparativas", "/blog", "/sobre-nosotros"].some(prefix => atSegment(pathname, prefix))) return true;
  const unlocalized = pathname.replace(/^\/(?:es|en)(?=\/)/, "");
  return /^\/(?:gimnasia-artistica|gimnasia-ritmica|gimnasia-acrobatica|trampolin|artistic-gymnastics|rhythmic-gymnastics|acrobatic-gymnastics|trampoline)(?:\/|$)/.test(unlocalized);
}
