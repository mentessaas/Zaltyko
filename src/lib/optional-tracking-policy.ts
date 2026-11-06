const analyticsDisabled = process.env.NEXT_PUBLIC_DISABLE_ANALYTICS === "true";

/** Optional providers stay off unless a deployment explicitly opts in. */
export const optionalTrackingFlags = Object.freeze({
  // Disabled until the SDK exposes a supported way to prevent consent-revoked retries.
  posthog: false,
  vercelAnalytics:
    !analyticsDisabled &&
    process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === "true",
  speedInsights:
    !analyticsDisabled &&
    process.env.NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS === "true",
  // Hard-disabled until there is a separate advertising-consent contract.
  googleAds: false,
});

// Positive, exact allowlist: dynamic routes, app surfaces, auth, and anything
// not listed here remain ineligible for optional browser telemetry.
const publicTrackingPaths = new Set([
  "/",
  "/about",
  "/academias",
  "/blog",
  "/changelog",
  "/coaches",
  "/comparativas",
  "/es",
  "/en",
  "/es/ayuda",
  "/en/ayuda",
  "/es/sobre-nosotros",
  "/en/sobre-nosotros",
  "/features",
  "/faq",
  "/integraciones",
  "/integrations",
  "/pricing",
  "/sobre-nosotros",
]);

const postHogBuiltInPropertyKeys = new Set([
  "$current_url",
  "$device_id",
  "$insert_id",
  "$initial_current_url",
  "$initial_pathname",
  "$lib",
  "$lib_version",
  "$session_id",
  "$time",
  "$window_id",
  "$pathname",
  "distinct_id",
  "token",
]);

const publicEventNames = new Set(["$pageview", "lead_captured"]);
const allowedLeadSources = new Set(["landing_page"]);
const allowedPlans = new Set(["free", "starter", "growth", "network"]);

function normalizeOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getSafePublicTrackingPath(value: string): string | null {
  try {
    const parsed = new URL(value, "https://zaltyko.invalid");
    if (parsed.origin !== "https://zaltyko.invalid") return null;
    const pathname =
      parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    return publicTrackingPaths.has(pathname) ? pathname : null;
  } catch {
    return null;
  }
}

export function getSafePublicTrackingPathFromUrl(
  value: string,
  origin: string
): string | null {
  const safeOrigin = normalizeOrigin(origin);
  if (!safeOrigin) return null;

  try {
    const parsed = new URL(value, safeOrigin);
    if (parsed.origin !== safeOrigin) return null;
    return getSafePublicTrackingPath(parsed.pathname);
  } catch {
    return null;
  }
}

export function isOptionalTrackingAllowed(
  enabled: boolean,
  consentGranted: boolean,
  pathname: string
): boolean {
  return enabled && consentGranted && getSafePublicTrackingPath(pathname) !== null;
}

function isSafeProtocolValue(value: unknown): value is string | number | boolean {
  if (typeof value === "string") return value.length <= 200;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "boolean";
}

/**
 * Keeps only static public campaign dimensions and PostHog protocol fields.
 * SDK token/anonymous distinct_id/session fields are required for ingestion;
 * app user, academy, tenant IDs, free-form metadata, paths, queries, and every
 * referrer property are discarded. This code never calls posthog.identify().
 */
export function sanitizePostHogProperties(
  properties: Record<string, unknown>,
  pathname: string,
  origin: string
): Record<string, unknown> | null {
  const safePath = getSafePublicTrackingPath(pathname);
  const safeOrigin = normalizeOrigin(origin);
  if (!safePath || !safeOrigin) return null;

  const sanitized: Record<string, unknown> = {
    $current_url: safeOrigin + safePath,
    $pathname: safePath,
  };

  for (const key of postHogBuiltInPropertyKeys) {
    if (key === "$current_url" || key === "$pathname") continue;
    if (key === "$initial_current_url") {
      if (key in properties) sanitized[key] = safeOrigin + safePath;
      continue;
    }
    if (key === "$initial_pathname") {
      if (key in properties) sanitized[key] = safePath;
      continue;
    }
    const value = properties[key];
    if (isSafeProtocolValue(value)) sanitized[key] = value;
  }

  const source = properties.source;
  if (source === "landing_page" && allowedLeadSources.has(source)) {
    sanitized.source = source;
  }
  const plan = properties.plan;
  if (typeof plan === "string" && allowedPlans.has(plan)) {
    sanitized.plan = plan;
  }

  return sanitized;
}

/** App callers may contribute only the two bounded public campaign dimensions. */
export function sanitizePostHogAppProperties(
  eventName: string,
  properties: Record<string, unknown>,
  pathname: string,
  origin: string
): Record<string, unknown> | null {
  if (!publicEventNames.has(eventName)) return null;
  if (
    eventName === "lead_captured" &&
    properties.source !== "landing_page"
  ) {
    return null;
  }

  return sanitizePostHogProperties(
    {
      source: properties.source,
      plan: properties.plan,
    },
    pathname,
    origin
  );
}

/** Final PostHog send-time check. Unknown event names and properties fail closed. */
export function sanitizePostHogEvent<T extends {
  event?: unknown;
  properties?: unknown;
}>(
  event: T,
  options: {
    enabled: boolean;
    consentGranted: boolean;
    pathname: string;
    origin: string;
  }
): T | null {
  if (
    typeof event.event !== "string" ||
    !publicEventNames.has(event.event) ||
    !options.enabled ||
    !options.consentGranted
  ) {
    return null;
  }

  const safePath = getSafePublicTrackingPath(options.pathname);
  if (!safePath || !normalizeOrigin(options.origin)) return null;

  const properties =
    event.properties && typeof event.properties === "object"
      ? (event.properties as Record<string, unknown>)
      : {};
  if (
    event.event === "lead_captured" &&
    properties.source !== "landing_page"
  ) {
    return null;
  }

  const safeProperties = sanitizePostHogProperties(
    properties,
    safePath,
    options.origin
  );
  if (!safeProperties) return null;

  // Force the SDK's never-process setting after caller properties are discarded.
  safeProperties.$process_person_profile = false;
  return { ...event, properties: safeProperties };
}

function isSafeVercelLocation(
  eventUrl: string,
  options: {
    enabled: boolean;
    consentGranted: boolean;
    pathname: string;
    origin: string;
  }
): { safePath: string; safeOrigin: string } | null {
  const safeCurrentPath = getSafePublicTrackingPath(options.pathname);
  const safeEventPath = getSafePublicTrackingPathFromUrl(eventUrl, options.origin);
  const safeOrigin = normalizeOrigin(options.origin);

  if (
    !options.enabled ||
    !options.consentGranted ||
    !safeCurrentPath ||
    safeCurrentPath !== safeEventPath ||
    !safeOrigin
  ) {
    return null;
  }

  return { safePath: safeCurrentPath, safeOrigin };
}

export function sanitizeVercelAnalyticsEvent(
  event: { type: "pageview" | "event"; url: string },
  options: {
    enabled: boolean;
    consentGranted: boolean;
    pathname: string;
    origin: string;
  }
): { type: "pageview"; url: string } | null {
  if (event.type !== "pageview") return null;
  const safeLocation = isSafeVercelLocation(event.url, options);
  if (!safeLocation) return null;

  return {
    type: "pageview",
    url: safeLocation.safeOrigin + safeLocation.safePath,
  };
}

export function sanitizeSpeedInsightsEvent(
  event: { type: "vital"; url: string; route?: string },
  options: {
    enabled: boolean;
    consentGranted: boolean;
    pathname: string;
    origin: string;
  }
): { type: "vital"; url: string; route?: string } | null {
  const safeLocation = isSafeVercelLocation(event.url, options);
  if (!safeLocation) return null;

  const safeRoute =
    typeof event.route === "string" &&
    getSafePublicTrackingPath(event.route) === safeLocation.safePath
      ? safeLocation.safePath
      : undefined;

  return {
    type: "vital",
    url: safeLocation.safeOrigin + safeLocation.safePath,
    ...(safeRoute ? { route: safeRoute } : {}),
  };
}
