import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const API_DIR = join(process.cwd(), "src/app/api");
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const METHOD_RE = /export\s+(?:async\s+function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE)\b/g;

interface RouteAudit {
  route: string;
  methods: string[];
  auth: "tenant" | "super-admin" | "bearer" | "public" | "webhook" | "cron" | "dev" | "deprecated" | "unknown";
  mutates: boolean;
  standardizedResponse: boolean;
  rateLimited: boolean;
  serviceRole: boolean;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) return walk(fullPath);
    return entry === "route.ts" || entry === "route.tsx" ? [fullPath] : [];
  });
}

function getMethods(source: string): string[] {
  const methods = new Set<string>();
  for (const match of source.matchAll(METHOD_RE)) {
    methods.add(match[1]);
  }
  return [...methods].sort();
}

function classify(route: string, source: string): RouteAudit["auth"] {
  const annotatedAuth = source.match(/@route-auth\s+(tenant|super-admin|bearer|public|webhook|cron|dev|deprecated)\b/)?.[1];
  if (annotatedAuth) return annotatedAuth as RouteAudit["auth"];

  if (source.includes("ENDPOINT_DEPRECATED") || source.includes("DEPRECATED")) return "deprecated";
  if (route.includes("/webhook") || source.includes("verifyWebhookSignature")) return "webhook";
  if (route.includes("/cron/") || source.includes("CRON_SECRET")) return "cron";
  if (route.includes("/api/dev/")) return "dev";
  if (source.includes("withSuperAdmin(")) return "super-admin";
  if (source.includes("withTenant(")) return "tenant";
  if (source.includes("auth.getUser(") || source.includes("getUser(token)") || source.includes("Authorization")) {
    return "bearer";
  }
  if (route.includes("/public/") || route.endsWith("/contact/route.ts") || route.endsWith("/plans/route.ts")) {
    return "public";
  }
  return "unknown";
}

function auditRoute(filePath: string): RouteAudit {
  const source = readFileSync(filePath, "utf8");
  const route = relative(process.cwd(), filePath);
  const methods = getMethods(source);

  return {
    route,
    methods,
    auth: classify(route, source),
    mutates: methods.some((method) => MUTATING_METHODS.has(method)),
    standardizedResponse: /api(Success|Created|Error)\(/.test(source),
    rateLimited: source.includes("withRateLimit(") || source.includes("rateLimit("),
    serviceRole:
      source.includes("@service-role") ||
      source.includes("SUPABASE_SERVICE_ROLE_KEY") ||
      source.includes("getSupabaseAdminClient("),
  };
}

const audits = walk(API_DIR).map(auditRoute).sort((a, b) => a.route.localeCompare(b.route));
const risky = audits.filter((route) =>
  route.mutates &&
  route.auth === "unknown"
);

const summary = audits.reduce(
  (acc, route) => {
    acc.total += 1;
    acc.byAuth[route.auth] = (acc.byAuth[route.auth] ?? 0) + 1;
    if (route.mutates) acc.mutating += 1;
    if (route.serviceRole) acc.serviceRole += 1;
    if (route.rateLimited) acc.rateLimited += 1;
    return acc;
  },
  {
    total: 0,
    mutating: 0,
    serviceRole: 0,
    rateLimited: 0,
    byAuth: {} as Record<RouteAudit["auth"], number>,
  }
);

console.log(JSON.stringify({ summary, risky, routes: audits }, null, 2));

if (process.argv.includes("--strict") && risky.length > 0) {
  process.exitCode = 1;
}
