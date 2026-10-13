// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpenManualPaymentCharge } from "@/modules/billing/application/manual-payments";

const mockRefresh = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock("@/components/owner-dashboard/FamilyCollectionModeCard", () => ({
  FamilyCollectionModeCard: () => null,
}));

import { ManualPaymentForm } from "@/components/owner-dashboard/ManualPaymentForm";

const organizationId = "10000000-0000-0000-0000-000000000001";
const charge: OpenManualPaymentCharge = {
  chargeId: "10000000-0000-0000-0000-000000000301",
  familyId: "10000000-0000-0000-0000-000000000201",
  locationId: "10000000-0000-0000-0000-000000000101",
  locationName: "Sede Centro",
  invoiceReference: "FAC-2026-014",
  payerName: "Familia de prueba",
  currency: "EUR",
  dueAt: "2026-10-01T00:00:00.000Z",
  totalCents: 2500,
  allocatedCents: 0,
  outstandingCents: 2500,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockRefresh.mockReset();
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("crypto", {
    randomUUID: () => "synthetic-payment-id",
  });
});

describe("registro manual de pagos en el dashboard owner", () => {
  it("explica el estado vacío sin presentar controles que no se pueden usar", () => {
    render(
      <ManualPaymentForm
        organizationId={organizationId}
        charges={[]}
        canManageFamilyCollectionPreferences={false}
      />
    );

    expect(
      screen.getByRole("heading", { name: "No hay cargos pendientes" })
    ).toBeVisible();
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("reintenta el mismo registro con la misma clave para evitar duplicar el pago", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      })
      .mockResolvedValueOnce({ ok: true, status: 201 });

    render(
      <ManualPaymentForm
        organizationId={organizationId}
        charges={[charge]}
        canManageFamilyCollectionPreferences={false}
      />
    );

    const saveButton = await screen.findByRole("button", {
      name: "Guardar pago recibido",
    });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No sabemos si se guardó. Reintenta este mismo envío"
    );
    const retryButton = screen.getByRole("button", {
      name: "Reintentar el mismo registro",
    });
    await user.click(retryButton);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Pago guardado y asignado al cargo."
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstRequest = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const retryRequest = mockFetch.mock.calls[1]?.[1] as RequestInit;
    expect(firstRequest.headers).toEqual(retryRequest.headers);
    expect(firstRequest.headers).toMatchObject({
      "idempotency-key": "owner-manual-payment:synthetic-payment-id",
    });
    expect(firstRequest.body).toBe(retryRequest.body);
    expect(JSON.parse(String(firstRequest.body))).toMatchObject({
      organizationId,
      chargeId: charge.chargeId,
      amountCents: 2500,
      method: "bank_transfer",
    });
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("admite coma decimal al registrar un pago parcial", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });

    render(
      <ManualPaymentForm
        organizationId={organizationId}
        charges={[charge]}
        canManageFamilyCollectionPreferences={false}
      />
    );

    const amount = screen.getByLabelText(/Importe recibido/);
    expect(amount).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByText(/Usa coma o punto decimal/)).toBeVisible();
    await user.clear(amount);
    await user.type(amount, "12,50");

    const saveButton = screen.getByRole("button", {
      name: "Guardar pago recibido",
    });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledOnce());
    const request = mockFetch.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      amountCents: 1250,
      chargeId: charge.chargeId,
    });
  });
});
