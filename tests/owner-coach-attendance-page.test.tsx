import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OperationalError } from "@/modules/shared/domain/operational-error";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  options: vi.fn(),
  scope: vi.fn(),
  today: vi.fn(),
  progressAvailable: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/modules/attendance/application/owner-attendance-sessions", () => ({
  getOwnerAttendanceSessionOptions: mocks.options,
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.scope,
}));
vi.mock("@/modules/owner-dashboard/application/today-sessions", () => ({
  getOwnerTodaySessions: mocks.today,
}));
vi.mock("@/modules/athlete-progress/application/athlete-progress-service", () => ({
  isAthleteProgressAvailableForPage: mocks.progressAvailable,
}));

import OwnerAttendancePage from "@/app/owner/attendance/page";
import { OwnerAttendanceManager } from "@/components/owner-dashboard/OwnerAttendanceManager";
import { OwnerTodaySessionsPanel } from "@/components/owner-dashboard/OwnerTodaySessionsPanel";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";

const organizationId = "a0000000-0000-4000-8000-000000000001";
const siteNorth = "a0000000-0000-4000-8000-000000000011";
const siteSouth = "a0000000-0000-4000-8000-000000000012";

/** Only the page's own local component is rendered; everything else is walked. */
function expandLocal(element: ReactElement): ReactNode | null {
  const type = element.type as { name?: string } | string;
  return typeof type === "function" && type.name === "CoachWithoutLocations"
    ? (element.type as (props: unknown) => ReactNode)(element.props)
    : null;
}

function findAll(node: ReactNode, type: unknown): ReactElement[] {
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  const local = expandLocal(element);
  if (local !== null) return findAll(local, type);
  const own = element.type === type ? [element] : [];
  return [
    ...own,
    ...Children.toArray(element.props.children).flatMap((child) => findAll(child, type)),
  ];
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement(node)) return "";
  const element = node as ReactElement<{ children?: ReactNode }>;
  const local = expandLocal(element);
  if (local !== null) return textOf(local);
  return Children.toArray(element.props.children).map(textOf).join(" ");
}

function scopeFor(role: string, locations = [{ id: siteNorth, name: "Norte" }]) {
  return {
    organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
    member: { id: "synthetic-member", role, locationScopeMode: "selected" },
    locations,
    selectedLocationId: locations[0]?.id ?? null,
    canViewOrganizationAggregate: role !== "coach" && role !== "manager",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "synthetic-user" } } });
  mocks.options.mockResolvedValue({
    organization: { id: organizationId, name: "QA", defaultCurrency: "EUR" },
    locationId: siteNorth,
    sessions: [],
    nextCursor: null,
    selectedSession: null,
  });
  mocks.today.mockResolvedValue({ sessions: [], truncated: false });
  mocks.progressAvailable.mockResolvedValue(false);
});

describe("Objetivos y observaciones en Pasar lista (P2 #17)", () => {
  it.each([
    [false, "sin la migración candidata aplicada no se muestran los accesos"],
    [true, "con las tablas disponibles se muestran los accesos"],
  ] as const)("progressAvailable=%s: %s", async (available) => {
    mocks.progressAvailable.mockResolvedValue(available);
    mocks.scope.mockResolvedValue(scopeFor("coach"));

    const page = await OwnerAttendancePage({
      searchParams: Promise.resolve({ organizationId }),
    });

    expect(mocks.progressAvailable).toHaveBeenCalledTimes(1);
    const [manager] = findAll(page, OwnerAttendanceManager);
    expect(manager.props).toMatchObject({ progressAvailable: available });
  });
});

describe("Pasar lista para el coach (P1 #8)", () => {
  it("muestra Hoy de su sede, sin enlace a Clases ni al panel, con la superficie coach", async () => {
    mocks.scope.mockResolvedValue(scopeFor("coach"));

    const page = await OwnerAttendancePage({
      searchParams: Promise.resolve({ organizationId }),
    });

    expect(mocks.scope).toHaveBeenCalledWith({
      userId: "synthetic-user",
      organizationId,
      locationId: undefined,
      surface: "coach_operations",
    });
    expect(mocks.today).toHaveBeenCalledWith({
      scope: expect.objectContaining({ canViewOrganizationAggregate: false }),
      locationId: siteNorth,
    });
    const [today] = findAll(page, OwnerTodaySessionsPanel);
    expect(today.props).toMatchObject({ organizationId, classesHref: null });
    const [manager] = findAll(page, OwnerAttendanceManager);
    expect(manager.props).toMatchObject({ coachMode: true, locationId: siteNorth });
  });

  it("ofrece cambiar entre sus sedes cuando tiene varias", async () => {
    mocks.scope.mockResolvedValue(
      scopeFor("coach", [
        { id: siteNorth, name: "Norte" },
        { id: siteSouth, name: "Sur" },
      ])
    );

    const page = await OwnerAttendancePage({
      searchParams: Promise.resolve({ organizationId }),
    });

    const text = textOf(page);
    expect(text).toContain("Norte");
    expect(text).toContain("Sur");
  });

  it("explica al coach sin sedes que no tiene nada operativo, sin 404 ni alta de academia", async () => {
    mocks.options.mockRejectedValue(
      new OperationalError("LOCATION_SCOPE_DENIED", "Sin sedes asignadas", 403, {
        reason: "coach_without_locations",
        organizationId,
      })
    );

    const page = await OwnerAttendancePage({ searchParams: Promise.resolve({}) });

    expect(mocks.notFound).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(textOf(page)).toContain("Aún no tienes sedes asignadas");
    expect(findAll(page, OwnerAttendanceManager)).toEqual([]);
    const [shell] = findAll(page, OwnerWorkspacePageShell);
    expect(shell.props).toMatchObject({
      member: { role: "coach" },
      organizationId: null,
    });
  });

  it("una sede ajena sigue siendo 404 para el coach", async () => {
    mocks.options.mockRejectedValue(
      new OperationalError("LOCATION_SCOPE_DENIED", "Sede fuera de alcance", 403)
    );

    await expect(
      OwnerAttendancePage({
        searchParams: Promise.resolve({ organizationId, locationId: siteSouth }),
      })
    ).rejects.toThrow("NOT_FOUND");
  });
});

describe("Pasar lista para owner/admin/manager (sin cambios)", () => {
  it.each(["owner", "admin", "manager"])("%s no recibe el bloque Hoy del coach", async (role) => {
    mocks.scope.mockResolvedValue(scopeFor(role));

    const page = await OwnerAttendancePage({
      searchParams: Promise.resolve({ organizationId }),
    });

    expect(mocks.today).not.toHaveBeenCalled();
    expect(findAll(page, OwnerTodaySessionsPanel)).toEqual([]);
    const [manager] = findAll(page, OwnerAttendanceManager);
    expect(manager.props).toMatchObject({ coachMode: false });
  });
});
