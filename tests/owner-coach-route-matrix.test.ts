/**
 * P1 #8 · Matriz de autorización rol × ruta/API para el rol coach.
 *
 * Las rutas se ejecutan de verdad. Solo se simulan la identidad, el límite de
 * peticiones y la base de datos (que responde únicamente a las consultas de
 * los guards). El coach debe:
 *  - poder usar Hoy/Pasar lista y la política operativa en su sede;
 *  - recibir 403/404 en todo lo demás, sin leer datos del club ni escribir,
 *    tanto con su propia organización y sede como con las de otro club.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  db: undefined as undefined | Record<string, unknown>,
  userId: "",
}));
const mocks = vi.hoisted(() => ({
  roster: vi.fn(),
  record: vi.fn(),
  usage: vi.fn(),
  calendar: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => holder.db?.[property as string] }
  ),
}));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => (holder.userId ? { id: holder.userId } : null),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  rateLimit: async () => ({
    success: true,
    limit: 1000,
    remaining: 999,
    reset: Math.floor(Date.now() / 1000) + 60,
  }),
}));
vi.mock(
  "@/modules/attendance/application/owner-session-attendance",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/modules/attendance/application/owner-session-attendance")
    >()),
    loadOwnerSessionAttendanceRoster: mocks.roster,
  })
);
vi.mock(
  "@/modules/attendance/application/attendance-service",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/modules/attendance/application/attendance-service")
    >()),
    recordAttendance: mocks.record,
  })
);
vi.mock("@/modules/scheduling/application/calendar-sessions", () => ({
  getOwnerCalendar: mocks.calendar,
}));
vi.mock(
  "@/modules/saas-billing/application/organization-usage",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/modules/saas-billing/application/organization-usage")
    >()),
    getOrganizationUsage: mocks.usage,
  })
);

import {
  createFakeDb,
  createFakeDbState,
  ids,
  members,
  type FakeDbState,
} from "./helpers/coach-access-fake-db";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Handler = (
  request: Request,
  context: { params: Promise<Record<string, string>> }
) => Promise<Response>;
type Target = { organizationId: string; locationId: string };

let state: FakeDbState;

beforeAll(() => {
  vi.stubEnv("ZALTYKO_TEAM_ACCESS_ENABLED", "true");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  state = createFakeDbState();
  holder.db = createFakeDb(state) as unknown as Record<string, unknown>;
  holder.userId = ids.coach;
  mocks.roster.mockReset().mockResolvedValue([]);
  mocks.record.mockReset().mockImplementation(async (command: {
    sessionId: string;
    enrollmentId: string;
    status: string;
  }) => ({
    id: ids.entity,
    sessionId: command.sessionId,
    enrollmentId: command.enrollmentId,
    status: command.status,
    recordedAt: new Date("2026-11-09T17:05:00.000Z"),
  }));
  mocks.calendar.mockReset().mockResolvedValue({
    range: { from: "2026-11-09", to: "2026-11-09" },
    sessions: [],
    truncated: false,
    locations: [],
    groups: [],
    coachesAvailable: false,
    assignedOnly: true,
  });
  mocks.usage.mockReset().mockResolvedValue({
    readOnly: false,
    planCode: "growth",
    resources: [],
    items: [],
  });
});

function query(values: Record<string, string>): string {
  return `?${new URLSearchParams(values).toString()}`;
}

function buildRequest(method: Method, path: string, body?: unknown): Request {
  const headers = new Headers({
    origin: "https://zaltyko.test",
    "sec-fetch-site": "same-origin",
    "idempotency-key": "coach-matrix-0001",
  });
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(new URL(path, "https://zaltyko.test"), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(
  load: () => Promise<unknown>,
  method: Method,
  path: string,
  options: { params?: Record<string, string>; body?: unknown } = {}
): Promise<Response> {
  const handler = ((await load()) as Record<string, unknown>)[method] as
    | Handler
    | undefined;
  if (!handler) throw new Error(`${path} no exporta ${method}`);
  return handler(buildRequest(method, path, options.body), {
    params: Promise.resolve(options.params ?? {}),
  });
}

/* ------------------------------------------------------------------------ */
/* Rutas prohibidas al coach, ejecutadas                                     */
/* ------------------------------------------------------------------------ */

interface DeniedCase {
  route: string;
  method: Method;
  area: string;
  load: () => Promise<unknown>;
  path: (target: Target) => string;
  params?: Record<string, string>;
  body?: (target: Target) => unknown;
}

const e = ids.entity;
const day = "2026-11-09";

const deniedCases: DeniedCase[] = [
  // Gimnastas y familias
  { route: "owner/athlete-intake/route.ts", method: "GET", area: "gimnastas", load: () => import("@/app/api/v1/owner/athlete-intake/route"), path: (t) => `/api/v1/owner/athlete-intake${query({ organizationId: t.organizationId })}` },
  { route: "owner/athletes/[athleteId]/route.ts", method: "GET", area: "gimnastas", load: () => import("@/app/api/v1/owner/athletes/[athleteId]/route"), params: { athleteId: e }, path: (t) => `/api/v1/owner/athletes/${e}${query({ organizationId: t.organizationId, locationId: t.locationId })}` },
  { route: "owner/athletes/[athleteId]/archive/route.ts", method: "POST", area: "gimnastas", load: () => import("@/app/api/v1/owner/athletes/[athleteId]/archive/route"), params: { athleteId: e }, path: () => `/api/v1/owner/athletes/${e}/archive`, body: (t) => ({ organizationId: t.organizationId, locationId: t.locationId }) },
  { route: "owner/families/options/route.ts", method: "GET", area: "gimnastas", load: () => import("@/app/api/v1/owner/families/options/route"), path: (t) => `/api/v1/owner/families/options${query({ organizationId: t.organizationId, locationId: t.locationId })}` },
  { route: "owner/guardians/[guardianId]/contacts/route.ts", method: "GET", area: "gimnastas", load: () => import("@/app/api/v1/owner/guardians/[guardianId]/contacts/route"), params: { guardianId: e }, path: (t) => `/api/v1/owner/guardians/${e}/contacts${query({ organizationId: t.organizationId, locationId: t.locationId })}` },
  { route: "owner/guardians/[guardianId]/profile/route.ts", method: "GET", area: "gimnastas", load: () => import("@/app/api/v1/owner/guardians/[guardianId]/profile/route"), params: { guardianId: e }, path: (t) => `/api/v1/owner/guardians/${e}/profile${query({ organizationId: t.organizationId, locationId: t.locationId })}` },
  // Solicitudes de prueba (P2 #15)
  { route: "owner/trial-requests/route.ts", method: "GET", area: "solicitudes", load: () => import("@/app/api/v1/owner/trial-requests/route"), path: (t) => `/api/v1/owner/trial-requests${query({ organizationId: t.organizationId, locationId: t.locationId })}` },
  { route: "owner/trial-requests/[requestId]/status/route.ts", method: "POST", area: "solicitudes", load: () => import("@/app/api/v1/owner/trial-requests/[requestId]/status/route"), params: { requestId: e }, path: () => `/api/v1/owner/trial-requests/${e}/status`, body: (t) => ({ organizationId: t.organizationId, expectedRevision: 1, status: "contacted" }) },
  { route: "owner/trial-requests/[requestId]/convert/route.ts", method: "POST", area: "solicitudes", load: () => import("@/app/api/v1/owner/trial-requests/[requestId]/convert/route"), params: { requestId: e }, path: () => `/api/v1/owner/trial-requests/${e}/convert`, body: (t) => ({ organizationId: t.organizationId, expectedRevision: 1, familyName: "Pérez", relationship: "parent", destination: "enrollment", classTemplateId: null }) },
  { route: "owner/trial-requests/[requestId]/anonymize/route.ts", method: "POST", area: "solicitudes", load: () => import("@/app/api/v1/owner/trial-requests/[requestId]/anonymize/route"), params: { requestId: e }, path: () => `/api/v1/owner/trial-requests/${e}/anonymize`, body: (t) => ({ organizationId: t.organizationId, expectedRevision: 1 }) },
  { route: "owner/trial-requests/links/route.ts", method: "POST", area: "solicitudes", load: () => import("@/app/api/v1/owner/trial-requests/links/route"), path: () => "/api/v1/owner/trial-requests/links", body: (t) => ({ organizationId: t.organizationId, locationId: t.locationId, action: "enable" }) },
  // Clases, grupos e inscripciones
  // O1: titulares por clase y sustitución por sesión. El coach no asigna ni
  // sustituye, ni siquiera en su sede.
  { route: "owner/classes/[classTemplateId]/coaches/route.ts", method: "GET", area: "clases", load: () => import("@/app/api/v1/owner/classes/[classTemplateId]/coaches/route"), params: { classTemplateId: e }, path: (t) => `/api/v1/owner/classes/${e}/coaches${query({ organizationId: t.organizationId, locationId: t.locationId })}` },
  { route: "owner/classes/[classTemplateId]/coaches/route.ts", method: "PUT", area: "clases", load: () => import("@/app/api/v1/owner/classes/[classTemplateId]/coaches/route"), params: { classTemplateId: e }, path: () => `/api/v1/owner/classes/${e}/coaches`, body: (t) => ({ organizationId: t.organizationId, locationId: t.locationId, clientRequestId: e, staffProfileIds: [], expectedStaffProfileIds: [] }) },
  { route: "owner/sessions/[sessionId]/coaches/route.ts", method: "PUT", area: "clases", load: () => import("@/app/api/v1/owner/sessions/[sessionId]/coaches/route"), params: { sessionId: e }, path: () => `/api/v1/owner/sessions/${e}/coaches`, body: (t) => ({ organizationId: t.organizationId, locationId: t.locationId, clientRequestId: e, staffProfileIds: [], expectedStaffProfileIds: [], reason: null }) },
  { route: "owner/classes/route.ts", method: "GET", area: "clases", load: () => import("@/app/api/v1/owner/classes/route"), path: (t) => `/api/v1/owner/classes${query({ organizationId: t.organizationId, locationId: t.locationId })}` },
  // P2 #17: la plantilla de plan de una clase es solo de la dirección.
  { route: "owner/classes/[classTemplateId]/plan-template/route.ts", method: "GET", area: "clases", load: () => import("@/app/api/v1/owner/classes/[classTemplateId]/plan-template/route"), params: { classTemplateId: e }, path: (t) => `/api/v1/owner/classes/${e}/plan-template${query({ organizationId: t.organizationId, locationId: t.locationId })}` },
  { route: "owner/classes/[classTemplateId]/plan-template/route.ts", method: "PUT", area: "clases", load: () => import("@/app/api/v1/owner/classes/[classTemplateId]/plan-template/route"), params: { classTemplateId: e }, path: () => `/api/v1/owner/classes/${e}/plan-template`, body: (t) => ({ organizationId: t.organizationId, locationId: t.locationId, expectedRevision: null, focus: "Salto", blocks: [] }) },
  { route: "owner/groups/route.ts", method: "GET", area: "grupos", load: () => import("@/app/api/v1/owner/groups/route"), path: (t) => `/api/v1/owner/groups${query({ organizationId: t.organizationId, locationId: t.locationId })}` },
  { route: "owner/groups/[groupId]/memberships/route.ts", method: "GET", area: "grupos", load: () => import("@/app/api/v1/owner/groups/[groupId]/memberships/route"), params: { groupId: e }, path: (t) => `/api/v1/owner/groups/${e}/memberships${query({ organizationId: t.organizationId, q: "ana" })}` },
  { route: "owner/groups/[groupId]/memberships/route.ts", method: "POST", area: "grupos", load: () => import("@/app/api/v1/owner/groups/[groupId]/memberships/route"), params: { groupId: e }, path: () => `/api/v1/owner/groups/${e}/memberships`, body: (t) => ({ organizationId: t.organizationId, athleteId: e, startsOn: day, status: "active" }) },
  { route: "owner/groups/[groupId]/memberships/receipt/route.ts", method: "GET", area: "grupos", load: () => import("@/app/api/v1/owner/groups/[groupId]/memberships/receipt/route"), params: { groupId: e }, path: (t) => `/api/v1/owner/groups/${e}/memberships/receipt${query({ organizationId: t.organizationId, idempotencyKey: "coach-matrix-0001" })}` },
  { route: "owner/enrollments/route.ts", method: "GET", area: "inscripciones", load: () => import("@/app/api/v1/owner/enrollments/route"), path: (t) => `/api/v1/owner/enrollments${query({ organizationId: t.organizationId, locationId: t.locationId, classTemplateId: e, q: "ana" })}` },
  { route: "owner/enrollments/[enrollmentId]/route.ts", method: "PATCH", area: "inscripciones", load: () => import("@/app/api/v1/owner/enrollments/[enrollmentId]/route"), params: { enrollmentId: e }, path: () => `/api/v1/owner/enrollments/${e}`, body: (t) => ({ organizationId: t.organizationId, expectedVersion: 1, toStatus: "cancelled", effectiveOn: day }) },
  // Finanzas: cuotas, cobros, facturas, tarifas
  { route: "owner/billing/manual-payments/route.ts", method: "GET", area: "finanzas", load: () => import("@/app/api/v1/owner/billing/manual-payments/route"), path: (t) => `/api/v1/owner/billing/manual-payments${query({ organizationId: t.organizationId, locationId: t.locationId })}` },
  { route: "owner/billing/manual-payments/route.ts", method: "POST", area: "finanzas", load: () => import("@/app/api/v1/owner/billing/manual-payments/route"), path: () => "/api/v1/owner/billing/manual-payments", body: (t) => ({ organizationId: t.organizationId, chargeId: e, amountCents: 1000, method: "cash", receivedAt: "2026-11-09T10:00:00Z" }) },
  { route: "owner/billing/monthly-invoices/options/route.ts", method: "GET", area: "finanzas", load: () => import("@/app/api/v1/owner/billing/monthly-invoices/options/route"), path: (t) => `/api/v1/owner/billing/monthly-invoices/options${query({ organizationId: t.organizationId, locationId: t.locationId, servicePeriod: "2026-11" })}` },
  { route: "owner/billing/family-collection-preference/route.ts", method: "GET", area: "finanzas", load: () => import("@/app/api/v1/owner/billing/family-collection-preference/route"), path: (t) => `/api/v1/owner/billing/family-collection-preference${query({ organizationId: t.organizationId, familyId: e })}` },
  { route: "owner/billing/family-collection-preference/route.ts", method: "PUT", area: "finanzas", load: () => import("@/app/api/v1/owner/billing/family-collection-preference/route"), path: () => "/api/v1/owner/billing/family-collection-preference", body: (t) => ({ organizationId: t.organizationId, familyId: e, mode: "manual", expectedVersion: 0 }) },
  { route: "owner/price-plans/options/route.ts", method: "GET", area: "finanzas", load: () => import("@/app/api/v1/owner/price-plans/options/route"), path: (t) => `/api/v1/owner/price-plans/options${query({ organizationId: t.organizationId, locationId: t.locationId })}` },
  { route: "owner/enrollments/[enrollmentId]/price-plan/route.ts", method: "PATCH", area: "finanzas", load: () => import("@/app/api/v1/owner/enrollments/[enrollmentId]/price-plan/route"), params: { enrollmentId: e }, path: () => `/api/v1/owner/enrollments/${e}/price-plan`, body: (t) => ({ organizationId: t.organizationId, locationId: t.locationId, pricePlanId: e, startsOn: day }) },
  // Personal y equipo
  { route: "owner/staff/route.ts", method: "GET", area: "equipo", load: () => import("@/app/api/v1/owner/staff/route"), path: (t) => `/api/v1/owner/staff${query({ organizationId: t.organizationId })}` },
  { route: "owner/staff/access/route.ts", method: "GET", area: "equipo", load: () => import("@/app/api/v1/owner/staff/access/route"), path: (t) => `/api/v1/owner/staff/access${query({ organizationId: t.organizationId })}` },
  { route: "owner/staff/invitations/route.ts", method: "POST", area: "equipo", load: () => import("@/app/api/v1/owner/staff/invitations/route"), path: () => "/api/v1/owner/staff/invitations", body: (t) => ({ organizationId: t.organizationId, email: "coach2@example.invalid", role: "coach", locationIds: [t.locationId], givenName: "Ana", familyName: "Ruiz" }) },
  // Plan y suscripción
  { route: "owner/saas/billing/route.ts", method: "GET", area: "plan", load: () => import("@/app/api/v1/owner/saas/billing/route"), path: (t) => `/api/v1/owner/saas/billing${query({ organizationId: t.organizationId })}` },
  { route: "owner/saas/checkout/route.ts", method: "GET", area: "plan", load: () => import("@/app/api/v1/owner/saas/checkout/route"), path: (t) => `/api/v1/owner/saas/checkout${query({ organizationId: t.organizationId })}` },
  { route: "owner/saas/portal/route.ts", method: "POST", area: "plan", load: () => import("@/app/api/v1/owner/saas/portal/route"), path: () => "/api/v1/owner/saas/portal", body: (t) => ({ organizationId: t.organizationId }) },
  { route: "owner/saas/trial/start/route.ts", method: "POST", area: "plan", load: () => import("@/app/api/v1/owner/saas/trial/start/route"), path: () => "/api/v1/owner/saas/trial/start", body: (t) => ({ organizationId: t.organizationId }) },
  { route: "owner/saas/usage/route.ts", method: "GET", area: "plan", load: () => import("@/app/api/v1/owner/saas/usage/route"), path: (t) => `/api/v1/owner/saas/usage${query({ organizationId: t.organizationId })}` },
  { route: "owner/saas/usage/route.ts", method: "POST", area: "plan", load: () => import("@/app/api/v1/owner/saas/usage/route"), path: () => "/api/v1/owner/saas/usage", body: (t) => ({ organizationId: t.organizationId, resource: "athletes", resourceId: e, confirmArchive: true }) },
  // Exportación de datos
  { route: "owner/data-export/route.ts", method: "GET", area: "exportación", load: () => import("@/app/api/v1/owner/data-export/route"), path: (t) => `/api/v1/owner/data-export${query({ organizationId: t.organizationId })}` },
  // Ajustes y descubrimiento
  { route: "owner/dashboard-layout/route.ts", method: "GET", area: "ajustes", load: () => import("@/app/api/v1/owner/dashboard-layout/route"), path: (t) => `/api/v1/owner/dashboard-layout${query({ organizationId: t.organizationId })}` },
  { route: "owner/product-discovery/route.ts", method: "GET", area: "ajustes", load: () => import("@/app/api/v1/owner/product-discovery/route"), path: (t) => `/api/v1/owner/product-discovery${query({ organizationId: t.organizationId, locationId: t.locationId })}` },
  // Agregado de toda la organización
  { route: "owner/dashboard/route.ts", method: "GET", area: "agregado", load: () => import("@/app/api/v1/owner/dashboard/route"), path: (t) => `/api/v1/owner/dashboard${query({ organization_id: t.organizationId, location_id: t.locationId })}` },
  { route: "capacity/heatmap/route.ts", method: "GET", area: "agregado", load: () => import("@/app/api/v1/capacity/heatmap/route"), path: (t) => `/api/v1/capacity/heatmap${query({ organization_id: t.organizationId, location_id: t.locationId })}` },
  { route: "health-scores/current/route.ts", method: "GET", area: "agregado", load: () => import("@/app/api/v1/health-scores/current/route"), path: (t) => `/api/v1/health-scores/current${query({ organization_id: t.organizationId, location_id: t.locationId })}` },
  { route: "health-scores/history/route.ts", method: "GET", area: "agregado", load: () => import("@/app/api/v1/health-scores/history/route"), path: (t) => `/api/v1/health-scores/history${query({ organization_id: t.organizationId, location_id: t.locationId })}` },
  { route: "metrics/[key]/route.ts", method: "GET", area: "agregado", load: () => import("@/app/api/v1/metrics/[key]/route"), params: { key: "active_athletes" }, path: (t) => `/api/v1/metrics/active_athletes${query({ organization_id: t.organizationId, location_id: t.locationId })}` },
  { route: "retention/cohorts/route.ts", method: "GET", area: "agregado", load: () => import("@/app/api/v1/retention/cohorts/route"), path: (t) => `/api/v1/retention/cohorts${query({ organization_id: t.organizationId, location_id: t.locationId })}` },
  { route: "insights/route.ts", method: "GET", area: "agregado", load: () => import("@/app/api/v1/insights/route"), path: (t) => `/api/v1/insights${query({ organization_id: t.organizationId, location_id: t.locationId })}` },
  { route: "insights/[id]/route.ts", method: "GET", area: "agregado", load: () => import("@/app/api/v1/insights/[id]/route"), params: { id: e }, path: (t) => `/api/v1/insights/${e}${query({ organization_id: t.organizationId, location_id: t.locationId })}` },
];

const ownSite: Target = { organizationId: ids.orgA, locationId: ids.siteAssigned };
const foreignClub: Target = { organizationId: ids.orgForeign, locationId: ids.siteForeign };

describe.each([
  ["con su organización y su sede", ownSite],
  ["con organizationId/locationId de otro club", foreignClub],
])("coach denegado %s", (_label, target) => {
  it.each(deniedCases.map((item) => [`${item.method} ${item.route} (${item.area})`, item] as const))(
    "%s",
    async (_name, item) => {
      const response = await call(item.load, item.method, item.path(target), {
        params: item.params,
        body: item.body?.(target),
      });

      expect([403, 404]).toContain(response.status);
      expect(response.headers.get("cache-control") ?? "").not.toMatch(/public/);
      expect(state.domainReads).toEqual([]);
      expect(mocks.usage).not.toHaveBeenCalled();
      expect(mocks.record).not.toHaveBeenCalled();
    }
  );
});

it("el coach sin sedes tampoco entra en ninguna ruta de gestión", async () => {
  holder.userId = ids.coachNoSites;
  for (const item of deniedCases) {
    const response = await call(item.load, item.method, item.path(ownSite), {
      params: item.params,
      body: item.body?.(ownSite),
    });
    expect([403, 404], `${item.method} ${item.route}`).toContain(response.status);
  }
  expect(state.domainReads).toEqual([]);
});

/* ------------------------------------------------------------------------ */
/* Rutas permitidas al coach: Hoy/Pasar lista y la política operativa        */
/* ------------------------------------------------------------------------ */

const loadSessions = () => import("@/app/api/v1/owner/attendance/sessions/route");
const loadSessionAttendance = () =>
  import("@/app/api/v1/owner/sessions/[sessionId]/attendance/route");
const loadPolicy = () => import("@/app/api/v1/owner/operational-policy/route");
const loadCalendar = () => import("@/app/api/v1/owner/calendar/route");

describe("coach permitido solo en su sede", () => {
  it("lista sesiones para pasar lista en su sede", async () => {
    const response = await call(
      loadSessions,
      "GET",
      `/api/v1/owner/attendance/sessions${query({ organizationId: ids.orgA, locationId: ids.siteAssigned })}`
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      organization: { id: ids.orgA },
      locationId: ids.siteAssigned,
    });
  });

  it.each([
    ["otra sede de su club", { organizationId: ids.orgA, locationId: ids.siteOther }],
    ["una sede de otro club", { organizationId: ids.orgA, locationId: ids.siteForeign }],
    ["otro club", foreignClub],
  ])("deniega el listado de %s", async (_label, target) => {
    const response = await call(
      loadSessions,
      "GET",
      `/api/v1/owner/attendance/sessions${query(target)}`
    );

    expect(response.status).toBe(403);
    expect(state.domainReads).toEqual([]);
  });

  it("lee su calendario en su sede, como entrenadora y sin acceso a más sedes", async () => {
    const range = { from: day, to: day };
    const response = await call(
      loadCalendar,
      "GET",
      `/api/v1/owner/calendar${query({ ...ownSite, ...range })}`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.calendar).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({
          member: expect.objectContaining({ role: "coach" }),
          selectedLocationId: ids.siteAssigned,
          canViewOrganizationAggregate: false,
        }),
        locationId: ids.siteAssigned,
        ...range,
      })
    );
    // La sede pedida sale del alcance de la entrenadora: ninguna otra.
    const scope = mocks.calendar.mock.calls[0][0].scope;
    expect(scope.locations.map((location: { id: string }) => location.id)).toEqual([ids.siteAssigned]);
  });

  it("sin sede pedida, el calendario usa la sede asignada y nunca el agregado", async () => {
    const response = await call(
      loadCalendar,
      "GET",
      `/api/v1/owner/calendar${query({ organizationId: ids.orgA, from: day, to: day })}`
    );

    expect(response.status).toBe(200);
    const { scope } = mocks.calendar.mock.calls[0][0];
    expect(scope.canViewOrganizationAggregate).toBe(false);
    expect(scope.selectedLocationId).toBe(ids.siteAssigned);
  });

  it.each([
    ["otra sede de su club", { organizationId: ids.orgA, locationId: ids.siteOther }],
    ["una sede de otro club", { organizationId: ids.orgA, locationId: ids.siteForeign }],
    ["otro club", foreignClub],
  ])("deniega el calendario de %s sin leer sesiones", async (_label, target) => {
    const response = await call(
      loadCalendar,
      "GET",
      `/api/v1/owner/calendar${query({ ...target, from: day, to: day })}`
    );

    expect(response.status).toBe(403);
    expect(mocks.calendar).not.toHaveBeenCalled();
    expect(state.domainReads).toEqual([]);
  });

  it("un coach sin sedes no lee el calendario", async () => {
    holder.userId = ids.coachNoSites;

    const response = await call(
      loadCalendar,
      "GET",
      `/api/v1/owner/calendar${query({ ...ownSite, from: day, to: day })}`
    );

    expect(response.status).toBe(403);
    expect(mocks.calendar).not.toHaveBeenCalled();
  });

  it("lee y registra la asistencia de una sesión de su sede", async () => {
    const path = `/api/v1/owner/sessions/${ids.sessionAssigned}/attendance`;
    const params = { sessionId: ids.sessionAssigned };

    const read = await call(loadSessionAttendance, "GET", `${path}${query(ownSite)}`, { params });
    const write = await call(loadSessionAttendance, "POST", path, {
      params,
      body: { ...ownSite, enrollmentId: e, status: "present" },
    });

    expect(read.status).toBe(200);
    expect(write.status).toBe(201);
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ids.orgA,
        expectedLocationId: ids.siteAssigned,
        sessionId: ids.sessionAssigned,
        actor: { userId: ids.coach, memberId: members[ids.coach].memberId },
      })
    );
  });

  it("pasa lista como sustituto en una sesión de su sede sin asignación (opción A)", async () => {
    const path = `/api/v1/owner/sessions/${ids.sessionUnassigned}/attendance`;
    const params = { sessionId: ids.sessionUnassigned };

    const read = await call(loadSessionAttendance, "GET", `${path}${query(ownSite)}`, { params });
    const write = await call(loadSessionAttendance, "POST", path, {
      params,
      body: { ...ownSite, enrollmentId: e, status: "late" },
    });

    expect(read.status).toBe(200);
    expect(write.status).toBe(201);
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: ids.sessionUnassigned,
        actor: { userId: ids.coach, memberId: members[ids.coach].memberId },
      })
    );
  });

  it("una sesión de otra sede devuelve lo mismo que una inexistente", async () => {
    const target = { organizationId: ids.orgA, locationId: ids.siteOther };
    const responses = await Promise.all(
      [ids.sessionOtherSite, "a0000000-0000-4000-8000-0000000000ff"].map((sessionId) =>
        call(
          loadSessionAttendance,
          "GET",
          `/api/v1/owner/sessions/${sessionId}/attendance${query(target)}`,
          { params: { sessionId } }
        )
      )
    );

    const [otherSite, missing] = await Promise.all(
      responses.map(async (response) => ({ status: response.status, body: await response.json() }))
    );
    expect(otherSite).toEqual(missing);
    expect(otherSite.status).toBe(404);
  });

  it.each([
    ["sesión de otra sede con esa sede", ids.sessionOtherSite, { organizationId: ids.orgA, locationId: ids.siteOther }, 404],
    ["sesión de otra sede disfrazada con su sede", ids.sessionOtherSite, ownSite, 404],
    ["su sesión con otra sede", ids.sessionAssigned, { organizationId: ids.orgA, locationId: ids.siteOther }, 404],
    ["sesión de otro club", ids.sessionForeign, foreignClub, 403],
    ["sesión de otro club con su organización", ids.sessionForeign, ownSite, 404],
  ] as const)("no lee ni registra asistencia en una %s", async (_label, sessionId, target, status) => {
    const path = `/api/v1/owner/sessions/${sessionId}/attendance`;
    const params = { sessionId };

    const read = await call(loadSessionAttendance, "GET", `${path}${query(target)}`, { params });
    const write = await call(loadSessionAttendance, "POST", path, {
      params,
      body: { ...target, enrollmentId: e, status: "present" },
    });

    expect(read.status).toBe(status);
    expect(write.status).toBe(status);
    expect(mocks.roster).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("lee el estado de solo lectura de su sede sin ver el plan", async () => {
    const response = await call(loadPolicy, "GET", `/api/v1/owner/operational-policy${query(ownSite)}`);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toEqual({ readOnly: false, planCode: "staff" });
    expect(JSON.stringify(body)).not.toContain("growth");
  });

  it.each([
    ["otra sede", { organizationId: ids.orgA, locationId: ids.siteOther }],
    ["otro club", foreignClub],
  ])("no lee la política operativa de %s", async (_label, target) => {
    const response = await call(loadPolicy, "GET", `/api/v1/owner/operational-policy${query(target)}`);

    expect(response.status).toBe(403);
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("un coach sin sedes no lista sesiones ni lee la política", async () => {
    holder.userId = ids.coachNoSites;

    const sessionsResponse = await call(loadSessions, "GET", `/api/v1/owner/attendance/sessions${query(ownSite)}`);
    const policyResponse = await call(loadPolicy, "GET", `/api/v1/owner/operational-policy${query({ organizationId: ids.orgA })}`);

    expect(sessionsResponse.status).toBe(403);
    expect(policyResponse.status).toBe(403);
  });
});

describe("referencia owner/manager en las rutas del coach (sin cambios)", () => {
  it("el owner sigue listando cualquier sede y viendo su plan", async () => {
    holder.userId = ids.owner;

    const sessionsResponse = await call(
      loadSessions,
      "GET",
      `/api/v1/owner/attendance/sessions${query({ organizationId: ids.orgA, locationId: ids.siteOther })}`
    );
    const policy = await call(loadPolicy, "GET", `/api/v1/owner/operational-policy${query({ organizationId: ids.orgA })}`);

    expect(sessionsResponse.status).toBe(200);
    expect((await policy.json()).data).toEqual({ readOnly: false, planCode: "growth" });
  });

  it("el manager con una sede sigue limitado a ella", async () => {
    holder.userId = ids.manager;

    const own = await call(loadSessions, "GET", `/api/v1/owner/attendance/sessions${query(ownSite)}`);
    const other = await call(
      loadSessions,
      "GET",
      `/api/v1/owner/attendance/sessions${query({ organizationId: ids.orgA, locationId: ids.siteOther })}`
    );

    expect(own.status).toBe(200);
    expect(other.status).toBe(403);
  });
});

/* ------------------------------------------------------------------------ */
/* Inventario: ninguna ruta v1 queda fuera de la matriz                      */
/* ------------------------------------------------------------------------ */

const apiRoot = join(process.cwd(), "src/app/api/v1");

/** Mutaciones no ejecutadas arriba: su guard debe estar en el código. */
const staticallyGuarded: Record<string, { guard: string; via?: string }> = {
  // O4: las dos rutas de importación comparten la entrada de import-request.ts.
  "POST owner/athlete-import/confirm/route.ts": { guard: "resolveOwnerScope", via: "src/app/api/v1/owner/athlete-import/import-request.ts" },
  "POST owner/athlete-import/preview/route.ts": { guard: "resolveOwnerScope", via: "src/app/api/v1/owner/athlete-import/import-request.ts" },
  "POST owner/athlete-intake/[athleteId]/assign/route.ts": { guard: "resolveOwnerScope" },
  "POST owner/athlete-intake/route.ts": { guard: "resolveOwnerScope" },
  "PATCH owner/athletes/[athleteId]/route.ts": { guard: "resolveOwnerScope" },
  "POST owner/billing/monthly-invoices/issue/route.ts": { guard: "resolveOwnerScope" },
  "POST owner/billing/price-plans/route.ts": { guard: "resolveOwnerScope" },
  // Recordatorios de impago: el servicio exige además propiedad o administración (requireReminderRole).
  "GET owner/billing/payment-reminders/route.ts": { guard: "resolveOwnerScope", via: "src/modules/payment-reminders/application/service.ts" },
  "POST owner/billing/payment-reminders/route.ts": { guard: "resolveOwnerScope" },
  "POST owner/billing/payment-reminders/preview/route.ts": { guard: "resolveOwnerScope" },
  "GET owner/billing/payment-reminders/settings/route.ts": { guard: "resolveOwnerScope", via: "src/modules/payment-reminders/application/settings.ts" },
  "PUT owner/billing/payment-reminders/settings/route.ts": { guard: "resolveOwnerScope" },
  "POST owner/classes/route.ts": { guard: "resolveOwnerScope" },
  "PUT owner/dashboard-layout/route.ts": { guard: "resolveOwnerScope", via: "src/modules/owner-dashboard/application/dashboard-layout.ts" },
  "POST owner/enrollments/route.ts": { guard: "resolveOwnerScope" },
  "POST owner/families/associations/route.ts": { guard: "resolveOwnerScope" },
  "PATCH owner/groups/[groupId]/memberships/[membershipId]/route.ts": { guard: "resolveOwnerScope" },
  "POST owner/groups/route.ts": { guard: "resolveOwnerScope" },
  "GET owner/academy-settings/route.ts": { guard: "resolveOwnerScope" },
  "PATCH owner/academy-settings/route.ts": { guard: "resolveOwnerScope" },
  "POST owner/academy-settings/locations/route.ts": { guard: "resolveOwnerScope" },
  "PATCH owner/guardians/[guardianId]/contacts/route.ts": { guard: "resolveOwnerScope" },
  "PATCH owner/guardians/[guardianId]/profile/route.ts": { guard: "resolveOwnerScope" },
  "POST owner/health-score/targets/route.ts": { guard: "resolveOwnerScope" },
  "POST owner/product-discovery/route.ts": { guard: "resolveOwnerScope", via: "src/modules/product-discovery/application/product-discovery.ts" },
  "POST owner/saas/checkout/route.ts": { guard: "resolveSaasOwnerScope" },
  "POST owner/staff/[staffProfileId]/archive/route.ts": { guard: "requireOwnerAllScope" },
  "POST owner/staff/[staffProfileId]/reactivate/route.ts": { guard: "requireOwnerAllScope" },
  "PATCH owner/staff/[staffProfileId]/route.ts": { guard: "requireOwnerAllScope" },
  "POST owner/staff/invitations/[id]/reissue/route.ts": { guard: "withTeamManager" },
  "DELETE owner/staff/invitations/[id]/route.ts": { guard: "withTeamManager" },
  "POST owner/staff/route.ts": { guard: "requireOwnerAllScope" },
  "POST insights/[id]/actions/route.ts": { guard: "resolveInsightApiScope" },
  "POST insights/[id]/dismiss/route.ts": { guard: "resolveInsightApiScope" },
  "POST insights/[id]/snooze/route.ts": { guard: "resolveInsightApiScope" },
  "POST insights/actions/[actionId]/outcome/route.ts": { guard: "resolveInsightApiScope" },
};

/** Fuera de la superficie Owner: no dependen de la membresía canónica. */
const outsideOwnerSurface: Record<string, string> = {
  "POST admin/saas/webhooks/[eventId]/reconciliation/confirm/route.ts": "superadmin",
  "POST admin/saas/webhooks/[eventId]/reconciliation/preview/route.ts": "superadmin",
  "POST organizations/bootstrap/route.ts": "alta de la propia academia",
  "POST staff/invitations/accept/route.ts": "la persona invitada acepta su invitación",
  "POST staff/invitations/inspect/route.ts": "la persona invitada consulta su invitación",
};

/** Rutas que admiten al coach por diseño (P1 #8). */
const coachAllowed = new Set([
  "GET owner/attendance/sessions/route.ts",
  "GET owner/sessions/[sessionId]/attendance/route.ts",
  "POST owner/sessions/[sessionId]/attendance/route.ts",
  "GET owner/operational-policy/route.ts",
  // Calendario: la entrenadora lee solo sus sesiones asignadas, de una sede
  // de su alcance (el servicio filtra por session_staff).
  "GET owner/calendar/route.ts",
  // P2 #17: objetivos y observaciones. El servicio exige sede asignada y una
  // gimnasta con inscripción o grupo abierto en ella (tests/athlete-progress-*).
  "GET owner/athletes/[athleteId]/progress/route.ts",
  "POST owner/athletes/[athleteId]/objectives/route.ts",
  "POST owner/athletes/[athleteId]/objectives/[objectiveId]/status/route.ts",
  "POST owner/athletes/[athleteId]/observations/route.ts",
  "PATCH owner/athletes/[athleteId]/observations/[observationId]/route.ts",
  "GET owner/sessions/[sessionId]/observations/route.ts",
  "POST owner/sessions/[sessionId]/observations/route.ts",
  // O1: la entrenadora lee quién entrena en una sesión de su sede, con el
  // mismo acceso que Pasar lista (resolveSessionAttendanceAccess). No asigna.
  "GET owner/sessions/[sessionId]/coaches/route.ts",
  // P2 #17 (segunda parte): plan de la sesión con el criterio de Pasar lista
  // (sede asignada, no session_staff) (tests/session-plans-*).
  "GET owner/sessions/[sessionId]/plan/route.ts",
  "PUT owner/sessions/[sessionId]/plan/route.ts",
  "PUT owner/sessions/[sessionId]/plan/blocks/[blockId]/route.ts",
  // Niveles y progresión (A6): el equipo técnico lee plantillas y evalúa con el
  // criterio de Pasar lista (sede asignada, gimnasta con inscripción o grupo
  // abierto). Crear y editar plantillas lo deniega el servicio a los
  // entrenadores (tests/skill-levels-*). Todo responde 503 con la bandera apagada.
  "GET owner/skill-templates/route.ts",
  "POST owner/skill-templates/route.ts",
  "GET owner/skill-templates/[templateId]/route.ts",
  "PUT owner/skill-templates/[templateId]/route.ts",
  "POST owner/skill-evaluations/route.ts",
  "GET owner/athletes/[athleteId]/skills/route.ts",
  "POST owner/athletes/[athleteId]/skills/level-passes/route.ts",
  "GET owner/groups/[groupId]/skills/route.ts",
  "GET owner/sessions/[sessionId]/skills/route.ts",
]);

function routeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return entry === "route.ts" ? [path] : [];
  });
}

function handlers(): string[] {
  return routeFiles(apiRoot).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    const route = relative(apiRoot, file).split("\\").join("/");
    return [...source.matchAll(/export (?:async function|const) (GET|POST|PUT|PATCH|DELETE)\b/g)].map(
      (match) => `${match[1]} ${route}`
    );
  });
}

describe("inventario de /api/v1", () => {
  it("cada handler está ejecutado, protegido por un guard conocido, permitido al coach o fuera de la superficie", () => {
    const executed = new Set(deniedCases.map((item) => `${item.method} ${item.route}`));
    const unclassified = handlers().filter(
      (key) =>
        !executed.has(key) &&
        !(key in staticallyGuarded) &&
        !(key in outsideOwnerSurface) &&
        !coachAllowed.has(key)
    );

    expect(unclassified).toEqual([]);
  });

  it("los handlers no ejecutados conservan su guard en el código", () => {
    for (const [key, { guard, via }] of Object.entries(staticallyGuarded)) {
      const route = key.split(" ")[1];
      const source = readFileSync(via ? join(process.cwd(), via) : join(apiRoot, route), "utf8");
      expect(source, key).toContain(`${guard}(`);
      expect(source, key).not.toContain("coach_operations");
    }
  });

  it("solo los archivos autorizados piden la superficie coach_operations", () => {
    const allowedFiles = new Set([
      "src/modules/owner-dashboard/application/owner-scope.ts",
      "src/modules/attendance/application/owner-attendance-sessions.ts",
      "src/app/api/v1/owner/attendance/sessions/route.ts",
      // Calendario: lectura de las sesiones asignadas a la entrenadora.
      "src/app/api/v1/owner/calendar/route.ts",
      "src/app/owner/calendar/page.tsx",
      "src/app/api/v1/owner/operational-policy/route.ts",
      "src/app/owner/page.tsx",
      "src/app/owner/attendance/page.tsx",
      // P2 #17: única entrada de las rutas de objetivos y observaciones.
      "src/app/api/v1/owner/athlete-progress-http.ts",
      // P2 #17 (segunda parte): única entrada de las rutas del plan de sesión.
      "src/app/api/v1/owner/session-plan-http.ts",
      // Niveles y progresión: única entrada de sus páginas (las rutas API
      // reutilizan la resolución de athlete-progress-http.ts).
      "src/app/owner/skills/_lib/skills-scope.ts",
    ]);
    const sourceFiles = (directory: string): string[] =>
      readdirSync(directory).flatMap((entry) => {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) return sourceFiles(path);
        return /\.(ts|tsx)$/.test(entry) ? [path] : [];
      });

    const requesting = sourceFiles(join(process.cwd(), "src"))
      .filter((file) => readFileSync(file, "utf8").includes('"coach_operations"'))
      .map((file) => relative(process.cwd(), file).split("\\").join("/"));

    expect(requesting.sort()).toEqual([...allowedFiles].sort());
  });
});
