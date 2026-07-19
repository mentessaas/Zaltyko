import type { Permission } from "@/db/schema/permissions";

type MethodPermissions = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Permission>>;

const ROUTE_PERMISSIONS: Array<{ prefix: string; permissions: MethodPermissions }> = [
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
  {
    prefix: "/api/assessments",
    permissions: { GET: "athletes:read", POST: "athletes:update", PATCH: "athletes:update" },
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
    prefix: "/api/reports",
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
    prefix: "/api/messages",
    permissions: {
      GET: "communications:read",
      POST: "communications:send",
      PATCH: "communications:send",
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
];

export function getRequiredRoutePermission(pathname: string, method: string): Permission | null {
  const normalizedMethod = method.toUpperCase() as keyof MethodPermissions;
  if (
    normalizedMethod === "POST" &&
    (pathname.endsWith("/generate-sessions") || pathname.includes("/recurring-settings"))
  ) {
    return "classes:schedule";
  }
  if (pathname.includes("/communication/templates")) {
    return normalizedMethod === "GET" ? "communications:read" : "communications:templates";
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
