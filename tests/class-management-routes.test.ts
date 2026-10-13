import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/rate-limit";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  createScheduledClass,
  getOwnerClassesPageData,
} from "@/modules/scheduling/application/class-management-service";
import {
  GET as listClasses,
  POST as createClass,
} from "@/app/api/v1/owner/classes/route";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: vi.fn(() => ({ limit: 30, window: 60 })),
  getVerifiedTenantRateLimitIdentifier: vi.fn(() => "verified-tenant"),
  rateLimit: vi.fn(),
  rateLimitExceededResponse: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));
vi.mock("@/modules/scheduling/application/class-management-service", () => ({
  createScheduledClass: vi.fn(),
  getOwnerClassesPageData: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const organizationId = "10000000-0000-4000-8000-000000000003";
const locationId = "10000000-0000-4000-8000-000000000004";
const programId = "10000000-0000-4000-8000-000000000005";
const templateId = "10000000-0000-4000-8000-000000000006";

const ownerScope = {
  organization: {
    id: organizationId,
    name: "Academia Sintética",
    defaultCurrency: "EUR",
  },
  member: { id: memberId, role: "manager", locationScopeMode: "selected" },
  locations: [{ id: locationId, name: "Sede Centro" }],
  selectedLocationId: locationId,
  canViewOrganizationAggregate: false,
};

function request(path: string, body?: unknown, method = "POST") {
  return new Request(`https://zaltyko.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": "class-command-001",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const classBody = {
  organizationId,
  locationId,
  programId,
  name: "Infantil iniciación",
  capacity: 12,
  effectiveFrom: "2026-10-19",
  effectiveTo: null,
  schedule: [
    { isoWeekday: 1, startsAtLocal: "17:00", endsAtLocal: "18:00" },
    { isoWeekday: 3, startsAtLocal: "17:00", endsAtLocal: "18:00" },
  ],
};

describe("API canónica de clases recurrentes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: userId });
    vi.mocked(resolveOwnerScope).mockResolvedValue(ownerScope);
    vi.mocked(rateLimit).mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: 1_800_000_000,
    });
    vi.mocked(getOwnerClassesPageData).mockResolvedValue({
      organization: ownerScope.organization,
      member: ownerScope.member,
      locations: [],
      programs: [],
      classes: [],
      selectedLocationId: locationId,
      localTodayByLocation: {},
    });
    vi.mocked(createScheduledClass).mockResolvedValue({
      classTemplate: {
        id: templateId,
        name: classBody.name,
        locationId,
      },
      sessionCount: 36,
      generatedThrough: "2027-02-16",
    } as never);
  });

  afterEach(() => vi.clearAllMocks());

  it("filtra la lectura por la academia y sede de la sesión", async () => {
    const response = await listClasses(
      new Request(
        `https://zaltyko.test/api/v1/owner/classes?organizationId=${organizationId}&locationId=${locationId}`
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getOwnerClassesPageData).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
    });
  });

  it("exige sesión antes de resolver la academia", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await createClass(
      new Request("https://zaltyko.test/api/v1/owner/classes", {
        method: "POST",
        body: "no-json",
      })
    );

    expect(response.status).toBe(401);
    expect(resolveOwnerScope).not.toHaveBeenCalled();
    expect(createScheduledClass).not.toHaveBeenCalled();
  });

  it("deriva el actor de la sesión y exige idempotencia", async () => {
    const response = await createClass(
      request("/api/v1/owner/classes", classBody)
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(createScheduledClass).toHaveBeenCalledWith({
      ...classBody,
      idempotencyKey: "class-command-001",
      actor: { userId, memberId },
    });
  });

  it("rechaza actor enviado por el cliente y horario imposible", async () => {
    const forgedActor = await createClass(
      request("/api/v1/owner/classes", {
        ...classBody,
        actor: { userId, memberId },
      })
    );
    const invalidTime = await createClass(
      request("/api/v1/owner/classes", {
        ...classBody,
        schedule: [
          { isoWeekday: 1, startsAtLocal: "18:00", endsAtLocal: "17:00" },
        ],
      })
    );
    const overlappingSchedule = await createClass(
      request("/api/v1/owner/classes", {
        ...classBody,
        schedule: [
          { isoWeekday: 1, startsAtLocal: "17:00", endsAtLocal: "18:00" },
          { isoWeekday: 1, startsAtLocal: "17:30", endsAtLocal: "18:30" },
        ],
      })
    );

    expect(forgedActor.status).toBe(400);
    expect(invalidTime.status).toBe(400);
    expect(overlappingSchedule.status).toBe(400);
    expect(createScheduledClass).not.toHaveBeenCalled();
  });
});
