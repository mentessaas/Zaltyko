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
  // /app/*/subdomain only drives the retired /api/academy/subdomain; without
  // this cut, ENABLE_ACTOR_PAGES would render a toggle that always gets 410.
  return /^\/app\/[^/]+\/(?:marketplace|store|subdomain)(?:\/|$)/.test(pathname)
    || /^\/a\/[^/]+\/tienda(?:\/|$)/.test(pathname);
}

/**
 * What a visitor (or crawler) gets at a retired marketing URL. Search engines
 * still list some of these pages, so each one answers with a permanent signal:
 * a 301 to the closest live page when there is an equivalent, or 410 Gone
 * when there is none (a soft redirect to an unrelated page reads as a soft
 * 404 and keeps the old URL in the index longer).
 */
export type RetiredMarketingOutcome =
  | { status: 301; location: string }
  | { status: 410 };

const RETIRED_MARKETING_RULES: ReadonlyArray<{ pattern: RegExp; outcome: RetiredMarketingOutcome }> = [
  // Discipline clusters the launch still serves: /features covers artística and rítmica.
  {
    pattern: /^\/(?:gimnasia-artistica|gimnasia-ritmica|artistic-gymnastics|rhythmic-gymnastics)(?:\/|$)/,
    outcome: { status: 301, location: "/features" },
  },
  // Disciplines outside the launch focus: the live site says it covers only
  // artística and rítmica, so no page is an equivalent; sending them to the
  // home page would be a soft 404.
  {
    pattern: /^\/(?:gimnasia-acrobatica|trampolin|acrobatic-gymnastics|trampoline)(?:\/|$)/,
    outcome: { status: 410 },
  },
  // Per-module landings and comparisons are summarised on /features.
  { pattern: /^\/(?:modules|comparativas)(?:\/|$)/, outcome: { status: 301, location: "/features" } },
  // The company story page is withdrawn; home is the closest live page.
  { pattern: /^\/sobre-nosotros(?:\/|$)/, outcome: { status: 301, location: "/" } },
  // Blog articles have no live equivalent at all.
  { pattern: /^\/blog(?:\/|$)/, outcome: { status: 410 } },
];

/** Outcome for a retired marketing URL, or null when the path is not retired. */
export function retiredMarketingOutcome(pathname: string): RetiredMarketingOutcome | null {
  const unlocalized = decodedPath(pathname).replace(/^\/(?:es|en)(?=\/)/, "");
  return RETIRED_MARKETING_RULES.find(({ pattern }) => pattern.test(unlocalized))?.outcome ?? null;
}

export function isRetiredLaunchMarketing(pathname: string): boolean {
  return retiredMarketingOutcome(pathname) !== null;
}
