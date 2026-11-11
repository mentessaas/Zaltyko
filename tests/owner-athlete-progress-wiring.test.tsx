// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * P2 #17: los accesos a objetivos y observaciones dependen de la prop que el
 * servidor calcula (tablas del candidato presentes). Estas pruebas rompen si
 * se quita la condición en OwnerAttendanceManager (Pasar lista) o en el
 * cableado OwnerGroupsManager → OwnerGroupMembershipRow (Grupos).
 */
const mockRefresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));

import { OwnerAttendanceManager } from "@/components/owner-dashboard/OwnerAttendanceManager";
import { OwnerGroupsManager } from "@/components/owner-dashboard/OwnerGroupsManager";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const organizationId = "90000000-0000-4000-8000-000000000001";
const locationId = "90000000-0000-4000-8000-000000000002";
const sessionId = "90000000-0000-4000-8000-000000000003";
const enrollmentId = "90000000-0000-4000-8000-000000000004";
const groupId = "90000000-0000-4000-8000-000000000005";
const athleteId = "90000000-0000-4000-8000-000000000006";
const programId = "90000000-0000-4000-8000-000000000007";
const fetchMock = vi.fn();

beforeEach(() => {
  window.sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("Pasar lista: accesos de objetivos y observaciones", () => {
  function renderAttendance(progressAvailable?: boolean) {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: { items: [{ enrollmentId, athleteName: "Lúa Pérez", attendanceStatus: null }] },
      }),
    });
    return render(
      <OwnerAttendanceManager
        organizationId={organizationId}
        locationId={locationId}
        sessions={[
          { id: sessionId, className: "Base 3", startsAt: "2026-11-11T16:00:00.000Z", timezone: "Europe/Madrid" },
        ]}
        initialSessionId={sessionId}
        {...(progressAvailable === undefined ? {} : { progressAvailable })}
      />
    );
  }

  it.each([
    ["false", false],
    ["omitida", undefined],
  ] as const)("con progressAvailable %s no muestra «Observación» ni «Ver objetivos»", async (_label, value) => {
    renderAttendance(value);
    expect(await screen.findByRole("button", { name: "Presente: Lúa Pérez" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Añadir observación a Lúa Pérez" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver objetivos de Lúa Pérez" })).not.toBeInTheDocument();
    expect(screen.queryByText("Observación")).not.toBeInTheDocument();
    expect(screen.queryByText("Ver objetivos")).not.toBeInTheDocument();
  });

  it("con progressAvailable=true muestra los dos accesos de cada gimnasta", async () => {
    renderAttendance(true);
    expect(await screen.findByRole("button", { name: "Añadir observación a Lúa Pérez" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver objetivos de Lúa Pérez" })).toBeInTheDocument();
    // Solo se pidió la lista de la sesión: los accesos no hacen peticiones al montarse.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/sessions/${sessionId}/attendance?`);
  });
});

describe("Grupos: acceso de objetivos y observaciones en la ficha", () => {
  beforeEach(() => {
    // Igual que tests/owner-groups-manager.test.tsx: ids deterministas.
    vi.stubGlobal("crypto", { randomUUID: () => "90000000-0000-4000-8000-000000000009" });
  });

  const bundle = {
    organization: { id: organizationId, name: "Academia sintética", defaultCurrency: "EUR" },
    member: { id: "owner-1", role: "owner", locationScopeMode: "all" },
    locations: [{ id: locationId, name: "Sede Centro", timezone: "Europe/Madrid" }],
    programs: [{ id: programId, name: "Gimnasia artística", kind: "gymnastics_sport" }],
    groups: [
      {
        id: groupId,
        name: "Iniciación",
        capacity: 12,
        status: "active",
        locationId,
        locationName: "Sede Centro",
        timezone: "Europe/Madrid",
        programId,
        programName: "Gimnasia artística",
        memberCount: 1,
      },
    ],
    selectedGroupId: groupId,
    memberships: [
      { id: "90000000-0000-4000-8000-000000000008", athleteId, athleteName: "Ana Sintética", status: "active", startsOn: "2026-10-13" },
    ],
    localTodayByLocation: { [locationId]: "2026-11-11" },
  } as never;

  it.each([
    ["false", false],
    ["omitida", undefined],
  ] as const)("con progressAvailable %s la ficha no ofrece la sección", async (_label, value) => {
    render(<OwnerGroupsManager bundle={bundle} {...(value === undefined ? {} : { progressAvailable: value })} />);
    expect(await screen.findByRole("button", { name: "Dar de baja a Ana Sintética" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Objetivos y observaciones de Ana Sintética" })
    ).not.toBeInTheDocument();
  });

  it("con progressAvailable=true la ficha ofrece la sección", async () => {
    render(<OwnerGroupsManager bundle={bundle} progressAvailable />);
    expect(
      await screen.findByRole("button", { name: "Objetivos y observaciones de Ana Sintética" })
    ).toHaveAttribute("aria-expanded", "false");
  });
});
