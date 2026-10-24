// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FamilyCollectionModeCard } from "@/components/owner-dashboard/FamilyCollectionModeCard";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";
import { PENDING_FAMILY_COLLECTION_PREFERENCE_STORAGE_KEY } from "@/components/owner-dashboard/owner-pending-family-collection-preference";

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
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("crypto", {
    randomUUID: () => key.slice("family-preference-".length),
  });
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
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

  it("restaura tras recargar la misma solicitud incierta y solo permite reintentarla manualmente", async () => {
    let putAttempts = 0;
    mocks.fetch.mockImplementation(async (_input, init) => {
      if (init?.method !== "PUT") return response(currentPreference);
      putAttempts += 1;
      if (putAttempts === 1) throw new Error("acuse perdido");
      return response(updatedPreference);
    });

    const user = userEvent.setup();
    const firstView = render(
      <FamilyCollectionModeCard
        organizationId={organizationId}
        familyId={familyId}
        canManage
      />
    );
    await user.click(await screen.findByRole("radio", { name: "Manual" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Reintenta la misma solicitud"
    );
    const firstWrite = mocks.fetch.mock.calls.find(
      ([, init]) => init?.method === "PUT"
    );
    expect(firstWrite).toBeDefined();
    expect(window.sessionStorage.getItem(PENDING_FAMILY_COLLECTION_PREFERENCE_STORAGE_KEY)).toBeTruthy();
    firstView.unmount();

    render(
      <FamilyCollectionModeCard
        organizationId={organizationId}
        familyId={familyId}
        canManage
      />
    );
    const retry = await screen.findByRole("button", {
      name: "Reintentar solicitud pendiente",
    });
    expect(retry).toBeEnabled();
    expect(putAttempts).toBe(1);
    await user.click(retry);

    await waitFor(() => expect(putAttempts).toBe(2));
    const writes = mocks.fetch.mock.calls.filter(
      ([, init]) => init?.method === "PUT"
    );
    expect(writes[1]).toEqual(firstWrite);
    await waitFor(() =>
      expect(
        window.sessionStorage.getItem(
          PENDING_FAMILY_COLLECTION_PREFERENCE_STORAGE_KEY
        )
      ).toBeNull()
    );
    expect(
      await screen.findByText("Preferencia manual guardada para esta familia.")
    ).toBeVisible();
  });

  it("bloquea nuevas claves si el registro de recuperación local está dañado", async () => {
    mocks.fetch.mockResolvedValue(response(currentPreference));
    window.sessionStorage.setItem(
      PENDING_FAMILY_COLLECTION_PREFERENCE_STORAGE_KEY,
      JSON.stringify({ version: 1, organizationId, familyId, extra: "invalid" })
    );

    render(
      <FamilyCollectionModeCard
        organizationId={organizationId}
        familyId={familyId}
        canManage
      />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "solicitud local dañada"
    );
    expect(screen.getByRole("radio", { name: "Manual" })).toBeDisabled();
    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(
      false
    );
  });

  it("no envía si sessionStorage impide guardar el comando antes del PUT", async () => {
    mocks.fetch.mockResolvedValue(response(currentPreference));
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      storageKey: string,
      value: string
    ) {
      if (
        this === window.sessionStorage &&
        storageKey === PENDING_FAMILY_COLLECTION_PREFERENCE_STORAGE_KEY
      ) {
        throw new DOMException("Write denied", "SecurityError");
      }
      return originalSetItem.call(this, storageKey, value);
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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo guardar y verificar esta solicitud"
    );
    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(
      false
    );
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
