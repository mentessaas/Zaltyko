export type ExperimentalReleaseFlags = {
  academyMarketplace: boolean;
  b2bStore: boolean;
  actorPages: boolean;
};

export function getExperimentalReleaseFlags(
  env: Record<string, string | undefined> = process.env
): ExperimentalReleaseFlags {
  return {
    academyMarketplace: env.ENABLE_ACADEMY_MARKETPLACE === "true",
    b2bStore: env.ENABLE_B2B_STORE === "true",
    actorPages: env.ENABLE_ACTOR_PAGES === "true",
  };
}

function startsAtSegment(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Keep unfinished routes unavailable until their schema and E2E gates pass. */
export function isExperimentalRouteDisabled(
  pathname: string,
  flags: ExperimentalReleaseFlags
): boolean {
  if (!flags.academyMarketplace) {
    if (startsAtSegment(pathname, "/academy-marketplace")) return true;
    if (startsAtSegment(pathname, "/marketplace/orders")) return true;
    if (pathname === "/admin/disputes" || pathname === "/api/admin/disputes") return true;
    if (/^\/app\/[^/]+\/marketplace(?:\/|$)/.test(pathname)) return true;
    for (const prefix of [
      "/api/marketplace/search",
      "/api/marketplace/listings",
      "/api/marketplace/orders",
      "/api/marketplace/disputes",
      "/api/marketplace/ratings",
      "/api/marketplace/webhook",
    ]) {
      if (startsAtSegment(pathname, prefix)) return true;
    }
  }

  if (!flags.b2bStore) {
    if (startsAtSegment(pathname, "/api/products")) return true;
    if (pathname === "/api/checkout") return true;
    if (pathname === "/api/academy/stripe-connect/onboard") return true;
    if (/^\/app\/[^/]+\/store(?:\/|$)/.test(pathname)) return true;
    if (/^\/a\/[^/]+\/tienda(?:\/|$)/.test(pathname)) return true;
  }

  if (!flags.actorPages) {
    if (/^\/app\/[^/]+\/audit-timeline(?:\/|$)/.test(pathname)) return true;
    for (const prefix of [
      "/api/actor-pages",
      "/api/actor-consents",
      "/api/academy/subdomain",
      "/sitemap-actor-pages",
      "/sitemap-actor-pages.xml",
    ]) {
      if (startsAtSegment(pathname, prefix)) return true;
    }
    if (/^\/(?:a|c|g|p)\/[^/]+(?:\/|$)/.test(pathname)) return true;
    if (/^\/app\/[^/]+\/public-page(?:\/|$)/.test(pathname)) return true;
    if (/^\/app\/[^/]+\/privacy(?:\/|$)/.test(pathname)) return true;
    if (/^\/app\/[^/]+\/subdomain(?:\/|$)/.test(pathname)) return true;
    if (/^\/app\/(?:athlete|coach|supplier)\/[^/]+\/public-page(?:\/|$)/.test(pathname)) return true;
  }

  return false;
}
