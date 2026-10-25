// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const organizationId = "10000000-0000-4000-8000-000000000001";
const charge: OpenManualPaymentCharge = {
  chargeId: "10000000-0000-4000-8000-000000000301",
  familyId: "10000000-0000-4000-8000-000000000201",
  locationId: "10000000-0000-4000-8000-000000000101",
  locationName: "Sede Centro",
  locationTimezone: "Europe/Madrid",
  invoiceReference: "FAC-2026-014",
  payerName: "Familia de prueba",
  currency: "EUR",
  dueAt: "2026-10-01T00:00:00.000Z",
  totalCents: 2500,
  allocatedCents: 0,
  outstandingCents: 2500,
};

function successfulResponseForBody(body: string) {
  const request = JSON.parse(body) as {
    chargeId: string;
    amountCents: number;
    method: string;
    receivedAt: string;
  };
  return {
    ok: true,
    status: 201,
    json: async () => ({
      ok: true,
      data: {
        chargeId: request.chargeId,
        amountCents: request.amountCents,
        method: request.method,
        receivedAt: request.receivedAt,
      },
    }),
  };
}

function optionsPageResponse(
  charges: OpenManualPaymentCharge[],
  nextCursor: string | null
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data: { charges, nextCursor } }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockRefresh.mockReset();
  mockFetch.mockReset();
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("crypto", {
    randomUUID: () => "10000000-0000-4000-8000-000000000009",
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
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("carga más cargos dentro del mismo ámbito sin perder la selección ni el importe editado", async () => {
    const user = userEvent.setup();
    const nextCharge: OpenManualPaymentCharge = {
      ...charge,
      chargeId: "10000000-0000-4000-8000-000000000302",
      familyId: "10000000-0000-4000-8000-000000000202",
      invoiceReference: "FAC-2026-015",
      payerName: "Otra familia de prueba",
      outstandingCents: 1800,
    };
    mockFetch.mockResolvedValueOnce(optionsPageResponse([nextCharge], null));

    render(
      <ManualPaymentForm
        organizationId={organizationId}
        locationId={charge.locationId}
        charges={[charge]}
        nextCursor="cursor-de-la-misma-sede"
        canManageFamilyCollectionPreferences={false}
      />
    );

    const amount = screen.getByLabelText(/Importe recibido/);
    await user.clear(amount);
    await user.type(amount, "12,50");
    await user.click(screen.getByRole("button", { name: "Cargar más cargos" }));

    expect(
      await screen.findByRole("option", { name: /Otra familia de prueba/ })
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Cargo pendiente")).toHaveValue(charge.chargeId);
    expect(screen.getByLabelText(/Importe recibido/)).toHaveValue("12,50");
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit | undefined];
    const query = new URL(url, "https://example.invalid").searchParams;
    expect(query.get("organizationId")).toBe(organizationId);
    expect(query.get("locationId")).toBe(charge.locationId);
    expect(query.get("cursor")).toBe("cursor-de-la-misma-sede");
    expect(init?.method).toBeUndefined();
    expect(
      screen.queryByRole("button", { name: "Cargar más cargos" })
    ).not.toBeInTheDocument();
  });

  it("ignora una página tardía del ámbito anterior y conserva el bloqueo de la nueva solicitud", async () => {
    const user = userEvent.setup();
    const organizationB = "10000000-0000-4000-8000-000000000002";
    const locationB = "10000000-0000-4000-8000-000000000102";
    const chargeB: OpenManualPaymentCharge = {
      ...charge,
      chargeId: "10000000-0000-4000-8000-000000000311",
      familyId: "10000000-0000-4000-8000-000000000211",
      locationId: locationB,
      payerName: "Familia academia B",
      invoiceReference: "FAC-B-001",
    };
    const chargeAExtra: OpenManualPaymentCharge = {
      ...charge,
      chargeId: "10000000-0000-4000-8000-000000000312",
      familyId: "10000000-0000-4000-8000-000000000212",
      payerName: "Cargo tardío academia A",
      invoiceReference: "FAC-A-002",
    };
    const chargeBExtra: OpenManualPaymentCharge = {
      ...chargeB,
      chargeId: "10000000-0000-4000-8000-000000000313",
      familyId: "10000000-0000-4000-8000-000000000213",
      payerName: "Otra familia academia B",
      invoiceReference: "FAC-B-002",
    };
    const responseA = deferred<ReturnType<typeof optionsPageResponse>>();
    const responseB = deferred<ReturnType<typeof optionsPageResponse>>();
    mockFetch
      .mockReturnValueOnce(responseA.promise)
      .mockReturnValueOnce(responseB.promise);

    const { rerender } = render(
      <ManualPaymentForm
        organizationId={organizationId}
        locationId={charge.locationId}
        charges={[charge]}
        nextCursor="cursor-academia-a"
        canManageFamilyCollectionPreferences={false}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cargar más cargos" }));
    expect(screen.getByRole("button", { name: "Cargando cargos…" })).toBeDisabled();

    rerender(
      <ManualPaymentForm
        organizationId={organizationB}
        locationId={locationB}
        charges={[chargeB]}
        nextCursor="cursor-academia-b"
        canManageFamilyCollectionPreferences={false}
      />
    );
    expect(
      await screen.findByRole("option", { name: /Familia academia B/ })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Cargar más cargos" })
      ).toBeEnabled();
    });
    await user.click(screen.getByRole("button", { name: "Cargar más cargos" }));
    expect(screen.getByRole("button", { name: "Cargando cargos…" })).toBeDisabled();
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [urlB] = mockFetch.mock.calls[1] as [string, RequestInit | undefined];
    const queryB = new URL(urlB, "https://example.invalid").searchParams;
    expect(queryB.get("organizationId")).toBe(organizationB);
    expect(queryB.get("locationId")).toBe(locationB);
    expect(queryB.get("cursor")).toBe("cursor-academia-b");

    await act(async () => {
      responseA.resolve(
        optionsPageResponse([chargeAExtra], "cursor-academia-a-next")
      );
      await responseA.promise;
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByRole("button", { name: "Cargando cargos…" })
    ).toBeDisabled();
    expect(screen.queryByRole("option", { name: /Cargo tardío academia A/ })).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(2);

    responseB.resolve(optionsPageResponse([chargeBExtra], null));
    expect(
      await screen.findByRole("option", { name: /Otra familia academia B/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Cargo tardío academia A/ })).not.toBeInTheDocument();
  });

  it("mantiene la confirmación si el pago deja la lista de cargos vacía", async () => {
    const user = userEvent.setup();
    let resolveResponseBody: ((value: unknown) => void) | undefined;
    const json = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveResponseBody = resolve;
        })
    );
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201, json });

    const props = {
      organizationId,
      charges: [charge],
      canManageFamilyCollectionPreferences: false,
    };
    const { rerender } = render(<ManualPaymentForm {...props} />);

    const saveButton = await screen.findByRole("button", {
      name: "Guardar pago recibido",
    });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() => expect(json).toHaveBeenCalledOnce());
    expect(mockRefresh).not.toHaveBeenCalled();
    const request = mockFetch.mock.calls[0]?.[1] as RequestInit;
    resolveResponseBody?.(
      successfulResponseForBody(String(request.body)).json()
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Pago guardado y asignado al cargo."
    );
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0]?.[0]).toBe(
      "/api/v1/owner/billing/manual-payments"
    );
    expect((mockFetch.mock.calls[0]?.[1] as RequestInit).method).toBe("POST");

    rerender(<ManualPaymentForm {...props} charges={[]} />);

    expect(
      screen.getByRole("heading", { name: "No hay cargos pendientes" })
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Pago guardado y asignado al cargo."
    );
  });

  it("reintenta el mismo registro con la misma clave para evitar duplicar el pago", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      })
      .mockImplementationOnce(async (_url, init) =>
        successfulResponseForBody(String(init?.body))
      );

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
      "idempotency-key": "owner-manual-payment:10000000-0000-4000-8000-000000000009",
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
    mockFetch.mockImplementationOnce(async (_url, init) =>
      successfulResponseForBody(String(init?.body))
    );

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

  it("no confirma una respuesta 201 que no coincide y reintenta el mismo envío", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          ok: true,
          data: {
            chargeId: charge.chargeId,
            amountCents: 1,
            method: "bank_transfer",
            receivedAt: "2026-10-13T11:00:00.000Z",
          },
        }),
      })
      .mockImplementationOnce(async (_url, init) =>
        successfulResponseForBody(String(init?.body))
      );

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
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();

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
    expect(retryRequest.headers).toEqual(firstRequest.headers);
    expect(retryRequest.body).toBe(firstRequest.body);
    expect(mockRefresh).toHaveBeenCalledOnce();
  });
});
