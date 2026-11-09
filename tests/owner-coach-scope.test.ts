import { beforeEach, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({
  db: undefined as undefined | Record<string, unknown>,
}));

vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => holder.db?.[property as string] }
  ),
}));

import {
  createFakeDb,
  createFakeDbState,
  ids,
  type FakeDbState,
} from "./helpers/coach-access-fake-db";
import { resolveSessionAttendanceAccess } from "@/modules/attendance/application/owner-session-attendance";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  COACH_WITHOUT_LOCATIONS_REASON,
  coachWithoutLocationsOrganizationId,
} from "@/modules/owner-dashboard/domain/coach-access";

let state: FakeDbState;

beforeEach(() => {
  state = createFakeDbState();
  holder.db = createFakeDb(state) as unknown as Record<string, unknown>;
});

function auditReasons(): unknown[] {
  // auditDeniedAccess binds (userId, reason, organizationId) in that order.
  return state.audits.map((audit) => audit.params[1]);
}

describe("resolveOwnerScope · superficie de gestión (sin cambios para owner/admin/manager)", () => {
  it.each([
    { userId: ids.owner, role: "owner", aggregate: true },
    { userId: ids.admin, role: "admin", aggregate: true },
    { userId: ids.manager, role: "manager", aggregate: false },
  ])("admite a $role como hasta ahora", async ({ userId, role, aggregate }) => {
    const scope = await resolveOwnerScope({ userId, organizationId: ids.orgA });

    expect(scope.member.role).toBe(role);
    expect(scope.canViewOrganizationAggregate).toBe(aggregate);
  });

  it.each([
    ["sin organización", undefined],
    ["con su organización", ids.orgA],
  ])("deniega al coach %s y no le abre ninguna ruta de gestión", async (_label, organizationId) => {
    await expect(
      resolveOwnerScope({ userId: ids.coach, organizationId })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      resolveOwnerScope({
        userId: ids.coach,
        organizationId,
        locationId: ids.siteAssigned,
        surface: "management",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("audita la denegación del coach cuando nombra la organización", async () => {
    await expect(
      resolveOwnerScope({ userId: ids.coach, organizationId: ids.orgA })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(auditReasons()).toEqual(["membership_or_role"]);
  });
});

describe("resolveOwnerScope · superficie coach_operations (Hoy y Pasar lista)", () => {
  it("admite al coach solo en su sede y nunca con el agregado de la organización", async () => {
    const scope = await resolveOwnerScope({
      userId: ids.coach,
      organizationId: ids.orgA,
      surface: "coach_operations",
    });

    expect(scope.member.role).toBe("coach");
    expect(scope.locations.map((location) => location.id)).toEqual([
      ids.siteAssigned,
    ]);
    expect(scope.selectedLocationId).toBe(ids.siteAssigned);
    expect(scope.canViewOrganizationAggregate).toBe(false);
  });

  it("un coach con todas las sedes trabaja sede a sede, sin agregado", async () => {
    const scope = await resolveOwnerScope({
      userId: ids.coachAllSites,
      organizationId: ids.orgA,
      surface: "coach_operations",
    });

    expect(scope.canViewOrganizationAggregate).toBe(false);
    expect(scope.selectedLocationId).not.toBeNull();
    expect(scope.locations.map((location) => location.id)).toEqual(
      expect.arrayContaining([ids.siteAssigned, ids.siteOther])
    );
  });

  it.each([
    ["otra sede de su club", ids.siteOther],
    ["una sede de otro club", ids.siteForeign],
  ])("deniega %s pasada por locationId", async (_label, locationId) => {
    await expect(
      resolveOwnerScope({
        userId: ids.coach,
        organizationId: ids.orgA,
        locationId,
        surface: "coach_operations",
      })
    ).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    expect(auditReasons()).toEqual(["location_scope"]);
  });

  it("deniega una organizationId ajena aunque el coach exista en otro club", async () => {
    await expect(
      resolveOwnerScope({
        userId: ids.coach,
        organizationId: ids.orgForeign,
        locationId: ids.siteForeign,
        surface: "coach_operations",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(auditReasons()).toEqual(["membership_or_role"]);
  });

  it("deniega a quien no es miembro en ambas superficies", async () => {
    for (const surface of ["management", "coach_operations"] as const) {
      await expect(
        resolveOwnerScope({ userId: ids.stranger, organizationId: ids.orgA, surface })
      ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
  });

  it("un coach sin sedes no ve nada operativo y recibe un motivo explícito", async () => {
    const error = await resolveOwnerScope({
      userId: ids.coachNoSites,
      surface: "coach_operations",
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
      details: { reason: COACH_WITHOUT_LOCATIONS_REASON, organizationId: ids.orgA },
    });
    expect(coachWithoutLocationsOrganizationId(error)).toBe(ids.orgA);
    expect(auditReasons()).toEqual([COACH_WITHOUT_LOCATIONS_REASON]);
  });

  it("owner/admin/manager no cambian al pedir la superficie coach_operations", async () => {
    const owner = await resolveOwnerScope({
      userId: ids.owner,
      organizationId: ids.orgA,
      surface: "coach_operations",
    });
    const manager = await resolveOwnerScope({
      userId: ids.manager,
      organizationId: ids.orgA,
      surface: "coach_operations",
    });

    expect(owner.canViewOrganizationAggregate).toBe(true);
    expect(manager.locations.map((location) => location.id)).toEqual([
      ids.siteAssigned,
    ]);
  });
});

describe("resolveSessionAttendanceAccess · coach con sesión, sede u organización manipuladas", () => {
  const base = {
    userId: ids.coach,
    organizationId: ids.orgA,
    locationId: ids.siteAssigned,
    sessionId: ids.sessionAssigned,
  };

  it("permite la sesión de su sede", async () => {
    await expect(resolveSessionAttendanceAccess(base)).resolves.toMatchObject({
      role: "coach",
      organizationId: ids.orgA,
      locationId: ids.siteAssigned,
    });
  });

  it("permite una sesión de su sede sin asignación (entrenador sustituto, opción A)", async () => {
    await expect(
      resolveSessionAttendanceAccess({ ...base, sessionId: ids.sessionUnassigned })
    ).resolves.toMatchObject({ role: "coach", sessionId: ids.sessionUnassigned });
  });

  it("una sesión de otra sede de su club responde igual que una inexistente", async () => {
    const otherSite = await resolveSessionAttendanceAccess({
      ...base,
      locationId: ids.siteOther,
      sessionId: ids.sessionOtherSite,
    }).catch((error: unknown) => error);
    const missing = await resolveSessionAttendanceAccess({
      ...base,
      locationId: ids.siteOther,
      sessionId: "a0000000-0000-4000-8000-0000000000ff",
    }).catch((error: unknown) => error);

    expect(otherSite).toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(missing).toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect((otherSite as Error).message).toBe((missing as Error).message);
  });

  it("el manager con sede limitada conserva su denegación explícita", async () => {
    await expect(
      resolveSessionAttendanceAccess({
        ...base,
        userId: ids.manager,
        locationId: ids.siteOther,
        sessionId: ids.sessionOtherSite,
      })
    ).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
  });

  it("no acepta su sede como disfraz de una sesión de otra sede", async () => {
    await expect(
      resolveSessionAttendanceAccess({ ...base, sessionId: ids.sessionOtherSite })
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("deniega una sesión de otro club aunque se pase su organizationId", async () => {
    await expect(
      resolveSessionAttendanceAccess({
        ...base,
        organizationId: ids.orgForeign,
        locationId: ids.siteForeign,
        sessionId: ids.sessionForeign,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("a un coach sin sedes ninguna sesión le existe", async () => {
    await expect(
      resolveSessionAttendanceAccess({ ...base, userId: ids.coachNoSites })
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });
});
