export type RouteAuthClass =
  | "tenant"
  | "super-admin"
  | "bearer"
  | "session"
  | "custom"
  | "public"
  | "webhook"
  | "cron"
  | "dev"
  | "deprecated"
  | "unknown";

const ROUTE_AUTH_CLASSES =
  "tenant|super-admin|bearer|session|custom|public|webhook|cron|dev|deprecated";

/** Classifies one HTTP method without treating an undocumented guard as safe. */
export function classifyRouteAuth(
  route: string,
  source: string,
  method: string
): RouteAuthClass {
  const methodAnnotation = [...source.matchAll(
    new RegExp(`@route-auth\\s+(GET|POST|PUT|PATCH|DELETE)\\s+(${ROUTE_AUTH_CLASSES})\\b`, "g")
  )].find((match) => match[1] === method.toUpperCase())?.[2] as RouteAuthClass | undefined;
  if (methodAnnotation) return methodAnnotation;

  const routeAnnotation = source.match(
    new RegExp(`@route-auth\\s+(${ROUTE_AUTH_CLASSES})\\b`)
  )?.[1] as RouteAuthClass | undefined;
  if (routeAnnotation) return routeAnnotation;

  if (source.includes("ENDPOINT_DEPRECATED") || source.includes("DEPRECATED")) return "deprecated";
  if (route.includes("/webhook") || source.includes("verifyWebhookSignature")) return "webhook";
  if (route.includes("/cron/") || source.includes("CRON_SECRET")) return "cron";
  if (route.includes("/api/dev/")) return "dev";
  if (source.includes("withSuperAdmin(")) return "super-admin";
  if (source.includes("withTenant(")) return "tenant";
  if (
    /@auth-flexible\s+route-guard-reason:\s*\S/.test(source) ||
    source.includes("directoryRequest(")
  ) return "custom";
  if (
    source.includes("getCurrentUser(") ||
    source.includes("withAuthenticatedNoTenant(") ||
    source.includes("auth.getUser(")
  ) return "session";
  if (
    source.includes("getUser(token)") ||
    source.includes("Authorization") ||
    source.includes("getBearerToken(") ||
    source.includes("createBearerSupabaseClient(")
  ) return "bearer";
  if (route.includes("/public/") || route.endsWith("/contact/route.ts") || route.endsWith("/plans/route.ts")) {
    return "public";
  }
  return "unknown";
}
