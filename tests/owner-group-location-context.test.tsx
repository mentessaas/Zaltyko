// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), fetch: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

import { OwnerClassesManager } from "@/components/owner-dashboard/OwnerClassesManager";
import { OwnerGroupsManager } from "@/components/owner-dashboard/OwnerGroupsManager";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationA = "10000000-0000-4000-8000-000000000002";
const locationB = "10000000-0000-4000-8000-000000000003";
const programId = "10000000-0000-4000-8000-000000000004";

function classesBundle() {
  return {
    organization: { id: organizationId, name: "Academia sintética", defaultCurrency: "EUR" },
    member: { id: "owner-1", role: "owner", locationScopeMode: "all" },
    locations: [
      { id: locationA, name: "Sede A", timezone: "Europe/Madrid" },
      { id: locationB, name: "Sede B", timezone: "Europe/Madrid" },
    ],
    programs: [{ id: programId, name: "Gimnasia", kind: "gymnastics_sport" }],
    classes: [],
    selectedLocationId: locationB,
    localTodayByLocation: { [locationA]: "2026-11-03", [locationB]: "2026-11-03" },
  } as never;
}

function groupsBundle(selectedLocationId: string | null) {
  return {
    organization: { id: organizationId, name: "Academia sintética", defaultCurrency: "EUR" },
    member: { id: "owner-1", role: "owner", locationScopeMode: "all" },
    locations: [
      { id: locationA, name: "Sede A", timezone: "Europe/Madrid" },
      { id: locationB, name: "Sede B", timezone: "Europe/Madrid" },
    ],
    programs: [{ id: programId, name: "Gimnasia", kind: "gymnastics_sport" }],
    groups: [],
    selectedLocationId,
    selectedGroupId: null,
    memberships: [],
    localTodayByLocation: { [locationA]: "2026-11-03", [locationB]: "2026-11-03" },
  } as never;
}

function groupCreatePostCalls() {
  return mocks.fetch.mock.calls.filter(([url, init]) =>
    url === "/api/v1/owner/groups" && (init as RequestInit | undefined)?.method === "POST"
  );
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.fetch.mockReset();
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", mocks.fetch);
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("contexto de sede al crear grupos", () => {
  it("conserva la sede B en el enlace de Clases aunque A aparezca primero", () => {
    render(<OwnerClassesManager bundle={classesBundle()} />);

    expect(screen.getByRole("link", { name: /Grupos/ })).toHaveAttribute(
      "href",
      `/owner/groups?organizationId=${organizationId}&locationId=${locationB}`
    );
  });

  it("preselecciona la sede B del contexto en vez de la primera sede A", async () => {
    render(<OwnerGroupsManager bundle={groupsBundle(locationB)} />);

    await waitFor(() => expect(screen.getByLabelText("Sede")).toHaveValue(locationB));
    expect(groupCreatePostCalls()).toHaveLength(0);
  });

  it("actualiza el borrador de B a A cuando cambia el contexto sin operación pendiente", async () => {
    const { rerender } = render(<OwnerGroupsManager bundle={groupsBundle(locationB)} />);
    await waitFor(() => expect(screen.getByLabelText("Sede")).toHaveValue(locationB));

    rerender(<OwnerGroupsManager bundle={groupsBundle(locationA)} />);

    await waitFor(() => expect(screen.getByLabelText("Sede")).toHaveValue(locationA));
    expect(groupCreatePostCalls()).toHaveLength(0);
  });

  it("preserva sede, cuerpo y clave de una creación pendiente al cambiar el contexto", async () => {
    const storageKey = `zaltyko:pending-group-create:v2:${organizationId}`;
    const pending = JSON.stringify({
      version: 1,
      organizationId,
      idempotencyKey: "pending-group-create-key",
      body: JSON.stringify({
        organizationId,
        locationId: locationA,
        programId,
        name: "Grupo pendiente",
        capacity: 12,
      }),
    });
    window.sessionStorage.setItem(storageKey, pending);

    const { rerender } = render(<OwnerGroupsManager bundle={groupsBundle(locationA)} />);
    await waitFor(() => expect(screen.getByLabelText("Sede")).toHaveValue(locationA));

    rerender(<OwnerGroupsManager bundle={groupsBundle(locationB)} />);

    await waitFor(() => expect(screen.getByLabelText("Sede")).toHaveValue(locationA));
    expect(window.sessionStorage.getItem(storageKey)).toBe(pending);
    expect(groupCreatePostCalls()).toHaveLength(0);
  });
});
