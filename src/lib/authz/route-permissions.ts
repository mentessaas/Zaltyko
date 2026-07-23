import type { Permission } from "@/db/schema/permissions";

type MethodPermissions = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Permission>>;

const ROUTE_PERMISSIONS: Array<{ prefix: string; permissions: MethodPermissions }> = [
  {
    prefix: "/api/academies",
    permissions: {
      GET: "settings:read",
      POST: "settings:write",
      PUT: "settings:write",
      PATCH: "settings:write",
      DELETE: "settings:write",
    },
  },
  {
    prefix: "/api/athletes",
    permissions: {
      GET: "athletes:read",
      POST: "athletes:create",
      PUT: "athletes:update",
      PATCH: "athletes:update",
      DELETE: "athletes:delete",
    },
  },
  {
    prefix: "/api/classes",
    permissions: {
      GET: "classes:read",
      POST: "classes:create",
      PUT: "classes:update",
      PATCH: "classes:update",
      DELETE: "classes:delete",
    },
  },
  {
    prefix: "/api/class-sessions",
    permissions: {
      GET: "classes:read",
      POST: "classes:schedule",
      PUT: "classes:schedule",
      PATCH: "classes:schedule",
      DELETE: "classes:schedule",
    },
  },
  ...["/api/class-enrollments", "/api/class-waiting-list"].map((prefix) => ({
    prefix,
    permissions: {
      GET: "classes:read" as Permission,
      POST: "classes:schedule" as Permission,
      PUT: "classes:schedule" as Permission,
      PATCH: "classes:schedule" as Permission,
      DELETE: "classes:schedule" as Permission,
    },
  })),
  {
    prefix: "/api/groups",
    permissions: {
      GET: "classes:read",
      POST: "classes:create",
      PUT: "classes:update",
      PATCH: "classes:update",
      DELETE: "classes:delete",
    },
  },
  {
    prefix: "/api/attendance",
    permissions: { GET: "classes:read", POST: "classes:schedule", PATCH: "classes:schedule" },
  },
  ...["/api/academy-diagnostics", "/api/audit-logs"].map((prefix) => ({
    prefix,
    permissions: {
      GET: "settings:read" as Permission,
      POST: "settings:write" as Permission,
    },
  })),
  ...["/api/academy-expenses", "/api/coach-compensation"].map((prefix) => ({
    prefix,
    permissions: {
      GET: "billing:read" as Permission,
      POST: "billing:update" as Permission,
      PUT: "billing:update" as Permission,
      PATCH: "billing:update" as Permission,
      DELETE: "billing:update" as Permission,
    },
  })),
  {
    prefix: "/api/assessments",
    permissions: {
      GET: "athletes:read",
      POST: "athletes:update",
      PATCH: "athletes:update",
      DELETE: "athletes:update",
    },
  },
  {
    prefix: "/api/coaches",
    permissions: {
      GET: "coaches:read",
      POST: "coaches:create",
      PUT: "coaches:update",
      PATCH: "coaches:update",
      DELETE: "coaches:delete",
    },
  },
  {
    prefix: "/api/coach-notes",
    permissions: {
      GET: "athletes:read",
      POST: "athletes:update",
      PUT: "athletes:update",
      PATCH: "athletes:update",
      DELETE: "athletes:update",
    },
  },
  {
    prefix: "/api/guardians",
    permissions: {
      GET: "athletes:read",
      POST: "athletes:create",
      PUT: "athletes:update",
      PATCH: "athletes:update",
      DELETE: "athletes:delete",
    },
  },
  {
    prefix: "/api/billing",
    permissions: {
      GET: "billing:read",
      POST: "billing:update",
      PUT: "billing:update",
      PATCH: "billing:update",
      DELETE: "billing:update",
    },
  },
  ...[
    "/api/charges",
    "/api/billing-items",
    "/api/receipts",
    "/api/scholarships",
    "/api/discounts",
  ].map((prefix) => ({
    prefix,
    permissions: {
      GET: "billing:read" as Permission,
      POST: "billing:create" as Permission,
      PUT: "billing:update" as Permission,
      PATCH: "billing:update" as Permission,
      DELETE: "billing:update" as Permission,
    },
  })),
  {
    prefix: "/api/transactions",
    permissions: { GET: "billing:read", POST: "billing:payments" },
  },
  ...["/api/payments", "/api/quick-actions/record-payment"].map((prefix) => ({
    prefix,
    permissions: {
      GET: "billing:read" as Permission,
      POST: "billing:update" as Permission,
      PUT: "billing:update" as Permission,
      PATCH: "billing:update" as Permission,
      DELETE: "billing:update" as Permission,
    },
  })),
  {
    prefix: "/api/reports",
    permissions: {
      GET: "reports:read",
      POST: "reports:create",
      PUT: "reports:create",
      PATCH: "reports:create",
      DELETE: "reports:create",
    },
  },
  {
    prefix: "/api/dashboard",
    permissions: { GET: "reports:read" },
  },
  {
    prefix: "/api/analytics",
    permissions: { GET: "reports:read", POST: "reports:create" },
  },
  {
    prefix: "/api/events",
    permissions: {
      GET: "events:read",
      POST: "events:create",
      PUT: "events:update",
      PATCH: "events:update",
      DELETE: "events:delete",
    },
  },
  {
    prefix: "/api/communication",
    permissions: {
      GET: "communications:read",
      POST: "communications:send",
      PUT: "communications:send",
      PATCH: "communications:send",
      DELETE: "communications:templates",
    },
  },
  {
    prefix: "/api/contact-messages",
    permissions: {
      GET: "communications:read",
      POST: "communications:send",
      PUT: "communications:send",
      PATCH: "communications:send",
      DELETE: "communications:send",
    },
  },
  {
    prefix: "/api/messages",
    permissions: {
      GET: "communications:read",
      POST: "communications:send",
      PATCH: "communications:send",
      DELETE: "communications:send",
    },
  },
  {
    prefix: "/api/announcements",
    permissions: {
      GET: "communications:read",
      POST: "communications:send",
      PATCH: "communications:send",
      DELETE: "communications:send",
    },
  },
  {
    prefix: "/api/invitations",
    permissions: { GET: "settings:users", POST: "settings:users" },
  },
  {
    prefix: "/api/link-requests",
    permissions: {
      GET: "settings:users",
      POST: "settings:users",
      PATCH: "settings:users",
    },
  },
  {
    prefix: "/api/licenses",
    permissions: { GET: "athletes:read", POST: "athletes:update" },
  },
  {
    prefix: "/api/competition-results",
    permissions: { GET: "athletes:read", POST: "athletes:update" },
  },
  {
    prefix: "/api/upload",
    permissions: { POST: "athletes:update" },
  },
  {
    prefix: "/api/whatsapp",
    permissions: {
      GET: "communications:read",
      POST: "communications:send",
    },
  },
  {
    prefix: "/api/academy-memberships",
    permissions: { DELETE: "settings:users" },
  },
];

export function getRequiredRoutePermission(pathname: string, method: string): Permission | null {
  const normalizedMethod = method.toUpperCase() as keyof MethodPermissions;
  // Creation and membership discovery are account-scoped onboarding flows.
  // They have no academy context yet and authorize inside the handler.
  if (pathname === "/api/academies" && ["GET", "POST"].includes(normalizedMethod)) {
    return null;
  }
  if (/^\/api\/athletes\/[^/]+\/family-conversation$/.test(pathname)) {
    return "communications:send";
  }
  if (/^\/api\/groups\/[^/]+\/family-conversation$/.test(pathname)) {
    return "communications:send";
  }
  if (/^\/api\/academies\/[^/]+\/announcements(?:\/|$)/.test(pathname)) {
    return normalizedMethod === "GET"
      ? "communications:read"
      : "communications:send";
  }
  if (
    normalizedMethod === "POST" &&
    (pathname.endsWith("/generate-sessions") || pathname.includes("/recurring-settings"))
  ) {
    return "classes:schedule";
  }
  if (pathname.includes("/communication/templates")) {
    return normalizedMethod === "GET" ? "communications:read" : "communications:templates";
  }
  if (/^\/api\/charges\/[^/]+\/refund$/.test(pathname)) {
    return "billing:payments";
  }
  if (/^\/api\/charges\/[^/]+\/remind$/.test(pathname)) {
    return "billing:update";
  }
  if (/^\/api\/dashboard\/[^/]+\/financial-metrics$/.test(pathname)) {
    return "billing:reports";
  }
  if (pathname === "/api/notifications/send") {
    return "communications:send";
  }
  if (pathname.startsWith("/api/reports/") && pathname.endsWith("/export")) {
    return "reports:export";
  }
  if (/^\/api\/academies\/[^/]+\/settings$/.test(pathname)) {
    return normalizedMethod === "GET" ? "settings:read" : "settings:write";
  }
  if (/^\/api\/academies\/[^/]+\/roles(?:\/|$)/.test(pathname)) {
    return "settings:users";
  }
  const match = ROUTE_PERMISSIONS.find(
    (route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`)
  );
  return match?.permissions[normalizedMethod] ?? null;
}
