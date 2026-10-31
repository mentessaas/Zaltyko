// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";

import type { OpenManualPaymentCharge } from "@/modules/billing/application/manual-payments";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/components/owner-dashboard/FamilyCollectionModeCard", () => ({
  FamilyCollectionModeCard: () => null,
}));

import { ManualPaymentForm } from "@/components/owner-dashboard/ManualPaymentForm";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const organizationId = "75000000-0000-4000-8000-000000000001";
const actorId = "75000000-0000-4000-8000-000000000002";
const charge: OpenManualPaymentCharge = {
  chargeId: "75000000-0000-4000-8000-000000000003",
  familyId: "75000000-0000-4000-8000-000000000004",
  locationId: "75000000-0000-4000-8000-000000000005",
  locationName: "Sede sintética",
  locationTimezone: "Europe/Madrid",
  invoiceReference: "INV-CROSS-TAB-001",
  payerName: "Familia sintética",
  currency: "EUR",
  dueAt: "2026-10-20T21:59:59.999Z",
  totalCents: 5000,
  allocatedCents: 0,
  outstandingCents: 5000,
};

function createSerializedWebLocks() {
  let tail = Promise.resolve();
  let active = 0;
  let queued = 0;
  let maxActive = 0;

  const locks = {
    request<T>(
      _name: string,
      _options: { mode: "exclusive" },
      callback: () => Promise<T>
    ): Promise<T> {
      const previous = tail;
      let release!: () => void;
      const turn = new Promise<void>((resolve) => {
        release = resolve;
      });
      tail = previous.then(() => turn);
      queued += 1;

      return (async () => {
        await previous;
        queued -= 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        try {
          return await callback();
        } finally {
          active -= 1;
          release();
        }
      })();
    },
  };

  return {
    locks,
    get active() {
      return active;
    },
    get queued() {
      return queued;
    },
    get maxActive() {
      return maxActive;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function successfulResponse(body: string) {
  return {
    ok: true,
    status: 201,
    json: async () => ({ ok: true, data: JSON.parse(body) }),
  };
}

function renderPaymentForm(testId = "payment-tab") {
  return render(
    <section data-testid={testId}>
      <ManualPaymentForm
        actorId={actorId}
        organizationId={organizationId}
        charges={[charge]}
        canManageFamilyCollectionPreferences={false}
      />
    </section>
  );
}

async function waitUntilReady(formCount: number) {
  await waitFor(() => {
    const buttons = screen.getAllByRole("button", {
      name: "Guardar pago recibido",
    });
    expect(buttons).toHaveLength(formCount);
    for (const button of buttons) expect(button).toBeEnabled();
  });
}

function submitForm(container: HTMLElement) {
  const button = within(container).getByRole("button", {
    name: "Guardar pago recibido",
  });
  const form = button.closest("form");
  if (!form) throw new Error("Falta el formulario de pago manual.");
  fireEvent.submit(form);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mocks.fetch.mockReset();
  mocks.refresh.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
  vi.stubGlobal("crypto", {
    subtle: webcrypto.subtle,
    randomUUID: () => "75000000-0000-4000-8000-000000000099",
  });
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("coordinación de pagos manuales entre formularios", () => {
  it("serializa los envíos y rechaza el saldo antiguo tras confirmar el primero", async () => {
    const serializedLocks = createSerializedWebLocks();
    const navigatorWithLocks = Object.create(window.navigator) as Navigator;
    Object.defineProperty(navigatorWithLocks, "locks", {
      value: serializedLocks.locks,
    });
    vi.stubGlobal("navigator", navigatorWithLocks);

    const pendingPost = deferred<ReturnType<typeof successfulResponse>>();
    mocks.fetch.mockImplementationOnce(() => pendingPost.promise);

    render(
      <>
        <section data-testid="payment-tab-a">
          <ManualPaymentForm
            actorId={actorId}
            organizationId={organizationId}
            charges={[charge]}
            canManageFamilyCollectionPreferences={false}
          />
        </section>
        <section data-testid="payment-tab-b">
          <ManualPaymentForm
            actorId={actorId}
            organizationId={organizationId}
            charges={[charge]}
            canManageFamilyCollectionPreferences={false}
          />
        </section>
      </>
    );

    await waitUntilReady(2);
    await waitFor(() => {
      expect(serializedLocks.active).toBe(0);
      expect(serializedLocks.queued).toBe(0);
    });

    const tabA = screen.getByTestId("payment-tab-a");
    const tabB = screen.getByTestId("payment-tab-b");
    fireEvent.change(within(tabA).getByLabelText(/Importe recibido/), {
      target: { value: "25.00" },
    });
    submitForm(tabA);

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    const firstInit = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    const firstBody = String(firstInit.body);
    const firstCommand = JSON.parse(firstBody) as { amountCents: number };
    const firstKey = (firstInit.headers as Record<string, string>)[
      "idempotency-key"
    ];
    expect(firstCommand.amountCents).toBe(2500);
    expect(serializedLocks.active).toBe(1);

    submitForm(tabB);
    await waitFor(() => expect(serializedLocks.queued).toBe(1));
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      pendingPost.resolve(successfulResponse(firstBody));
    });

    await within(tabA).findByText("Pago guardado y asignado al cargo.");
    await waitFor(() => {
      expect(within(tabB).getByRole("alert")).toHaveTextContent(
        "El saldo de este cargo cambió en otra pestaña"
      );
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(serializedLocks.maxActive).toBe(1);
    expect(serializedLocks.active).toBe(0);
    expect(firstKey).toMatch(/^owner-manual-payment:/);
  });

  it("recupera un comando incierto con el mismo cuerpo y la misma clave", async () => {
    const serializedLocks = createSerializedWebLocks();
    const navigatorWithLocks = Object.create(window.navigator) as Navigator;
    Object.defineProperty(navigatorWithLocks, "locks", {
      value: serializedLocks.locks,
    });
    vi.stubGlobal("navigator", navigatorWithLocks);
    mocks.fetch.mockRejectedValueOnce(new TypeError("conexión interrumpida"));

    const firstRender = renderPaymentForm("payment-tab-a");
    await waitUntilReady(1);
    await waitFor(() => {
      expect(serializedLocks.active).toBe(0);
      expect(serializedLocks.queued).toBe(0);
    });
    submitForm(screen.getByTestId("payment-tab-a"));

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    await within(screen.getByTestId("payment-tab-a")).findByRole("alert");
    const firstInit = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    const firstBody = String(firstInit.body);
    const firstKey = (firstInit.headers as Record<string, string>)[
      "idempotency-key"
    ];

    firstRender.unmount();
    mocks.fetch.mockImplementationOnce(async (_url, init) =>
      successfulResponse(String(init?.body))
    );
    renderPaymentForm("payment-tab-b");
    await screen.findByRole("button", {
      name: "Reintentar el mismo registro",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Reintentar el mismo registro" })
    );

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    const retryInit = mocks.fetch.mock.calls[1]?.[1] as RequestInit;
    expect(String(retryInit.body)).toBe(firstBody);
    expect(
      (retryInit.headers as Record<string, string>)["idempotency-key"]
    ).toBe(firstKey);
    await within(screen.getByTestId("payment-tab-b")).findByText(
      "Pago guardado y asignado al cargo."
    );
  });
});
