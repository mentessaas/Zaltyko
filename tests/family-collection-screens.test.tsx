// @vitest-environment jsdom
/**
 * Cobro automático de cuotas (Fase 3): pantallas de la familia y de la
 * academia. Nombres accesibles, textos sencillos sin jerga y las llamadas a
 * las rutas (día de cobro, preferencia de la familia y acciones de la
 * academia). Solo datos sintéticos.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import type { ReactNode } from "react";

const mockRefresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/owner/payments",
}));
// FamilyFeesView importa la tarjeta de pago automático (Fase 2): Stripe.js no se carga.
vi.mock("@stripe/stripe-js/pure", () => ({ loadStripe: vi.fn() }));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: vi.fn() }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PaymentElement: () => null,
  useStripe: () => null,
  useElements: () => null,
}));

import { FamilyFeesView } from "@/components/family-portal/FamilyFeesView";
import { OwnerAutomaticCollectionsPanel } from "@/components/owner-dashboard/OwnerAutomaticCollectionsPanel";
import { OwnerCollectionDaySettings } from "@/components/owner-dashboard/OwnerCollectionDaySettings";
import {
  OwnerFamilyPaymentMethodsPanel,
  type OwnerFamilyPaymentMethod,
} from "@/components/owner-dashboard/OwnerFamilyPaymentMethodsPanel";
import { OwnerStripeConnectCard } from "@/components/owner-dashboard/OwnerStripeConnectCard";
import type {
  OwnerAutomaticCollectionItem,
  OwnerAutomaticCollectionsView,
} from "@/modules/family-collection/application/family-collection-reads";
import type { FamilyAcademyFees, FamilyFee } from "@/modules/family-portal/application/family-portal-reads";

const ORGANIZATION_ID = "92000000-0000-4000-8000-000000000001";
const FAMILY_A = "92000000-0000-4000-8000-000000000301";
const FAMILY_B = "92000000-0000-4000-8000-000000000302";
const JARGON = /stripe_|payment ?intent|off-session|webhook|connect\b|decline|insufficient_funds|card_declined|pi_/i;

type Call = { url: string; init?: RequestInit };
let calls: Call[];

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function problem(status: number, type: string, detail: string) {
  return reply(status, { type: `https://zaltyko.com/problems/${type}`, title: "Problema", status, detail });
}

function stubFetch(handler: (call: Call) => Response | Promise<Response>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: String(input), init };
      calls.push(call);
      return handler(call);
    })
  );
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init?.body)) as Record<string, unknown>;
}

function headerOf(call: Call, name: string): string | null {
  return new Headers(call.init?.headers).get(name);
}

let uuidCounter = 0;

beforeEach(() => {
  mockRefresh.mockReset();
  // Claves de envío distintas y deterministas.
  vi.stubGlobal("crypto", {
    subtle: webcrypto.subtle,
    getRandomValues: (array: Uint8Array) => webcrypto.getRandomValues(array),
    randomUUID: () => `92000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Familia: /familia/cuotas
// ---------------------------------------------------------------------------

describe("FamilyFeesView: estado del cobro automático de cada cuota", () => {
  const fee = (invoiceId: string, reference: string): FamilyFee => ({
    invoiceId,
    reference,
    status: "issued",
    currency: "EUR",
    totalCents: 4500,
    paidCents: 0,
    refundedCents: 0,
    pendingCents: 4500,
    dueAt: "2026-11-20T22:59:59.999Z",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
  });
  const ids = {
    scheduled: "92000000-0000-4000-8000-000000000401",
    progress: "92000000-0000-4000-8000-000000000402",
    collected: "92000000-0000-4000-8000-000000000403",
    failed: "92000000-0000-4000-8000-000000000404",
    manual: "92000000-0000-4000-8000-000000000405",
  };
  const academy: FamilyAcademyFees = {
    organizationId: ORGANIZATION_ID,
    organizationName: "Club Sintético",
    timezone: "Europe/Madrid",
    fees: [
      fee(ids.scheduled, "CUO-A"),
      fee(ids.progress, "CUO-B"),
      fee(ids.collected, "CUO-C"),
      fee(ids.failed, "CUO-D"),
      fee(ids.manual, "CUO-E"),
    ],
  };

  function itemOf(reference: string) {
    const item = screen.getByText(`Cuota ${reference}`).closest("li");
    if (!item) throw new Error(`Sin cuota ${reference}`);
    return item;
  }

  it("enseña el estado de cada cuota automática y nada en las manuales", () => {
    render(
      <FamilyFeesView
        academies={[academy]}
        automaticCollection={{
          [ids.scheduled]: { kind: "scheduled", date: "2026-11-20" },
          [ids.progress]: { kind: "in_progress" },
          [ids.collected]: { kind: "collected", date: "2026-11-05" },
          [ids.failed]: { kind: "not_collected" },
        }}
      />
    );

    expect(itemOf("CUO-A")).toHaveTextContent(/Se cobrará automáticamente el 20 nov\.? 2026/);
    expect(itemOf("CUO-B")).toHaveTextContent("Cobro en curso");
    expect(itemOf("CUO-C")).toHaveTextContent(/Cobrada automáticamente el 5 nov\.? 2026/);
    expect(itemOf("CUO-D")).toHaveTextContent(
      "No se pudo cobrar automáticamente; tu academia te dirá cómo pagarla"
    );
    expect(itemOf("CUO-E")).not.toHaveTextContent(/automáticamente|Cobro en curso/);
    expect(document.body.textContent ?? "").not.toMatch(JARGON);
    // Solo informa: ningún botón ni formulario nuevo.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sin estados (la demo pública): ninguna cuota habla de cobro automático", () => {
    render(<FamilyFeesView academies={[academy]} />);

    expect(document.body.textContent ?? "").not.toMatch(/Se cobrará automáticamente|Cobro en curso|Cobrada automáticamente|No se pudo cobrar/);
  });
});

// ---------------------------------------------------------------------------
// Academia: «Día de cobro» en Ajustes
// ---------------------------------------------------------------------------

describe("OwnerCollectionDaySettings", () => {
  const ENDPOINT = "/api/v1/owner/payments/collection-settings";

  it("por defecto, el día que vence cada cuota; sin cambios no se puede guardar", () => {
    stubFetch(() => reply(200, {}));
    render(<OwnerCollectionDaySettings organizationId={ORGANIZATION_ID} initial={{ collectionDayOfMonth: null, version: 0 }} />);

    expect(screen.getByRole("heading", { name: "Día de cobro" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "El día que vence cada cuota" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Un día fijo del mes" })).not.toBeChecked();
    expect(screen.queryByRole("combobox", { name: "Día del mes" })).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar día de cobro" })).toBeDisabled();
    // D4 (Elvis, 17-11-2026): lo que cuesta cobrar, sin cifras.
    expect(
      screen.getByText("Stripe cobra su tarifa por cada pago a la academia; Zaltyko no cobra comisión.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/\d\s*(%|€)/)).toBeNull();
  });

  it("un día fijo: selector del 1 al 31, las dos notas y guarda con la versión", async () => {
    stubFetch(() => reply(200, { collectionDayOfMonth: 31, version: 1, isDefault: false }));
    render(<OwnerCollectionDaySettings organizationId={ORGANIZATION_ID} initial={{ collectionDayOfMonth: null, version: 0 }} />);

    fireEvent.click(screen.getByRole("radio", { name: "Un día fijo del mes" }));
    const select = screen.getByRole("combobox", { name: "Día del mes" });
    const options = within(select).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(Array.from({ length: 31 }, (_, index) => String(index + 1)));
    expect(screen.getByText("En los meses que no tienen ese día, se cobra el último día del mes.")).toBeInTheDocument();
    // Regla del día fijo (Elvis, 17-11-2026): nunca antes del vencimiento.
    expect(
      screen.getByText("Si una cuota vence más tarde que el día elegido, se cobrará el día que vence, nunca antes.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Si ese día cae antes del vencimiento, se cobra el día del vencimiento.")).toBeNull();
    expect(
      screen.getByText("Stripe cobra su tarifa por cada pago a la academia; Zaltyko no cobra comisión.")
    ).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "31" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar día de cobro" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Día de cobro guardado.");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ENDPOINT);
    expect(calls[0].init?.method).toBe("PUT");
    expect(bodyOf(calls[0])).toEqual({ organizationId: ORGANIZATION_ID, collectionDayOfMonth: 31, expectedVersion: 0 });
    // Guardado: volver a pulsar no envía nada.
    expect(screen.getByRole("button", { name: "Guardar día de cobro" })).toBeDisabled();
  });

  it("volver al día de vencimiento envía null; un conflicto enseña el texto del servidor", async () => {
    stubFetch(() =>
      problem(409, "version-conflict", "El día de cobro cambió en otra sesión. Recarga antes de volver a guardar.")
    );
    render(<OwnerCollectionDaySettings organizationId={ORGANIZATION_ID} initial={{ collectionDayOfMonth: 10, version: 3 }} />);

    expect(screen.getByRole("radio", { name: "Un día fijo del mes" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Día del mes" })).toHaveValue("10");
    fireEvent.click(screen.getByRole("radio", { name: "El día que vence cada cuota" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar día de cobro" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El día de cobro cambió en otra sesión.");
    expect(bodyOf(calls[0])).toEqual({ organizationId: ORGANIZATION_ID, collectionDayOfMonth: null, expectedVersion: 3 });
    // Conflicto de versión: además del texto, relee la página para traer la versión nueva.
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("tras releer la página, enseña el día guardado en el servidor y guarda con su versión", async () => {
    stubFetch(() => reply(200, { collectionDayOfMonth: 12, version: 5 }));
    const { rerender } = render(
      <OwnerCollectionDaySettings organizationId={ORGANIZATION_ID} initial={{ collectionDayOfMonth: 10, version: 3 }} />
    );
    rerender(<OwnerCollectionDaySettings organizationId={ORGANIZATION_ID} initial={{ collectionDayOfMonth: 20, version: 4 }} />);

    expect(screen.getByRole("combobox", { name: "Día del mes" })).toHaveValue("20");
    fireEvent.change(screen.getByRole("combobox", { name: "Día del mes" }), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar día de cobro" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Día de cobro guardado.");
    expect(bodyOf(calls[0])).toEqual({ organizationId: ORGANIZATION_ID, collectionDayOfMonth: 12, expectedVersion: 4 });
  });
});

describe("OwnerStripeConnectCard con el día de cobro", () => {
  const readyState = { kind: "ready", card: "active", sepa: "active" };

  it("con la cuenta lista enseña el ajuste y ya no anuncia el cobro «en una próxima actualización»", async () => {
    stubFetch(() => reply(200, readyState));
    render(
      <OwnerStripeConnectCard organizationId={ORGANIZATION_ID}>
        <p>ajuste-dia-de-cobro</p>
      </OwnerStripeConnectCard>
    );

    expect(await screen.findByText("Lista para cobrar.")).toBeInTheDocument();
    expect(screen.getByText("ajuste-dia-de-cobro")).toBeInTheDocument();
    expect(screen.queryByText(/próxima actualización/)).toBeNull();
  });

  it("sin el ajuste (cobro automático cerrado) la tarjeta queda como en la Fase 1", async () => {
    stubFetch(() => reply(200, readyState));
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} />);

    expect(await screen.findByText(/próxima actualización/)).toBeInTheDocument();
  });

  it("si la tarjeta no se puede mostrar, tampoco el ajuste", async () => {
    stubFetch(() => reply(200, { kind: "unavailable", reason: "flag_off" }));
    const { container } = render(
      <OwnerStripeConnectCard organizationId={ORGANIZATION_ID}>
        <p>ajuste-dia-de-cobro</p>
      </OwnerStripeConnectCard>
    );

    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

// ---------------------------------------------------------------------------
// Academia: interruptor «Cobrar automáticamente» por familia
// ---------------------------------------------------------------------------

describe("OwnerFamilyPaymentMethodsPanel: «Cobrar automáticamente»", () => {
  const PREFERENCE_ENDPOINT = "/api/v1/owner/billing/family-collection-preference";
  const lucia: OwnerFamilyPaymentMethod = {
    authorizationId: "92000000-0000-4000-8000-000000000501",
    familyId: FAMILY_A,
    payerName: "Lucía Martín",
    method: "card",
    since: "2026-11-10T10:00:00.000Z",
  };
  const luciaSepa: OwnerFamilyPaymentMethod = {
    ...lucia,
    authorizationId: "92000000-0000-4000-8000-000000000502",
    method: "sepa_debit",
  };
  const pablo: OwnerFamilyPaymentMethod = {
    authorizationId: "92000000-0000-4000-8000-000000000503",
    familyId: FAMILY_B,
    payerName: "Pablo Ruiz",
    method: "sepa_debit",
    since: "2026-11-12T08:30:00.000Z",
  };
  const collection = {
    available: true,
    families: {
      [FAMILY_A]: { automatic: false, version: 0, requiresConfirmation: false },
      [FAMILY_B]: { automatic: true, version: 2, requiresConfirmation: false },
    },
  };

  function receipt(familyId: string, mode: "manual" | "automatic", version: number) {
    return {
      organizationId: ORGANIZATION_ID,
      familyId,
      requestedMode: mode,
      effectiveMode: mode,
      version,
      entitlementRevision: 5,
      preferenceEntitlementRevision: 5,
      automaticPreferenceAvailable: true,
      automaticProcessingEnabled: true,
      automaticStatus: "available",
      requiresConfirmation: false,
    };
  }

  it("sin el cobro automático abierto no hay interruptores", () => {
    stubFetch(() => reply(200, {}));
    render(<OwnerFamilyPaymentMethodsPanel organizationId={ORGANIZATION_ID} methods={[lucia, pablo]} />);

    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("un solo interruptor por familia, con su nombre accesible y su estado", () => {
    stubFetch(() => reply(200, {}));
    render(
      <OwnerFamilyPaymentMethodsPanel organizationId={ORGANIZATION_ID} methods={[lucia, luciaSepa, pablo]} collection={collection} />
    );

    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(2);
    expect(screen.getByRole("switch", { name: "Cobrar automáticamente a Lucía Martín" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Cobrar automáticamente a Pablo Ruiz" })).toBeChecked();
    expect(document.body.textContent ?? "").not.toMatch(JARGON);
  });

  it("encenderlo guarda la preferencia con su versión y una clave de envío", async () => {
    stubFetch(() => reply(200, receipt(FAMILY_A, "automatic", 1)));
    render(<OwnerFamilyPaymentMethodsPanel organizationId={ORGANIZATION_ID} methods={[lucia, pablo]} collection={collection} />);

    fireEvent.click(screen.getByRole("switch", { name: "Cobrar automáticamente a Lucía Martín" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Las próximas cuotas de Lucía Martín se cobrarán automáticamente."
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(PREFERENCE_ENDPOINT);
    expect(calls[0].init?.method).toBe("PUT");
    expect(bodyOf(calls[0])).toEqual({
      organizationId: ORGANIZATION_ID,
      familyId: FAMILY_A,
      mode: "automatic",
      expectedVersion: 0,
    });
    expect(headerOf(calls[0], "idempotency-key")).toMatch(/^family-preference-[0-9a-f-]{36}$/);
    expect(screen.getByRole("switch", { name: "Cobrar automáticamente a Lucía Martín" })).toBeChecked();
  });

  it("apagarlo guarda «manual» y lo dice en palabras sencillas", async () => {
    stubFetch(() => reply(200, receipt(FAMILY_B, "manual", 3)));
    render(<OwnerFamilyPaymentMethodsPanel organizationId={ORGANIZATION_ID} methods={[lucia, pablo]} collection={collection} />);

    fireEvent.click(screen.getByRole("switch", { name: "Cobrar automáticamente a Pablo Ruiz" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Las cuotas de Pablo Ruiz ya no se cobrarán automáticamente. Los cobros ya enviados al banco siguen su curso."
    );
    expect(bodyOf(calls[0])).toMatchObject({ mode: "manual", expectedVersion: 2 });
    expect(screen.getByRole("switch", { name: "Cobrar automáticamente a Pablo Ruiz" })).not.toBeChecked();
  });

  it("si no se sabe si se guardó, el reintento repite la misma clave; tras un rechazo, otra", async () => {
    const responses = [
      reply(503, null),
      problem(409, "version-conflict", "La preferencia cambió en otra sesión. Recarga antes de volver a guardar."),
      reply(200, receipt(FAMILY_A, "automatic", 1)),
    ];
    stubFetch(() => responses.shift() ?? reply(500, null));
    render(<OwnerFamilyPaymentMethodsPanel organizationId={ORGANIZATION_ID} methods={[lucia]} collection={collection} />);
    const toggle = () => screen.getByRole("switch", { name: "Cobrar automáticamente a Lucía Martín" });

    fireEvent.click(toggle());
    expect(await screen.findByRole("alert")).toHaveTextContent("No hemos podido guardar el cambio.");
    await waitFor(() => expect(toggle()).toBeEnabled());
    fireEvent.click(toggle());
    expect(await screen.findByText(/La preferencia cambió en otra sesión/)).toBeInTheDocument();
    await waitFor(() => expect(toggle()).toBeEnabled());
    fireEvent.click(toggle());
    await screen.findByRole("status");

    expect(calls).toHaveLength(3);
    expect(headerOf(calls[1], "idempotency-key")).toBe(headerOf(calls[0], "idempotency-key"));
    expect(headerOf(calls[2], "idempotency-key")).not.toBe(headerOf(calls[1], "idempotency-key"));
    // Solo el conflicto de versión relee la página; el 503 no.
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("sin plan de pago: interruptores desactivados y el motivo", () => {
    stubFetch(() => reply(200, {}));
    render(
      <OwnerFamilyPaymentMethodsPanel
        organizationId={ORGANIZATION_ID}
        methods={[lucia]}
        collection={{ available: false, families: { [FAMILY_A]: { automatic: false, version: 1, requiresConfirmation: false } } }}
      />
    );

    expect(screen.getByRole("switch", { name: "Cobrar automáticamente a Lucía Martín" })).toBeDisabled();
    expect(screen.getByText("El cobro automático de cuotas está incluido en Starter y Growth.")).toBeInTheDocument();
  });

  it("tras un cambio de plan, apagado y con el aviso para volver a encenderlo", () => {
    stubFetch(() => reply(200, {}));
    render(
      <OwnerFamilyPaymentMethodsPanel
        organizationId={ORGANIZATION_ID}
        methods={[lucia]}
        collection={{ available: true, families: { [FAMILY_A]: { automatic: false, version: 4, requiresConfirmation: true } } }}
      />
    );

    expect(screen.getByRole("switch", { name: "Cobrar automáticamente a Lucía Martín" })).not.toBeChecked();
    expect(screen.getByText(/Cambió el plan de la academia: vuelve a encenderlo/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Academia: cobros automáticos del mes en /owner/payments
// ---------------------------------------------------------------------------

describe("OwnerAutomaticCollectionsPanel", () => {
  const ENDPOINT = "/api/v1/owner/payments/automatic-collection";
  const base: Omit<OwnerAutomaticCollectionItem, "invoiceId" | "invoiceReference" | "state"> = {
    payerName: "Lucía Martín",
    amountCents: 4500,
    currency: "EUR",
    date: null,
    reason: null,
    needsReview: false,
    canCancel: false,
    canMarkReviewed: false,
    manualPaymentBlocked: false,
  };
  const invoice = (n: number) => `92000000-0000-4000-8000-00000000060${n}`;
  const items: OwnerAutomaticCollectionItem[] = [
    { ...base, invoiceId: invoice(1), invoiceReference: "CUO-1", state: "scheduled", date: "2026-11-20" },
    { ...base, invoiceId: invoice(2), invoiceReference: "CUO-2", state: "collected", date: "2026-11-05" },
    {
      ...base,
      invoiceId: invoice(3),
      invoiceReference: "CUO-3",
      state: "retry_scheduled",
      date: "2026-11-20",
      reason: "No había saldo suficiente.",
      canCancel: true,
    },
    {
      ...base,
      invoiceId: invoice(4),
      invoiceReference: "CUO-4",
      state: "in_progress",
      reason: "Hay más de un cobro para esta cuota. Compruébalo en Stripe.",
      needsReview: true,
      canMarkReviewed: true,
      manualPaymentBlocked: true,
    },
    {
      ...base,
      invoiceId: invoice(5),
      invoiceReference: "CUO-5",
      state: "failed",
      reason: "La tarjeta figura como perdida o robada.",
    },
  ];
  const view: OwnerAutomaticCollectionsView = { month: "2026-11", items, truncated: false };

  function rowOf(reference: string) {
    const row = screen.getByText(`Cuota ${reference}`).closest("li");
    if (!row) throw new Error(`Sin fila ${reference}`);
    return row;
  }

  it("lista los cobros del mes con su estado, el motivo y lo que necesita revisión", () => {
    stubFetch(() => reply(200, {}));
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    expect(screen.getByRole("heading", { name: "Cobros automáticos de este mes" })).toBeInTheDocument();
    expect(screen.getByText(/noviembre de 2026/)).toBeInTheDocument();
    expect(rowOf("CUO-1")).toHaveTextContent(/Se cobrará el 20 nov\.? 2026/);
    expect(rowOf("CUO-2")).toHaveTextContent(/Cobrada el 5 nov\.? 2026/);
    expect(rowOf("CUO-3")).toHaveTextContent(/No se pudo cobrar; se volverá a intentar el 20 nov\.? 2026/);
    expect(rowOf("CUO-3")).toHaveTextContent("No había saldo suficiente.");
    expect(rowOf("CUO-4")).toHaveTextContent("Necesita revisión");
    expect(rowOf("CUO-5")).toHaveTextContent("No se pudo cobrar");
    expect(rowOf("CUO-5")).toHaveTextContent("Esta cuota se cobra a mano");
    expect(within(rowOf("CUO-1")).queryByRole("button")).toBeNull();
    expect(within(rowOf("CUO-5")).queryByRole("button")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(JARGON);
  });

  it("un cobro que ya no puede llegar: «Se cobrará a mano» con el motivo", () => {
    stubFetch(() => reply(200, {}));
    render(
      <OwnerAutomaticCollectionsPanel
        organizationId={ORGANIZATION_ID}
        view={{
          month: "2026-11",
          truncated: false,
          items: [
            {
              ...base,
              invoiceId: invoice(6),
              invoiceReference: "CUO-6",
              state: "manual",
              date: "2026-11-20",
              reason: "La familia ya no tiene un método de pago activo.",
            },
          ],
        }}
      />
    );

    expect(rowOf("CUO-6")).toHaveTextContent("Se cobrará a mano");
    expect(rowOf("CUO-6")).toHaveTextContent("La familia ya no tiene un método de pago activo.");
    expect(rowOf("CUO-6")).not.toHaveTextContent(/Se cobrará el/);
  });

  it("D3: el primer cobro fallido sale como incidencia y dice si la familia está avisada", () => {
    stubFetch(() => reply(200, {}));
    render(
      <OwnerAutomaticCollectionsPanel
        organizationId={ORGANIZATION_ID}
        view={{
          month: "2026-11",
          truncated: false,
          items: [
            {
              ...base,
              invoiceId: invoice(7),
              invoiceReference: "CUO-7",
              state: "retry_scheduled",
              date: "2026-11-18",
              reason: "No había saldo suficiente.",
              canCancel: true,
              familyNotice: "sent",
            },
            {
              ...base,
              invoiceId: invoice(8),
              invoiceReference: "CUO-8",
              state: "failed",
              reason: "El banco pide que la familia confirme el pago.",
              familyNotice: "not_sent",
            },
            { ...base, invoiceId: invoice(9), invoiceReference: "CUO-9", state: "collected", date: "2026-11-05" },
          ],
        }}
      />
    );

    expect(rowOf("CUO-7")).toHaveTextContent(/No se pudo cobrar; se volverá a intentar el 18 nov\.? 2026/);
    expect(rowOf("CUO-7")).toHaveTextContent("Hemos avisado a la familia por correo de que no se pudo cobrar.");
    expect(rowOf("CUO-8")).toHaveTextContent("No se pudo cobrar");
    expect(rowOf("CUO-8")).toHaveTextContent("No hemos podido avisar a la familia por correo. Avísala tú.");
    expect(rowOf("CUO-9")).not.toHaveTextContent(/avisa/i);
    expect(document.body.textContent ?? "").not.toMatch(JARGON);
  });

  it("tras refrescar la página manda la lectura nueva del servidor", async () => {
    stubFetch(() => reply(200, { outcome: "canceled" }));
    const { rerender } = render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar el cobro" }));
    await screen.findByRole("status");
    expect(rowOf("CUO-3")).toHaveTextContent("Cobro automático cancelado");

    const refreshed: OwnerAutomaticCollectionsView = {
      ...view,
      items: view.items.map((item): OwnerAutomaticCollectionItem =>
        item.invoiceId === invoice(3)
          ? { ...item, state: "canceled", reason: "Lo canceló la academia.", canCancel: false }
          : item.invoiceId === invoice(1)
            ? { ...item, state: "in_progress", date: null }
            : item
      ),
    };
    rerender(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={refreshed} />);

    await waitFor(() => expect(rowOf("CUO-1")).toHaveTextContent("Cobro en curso"));
  });

  it("vacía: lo dice sin más", () => {
    stubFetch(() => reply(200, {}));
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={{ month: "2026-11", items: [], truncated: false }} />);

    expect(screen.getByText("Este mes todavía no hay cuotas que se cobren automáticamente.")).toBeInTheDocument();
  });

  it("con el cobro automático parado (solo cobros en marcha), el título no promete cobros del mes", () => {
    stubFetch(() => reply(200, {}));
    const inProgress: OwnerAutomaticCollectionsView = {
      month: "2026-11",
      items: [items[3]],
      truncated: false,
      inProgressOnly: true,
    };
    const { unmount } = render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={inProgress} />);

    expect(screen.getByRole("heading", { name: "Cobros automáticos en curso" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cobros automáticos de este mes" })).toBeNull();
    expect(
      screen.getByText(
        "El cobro automático está parado: ya no se cobra ninguna cuota nueva. Estos cobros ya estaban en marcha y siguen su curso."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/que se cobran solas/)).toBeNull();
    expect(rowOf("CUO-4")).toHaveTextContent("Necesita revisión");
    unmount();

    render(
      <OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={{ ...inProgress, items: [] }} />
    );
    expect(screen.getByText("Ya no queda ningún cobro automático en curso.")).toBeInTheDocument();
    expect(screen.queryByText("Este mes todavía no hay cuotas que se cobren automáticamente.")).toBeNull();
  });

  it("«Cancelar el cobro automático» pide confirmación y luego llama a la ruta", async () => {
    stubFetch(() => reply(200, { outcome: "canceled" }));
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3" }));
    expect(calls).toHaveLength(0);
    const group = screen.getByRole("group", { name: "Confirmar la cancelación del cobro automático de la cuota CUO-3" });
    fireEvent.click(within(group).getByRole("button", { name: "Sí, cancelar el cobro" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Cobro automático cancelado. La cuota CUO-3 se cobra a mano."
    );
    expect(calls[0].url).toBe(ENDPOINT);
    expect(bodyOf(calls[0])).toEqual({ action: "cancel", organizationId: ORGANIZATION_ID, invoiceId: invoice(3) });
    expect(rowOf("CUO-3")).toHaveTextContent("Cobro automático cancelado");
    expect(screen.queryByRole("button", { name: /Cancelar el cobro automático de la cuota CUO-3/ })).toBeNull();
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("«Marcar como revisado» exige «He comprobado el cobro en Stripe»", async () => {
    stubFetch(() => reply(200, { outcome: "reviewed" }));
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Marcar como revisado el cobro de la cuota CUO-4" }));
    const group = screen.getByRole("group", { name: "Marcar como revisado el cobro de la cuota CUO-4" });
    const confirm = within(group).getByRole("button", { name: "Confirmar revisión" });
    expect(confirm).toBeDisabled();
    fireEvent.click(within(group).getByRole("checkbox", { name: "He comprobado el cobro en Stripe" }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Cobro marcado como revisado. La cuota CUO-4 se cobra a mano."
    );
    expect(bodyOf(calls[0])).toEqual({
      action: "mark_reviewed",
      organizationId: ORGANIZATION_ID,
      invoiceId: invoice(4),
      checkedInStripe: true,
    });
    expect(rowOf("CUO-4")).not.toHaveTextContent("Necesita revisión");
  });

  it("si el cobro ya se había hecho, lo dice y la cuota queda cobrada", async () => {
    stubFetch(() => reply(200, { outcome: "collected" }));
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar el cobro" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "El cobro de la cuota CUO-3 ya se había hecho y ha quedado registrado."
    );
    expect(rowOf("CUO-3")).toHaveTextContent("Cobrada automáticamente");
  });

  it("cancelar un cobro ya registrado en otro intento: ofrece «Marcar como revisado»", async () => {
    stubFetch(() =>
      problem(
        409,
        "automatic-collection-review-required",
        "Este cobro ya figura registrado con otro cobro automático. Revísalo y usa «Marcar como revisado»."
      )
    );
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar el cobro" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se puede cancelar: este cobro ya figura registrado en otro cobro automático."
    );
    expect(screen.queryByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3" })).toBeNull();
    expect(screen.getByRole("button", { name: "Marcar como revisado el cobro de la cuota CUO-3" })).toBeInTheDocument();
    expect(rowOf("CUO-3")).toHaveTextContent("Necesita revisión");
  });

  it("marcar como revisado con dinero movido en Stripe: lo manda al soporte de Stripe y retira el botón", async () => {
    stubFetch(() =>
      problem(409, "automatic-collection-needs-support", "Resuélvelo en Stripe con su soporte; no se puede marcar como revisado.")
    );
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Marcar como revisado el cobro de la cuota CUO-4" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "He comprobado el cobro en Stripe" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar revisión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Resuélvelo en tu panel de Stripe con su soporte."
    );
    expect(screen.queryByRole("button", { name: "Marcar como revisado el cobro de la cuota CUO-4" })).toBeNull();
    expect(rowOf("CUO-4")).toHaveTextContent("Necesita revisión");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("si el cobro cambió mientras tanto, pide recargar", async () => {
    stubFetch(() => problem(409, "concurrency-retry", "Texto del servidor"));
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar el cobro" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El cobro automático de esta cuota cambió o acaba de empezar. Recarga la página y vuelve a intentarlo."
    );
  });

  it("otros rechazos enseñan el texto del servidor; un fallo de red, uno genérico", async () => {
    stubFetch(() => problem(409, "automatic-collection-processing", "Este cobro ya se envió al banco y no se puede cancelar."));
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar el cobro" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Este cobro ya se envió al banco y no se puede cancelar.");

    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("red"))));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sí, cancelar el cobro" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar el cobro" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("No hemos podido completar la acción. Inténtalo de nuevo.")
    );
  });
});
