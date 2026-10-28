// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import { ManualPaymentForm } from "@/components/owner-dashboard/ManualPaymentForm";
import {
  beginOwnerPlanUsageRead,
  markOwnerPlanUsageUnavailable,
  publishOwnerPlanUsage,
} from "@/components/owner-dashboard/owner-plan-usage-store";
import type { OpenManualPaymentCharge } from "@/modules/billing/application/manual-payments";
import { getCalendarDateInTimezone } from "@/modules/billing/domain/manual-payment-date";

const organizationId = "74000000-0000-4000-8000-000000000001";
const actorId = "74000000-0000-4000-8000-000000000099";
const otherOrganizationId = "74000000-0000-4000-8000-000000000005";
const timezoneSwitchOrganizationId = "74000000-0000-4000-8000-000000000007";
const charges: OpenManualPaymentCharge[] = [
  {
    chargeId: "74000000-0000-4000-8000-000000000002",
    familyId: "74000000-0000-4000-8000-000000000003",
    locationId: "74000000-0000-4000-8000-000000000004",
    locationName: "Sede sintética",
    locationTimezone: "Europe/Madrid",
    invoiceReference: "INV-SYNTHETIC-001",
    payerName: "Familia sintética",
    currency: "EUR",
    dueAt: "2026-10-20T21:59:59.999Z",
    totalCents: 5000,
    allocatedCents: 0,
    outstandingCents: 5000,
  },
];
const otherOrganizationCharges: OpenManualPaymentCharge[] = [
  {
    ...charges[0],
    chargeId: "74000000-0000-4000-8000-000000000006",
    invoiceReference: "INV-SYNTHETIC-002",
    outstandingCents: 3750,
  },
];
const fetchMock = vi.fn();
const policyCases: Array<[string, () => void]> = [
  ["exceso de capacidad", () => publishOwnerPlanUsage(organizationId, { readOnly: true, planCode: "free" })],
  ["comprobación pendiente", () => { beginOwnerPlanUsageRead(organizationId); }],
  ["fallo al comprobar límites", () => {
    const ticket = beginOwnerPlanUsageRead(organizationId);
    markOwnerPlanUsageUnavailable(organizationId, ticket);
  }],
];

beforeEach(() => {
  fetchMock.mockReset();
  mocks.refresh.mockReset();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", fetchMock);
  const navigatorWithLocks = Object.create(window.navigator) as Navigator;
  Object.defineProperty(navigatorWithLocks, "locks", {
    value: { request: async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback() },
  });
  vi.stubGlobal("navigator", navigatorWithLocks);
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function waitForRegisterEnabled() {
  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Guardar pago recibido" })
    ).toBeEnabled();
  });
}

describe("registro manual de pagos con política de solo lectura", () => {
  it("ignora un segundo submit síncrono y libera el gate tras confirmar el pago", async () => {
    const secondCharge: OpenManualPaymentCharge = {
      ...charges[0],
      chargeId: "74000000-0000-4000-8000-000000000010",
      invoiceReference: "INV-SYNTHETIC-004",
      outstandingCents: 2500,
    };
    let resolveFirst!: (value: {
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    }) => void;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise<{
            ok: boolean;
            status: number;
            json: () => Promise<unknown>;
          }>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockImplementation(async (_url, init) => {
        const request = JSON.parse(String(init?.body));
        return {
          ok: true,
          status: 201,
          json: async () => ({ ok: true, data: request }),
        };
      });

    render(
      <ManualPaymentForm
        actorId={actorId}
        organizationId={organizationId}
        charges={[...charges, secondCharge]}
      />
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Fecha de recepción")).not.toHaveValue("");
    });
    await waitForRegisterEnabled();
    const form = screen
      .getByRole("button", { name: "Guardar pago recibido" })
      .closest("form");
    expect(form).not.toBeNull();

    act(() => {
      fireEvent.submit(form!);
      fireEvent.submit(form!);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const firstBody = JSON.parse(String(firstInit.body));
    const firstKey = (firstInit.headers as Record<string, string>)[
      "idempotency-key"
    ];
    expect(firstKey).toMatch(/^owner-manual-payment:/);
    expect(firstBody).toMatchObject({
      organizationId,
      chargeId: charges[0].chargeId,
      amountCents: charges[0].outstandingCents,
      method: "bank_transfer",
    });

    await act(async () => {
      resolveFirst({
        ok: true,
        status: 201,
        json: async () => ({ ok: true, data: firstBody }),
      });
    });
    expect(await screen.findByText("Pago guardado y asignado al cargo.")).toBeVisible();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Cargo pendiente"), {
      target: { value: secondCharge.chargeId },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Importe recibido")).toHaveValue("25.00")
    );
    fireEvent.submit(form!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const secondBody = JSON.parse(String(secondInit.body));
    const secondKey = (secondInit.headers as Record<string, string>)[
      "idempotency-key"
    ];
    expect(secondKey).not.toBe(firstKey);
    expect(secondBody).toMatchObject({
      organizationId,
      chargeId: secondCharge.chargeId,
      amountCents: secondCharge.outstandingCents,
      method: "bank_transfer",
    });
    expect(secondBody).not.toEqual(firstBody);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("descarta la fecha anterior al cambiar a una sede con otro huso", async () => {
    const locationCharges: OpenManualPaymentCharge[] = [
      charges[0],
      {
        ...charges[0],
        chargeId: "74000000-0000-4000-8000-000000000009",
        locationId: "74000000-0000-4000-8000-000000000008",
        locationName: "Sede del Pacífico",
        locationTimezone: "Pacific/Kiritimati",
        invoiceReference: "INV-SYNTHETIC-003",
      },
    ];
    render(
      <ManualPaymentForm
        actorId={actorId}
        organizationId={timezoneSwitchOrganizationId}
        charges={locationCharges}
      />
    );

    const dateField = screen.getByLabelText("Fecha de recepción");
    await waitFor(() => expect(dateField).not.toHaveValue(""));
    fireEvent.change(dateField, { target: { value: "2026-10-10" } });
    expect(dateField).toHaveValue("2026-10-10");

    fireEvent.change(screen.getByLabelText("Cargo pendiente"), {
      target: { value: locationCharges[1].chargeId },
    });

    await waitFor(() =>
      expect(dateField).toHaveValue(
        getCalendarDateInTimezone(new Date(), "Pacific/Kiritimati")
      )
    );
  });

  it.each(policyCases)("deshabilita el envío y bloquea el handler si la política indica %s", async (_reason, setPolicy) => {
    act(() => setPolicy());
    render(<ManualPaymentForm actorId={actorId} organizationId={organizationId} charges={charges} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Fecha de recepción")).not.toHaveValue("");
    });
    expect(screen.getByRole("button", { name: "Guardar pago recibido" })).toBeDisabled();
    const form = screen.getByRole("button", { name: "Guardar pago recibido" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("mantiene un reintento incierto en su academia de origen al cambiar de academia", async () => {
    publishOwnerPlanUsage(otherOrganizationId, {
      readOnly: false,
      planCode: "free",
    });

    let attempt = 0;
    fetchMock.mockImplementation(async (_input, init) => {
      attempt += 1;
      const request = JSON.parse(String(init?.body)) as {
        chargeId: string;
        amountCents: number;
        method: string;
        receivedAt: string;
      };

      if (attempt === 1) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ detail: "Respuesta incierta" }),
        };
      }

      return {
        ok: true,
        status: 201,
        json: async () => ({ ok: true, data: request }),
      };
    });

    const { rerender } = render(
      <ManualPaymentForm actorId={actorId} organizationId={organizationId} charges={charges} />
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Fecha de recepción")).not.toHaveValue("");
    });
    await waitForRegisterEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar pago recibido" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await screen.findByRole("alert");

    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const firstBody = String(firstInit.body);
    const firstKey = (firstInit.headers as Record<string, string>)["idempotency-key"];
    act(() => {
      publishOwnerPlanUsage(organizationId, {
        readOnly: true,
        planCode: "free",
      });
    });

    rerender(
      <ManualPaymentForm
        actorId={actorId}
        organizationId={otherOrganizationId}
        charges={otherOrganizationCharges}
      />
    );

    expect(
      screen.getByRole("link", {
        name: "Volver a los pagos de la academia del envío pendiente",
      })
    ).toHaveAttribute(
      "href",
      `/owner/payments?organizationId=${organizationId}`
    );
    expect(screen.getByLabelText("Importe recibido")).toHaveValue("37.50");
    const otherAcademyButton = screen.getByRole("button", {
      name: "Resuelve primero el envío pendiente",
    });
    expect(otherAcademyButton).toBeDisabled();
    fireEvent.submit(otherAcademyButton.closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender(
      <ManualPaymentForm actorId={actorId} organizationId={organizationId} charges={[]} />
    );
    const retryButton = screen.getByRole("button", {
      name: "Reintentar el mismo registro",
    });
    expect(retryButton).toBeEnabled();
    fireEvent.click(retryButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const retryInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(String(retryInit.body)).toBe(firstBody);
    expect((retryInit.headers as Record<string, string>)["idempotency-key"]).toBe(
      firstKey
    );
    await screen.findByText("Pago guardado y asignado al cargo.");
  });

  it("conserva la clave del pago ante un 429 transitorio", async () => {
    let attempt = 0;
    fetchMock.mockImplementation(async (_input, init) => {
      attempt += 1;
      const request = JSON.parse(String(init?.body));
      if (attempt === 1) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ detail: "Demasiados intentos" }),
        };
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({ ok: true, data: request }),
      };
    });

    render(<ManualPaymentForm actorId={actorId} organizationId={organizationId} charges={charges} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Fecha de recepción")).not.toHaveValue("");
    });
    await waitForRegisterEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar pago recibido" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await screen.findByRole("alert");

    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const retryButton = screen.getByRole("button", {
      name: "Reintentar el mismo registro",
    });
    expect(retryButton).toBeEnabled();
    fireEvent.click(retryButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const retryInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(String(retryInit.body)).toBe(String(firstInit.body));
    expect((retryInit.headers as Record<string, string>)["idempotency-key"]).toBe(
      (firstInit.headers as Record<string, string>)["idempotency-key"]
    );
    await screen.findByText("Pago guardado y asignado al cargo.");
  });

  it("recupera entre pestañas el mismo comando sin guardar la referencia en claro", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: "Respuesta incierta" }),
      })
      .mockImplementationOnce(async (_input, init) => {
        const request = JSON.parse(String(init?.body));
        return { ok: true, status: 201, json: async () => ({ ok: true, data: request }) };
      });

    const firstRender = render(
      <ManualPaymentForm actorId={actorId} organizationId={organizationId} charges={charges} />
    );
    await waitFor(() => {
      expect(screen.getByLabelText("Fecha de recepción")).not.toHaveValue("");
    });
    await waitForRegisterEnabled();
    fireEvent.change(screen.getByLabelText(/Referencia/), {
      target: { value: "transferencia qa 741" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar pago recibido" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await screen.findByRole("alert");

    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const firstBody = String(firstInit.body);
    const firstKey = (firstInit.headers as Record<string, string>)["idempotency-key"];
    const storageKey = window.localStorage.key(0);
    expect(storageKey).toMatch(
      /^zaltyko:pending-manual-payment:v2:[0-9a-f]{64}:/
    );
    const pendingSnapshot = window.localStorage.getItem(storageKey!)!;
    expect(pendingSnapshot).not.toContain("transferencia qa 741");
    expect(JSON.parse(pendingSnapshot)).toMatchObject({
      organizationId,
      chargeId: charges[0].chargeId,
      idempotencyKey: firstKey,
    });

    firstRender.unmount();
    render(<ManualPaymentForm actorId={actorId} organizationId={organizationId} charges={charges} />);
    await screen.findByRole("button", { name: "Reintentar el mismo registro" });
    const referenceInput = screen.getByLabelText(/Referencia/);
    expect(referenceInput).toBeEnabled();
    fireEvent.change(referenceInput, { target: { value: "otra referencia" } });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar el mismo registro" }));
    await screen.findByText(/no coincide con el envío pendiente/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.change(referenceInput, { target: { value: "transferencia qa 741" } });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar el mismo registro" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const retryInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(String(retryInit.body)).toBe(firstBody);
    expect((retryInit.headers as Record<string, string>)["idempotency-key"]).toBe(firstKey);
    await screen.findByText("Pago guardado y asignado al cargo.");
    expect(window.localStorage.getItem(storageKey!)).toBeNull();
  });

  it("conserva el reintento tras perder la conexión después de iniciar el POST", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("network interrupted"))
      .mockImplementationOnce(async (_input, init) => {
        const request = JSON.parse(String(init?.body));
        return { ok: true, status: 201, json: async () => ({ ok: true, data: request }) };
      });

    render(<ManualPaymentForm actorId={actorId} organizationId={organizationId} charges={charges} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Fecha de recepción")).not.toHaveValue("");
    });
    await waitForRegisterEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar pago recibido" }));
    await screen.findByText(/no sabemos si se guardó/i);

    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const retryButton = screen.getByRole("button", {
      name: "Reintentar el mismo registro",
    });
    expect(retryButton).toBeEnabled();
    fireEvent.click(retryButton);
    await screen.findByText("Pago guardado y asignado al cargo.");

    const retryInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(retryInit.body).toBe(firstInit.body);
    expect(retryInit.headers).toEqual(firstInit.headers);
  });

  it("bloquea un segundo pago desde una pestaña con saldo antiguo", async () => {
    fetchMock.mockImplementationOnce(async (_input, init) => {
      const request = JSON.parse(String(init?.body));
      return { ok: true, status: 201, json: async () => ({ ok: true, data: request }) };
    });

    render(<ManualPaymentForm actorId={actorId} organizationId={organizationId} charges={charges} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Fecha de recepción")).not.toHaveValue("");
    });
    await waitForRegisterEnabled();
    fireEvent.change(screen.getByLabelText("Importe recibido"), {
      target: { value: "10.00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar pago recibido" }));
    await screen.findByText("Pago guardado y asignado al cargo.");

    fireEvent.change(screen.getByLabelText("Importe recibido"), {
      target: { value: "5.00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar pago recibido" }));
    await screen.findByText(/saldo de este cargo cambió en otra pestaña/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falla cerrado si acceder al getter de localStorage produce una excepción", async () => {
    const storageGetter = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new DOMException("Storage denied", "SecurityError");
      });
    render(<ManualPaymentForm actorId={actorId} organizationId={organizationId} charges={charges} />);

    await screen.findByText(/almacenamiento seguro o la coordinación entre pestañas no está disponible/i);
    expect(screen.getByRole("button", { name: "Guardar pago recibido" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
    storageGetter.mockRestore();
  });

  it("falla cerrado si el navegador no ofrece coordinación entre pestañas", async () => {
    const navigatorWithoutLocks = Object.create(window.navigator) as Navigator;
    Object.defineProperty(navigatorWithoutLocks, "locks", { value: undefined });
    vi.stubGlobal("navigator", navigatorWithoutLocks);
    render(<ManualPaymentForm actorId={actorId} organizationId={organizationId} charges={charges} />);

    await screen.findByText(/coordinación entre pestañas no está disponible/i);
    expect(screen.getByRole("button", { name: "Guardar pago recibido" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no envía un pago si localStorage no se puede escribir", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage denied", "SecurityError");
    });
    render(<ManualPaymentForm actorId={actorId} organizationId={organizationId} charges={charges} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Fecha de recepción")).not.toHaveValue("");
    });

    await waitForRegisterEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar pago recibido" }));
    await screen.findByText(/no se pudo guardar el reintento seguro/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("conserva el comando incierto si un replay requiere recuperar acceso", async () => {
    let attempt = 0;
    fetchMock.mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ detail: "Respuesta incierta" }),
        };
      }
      return {
        ok: false,
        status: 403,
        json: async () => ({ detail: "Acceso temporalmente no disponible" }),
      };
    });

    render(<ManualPaymentForm actorId={actorId} organizationId={organizationId} charges={charges} />);
    await waitFor(() => {
      expect(screen.getByLabelText("Fecha de recepción")).not.toHaveValue("");
    });
    await waitForRegisterEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar pago recibido" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await screen.findByRole("alert");

    const firstInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    fireEvent.click(
      screen.getByRole("button", { name: "Reintentar el mismo registro" })
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toBe(
      String(firstInit.body)
    );
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Acceso temporalmente no disponible"
      );
    });
    expect(
      screen.getByRole("button", { name: "Reintentar el mismo registro" })
    ).toBeEnabled();
  });
});
