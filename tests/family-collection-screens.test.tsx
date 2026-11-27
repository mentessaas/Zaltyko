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
// El formulario de ajustes de los recordatorios no se prueba aquí (Tarea 11 solo mira la lista).
vi.mock("@/components/owner-dashboard/PaymentReminderSettingsForm", () => ({
  PaymentReminderSettingsForm: () => null,
}));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PaymentElement: () => null,
  useStripe: () => null,
  useElements: () => null,
}));

import { loadStripe } from "@stripe/stripe-js/pure";

import { FamilyFeesView } from "@/components/family-portal/FamilyFeesView";
import { OwnerAutomaticCollectionsPanel } from "@/components/owner-dashboard/OwnerAutomaticCollectionsPanel";
import { OwnerCollectionDaySettings } from "@/components/owner-dashboard/OwnerCollectionDaySettings";
import {
  OwnerFamilyPaymentMethodsPanel,
  type OwnerFamilyPaymentMethod,
} from "@/components/owner-dashboard/OwnerFamilyPaymentMethodsPanel";
import { OwnerStripeConnectCard } from "@/components/owner-dashboard/OwnerStripeConnectCard";
import { PaymentRemindersPanel } from "@/components/owner-dashboard/PaymentRemindersPanel";
import type {
  OwnerAutomaticCollectionItem,
  OwnerAutomaticCollectionsView,
} from "@/modules/family-collection/application/family-collection-reads";
import type { FamilyAcademyFees, FamilyFee } from "@/modules/family-portal/application/family-portal-reads";
import type { ReminderListItem, ReminderOverview } from "@/modules/payment-reminders/application/service";

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

describe("FamilyFeesView: la familia confirma el pago con su banco (Fase 4, Tarea 5)", () => {
  const ENDPOINT = "/api/v1/family/automatic-payment/authentication";
  const INVOICE = "92000000-0000-4000-8000-000000000701";
  const PUBLISHABLE_KEY = "pk_test_synthetic";
  const PAYMENT_METHOD = "pm_SyntheticCard";
  /** Valor sintético montado en tiempo de ejecución: no es un secreto real. */
  const CLIENT_SECRET = ["pi_SyntheticConfirm", "secret", "synthetic"].join("_");
  const academy: FamilyAcademyFees = {
    organizationId: ORGANIZATION_ID,
    organizationName: "Club Sintético",
    timezone: "Europe/Madrid",
    fees: [
      {
        invoiceId: INVOICE,
        reference: "CUO-T5",
        status: "issued",
        currency: "EUR",
        totalCents: 4500,
        paidCents: 0,
        refundedCents: 0,
        pendingCents: 4500,
        dueAt: "2026-11-15T22:59:59.999Z",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
      },
    ],
  };
  const confirmCardPayment = vi.fn();

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
    // Lo que diga el navegador no cuenta: aquí siempre dice que se pagó.
    confirmCardPayment.mockReset();
    confirmCardPayment.mockResolvedValue({ paymentIntent: { status: "succeeded" } });
    vi.mocked(loadStripe).mockReset();
    vi.mocked(loadStripe).mockResolvedValue({ confirmCardPayment } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function renderWaiting() {
    return render(
      <FamilyFeesView
        academies={[academy]}
        automaticCollection={{ [INVOICE]: { kind: "action_required", deadline: "2026-11-18" } }}
      />
    );
  }

  function feeItem() {
    const item = screen.getByText("Cuota CUO-T5").closest("li");
    if (!item) throw new Error("Sin cuota CUO-T5");
    return item;
  }

  /** Cada test usa su cuenta: el componente guarda un Stripe.js por cuenta. */
  function started(connectedAccount: string) {
    return reply(200, {
      ok: true,
      data: { clientSecret: CLIENT_SECRET, connectedAccount, paymentMethodId: PAYMENT_METHOD },
    });
  }

  it("portal: action_required muestra el botón y el plazo; sin publishable key no se muestra", () => {
    const { unmount } = renderWaiting();

    expect(feeItem()).toHaveTextContent(/Tu banco pide que confirmes este pago\. Puedes hacerlo hasta el 18 nov\.? 2026\./);
    expect(within(feeItem()).getByRole("button", { name: "Confirmar el pago" })).toBeEnabled();
    expect(document.body.textContent ?? "").not.toMatch(JARGON);
    // Nada se carga ni se pide hasta pulsar.
    expect(loadStripe).not.toHaveBeenCalled();
    unmount();

    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
    renderWaiting();
    expect(screen.queryByRole("button")).toBeNull();
    expect(feeItem()).toHaveTextContent(
      "Tu banco pide que confirmes este pago, pero ahora no se puede hacer desde aquí. Tu academia te dirá cómo pagarla."
    );
    expect(feeItem()).not.toHaveTextContent(/Puedes hacerlo hasta/);
  });

  it("confirma el mismo cobro en la cuenta de la academia; «Procesando…» hasta que el servidor lo relee", async () => {
    const connectedAccount = "acct_SyntheticConfirm1";
    let answerCheck: (response: Response) => void = () => undefined;
    stubFetch((call) =>
      bodyOf(call).action === "start"
        ? started(connectedAccount)
        : new Promise<Response>((resolve) => {
            answerCheck = resolve;
          })
    );
    renderWaiting();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar el pago" }));

    expect(await screen.findByText("Procesando…")).toBeInTheDocument();
    // Stripe.js de la cuenta conectada de la academia, con la clave publicable.
    expect(loadStripe).toHaveBeenCalledWith(PUBLISHABLE_KEY, { stripeAccount: connectedAccount });
    // El mismo cobro, con la tarjeta del intento.
    expect(confirmCardPayment).toHaveBeenCalledWith(CLIENT_SECRET, { payment_method: PAYMENT_METHOD });
    expect(calls.map((call) => call.url)).toEqual([ENDPOINT, ENDPOINT]);
    expect(calls.map(bodyOf)).toEqual([
      { action: "start", organizationId: ORGANIZATION_ID, invoiceId: INVOICE },
      { action: "check", organizationId: ORGANIZATION_ID, invoiceId: INVOICE },
    ]);
    // Aunque el navegador diga que se pagó, no se dice hasta que lo confirma el servidor.
    expect(screen.queryByText("Pago confirmado")).toBeNull();

    answerCheck(reply(200, { ok: true, data: { state: "collected" } }));

    expect(await screen.findByText("Pago confirmado")).toBeInTheDocument();
    expect(mockRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Confirmar el pago" })).toBeNull();
    // La clave del cobro nunca se pinta.
    expect(document.body.innerHTML).not.toContain(CLIENT_SECRET);
  });

  it("si el servidor dice que sigue esperando, ofrece intentarlo otra vez hasta el plazo; nunca se reintenta solo", async () => {
    stubFetch((call) =>
      bodyOf(call).action === "start"
        ? started("acct_SyntheticConfirm2")
        : reply(200, { ok: true, data: { state: "action_required" } })
    );
    renderWaiting();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar el pago" }));

    expect(
      await screen.findByText(/^No se pudo confirmar\. Puedes intentarlo otra vez hasta el 18 nov\.? 2026\.$/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Pago confirmado")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirmar el pago" })).toBeEnabled();
    expect(mockRefresh).toHaveBeenCalledOnce();
    // Solo «start» y «check»: nada más sale sin que la familia vuelva a pulsar.
    expect(calls).toHaveLength(2);
    expect(confirmCardPayment).toHaveBeenCalledTimes(1);
  });

  it("I1: si no se puede comprobar (502, 429), deja «Procesando…», enseña el motivo y el botón otra vez", async () => {
    stubFetch((call) =>
      bodyOf(call).action === "start"
        ? started("acct_SyntheticConfirm3")
        : reply(502, {
            ok: false,
            code: "FAMILY_PAYMENT_CHECK_FAILED",
            message: "Todavía no podemos comprobar el pago. Recarga la página en unos minutos.",
          })
    );
    renderWaiting();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar el pago" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Todavía no podemos comprobar el pago. Recarga la página en unos minutos."
    );
    expect(screen.queryByText("Procesando…")).toBeNull();
    expect(screen.queryByText("Pago confirmado")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirmar el pago" })).toBeEnabled();
    expect(feeItem()).toHaveTextContent(/Puedes hacerlo hasta el 18 nov\.? 2026/);
    expect(mockRefresh).toHaveBeenCalledOnce();
    // Nada se reintenta solo.
    expect(calls).toHaveLength(2);
    expect(confirmCardPayment).toHaveBeenCalledTimes(1);
    cleanup();

    // Demasiados intentos al comprobar: el texto propio, y el botón.
    stubFetch((call) =>
      bodyOf(call).action === "start" ? started("acct_SyntheticConfirm4") : reply(429, { ok: false })
    );
    renderWaiting();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar el pago" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Has hecho demasiados intentos. Espera un minuto y vuelve a intentarlo."
    );
    expect(screen.queryByText("Procesando…")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirmar el pago" })).toBeEnabled();
  });

  it("si el pago ya no espera (409), enseña el texto del servidor sin abrir Stripe y refresca", async () => {
    stubFetch(() =>
      reply(409, {
        ok: false,
        code: "FAMILY_PAYMENT_CONFIRMATION_EXPIRED",
        message: "El plazo para confirmar este pago ya terminó. Tu academia te dirá cómo pagarla.",
      })
    );
    renderWaiting();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar el pago" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El plazo para confirmar este pago ya terminó. Tu academia te dirá cómo pagarla."
    );
    expect(loadStripe).not.toHaveBeenCalled();
    expect(confirmCardPayment).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(mockRefresh).toHaveBeenCalledOnce();
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

  it("B-M3: con dos pagadores, el mensaje nombra a quien tiene la tarjeta, no a la primera fila", async () => {
    // Marta (familia A) solo tiene domiciliación, que no se cobra sola, y sale primero.
    const martaSepa: OwnerFamilyPaymentMethod = {
      ...luciaSepa,
      authorizationId: "92000000-0000-4000-8000-000000000504",
      payerName: "Marta Gómez",
    };
    stubFetch(() => reply(200, receipt(FAMILY_A, "automatic", 1)));
    render(
      <OwnerFamilyPaymentMethodsPanel organizationId={ORGANIZATION_ID} methods={[martaSepa, lucia]} collection={collection} />
    );

    expect(screen.queryByRole("switch", { name: "Cobrar automáticamente a Marta Gómez" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Cobrar automáticamente a Lucía Martín" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Las próximas cuotas de Lucía Martín se cobrarán automáticamente.");
    expect(status).not.toHaveTextContent("Marta Gómez");
    expect(bodyOf(calls[0])).toEqual({
      organizationId: ORGANIZATION_ID,
      familyId: FAMILY_A,
      mode: "automatic",
      expectedVersion: 0,
    });
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
    expect(screen.getByText("Cuando se active, el cobro automático estará incluido en Club sin coste adicional.")).toBeInTheDocument();
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
    // Sin periodo: la fila sale con la referencia como respaldo («Cuota CUO-1»).
    servicePeriodStart: null,
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

    expect(screen.getByRole("heading", { name: "Cobros automáticos de noviembre de 2026" })).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3 (Lucía Martín)" }));
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

  it("Tarea 5: un cobro que espera a la familia dice hasta cuándo, sin jerga", () => {
    stubFetch(() => reply(200, {}));
    render(
      <OwnerAutomaticCollectionsPanel
        organizationId={ORGANIZATION_ID}
        view={{
          month: "2026-11",
          items: [
            {
              ...base,
              invoiceId: invoice(6),
              invoiceReference: "CUO-6",
              state: "action_required",
              date: "2026-11-18",
              canCancel: true,
              manualPaymentBlocked: true,
            },
          ],
          truncated: false,
        }}
      />
    );

    expect(rowOf("CUO-6")).toHaveTextContent(
      /Esperando a que la familia confirme el pago con su banco \(hasta el 18 nov\.? 2026\)/
    );
    // Sigue en curso: no se cobra a mano mientras espera.
    expect(rowOf("CUO-6")).not.toHaveTextContent("Esta cuota se cobra a mano");
    expect(document.body.textContent ?? "").not.toMatch(JARGON);
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
    expect(screen.queryByRole("heading", { name: /^Cobros automáticos de / })).toBeNull();
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

    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3 (Lucía Martín)" }));
    expect(calls).toHaveLength(0);
    const group = screen.getByRole("group", { name: "Confirmar la cancelación del cobro automático de la cuota CUO-3 (Lucía Martín)" });
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

    fireEvent.click(screen.getByRole("button", { name: "Marcar como revisado el cobro de la cuota CUO-4 (Lucía Martín)" }));
    const group = screen.getByRole("group", { name: "Marcar como revisado el cobro de la cuota CUO-4 (Lucía Martín)" });
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

  it("C1: revisado sin poder saber si se cobró: pide comprobarlo en Stripe y registrarlo a mano si se cobró", async () => {
    stubFetch(() => reply(200, { outcome: "unverifiable" }));
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Marcar como revisado el cobro de la cuota CUO-4 (Lucía Martín)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "He comprobado el cobro en Stripe" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar revisión" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Cobro marcado como revisado. La cuota CUO-4 se cobra a mano. Comprueba en tu panel de Stripe si se cobró; si se cobró, regístralo como pago manual."
    );
    expect(rowOf("CUO-4")).toHaveTextContent("Cobro automático cancelado");
    expect(rowOf("CUO-4")).toHaveTextContent(
      "Comprueba en tu panel de Stripe si se cobró; si se cobró, regístralo como pago manual."
    );
    expect(rowOf("CUO-4")).not.toHaveTextContent("Necesita revisión");
    expect(screen.queryByRole("button", { name: "Marcar como revisado el cobro de la cuota CUO-4 (Lucía Martín)" })).toBeNull();
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it("si el cobro ya se había hecho, lo dice y la cuota queda cobrada", async () => {
    stubFetch(() => reply(200, { outcome: "collected" }));
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3 (Lucía Martín)" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3 (Lucía Martín)" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar el cobro" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se puede cancelar: este cobro ya se hizo en Stripe (está registrado en otro cobro automático o por otro importe). Compruébalo en Stripe y usa «Marcar como revisado»."
    );
    expect(screen.queryByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3 (Lucía Martín)" })).toBeNull();
    expect(screen.getByRole("button", { name: "Marcar como revisado el cobro de la cuota CUO-3 (Lucía Martín)" })).toBeInTheDocument();
    expect(rowOf("CUO-3")).toHaveTextContent("Necesita revisión");
  });

  it("marcar como revisado con dinero movido en Stripe: lo manda al soporte de Stripe y retira el botón", async () => {
    stubFetch(() =>
      problem(409, "automatic-collection-needs-support", "Resuélvelo en Stripe con su soporte; no se puede marcar como revisado.")
    );
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Marcar como revisado el cobro de la cuota CUO-4 (Lucía Martín)" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "He comprobado el cobro en Stripe" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar revisión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Resuélvelo en tu panel de Stripe con su soporte."
    );
    expect(screen.queryByRole("button", { name: "Marcar como revisado el cobro de la cuota CUO-4 (Lucía Martín)" })).toBeNull();
    expect(rowOf("CUO-4")).toHaveTextContent("Necesita revisión");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("B-M2: cancelar con dinero movido en Stripe: texto propio de cancelar y retira «Cancelar»", async () => {
    stubFetch(() =>
      problem(
        409,
        "automatic-collection-needs-support",
        "Stripe cobró un importe distinto al de esta cuota y no lo hemos registrado. Resuélvelo en Stripe con su soporte; no se puede marcar como revisado."
      )
    );
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3 (Lucía Martín)" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar el cobro" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "No se puede cancelar desde aquí: en Stripe hay dinero que se ha movido o no se puede leer el cobro de esta cuota. Resuélvelo en tu panel de Stripe con su soporte."
    );
    expect(alert).not.toHaveTextContent("marcar como revisado");
    expect(screen.queryByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3 (Lucía Martín)" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sí, cancelar el cobro" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Marcar como revisado el cobro de la cuota CUO-3 (Lucía Martín)" })).toBeNull();
    expect(rowOf("CUO-3")).toHaveTextContent("Necesita revisión");
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("si el cobro cambió mientras tanto, pide recargar", async () => {
    stubFetch(() => problem(409, "concurrency-retry", "Texto del servidor"));
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3 (Lucía Martín)" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, cancelar el cobro" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El cobro automático de esta cuota cambió o acaba de empezar. Recarga la página y vuelve a intentarlo."
    );
  });

  it("otros rechazos enseñan el texto del servidor; un fallo de red, uno genérico", async () => {
    stubFetch(() => problem(409, "automatic-collection-processing", "Este cobro ya se envió al banco y no se puede cancelar."));
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={view} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota CUO-3 (Lucía Martín)" }));
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

// ---------------------------------------------------------------------------
// Fase 4, Tarea 11: el mes de la cuota en lugar del código interno, y un
// título que dice lo que se enseña (el mes en que se cobra).
// ---------------------------------------------------------------------------

describe("OwnerAutomaticCollectionsPanel: el mes de cada cuota (Tarea 11)", () => {
  const base: Omit<OwnerAutomaticCollectionItem, "invoiceId" | "invoiceReference" | "servicePeriodStart" | "state"> = {
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
  const invoice = (n: number) => `92000000-0000-4000-8000-00000000070${n}`;
  const feeItems: OwnerAutomaticCollectionItem[] = [
    {
      ...base,
      invoiceId: invoice(1),
      invoiceReference: "MENSUAL-202612-0001",
      servicePeriodStart: "2026-12-01",
      state: "collected",
      date: "2026-11-05",
    },
    {
      ...base,
      invoiceId: invoice(2),
      invoiceReference: "MENSUAL-202701-0002",
      servicePeriodStart: "2027-01-01",
      state: "scheduled",
      date: "2026-11-20",
    },
    {
      ...base,
      invoiceId: invoice(3),
      invoiceReference: "MENSUAL-202702-0003",
      servicePeriodStart: "2027-02-01",
      state: "retry_scheduled",
      date: "2026-11-20",
      reason: "No había saldo suficiente.",
      canCancel: true,
      canMarkReviewed: true,
    },
  ];
  const feeView: OwnerAutomaticCollectionsView = { month: "2026-11", items: feeItems, truncated: false };

  function rowWith(label: string) {
    const row = screen.getByText(label).closest("li");
    if (!row) throw new Error(`Sin fila ${label}`);
    return row;
  }

  it("fila con periodo 2027-02-01 → «Cuota de febrero de 2027»", async () => {
    stubFetch(() => reply(200, { outcome: "canceled" }));
    render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={feeView} />);

    expect(rowWith("Cuota de febrero de 2027")).toHaveTextContent("No había saldo suficiente.");
    expect(rowWith("Cuota de diciembre de 2026")).toHaveTextContent(/Cobrada el 5 nov\.? 2026/);
    expect(rowWith("Cuota de enero de 2027")).toHaveTextContent(/Se cobrará el 20 nov\.? 2026/);
    // El código interno no sale en la pantalla.
    expect(document.body.textContent ?? "").not.toMatch(/MENSUAL-/);
    // Los nombres accesibles dicen el mes de la cuota.
    expect(
      screen.getByRole("button", { name: "Marcar como revisado el cobro de la cuota de febrero de 2027 (Lucía Martín)" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota de febrero de 2027 (Lucía Martín)" }));
    const group = screen.getByRole("group", {
      name: "Confirmar la cancelación del cobro automático de la cuota de febrero de 2027 (Lucía Martín)",
    });
    expect(group).toHaveTextContent("¿Cancelar el cobro automático de la cuota de febrero de 2027?");
    fireEvent.click(within(group).getByRole("button", { name: "Sí, cancelar el cobro" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Cobro automático cancelado. La cuota de febrero de 2027 se cobra a mano."
    );
    // Solo cambia el texto: la acción sigue yendo a la misma factura.
    expect(bodyOf(calls[0])).toEqual({ action: "cancel", organizationId: ORGANIZATION_ID, invoiceId: invoice(3) });
    expect(document.body.textContent ?? "").not.toMatch(/MENSUAL-/);
  });

  it("sin periodo → «Cuota MENSUAL-…» como respaldo", () => {
    stubFetch(() => reply(200, {}));
    render(
      <OwnerAutomaticCollectionsPanel
        organizationId={ORGANIZATION_ID}
        view={{
          month: "2026-11",
          truncated: false,
          items: [
            { ...feeItems[2]!, servicePeriodStart: null },
            { ...feeItems[1]!, servicePeriodStart: "2027-13-01" },
          ],
        }}
      />
    );

    expect(rowWith("Cuota MENSUAL-202702-0003")).toHaveTextContent("No había saldo suficiente.");
    expect(rowWith("Cuota MENSUAL-202701-0002")).toHaveTextContent(/Se cobrará el 20 nov\.? 2026/);
    expect(
      screen.getByRole("button", { name: "Cancelar el cobro automático de la cuota MENSUAL-202702-0003 (Lucía Martín)" })
    ).toBeInTheDocument();
  });

  it("Tarea M (punto 18): dos cuotas del mismo mes → botones con la persona pagadora (o la referencia) en su nombre accesible", () => {
    stubFetch(() => reply(200, {}));
    render(
      <OwnerAutomaticCollectionsPanel
        organizationId={ORGANIZATION_ID}
        view={{
          month: "2026-11",
          truncated: false,
          items: [
            feeItems[2]!,
            { ...feeItems[2]!, invoiceId: invoice(4), invoiceReference: "MENSUAL-202702-0004", payerName: "Pablo Ruiz" },
            { ...feeItems[2]!, invoiceId: invoice(5), invoiceReference: "MENSUAL-202702-0005", payerName: null },
          ],
        }}
      />
    );

    for (const who of ["Lucía Martín", "Pablo Ruiz", "MENSUAL-202702-0005"]) {
      expect(
        screen.getByRole("button", { name: `Cancelar el cobro automático de la cuota de febrero de 2027 (${who})` }),
        who
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: `Marcar como revisado el cobro de la cuota de febrero de 2027 (${who})` }),
        who
      ).toBeInTheDocument();
    }
  });

  it("título con el mes de cobro y ayuda nueva; nunca «Cuotas de noviembre» con cuotas de otros meses", () => {
    stubFetch(() => reply(200, {}));
    const { unmount } = render(<OwnerAutomaticCollectionsPanel organizationId={ORGANIZATION_ID} view={feeView} />);

    expect(screen.getByRole("heading", { name: "Cobros automáticos de noviembre de 2026" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Cuotas que se cobran solas este mes; cada una dice de qué mes es. Las que no se pueden cobrar pasan a cobrarse a mano."
      )
    ).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toMatch(/Cuotas de noviembre/);
    // Las filas salen en el orden que da la lectura (por mes de la cuota).
    const titles = screen.getAllByRole("listitem").map((row) => row.querySelector("p")?.textContent);
    expect(titles).toEqual(["Cuota de diciembre de 2026", "Cuota de enero de 2027", "Cuota de febrero de 2027"]);
    unmount();

    // Con la bandera apagada el título sigue igual.
    render(
      <OwnerAutomaticCollectionsPanel
        organizationId={ORGANIZATION_ID}
        view={{ ...feeView, items: [{ ...feeItems[1]!, state: "in_progress", manualPaymentBlocked: true }], inProgressOnly: true }}
      />
    );
    expect(screen.getByRole("heading", { name: "Cobros automáticos en curso" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Cobros automáticos de / })).toBeNull();
    expect(screen.getByText("Cuota de enero de 2027")).toBeInTheDocument();
  });
});

describe("PaymentRemindersPanel: etiqueta común del mes (Tarea 11)", () => {
  const reminderItem = (overrides: Partial<ReminderListItem>): ReminderListItem => ({
    chargeId: "92000000-0000-4000-8000-000000000801",
    locationName: "Sede Centro",
    invoiceReference: "MENSUAL-202611-0001",
    servicePeriodStart: "2026-11-01",
    outstandingCents: 4500,
    currency: "EUR",
    dueAt: "2026-11-05T12:00:00.000Z",
    overdue: false,
    daysOverdue: 0,
    payerFirstName: "Lucía",
    payerEmailMasked: null,
    lastRemindedAt: null,
    reminderCount: 0,
    nextEligibleAt: null,
    canRemind: true,
    blockedReason: null,
    ...overrides,
  });
  const overview = (items: ReminderListItem[]): ReminderOverview => ({
    settings: {
      subjectTemplate: null,
      bodyTemplate: null,
      paymentInstructions: null,
      replyToEmail: "academia@example.test",
      minIntervalDays: 7,
      autoEnabled: false,
      autoAfterDays: 3,
      version: 1,
      isDefault: false,
    },
    items,
    truncated: false,
    overdueCount: 0,
    remindableOverdueCount: 0,
    maxChargesPerBatch: 50,
  });

  it("recordatorios: mismo texto que antes con la función común", () => {
    stubFetch(() => reply(200, {}));
    render(
      <PaymentRemindersPanel
        organizationId={ORGANIZATION_ID}
        locationId={null}
        automaticAvailable={false}
        suggestedReplyTo={null}
        overview={overview([
          reminderItem({}),
          reminderItem({
            chargeId: "92000000-0000-4000-8000-000000000802",
            servicePeriodStart: "2027-02-01",
            payerFirstName: null,
          }),
        ])}
      />
    );

    expect(screen.getByText(/^Cuota de noviembre de 2026 ·/)).toBeInTheDocument();
    expect(screen.getByText(/^Cuota de febrero de 2027 ·/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Seleccionar Cuota de noviembre de 2026 de Lucía" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Seleccionar Cuota de febrero de 2027 de la familia" })
    ).toBeInTheDocument();
  });
});
