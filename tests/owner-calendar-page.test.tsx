import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), calendar: vi.fn() }));
const coachHome = vi.hoisted(() => ({ withoutLocations: "coach_without_locations" }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "synthetic-user" } } }) },
  }),
}));
vi.mock("@/modules/owner-dashboard/application/owner-scope", () => ({
  resolveOwnerScope: mocks.scope,
}));
vi.mock("@/modules/scheduling/application/calendar-sessions", () => ({
  getOwnerCalendar: mocks.calendar,
}));

import OwnerCalendarPage from "@/app/owner/calendar/page";
import { OwnerCalendarView } from "@/components/owner-dashboard/OwnerCalendarView";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "82000000-0000-4000-8000-000000000001";
const locationA = "82000000-0000-4000-8000-000000000002";
const locationB = "82000000-0000-4000-8000-000000000003";
const groupId = "82000000-0000-4000-8000-000000000004";

function scope(role: string, mode: string, selected: string | null) {
  return {
    organization: { id: organizationId, name: "Club QA", defaultCurrency: "EUR" },
    member: { id: "synthetic-member", role, locationScopeMode: mode },
    locations: [
      { id: locationA, name: "Norte", timezone: "Europe/Madrid" },
      { id: locationB, name: "Sur", timezone: "America/Mexico_City" },
    ],
    selectedLocationId: selected,
    canViewOrganizationAggregate: mode === "all",
  };
}

const calendarData = {
  range: { from: "2026-11-09", to: "2026-11-15" },
  sessions: [],
  truncated: false,
  locations: [],
  groups: [],
  coachesAvailable: false,
};

async function render(search: Record<string, string> = { organizationId }) {
  const result = (await OwnerCalendarPage({ searchParams: Promise.resolve(search) })) as any;
  return { shell: result, view: result.props.children };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T10:00:00Z"));
  mocks.scope.mockReset().mockResolvedValue(scope("owner", "all", null));
  mocks.calendar.mockReset().mockResolvedValue(calendarData);
});

afterEach(() => vi.useRealTimers());

describe("página /owner/calendar", () => {
  it("abre en la semana de hoy, con la academia y sin sede, leyendo el primer rango en el servidor", async () => {
    const { shell, view } = await render();

    expect(shell.type).toBe(OwnerWorkspacePageShell);
    expect(shell.props).toMatchObject({ organizationId, organizationName: "Club QA", locationId: null });
    expect(view.type).toBe(OwnerCalendarView);
    expect(view.props).toMatchObject({
      organizationId,
      todayLocal: "2026-11-14",
      referenceTimeZone: "Europe/Madrid",
      initialState: { view: "week", date: "2026-11-14", locationId: "", groupId: "" },
      initialData: calendarData,
    });
    expect(view.props.locations).toEqual([
      { id: locationA, name: "Norte", timezone: "Europe/Madrid" },
      { id: locationB, name: "Sur", timezone: "America/Mexico_City" },
    ]);
    expect(mocks.scope).toHaveBeenCalledWith({
      userId: "synthetic-user",
      organizationId,
      surface: "coach_operations",
    });
    expect(view.props.assignedOnly).toBe(false);
    expect(mocks.calendar).toHaveBeenCalledWith({
      scope: expect.objectContaining({ organization: expect.objectContaining({ id: organizationId }) }),
      from: "2026-11-09",
      to: "2026-11-15",
      locationId: null,
      groupId: null,
    });
  });

  it("respeta vista, fecha y grupo de la URL y lee la rejilla completa del mes", async () => {
    const { view } = await render({ organizationId, vista: "month", fecha: "2026-11-20", grupo: groupId });

    expect(view.props.initialState).toEqual({ view: "month", date: "2026-11-20", locationId: "", groupId });
    expect(mocks.calendar).toHaveBeenCalledWith(
      expect.objectContaining({ from: "2026-10-26", to: "2026-12-06", groupId })
    );
  });

  it("ignora valores inválidos de la URL en lugar de romper", async () => {
    const { view } = await render({ organizationId, vista: "año", fecha: "2026-02-30", grupo: "x" });

    expect(view.props.initialState).toEqual({ view: "week", date: "2026-11-14", locationId: "", groupId: "" });
    expect(mocks.calendar).toHaveBeenCalledWith(expect.objectContaining({ groupId: null }));
  });

  it("con una sede explícita la conserva en la navegación y «hoy» sigue su zona horaria", async () => {
    mocks.scope.mockResolvedValue(scope("owner", "all", locationB));
    const { shell, view } = await render({ organizationId, locationId: locationB });

    expect(mocks.scope).toHaveBeenCalledWith({
      userId: "synthetic-user",
      organizationId,
      locationId: locationB,
      surface: "coach_operations",
    });
    expect(shell.props.locationId).toBe(locationB);
    expect(view.props.referenceTimeZone).toBe("America/Mexico_City");
    expect(view.props.initialState.locationId).toBe(locationB);
    expect(mocks.calendar).toHaveBeenCalledWith(expect.objectContaining({ locationId: locationB }));
  });

  it("un manager con sedes limitadas navega con su sede autorizada y ve el calendario de todas las suyas", async () => {
    mocks.scope.mockResolvedValue(scope("manager", "selected", locationA));
    const { shell, view } = await render();

    expect(shell.props.locationId).toBe(locationA);
    expect(shell.props.member).toMatchObject({ role: "manager", locationScopeMode: "selected" });
    expect(view.props.initialState.locationId).toBe("");
    expect(mocks.calendar).toHaveBeenCalledWith(expect.objectContaining({ locationId: null }));
  });

  it("una entrenadora abre su sede asignada, solo con sus sesiones, y navega con esa sede", async () => {
    mocks.scope.mockResolvedValue({
      ...scope("coach", "selected", locationB),
      locations: [{ id: locationB, name: "Sur", timezone: "America/Mexico_City" }],
    });
    const { shell, view } = await render();

    expect(shell.props.locationId).toBe(locationB);
    expect(view.props.assignedOnly).toBe(true);
    expect(view.props.initialState.locationId).toBe(locationB);
    expect(view.props.referenceTimeZone).toBe("America/Mexico_City");
    expect(view.props.locations).toEqual([{ id: locationB, name: "Sur", timezone: "America/Mexico_City" }]);
    expect(mocks.calendar).toHaveBeenCalledWith(expect.objectContaining({ locationId: locationB }));
  });

  it("una entrenadora sin sedes asignadas vuelve a Asistencia, que se lo explica", async () => {
    mocks.scope.mockRejectedValueOnce(
      new OperationalError("LOCATION_SCOPE_DENIED", "Sin sedes asignadas", 403, {
        reason: coachHome.withoutLocations,
        organizationId,
      })
    );

    await expect(render()).rejects.toThrow(`REDIRECT:/owner/attendance?organizationId=${organizationId}`);
    expect(mocks.calendar).not.toHaveBeenCalled();
  });

  it("si la primera lectura falla, pinta la pantalla igual y deja que ella reintente", async () => {
    mocks.calendar.mockRejectedValue(new Error("boom"));
    const { view } = await render();

    expect(view.type).toBe(OwnerCalendarView);
    expect(view.props.initialData).toBeNull();
  });

  it("sin academia permitida lleva a la puesta en marcha; con una ajena responde 404", async () => {
    mocks.scope.mockRejectedValueOnce(new OperationalError("FORBIDDEN", "Sin acceso", 403));
    await expect(render({})).rejects.toThrow("REDIRECT:/owner/setup");

    mocks.scope.mockRejectedValueOnce(new OperationalError("FORBIDDEN", "Sin acceso", 403));
    await expect(render({ organizationId })).rejects.toThrow("NOT_FOUND");

    mocks.scope.mockRejectedValueOnce(new OperationalError("LOCATION_SCOPE_DENIED", "Fuera", 403));
    await expect(render({ organizationId, locationId: locationB })).rejects.toThrow("NOT_FOUND");
    expect(mocks.calendar).not.toHaveBeenCalled();
  });

  it("rechaza ids que no son UUID antes de resolver el alcance", async () => {
    await expect(render({ organizationId: "x" })).rejects.toThrow("NOT_FOUND");
    expect(mocks.scope).not.toHaveBeenCalled();
  });
});
