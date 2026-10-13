import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser } from "@/lib/auth/current-user";
import { rateLimit } from "@/lib/rate-limit";
import {
  addGroupMembership,
  transitionGroupMembership,
} from "@/modules/groups/application/group-membership-service";
import {
  createOperationalGroup,
  getOwnerGroupsPageData,
  searchGroupAthleteOptions,
} from "@/modules/groups/application/group-management-service";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  GET as listGroups,
  POST as createGroup,
} from "@/app/api/v1/owner/groups/route";
import {
  GET as searchAthletes,
  POST as addMembership,
} from "@/app/api/v1/owner/groups/[groupId]/memberships/route";
import { PATCH as changeMembership } from "@/app/api/v1/owner/groups/[groupId]/memberships/[membershipId]/route";

vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  getLimitForRoute: vi.fn(() => ({ limit: 30, window: 60 })),
  getVerifiedTenantRateLimitIdentifier: vi.fn(() => "verified-tenant"),
  rateLimit: vi.fn(),
  rateLimitExceededResponse: vi.fn(),
}));
vi.mock("@/modules/groups/application/group-membership-service", () => ({
  addGroupMembership: vi.fn(),
  transitionGroupMembership: vi.fn(),
}));
vi.mock("@/modules/groups/application/group-management-service", () => ({
  createOperationalGroup: vi.fn(),
  getOwnerGroupsPageData: vi.fn(),
  searchGroupAthleteOptions: vi.fn(),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: vi.fn(),
}));

const userId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const organizationId = "10000000-0000-4000-8000-000000000003";
const locationId = "10000000-0000-4000-8000-000000000004";
const programId = "10000000-0000-4000-8000-000000000005";
const groupId = "10000000-0000-4000-8000-000000000006";
const membershipId = "10000000-0000-4000-8000-000000000007";
const athleteId = "10000000-0000-4000-8000-000000000008";

function request(path: string, body?: unknown, method = "POST") {
  return new Request(`https://zaltyko.test${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": "group-command-001",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const scope = {
  organization: {
    id: organizationId,
    name: "Academia sintética",
    defaultCurrency: "EUR",
  },
  member: { id: memberId, role: "manager", locationScopeMode: "selected" },
  locations: [{ id: locationId, name: "Sede Centro" }],
  selectedLocationId: locationId,
  canViewOrganizationAggregate: false,
};

describe("API canónica de grupos y pertenencias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: userId });
    vi.mocked(resolveOwnerScope).mockResolvedValue(scope);
    vi.mocked(rateLimit).mockResolvedValue({
      success: true,
      limit: 30,
      remaining: 29,
      reset: 1_800_000_000,
    });
    vi.mocked(createOperationalGroup).mockResolvedValue({
      id: groupId,
      organizationId,
      locationId,
      programId,
      name: "Base artística",
      capacity: 12,
      status: "active",
    } as never);
    vi.mocked(getOwnerGroupsPageData).mockResolvedValue({
      organization: scope.organization,
      member: scope.member,
      locations: [],
      programs: [],
      groups: [],
      selectedGroupId: null,
      memberships: [],
      localTodayByLocation: {},
    });
    vi.mocked(addGroupMembership).mockResolvedValue({
      id: membershipId,
      organizationId,
      groupId,
      athleteId,
      startsOn: "2026-10-13",
      status: "active",
    } as never);
    vi.mocked(transitionGroupMembership).mockResolvedValue({
      id: membershipId,
      organizationId,
      groupId,
      athleteId,
      startsOn: "2026-10-13",
      endsOn: null,
      status: "paused",
    } as never);
    vi.mocked(searchGroupAthleteOptions).mockResolvedValue([
      { id: athleteId, name: "Gimnasta Sintética" },
    ]);
  });

  afterEach(() => vi.clearAllMocks());

  it("limita y acota la lectura de grupos al scope de la sesión", async () => {
    const response = await listGroups(
      new Request(
        `https://zaltyko.test/api/v1/owner/groups?organizationId=${organizationId}&locationId=${locationId}`
      )
    );

    expect(response.status).toBe(200);
    expect(rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "verified-tenant" })
    );
    expect(getOwnerGroupsPageData).toHaveBeenCalledWith({
      userId,
      organizationId,
      locationId,
      groupId: undefined,
    });
  });

  it("exige una sesión antes de leer el cuerpo o consultar el tenant", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await createGroup(
      new Request("https://zaltyko.test/api/v1/owner/groups", {
        method: "POST",
        body: "no-json",
      })
    );

    expect(response.status).toBe(401);
    expect(resolveOwnerScope).not.toHaveBeenCalled();
    expect(createOperationalGroup).not.toHaveBeenCalled();
  });

  it("deriva el actor del usuario y membership activos, no del payload", async () => {
    const response = await createGroup(
      request("/api/v1/owner/groups", {
        organizationId,
        locationId,
        programId,
        name: "Base artística",
        capacity: 12,
      })
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(createOperationalGroup).toHaveBeenCalledWith({
      organizationId,
      locationId,
      programId,
      name: "Base artística",
      capacity: 12,
      idempotencyKey: "group-command-001",
      actor: { userId, memberId },
    });
  });

  it("rechaza que el cliente intente enviar un actor o rol", async () => {
    const response = await createGroup(
      request("/api/v1/owner/groups", {
        organizationId,
        locationId,
        programId,
        name: "Base artística",
        capacity: 12,
        actor: { userId, memberId, role: "owner" },
      })
    );

    expect(response.status).toBe(400);
    expect(createOperationalGroup).not.toHaveBeenCalled();
  });

  it("busca por grupo y organización con la sesión verificada", async () => {
    const response = await searchAthletes(
      request(
        `/api/v1/owner/groups/${groupId}/memberships?organizationId=${organizationId}&q=Gim`,
        undefined,
        "GET"
      ),
      { params: Promise.resolve({ groupId }) }
    );

    expect(response.status).toBe(200);
    expect(searchGroupAthleteOptions).toHaveBeenCalledWith({
      userId,
      organizationId,
      groupId,
      query: "Gim",
    });
    expect(rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "verified-tenant" })
    );
  });

  it("añade una pertenencia M:N con actor e idempotency key verificados", async () => {
    const response = await addMembership(
      request(`/api/v1/owner/groups/${groupId}/memberships`, {
        organizationId,
        athleteId,
        startsOn: "2026-10-13",
        status: "active",
      }),
      { params: Promise.resolve({ groupId }) }
    );

    expect(response.status).toBe(201);
    expect(addGroupMembership).toHaveBeenCalledWith({
      organizationId,
      groupId,
      athleteId,
      startsOn: "2026-10-13",
      status: "active",
      idempotencyKey: "group-command-001",
      actor: { userId, memberId },
    });
  });

  it("pasa el grupo esperado al servicio antes de cambiar el estado", async () => {
    const response = await changeMembership(
      request(
        `/api/v1/owner/groups/${groupId}/memberships/${membershipId}`,
        {
          organizationId,
          expectedStatus: "active",
          toStatus: "paused",
          effectiveOn: "2026-10-13",
        },
        "PATCH"
      ),
      { params: Promise.resolve({ groupId, membershipId }) }
    );

    expect(response.status).toBe(200);
    expect(transitionGroupMembership).toHaveBeenCalledWith({
      organizationId,
      membershipId,
      groupId,
      expectedStatus: "active",
      toStatus: "paused",
      effectiveOn: "2026-10-13",
      reasonCode: undefined,
      idempotencyKey: "group-command-001",
      actor: { userId, memberId },
    });
  });
});
