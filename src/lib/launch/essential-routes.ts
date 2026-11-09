/** Public scope of the first release. Historical implementations stay in Git. */
export const ESSENTIAL_PUBLIC_ROUTES = [
  "/", "/features", "/pricing", "/faq", "/contact", "/ayuda",
  "/terminos", "/politica-privacidad",
] as const;

/**
 * Historical APIs closed for the whole launch with 410 Gone. Unlike the
 * experimental flags, no environment variable can reopen them: they include a
 * public Stripe Connect checkout and family-facing commerce, which contradict
 * the launch red line (no Connect, no charging families through Zaltyko).
 */
export const RETIRED_LAUNCH_API_PREFIXES = [
  "/api/marketplace",
  "/api/checkout",
  "/api/products",
  "/api/listing-categories",
  "/api/academy/stripe-connect",
  "/api/academy/subdomain",
  "/api/advertising",
  "/api/docs",
] as const;

function atSegment(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function decodedPath(pathname: string): string {
  try { return decodeURIComponent(pathname); } catch { return pathname; }
}

/** Historical API answered with 410 before any rate limiter or handler runs. */
export function isRetiredLaunchApi(pathname: string): boolean {
  pathname = decodedPath(pathname);
  return RETIRED_LAUNCH_API_PREFIXES.some(prefix => atSegment(pathname, prefix));
}

/** Historical page answered with a real 404 before App Router renders it. */
export function isOutsideEssentialLaunch(pathname: string): boolean {
  pathname = decodedPath(pathname);
  if ([
    "/owner/insights", "/owner/health-score", "/marketplace",
    "/academy-marketplace", "/dashboard/marketplace",
    "/academias", "/coaches", "/events", "/empleo",
    // /integraciones presented paid Stripe checkout as available while billing
    // is closed; /docs published the whole API contract to any visitor.
    "/integraciones", "/integrations", "/docs",
  ].some(prefix => atSegment(pathname, prefix))) return true;
  return /^\/app\/[^/]+\/(?:marketplace|store)(?:\/|$)/.test(pathname)
    || /^\/a\/[^/]+\/tienda(?:\/|$)/.test(pathname);
}

export function isRetiredLaunchMarketing(pathname: string): boolean {
  pathname = decodedPath(pathname);
  if (["/modules", "/comparativas", "/blog", "/sobre-nosotros"].some(prefix => atSegment(pathname, prefix))) return true;
  const unlocalized = pathname.replace(/^\/(?:es|en)(?=\/)/, "");
  return /^\/(?:gimnasia-artistica|gimnasia-ritmica|gimnasia-acrobatica|trampolin|artistic-gymnastics|rhythmic-gymnastics|acrobatic-gymnastics|trampoline)(?:\/|$)/.test(unlocalized);
}
