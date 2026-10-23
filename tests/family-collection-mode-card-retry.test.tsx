// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FamilyCollectionModeCard } from "@/components/owner-dashboard/FamilyCollectionModeCard";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const organizationId = "76000000-0000-4000-8000-000000000001";
const familyId = "76000000-0000-4000-8000-000000000002";
const otherOrganizationId = "76000000-0000-4000-8000-000000000004";
const otherFamilyId = "76000000-0000-4000-8000-000000000005";
const key = "family-preference-76000000-0000-4000-8000-000000000003";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

const currentPreference = {
  organizationId,
  familyId,
  requestedMode: "automatic" as const,
  effectiveMode: "manual" as const,
  version: 4,
  entitlementRevision: 3,
  preferenceEntitlementRevision: null,
  automaticPreferenceAvailable: false,
  automaticProcessingEnabled: false as const,
  automaticStatus: "not_released" as const,
  requiresConfirmation: false,
};

const updatedPreference = {
  ...currentPreference,
  requestedMode: "manual" as const,
  version: 5,
};

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("crypto", {
    randomUUID: () => key.slice("family-preference-".length),
  });
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("preferencia de cobro familiar", () => {
  it("reintenta con la misma clave y cuerpo tras perder el acuse", async () => {
    let putAttempts = 0;
    mocks.fetch.mockImplementation(async (_input, init) => {
      if (init?.method !== "PUT") return response(currentPreference);
      putAttempts += 1;
      if (putAttempts === 1) throw new Error("acuse perdido");
      return response(updatedPreference);
    });

    const user = userEvent.setup();
    render(
      <FamilyCollectionModeCard
        organizationId={organizationId}
        familyId={familyId}
        canManage
      />
    );

    await user.click(await screen.findByRole("radio", { name: "Manual" }));
    expect(
      await screen.findByRole("button", {
        name: "Reintentar solicitud pendiente",
      })
    ).toBeEnabled();
    const firstWrite = mocks.fetch.mock.calls.find(
      ([, init]) => init?.method === "PUT"
    );
    expect(firstWrite).toBeDefined();

    await user.click(
      screen.getByRole("button", { name: "Reintentar solicitud pendiente" })
    );

    await waitFor(() => expect(putAttempts).toBe(2));
    const writes = mocks.fetch.mock.calls.filter(
      ([, init]) => init?.method === "PUT"
    );
    expect(writes[1]).toEqual(firstWrite);
    expect(writes[0][1].headers["idempotency-key"]).toBe(key);
    expect(JSON.parse(String(writes[0][1].body))).toEqual({
      organizationId,
      familyId,
      mode: "manual",
      expectedVersion: 4,
    });
    expect(
      await screen.findByText("Preferencia manual guardada para esta familia.")
    ).toBeVisible();
  });

  it("no ofrece el reintento en otra familia o academia", async () => {
    let putAttempts = 0;
    mocks.fetch.mockImplementation(async (input, init) => {
      if (init?.method === "PUT") {
        putAttempts += 1;
        throw new Error("acuse perdido");
      }
      if (String(input).includes(otherOrganizationId)) {
        return response({
          ...currentPreference,
          organizationId: otherOrganizationId,
          familyId: otherFamilyId,
        });
      }
      return response(currentPreference);
    });
    publishOwnerPlanUsage(otherOrganizationId, {
      readOnly: false,
      planCode: "free",
    });

    const user = userEvent.setup();
    const view = render(
      <FamilyCollectionModeCard
        organizationId={organizationId}
        familyId={familyId}
        canManage
      />
    );
    await user.click(await screen.findByRole("radio", { name: "Manual" }));
    expect(
      await screen.findByRole("button", {
        name: "Reintentar solicitud pendiente",
      })
    ).toBeEnabled();

    view.rerender(
      <FamilyCollectionModeCard
        organizationId={otherOrganizationId}
        familyId={otherFamilyId}
        canManage
      />
    );

    expect(
      await screen.findByText(/Hay una solicitud pendiente para otra familia o academia/)
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "Reintentar solicitud pendiente",
      })
    ).not.toBeInTheDocument();
    expect(putAttempts).toBe(1);
  });
});
