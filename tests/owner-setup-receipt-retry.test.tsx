// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

import { OwnerSetupForm } from "@/components/owner-dashboard/OwnerSetupForm";

const receipt = {
  organizationId: "10000000-0000-4000-8000-000000000001",
  locationId: "20000000-0000-4000-8000-000000000002",
  memberId: "30000000-0000-4000-8000-000000000003",
};

function response(payload: unknown) {
  return { ok: true, status: 201, json: async () => payload };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("crypto", {
    randomUUID: () => "40000000-0000-4000-8000-000000000004",
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("reintento de alta Owner", () => {
  it("conserva clave y cuerpo tras un recibo 2xx inválido y navega al recibir uno válido", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response(receipt));
    const user = userEvent.setup();
    render(
      <OwnerSetupForm
        contractualConsent={{ policyVersion: "2026-10", requiresAcceptance: false }}
      />
    );

    await user.type(screen.getByLabelText("Nombre de la academia"), "Academia sintética");
    await user.click(screen.getByRole("radio", { name: "Gimnasia artística" }));
    await user.type(screen.getByLabelText("Nombre de la primera sede"), "Sede principal");
    await user.click(screen.getByRole("button", { name: "Crear espacio de dirección" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No podemos confirmar si se creó el espacio");
    const retry = await screen.findByRole("button", { name: "Reintentar el mismo envío" });
    expect(retry).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const firstRequest = mocks.fetch.mock.calls[0];

    await user.click(retry);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(
      `/owner?organizationId=${receipt.organizationId}`
    ));
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1]).toEqual(firstRequest);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
