import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

import { getRequiredRoutePermission } from "../src/lib/authz/route-permissions";
import type { Permission } from "../src/db/schema/permissions";

const API_DIR = join(process.cwd(), "src/app/api");
const MIDDLEWARE_PATH = join(process.cwd(), "middleware.ts");
const MIDDLEWARE_SOURCE = existsSync(MIDDLEWARE_PATH)
  ? readFileSync(MIDDLEWARE_PATH, "utf8")
  : "";
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const METHOD_RE = /export\s+(?:async\s+function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE)\b/g;
const SENSITIVE_PREFIXES = [
  "/api/academies/",
  "/api/academy-memberships",
  "/api/assessments",
  "/api/athletes",
  "/api/attendance",
  "/api/billing",
  "/api/billing-items",
  "/api/charges",
  "/api/class-enrollments",
  "/api/class-sessions",
  "/api/classes",
  "/api/coaches",
  "/api/communication",
  "/api/guardians",
  "/api/groups",
  "/api/invitations",
  "/api/messages",
  "/api/payments",
  "/api/receipts",
  "/api/reports",
  "/api/scholarships",
] as const;

type AuthClass =
  | "tenant"
  | "super-admin"
  | "bearer"
  | "public"
  | "webhook"
  | "cron"
  | "dev"
  | "deprecated"
  | "unknown";

interface RouteAudit {
  route: string;
  pathname: string;
  methods: string[];
  auth: AuthClass;
  mutates: boolean;
  zodValidated: boolean;
  standardizedResponse: boolean;
  standardizedErrors: boolean;
  rateLimited: boolean;
  verifiedTenantRateLimit: boolean;
  serviceRole: boolean;
  acceptsClientTenantId: boolean;
  academyScoped: boolean;
  resourceScope: "not-applicable" | "detected" | "manual-review";
  sensitiveData: Array<"minors" | "family" | "billing" | "communications">;
  capabilities: Partial<Record<string, Permission>>;
  expectedDenial: "401/403" | "signature/secret" | "public-contract" | "410" | "404";
  findings: string[];
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
  return [...new Set([...source.matchAll(METHOD_RE)].map((match) => match[1]))].sort();
}

function toPathname(filePath: string): string {
  const routePath = relative(API_DIR, filePath)
    .split(sep)
    .join("/")
    .replace(/\/route\.tsx?$/, "")
    .replace(/\[([^\]]+)\]/g, "__$1__");
  return `/api/${routePath}`;
}

function classify(route: string, source: string): AuthClass {
  const annotatedAuth = source.match(
    /@route-auth\s+(tenant|super-admin|bearer|public|webhook|cron|dev|deprecated)\b/
  )?.[1] as AuthClass | undefined;
  if (annotatedAuth) return annotatedAuth;
  if (source.includes("ENDPOINT_DEPRECATED") || source.includes("DEPRECATED")) return "deprecated";
  if (route.includes("/webhook") || source.includes("verifyWebhookSignature")) return "webhook";
  if (route.includes("/cron/") || source.includes("CRON_SECRET")) return "cron";
  if (route.includes("/api/dev/")) return "dev";
  if (source.includes("withSuperAdmin(")) return "super-admin";
  if (source.includes("withTenant(")) return "tenant";
  if (
    source.includes("auth.getUser(") ||
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

function getSensitiveData(pathname: string): RouteAudit["sensitiveData"] {
  const result: RouteAudit["sensitiveData"] = [];
  if (/\/(athletes|assessments|attendance|classes|guardians|groups)(\/|$)/.test(pathname)) result.push("minors");
  if (/\/(family|guardians)(\/|$)/.test(pathname)) result.push("family");
  if (/\/(billing|charges|payments|receipts|scholarships|transactions)(\/|$)/.test(pathname)) result.push("billing");
  if (/\/(messages|communication|notifications|contact-messages)(\/|$)/.test(pathname)) result.push("communications");
  return result;
}

function auditRoute(filePath: string): RouteAudit {
  const source = readFileSync(filePath, "utf8");
  const route = relative(process.cwd(), filePath).split(sep).join("/");
  const pathname = toPathname(filePath);
  const methods = getMethods(source);
  const auth = classify(route, source);
  const mutates = methods.some((method) => MUTATING_METHODS.has(method));
  const capabilities = Object.fromEntries(
    methods.flatMap((method) => {
      const permission = getRequiredRoutePermission(pathname, method);
      return permission ? [[method, permission]] : [];
    })
  ) as Partial<Record<string, Permission>>;
  const globallyRateLimited =
    mutates &&
    MIDDLEWARE_SOURCE.includes("isApiPath(pathname)") &&
    MIDDLEWARE_SOURCE.includes("isMutation(req.method)") &&
    (MIDDLEWARE_SOURCE.includes("rateLimitResponse(req") || MIDDLEWARE_SOURCE.includes("checkRateLimit(req")) &&
    !route.includes("/webhook/") && !route.includes("/cron/") && !route.includes("/api/dev/");
  const dynamicResource = /__(?!academyId__)[A-Za-z][A-Za-z0-9]*Id__/.test(pathname);
  const scopeEvidence =
    /(?:verify|authorize)(?:Athlete|Class|Group|Coach|Academy|Resource).*?(?:Access|Resource|Capability)/.test(source) ||
    /@resource-scope\s+(academy|assigned|guardian|participant|self|super-admin)\b/.test(source) ||
    /guardianAthletes|conversationParticipants|classCoachAssignments/.test(source) ||
    (/\.tenantId/.test(source) && /\.academyId/.test(source) && /context\.tenantId/.test(source));
  const sensitive = SENSITIVE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const findings: string[] = [];
  const missingCapabilityMethods = auth === "tenant" && sensitive
    ? methods.filter((method) => !capabilities[method])
    : [];
  if (missingCapabilityMethods.length) findings.push(`missing-capability:${missingCapabilityMethods.join(",")}`);
  if (dynamicResource && sensitive && !scopeEvidence) findings.push("resource-scope-manual-review");
  const acceptsClientTenantId = /tenantId\s*:\s*z\./.test(source) || /(?:body|query|payload)\.tenantId/.test(source);
  if (acceptsClientTenantId) {
    findings.push(source.includes("isSuperAdmin") ? "client-tenant-id-super-admin-only" : "client-tenant-id");
  }
  const validatesExternalInput =
    /from ["']zod["']|\.safeParse\(|\.parse\(/.test(source) ||
    (source.includes("request.formData()") && /FILE_(?:REQUIRED|TOO_LARGE)|INVALID_FILE_TYPE/.test(source));
  if (mutates && !validatesExternalInput && source.includes("request.json()") && auth === "tenant") {
    findings.push("mutation-without-zod");
  }

  return {
    route,
    pathname,
    methods,
    auth,
    mutates,
    zodValidated: validatesExternalInput,
    standardizedResponse: /api(Success|Created|Error)\(/.test(source),
    standardizedErrors: /apiError\(|handleApiError\(/.test(source),
    rateLimited: globallyRateLimited || source.includes("withRateLimit(") || source.includes("rateLimit("),
    verifiedTenantRateLimit: auth === "tenant" && mutates,
    serviceRole: source.includes("@service-role") || source.includes("SUPABASE_SERVICE_ROLE_KEY") || source.includes("getSupabaseAdminClient("),
    acceptsClientTenantId,
    academyScoped: /academyId/.test(source) && (auth === "tenant" || /verifyAcademyAccess/.test(source)),
    resourceScope: dynamicResource ? (scopeEvidence ? "detected" : "manual-review") : "not-applicable",
    sensitiveData: getSensitiveData(pathname),
    capabilities,
    expectedDenial: auth === "deprecated" ? "410" : auth === "webhook" || auth === "cron" ? "signature/secret" : auth === "public" ? "public-contract" : auth === "unknown" ? "404" : "401/403",
    findings,
  };
}

const audits = walk(API_DIR).map(auditRoute).sort((a, b) => a.route.localeCompare(b.route));
const risky = audits.filter((route) => route.mutates && route.auth === "unknown");
const semanticRisks = audits.filter((route) =>
  route.findings.some((finding) => finding.startsWith("missing-capability") || finding === "client-tenant-id")
);
const summary = audits.reduce((acc, route) => {
  acc.total += 1;
  acc.byAuth[route.auth] = (acc.byAuth[route.auth] ?? 0) + 1;
  if (route.mutates) acc.mutating += 1;
  if (route.serviceRole) acc.serviceRole += 1;
  if (route.rateLimited) acc.rateLimited += 1;
  if (Object.keys(route.capabilities).length) acc.capabilityProtected += 1;
  if (route.resourceScope === "manual-review") acc.resourceScopeManualReview += 1;
  if (route.acceptsClientTenantId) acc.clientTenantId += 1;
  if (route.zodValidated) acc.zodValidated += 1;
  if (route.standardizedResponse) acc.standardizedResponse += 1;
  if (route.standardizedErrors) acc.standardizedErrors += 1;
  if (route.academyScoped) acc.academyScoped += 1;
  return acc;
}, {
  total: 0,
  mutating: 0,
  serviceRole: 0,
  rateLimited: 0,
  capabilityProtected: 0,
  resourceScopeManualReview: 0,
  clientTenantId: 0,
  zodValidated: 0,
  standardizedResponse: 0,
  standardizedErrors: 0,
  academyScoped: 0,
  byAuth: {} as Record<AuthClass, number>,
});

const capabilityInventory = Object.fromEntries(
  [...new Set(
    audits
      .flatMap((route) => Object.values(route.capabilities))
      .filter((permission): permission is Permission => Boolean(permission))
  )].sort().map((permission) => {
    const consumers = audits.flatMap((route) =>
      Object.entries(route.capabilities)
        .filter(([, value]) => value === permission)
        .map(([method]) => `${method} ${route.pathname}`)
    );
    const baselineRoles = ["owner"];
    if ([
      "athletes:read",
      "athletes:update",
      "classes:read",
      "classes:schedule",
      "reports:read",
      "events:read",
      "communications:read",
      "communications:send",
    ].includes(permission)) baselineRoles.push("coach");
    if (["communications:read", "communications:send"].includes(permission)) {
      baselineRoles.push("parent", "athlete");
    }
    return [permission, {
      domain: permission.split(":")[0],
      consumers,
      baselineRoles,
      customRoles: "allowed only when explicitly granted by an active, unexpired academy role",
      ownership: baselineRoles.length === 1 ? "academy owner or explicit custom capability" : "capability plus resource relationship where applicable",
      academyScope: "verified ownership/membership for the effective academy",
      resourceScope: ["athletes", "classes", "communications", "events"].includes(permission.split(":")[0])
        ? "resource ownership, assignment, participant, guardian/self link, or academy match required"
        : "resource academy and tenant must match the authorized context",
      denial: "403 without disclosing cross-scope resource existence",
    }];
  })
);

const output = { summary, capabilityInventory, risky, semanticRisks, routes: audits };
if (process.argv.includes("--json")) console.log(JSON.stringify(output, null, 2));
else console.log(JSON.stringify({ summary, risky, semanticRisks }, null, 2));

if (process.argv.includes("--strict") && (risky.length > 0 || semanticRisks.length > 0)) {
  process.exitCode = 1;
}
