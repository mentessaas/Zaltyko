// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stripeMock = vi.hoisted(() => ({
  loadStripe: vi.fn(),
  confirmSetup: vi.fn(),
  elements: { sintetico: "elements" },
  elementsOptions: [] as unknown[],
}));

vi.mock("@stripe/stripe-js/pure", () => ({ loadStripe: stripeMock.loadStripe }));
vi.mock("@stripe/stripe-js", () => ({ loadStripe: stripeMock.loadStripe }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children, options }: { children: ReactNode; options?: unknown }) => {
    stripeMock.elementsOptions.push(options);
    return <div data-testid="stripe-elements">{children}</div>;
  },
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => ({ confirmSetup: stripeMock.confirmSetup }),
  useElements: () => stripeMock.elements,
}));

import { FamilyAutomaticPaymentCard } from "@/components/family-portal/FamilyAutomaticPaymentCard";
import { FamilyFeesView } from "@/components/family-portal/FamilyFeesView";
import type { FamilyAcademyFees } from "@/modules/family-portal/application/family-portal-reads";
import type { FamilyPaymentMethodState } from "@/modules/family-payment-methods/application/family-payment-methods-service";

const ORGANIZATION_ID = "83000000-0000-4000-8000-000000000001";
const FAMILY_ID = "83000000-0000-4000-8000-000000000002";
const OTHER_FAMILY_ID = "83000000-0000-4000-8000-000000000003";
const ENDPOINT = "/api/v1/family/payment-methods";
const PUBLISHABLE_KEY = "pk_test_sintetico";
/** Valores sintéticos montados en tiempo de ejecución: no son secretos reales. */
const syntheticSecret = (intent: string) => [intent, "secret", "sintetico"].join("_");
const CLIENT_SECRET = syntheticSecret("seti_1Sintetico");
const VERSION = "borrador-2026-11-16";
const CARD_TEXT = "Autorizo a Club Sintético a cobrar automáticamente en esta tarjeta (texto sintético).";
const SEPA_TEXT = "Autorizo a Club Sintético a cobrar automáticamente por domiciliación (texto sintético).";
const INTRO =
  "Guarda una tarjeta o domicilia el pago para que las cuotas se cobren solas. Todavía no se cobrará nada.";
const PENDING =
  "Tu banco todavía lo está confirmando. Si en unos minutos no aparece como guardado, vuelve a guardarlo.";
/** D2 («Primero solo tarjeta»): mientras la domiciliación no se cobra sola. */
const SEPA_MANUAL = "Por ahora la domiciliación no se cobra sola; paga como siempre.";

type Kind = "card" | "sepa_debit";
type Call = { url: string; body: Record<string, unknown> };

function noneState(kinds: Kind[] = ["card", "sepa_debit"]): FamilyPaymentMethodState {
  const consentTexts: Partial<Record<Kind, string>> = {};
  if (kinds.includes("card")) consentTexts.card = CARD_TEXT;
  if (kinds.includes("sepa_debit")) consentTexts.sepa_debit = SEPA_TEXT;
  return { kind: "none", kinds, academyName: "Club Sintético", consentVersion: VERSION, consentTexts };
}

function activeState(method: Kind = "card", kinds: Kind[] = ["card", "sepa_debit"]): FamilyPaymentMethodState {
  const none = noneState(kinds) as Extract<FamilyPaymentMethodState, { kind: "none" }>;
  return { ...none, kind: "active", method, since: "2026-11-10T09:00:00.000Z" };
}

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const success = (data: unknown) => reply(200, { ok: true, data });
const failure = (status: number, code: string) =>
  reply(status, { ok: false, error: code, code, message: "Mensaje del servidor que no se enseña" });

let calls: Call[];

function stubFetch(handler: (body: Record<string, unknown>) => Response | Promise<Response>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ url: String(input), body });
      return handler(body);
    })
  );
}

const actions = () => calls.map((call) => call.body.action);

function renderCard(state: FamilyPaymentMethodState, familyId = FAMILY_ID) {
  return render(
    <FamilyAutomaticPaymentCard
      organizationId={ORGANIZATION_ID}
      familyId={familyId}
      timezone="Europe/Madrid"
      state={state}
    />
  );
}

let originalUrl: string;

beforeEach(() => {
  originalUrl = window.location.href;
  window.history.replaceState({}, "", "/familia/cuotas");
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", PUBLISHABLE_KEY);
  stripeMock.loadStripe.mockReset();
  stripeMock.loadStripe.mockImplementation(() => Promise.resolve({}));
  stripeMock.confirmSetup.mockReset();
  stripeMock.elementsOptions = [];
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", originalUrl);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("FamilyAutomaticPaymentCard", () => {
  it("no disponible: no enseña nada", () => {
    stubFetch(() => success({}));
    const { container } = renderCard({ kind: "unavailable", reason: "flag_off" });

    expect(container).toBeEmptyDOMElement();
    expect(calls).toHaveLength(0);
  });

  it("sin método: título, explicación, los dos métodos, el texto elegido y «Continuar» desactivado sin la casilla", () => {
    stubFetch(() => success({}));
    renderCard(noneState());

    expect(screen.getByRole("heading", { name: "Pago automático" })).toBeInTheDocument();
    expect(screen.getByText(INTRO)).toBeInTheDocument();
    const card = screen.getByRole("radio", { name: "Tarjeta" });
    const sepa = screen.getByRole("radio", { name: "Domiciliación bancaria" });
    expect(card).toBeChecked();
    expect(sepa).not.toBeChecked();
    expect(screen.getByText(CARD_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(SEPA_TEXT)).toBeNull();

    const accept = screen.getByRole("checkbox", { name: "Acepto" });
    const next = screen.getByRole("button", { name: "Continuar" });
    expect(accept).not.toBeChecked();
    expect(next).toBeDisabled();

    fireEvent.click(accept);
    expect(next).toBeEnabled();

    // Otro método, otro texto: hay que aceptarlo de nuevo.
    fireEvent.click(sepa);
    expect(screen.getByText(SEPA_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(CARD_TEXT)).toBeNull();
    expect(screen.getByRole("checkbox", { name: "Acepto" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(calls).toHaveLength(0);
  });

  it("solo ofrece la domiciliación si la academia la tiene", () => {
    stubFetch(() => success({}));
    renderCard(noneState(["card"]));

    expect(screen.getByRole("radio", { name: "Tarjeta" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Domiciliación bancaria" })).toBeNull();
  });

  it("sin clave publicable: dice que no está disponible y no ofrece el formulario", () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
    stubFetch(() => success({}));
    renderCard(noneState());

    expect(screen.getByRole("heading", { name: "Pago automático" })).toBeInTheDocument();
    expect(screen.getByText("El pago automático no está disponible ahora mismo.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("guarda la tarjeta: prepara con la versión y la aceptación, confirma sin redirigir y comprueba", async () => {
    stubFetch((body) => {
      if (body.action === "setup") {
        return success({ clientSecret: CLIENT_SECRET, connectedAccount: "acct_sintetico1" });
      }
      return success({ outcome: "active", method: "card" });
    });
    stripeMock.confirmSetup.mockResolvedValue({ setupIntent: { id: "seti_1Sintetico", status: "succeeded" } });
    renderCard(noneState());

    fireEvent.click(screen.getByRole("checkbox", { name: "Acepto" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByTestId("payment-element")).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ENDPOINT);
    expect(calls[0].body).toEqual({
      action: "setup",
      organizationId: ORGANIZATION_ID,
      familyId: FAMILY_ID,
      kind: "card",
      consentVersion: VERSION,
      consentAccepted: true,
    });
    expect(stripeMock.loadStripe).toHaveBeenCalledWith(PUBLISHABLE_KEY, { stripeAccount: "acct_sintetico1" });
    expect(stripeMock.elementsOptions[stripeMock.elementsOptions.length - 1]).toEqual({ clientSecret: CLIENT_SECRET, locale: "es" });
    expect(document.body.innerHTML).not.toContain(CLIENT_SECRET);

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Tarjeta guardada")).toBeInTheDocument();
    expect(stripeMock.confirmSetup).toHaveBeenCalledTimes(1);
    const returnUrl = `${window.location.origin}/familia/cuotas?pago=vuelta&organizationId=${ORGANIZATION_ID}&familyId=${FAMILY_ID}`;
    expect(stripeMock.confirmSetup).toHaveBeenCalledWith({
      elements: stripeMock.elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });
    expect(actions()).toEqual(["setup", "complete"]);
    expect(calls[1].body).toEqual({
      action: "complete",
      organizationId: ORGANIZATION_ID,
      familyId: FAMILY_ID,
      setupIntentId: "seti_1Sintetico",
    });
    expect(screen.getByText(/^Pagas automáticamente con tarjeta desde el /)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dejar de pagar automáticamente" })).toBeEnabled();
    expect(screen.queryByTestId("payment-element")).toBeNull();
    expect(document.body.innerHTML).not.toContain(CLIENT_SECRET);
  });

  it("la domiciliación pendiente del banco lo dice en lenguaje sencillo", async () => {
    stubFetch((body) =>
      body.action === "setup"
        ? success({ clientSecret: CLIENT_SECRET, connectedAccount: "acct_sintetico2" })
        : success({ outcome: "pending" })
    );
    stripeMock.confirmSetup.mockResolvedValue({ setupIntent: { id: "seti_2Sintetico", status: "processing" } });
    renderCard(noneState());

    fireEvent.click(screen.getByRole("radio", { name: "Domiciliación bancaria" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Acepto" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(calls[0]?.body.kind).toBe("sepa_debit"));

    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));

    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    expect(actions()).toEqual(["setup", "complete"]);
  });

  it("si el banco rechaza, explica sin códigos de Stripe y no comprueba", async () => {
    stubFetch(() => success({ clientSecret: CLIENT_SECRET, connectedAccount: "acct_sintetico3" }));
    stripeMock.confirmSetup.mockResolvedValue({
      error: {
        type: "card_error",
        code: "card_declined",
        decline_code: "generic_decline",
        message: "Your card was declined.",
      },
    });
    renderCard(noneState());

    fireEvent.click(screen.getByRole("checkbox", { name: "Acepto" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Guardar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu banco no ha aceptado este método de pago. Prueba con otro o habla con tu banco."
    );
    expect(actions()).toEqual(["setup"]);
    const html = document.body.innerHTML;
    for (const leaked of ["card_declined", "generic_decline", "Your card was declined", CLIENT_SECRET]) {
      expect(html).not.toContain(leaked);
    }
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("si la academia ya no acepta el método, lo dice sin enseñar el código", async () => {
    stubFetch(() => failure(409, "FAMILY_PAYMENT_METHOD_NOT_OFFERED"));
    renderCard(noneState());

    fireEvent.click(screen.getByRole("checkbox", { name: "Acepto" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu academia no acepta ahora mismo este método de pago."
    );
    expect(document.body.innerHTML).not.toContain("FAMILY_PAYMENT_METHOD_NOT_OFFERED");
    expect(document.body.innerHTML).not.toContain("Mensaje del servidor");
    expect(screen.queryByTestId("payment-element")).toBeNull();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
  });

  it("con método: lo enseña con la fecha y deja cambiarlo o volver atrás", () => {
    stubFetch(() => success({}));
    renderCard(activeState("sepa_debit"));

    // Domiciliación sin activar (por defecto): guardada, sin prometer que se cobra sola.
    expect(
      screen.getByText("Tienes la domiciliación bancaria guardada desde el 10 de noviembre de 2026.")
    ).toBeInTheDocument();
    expect(screen.getByText(SEPA_MANUAL)).toBeInTheDocument();
    expect(screen.queryByText(/^Pagas automáticamente con domiciliación/)).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cambiar método" }));
    expect(screen.getByRole("radio", { name: "Tarjeta" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Domiciliación bancaria" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByRole("button", { name: "Dejar de pagar automáticamente" })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("dejar de pagar automáticamente pide confirmación en la propia tarjeta", async () => {
    stubFetch(() => success({ outcome: "revoked" }));
    renderCard(activeState("card"));

    expect(
      screen.getByText("Pagas automáticamente con tarjeta desde el 10 de noviembre de 2026.")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dejar de pagar automáticamente" }));
    expect(screen.getByText(/Las cuotas dejarán de cobrarse solas/)).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "No, seguir igual" }));
    expect(screen.queryByText(/Las cuotas dejarán de cobrarse solas/)).toBeNull();
    expect(calls).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Dejar de pagar automáticamente" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, dejar de pagar automáticamente" }));

    expect(await screen.findByText("Ya no pagas automáticamente.")).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({ action: "revoke", organizationId: ORGANIZATION_ID, familyId: FAMILY_ID });
    expect(screen.queryByText(/Pagas automáticamente con tarjeta/)).toBeNull();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("si no se puede dejar de pagar automáticamente, lo dice y mantiene el método", async () => {
    stubFetch(() => failure(503, "FAMILY_PAYMENT_REVOKE_FAILED"));
    renderCard(activeState("card"));

    fireEvent.click(screen.getByRole("button", { name: "Dejar de pagar automáticamente" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, dejar de pagar automáticamente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo dejar de pagar automáticamente. Vuelve a intentarlo en un momento."
    );
    expect(document.body.innerHTML).not.toContain("FAMILY_PAYMENT_REVOKE_FAILED");
    expect(screen.getByText(/^Pagas automáticamente con tarjeta/)).toBeInTheDocument();
  });

  it("si la función no está disponible al revocar, manda a hablar con la academia", async () => {
    stubFetch(() => failure(503, "FEATURE_NOT_AVAILABLE"));
    renderCard(activeState("card"));

    fireEvent.click(screen.getByRole("button", { name: "Dejar de pagar automáticamente" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, dejar de pagar automáticamente" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ahora mismo no se puede dejar de pagar automáticamente desde aquí. Habla con tu academia."
    );
    expect(document.body.innerHTML).not.toContain("FEATURE_NOT_AVAILABLE");
    expect(screen.getByText(/^Pagas automáticamente con tarjeta/)).toBeInTheDocument();
  });

  it("con la función cerrada (sin métodos que ofrecer) solo deja revocar, no cambiar", async () => {
    stubFetch(() => success({ outcome: "revoked" }));
    renderCard({ ...activeState("card"), kinds: [], consentTexts: {} } as FamilyPaymentMethodState);

    expect(screen.getByText("Pagas automáticamente con tarjeta desde el 10 de noviembre de 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cambiar método" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Dejar de pagar automáticamente" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, dejar de pagar automáticamente" }));

    expect(await screen.findByText("Ya no pagas automáticamente.")).toBeInTheDocument();
    expect(calls.map((call) => call.body)).toEqual([
      { action: "revoke", organizationId: ORGANIZATION_ID, familyId: FAMILY_ID },
    ]);
    // Sin métodos que ofrecer, después no aparece el formulario para guardar otro.
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
  });

  it("a la vuelta del banco comprueba una sola vez y limpia la dirección", async () => {
    window.history.replaceState(
      {},
      "",
      `/familia/cuotas?pago=vuelta&organizationId=${ORGANIZATION_ID}&familyId=${FAMILY_ID}` +
        `&setup_intent=seti_3Vuelta&setup_intent_client_secret=${syntheticSecret("seti_3Vuelta")}&redirect_status=succeeded`
    );
    stubFetch(() => success({ outcome: "pending" }));
    render(
      <StrictMode>
        <FamilyAutomaticPaymentCard
          organizationId={ORGANIZATION_ID}
          familyId={FAMILY_ID}
          timezone="Europe/Madrid"
          state={noneState()}
        />
      </StrictMode>
    );

    expect(await screen.findByText(PENDING)).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({
      action: "complete",
      organizationId: ORGANIZATION_ID,
      familyId: FAMILY_ID,
      setupIntentId: "seti_3Vuelta",
    });
    expect(window.location.pathname).toBe("/familia/cuotas");
    expect(window.location.search).toBe("");
    expect(document.body.innerHTML).not.toContain(syntheticSecret("seti_3Vuelta"));
  });

  it("a la vuelta del banco con la confirmación rechazada lo dice y no comprueba", async () => {
    window.history.replaceState(
      {},
      "",
      `/familia/cuotas?pago=vuelta&organizationId=${ORGANIZATION_ID}&familyId=${FAMILY_ID}` +
        `&setup_intent=seti_5Rechazo&setup_intent_client_secret=${syntheticSecret("seti_5Rechazo")}&redirect_status=failed`
    );
    stubFetch(() => success({ outcome: "pending" }));
    render(
      <StrictMode>
        <FamilyAutomaticPaymentCard
          organizationId={ORGANIZATION_ID}
          familyId={FAMILY_ID}
          timezone="Europe/Madrid"
          state={noneState()}
        />
      </StrictMode>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tu banco no ha aceptado este método de pago. Prueba con otro o habla con tu banco."
    );
    expect(screen.queryByText(PENDING)).toBeNull();
    expect(calls).toHaveLength(0);
    expect(window.location.search).toBe("");
    expect(document.body.innerHTML).not.toContain("seti_5Rechazo");
    // Puede volver a intentarlo desde la propia tarjeta.
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });

  it("si Stripe.js no carga, lo dice y no deja el formulario a medias", async () => {
    stripeMock.loadStripe.mockImplementation(() => Promise.resolve(null));
    stubFetch(() => success({ clientSecret: CLIENT_SECRET, connectedAccount: "acct_sinStripeJs" }));
    renderCard(noneState());

    fireEvent.click(screen.getByRole("checkbox", { name: "Acepto" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El pago automático no está disponible ahora mismo.");
    expect(screen.queryByTestId("payment-element")).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
    expect(document.body.innerHTML).not.toContain(CLIENT_SECRET);

    // El siguiente intento vuelve a probar a cargar Stripe.js.
    stripeMock.loadStripe.mockImplementation(() => Promise.resolve({}));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByTestId("payment-element")).toBeInTheDocument();
    expect(stripeMock.loadStripe).toHaveBeenCalledTimes(2);
  });

  it("la vuelta de otra familia no la toca", async () => {
    const search =
      `?pago=vuelta&organizationId=${ORGANIZATION_ID}&familyId=${OTHER_FAMILY_ID}` +
      "&setup_intent=seti_4Otra&redirect_status=succeeded";
    window.history.replaceState({}, "", `/familia/cuotas${search}`);
    stubFetch(() => success({ outcome: "active", method: "card" }));
    renderCard(noneState());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toHaveLength(0);
    expect(window.location.search).toBe(search);
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  });
});

describe("FamilyFeesView con pago automático", () => {
  const academy: FamilyAcademyFees = {
    organizationId: ORGANIZATION_ID,
    organizationName: "Club Sintético",
    timezone: "Europe/Madrid",
    fees: [],
  };

  it("sin tarjetas (la demo): aviso de solo consulta y ningún pago automático", () => {
    render(<FamilyFeesView academies={[academy]} />);

    expect(screen.getByRole("note")).toHaveTextContent(
      "El pago se gestiona directamente con tu academia. Desde aquí solo puedes consultar tus cuotas."
    );
    expect(screen.queryByRole("heading", { name: "Pago automático" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("con tarjeta: la enseña dentro de su academia y el aviso no la contradice", () => {
    stubFetch(() => success({}));
    render(
      <FamilyFeesView
        academies={[academy]}
        automaticPayments={{ [ORGANIZATION_ID]: [{ familyId: FAMILY_ID, state: noneState(["card"]) }] }}
      />
    );

    const section = screen.getByRole("region", { name: "Club Sintético" });
    expect(section).toContainElement(screen.getByRole("heading", { name: "Pago automático" }));
    expect(screen.getByRole("note")).toHaveTextContent(
      "Desde aquí puedes consultar tus cuotas y, si quieres, activar el pago automático."
    );
    expect(screen.getByRole("note")).not.toHaveTextContent("solo puedes consultar");
  });
});

describe("FamilyAutomaticPaymentCard: domiciliación sin activar (D2, «Primero solo tarjeta»)", () => {
  function renderWith(state: FamilyPaymentMethodState, sepaCollectsAutomatically?: boolean) {
    return render(
      <FamilyAutomaticPaymentCard
        organizationId={ORGANIZATION_ID}
        familyId={FAMILY_ID}
        timezone="Europe/Madrid"
        state={state}
        {...(sepaCollectsAutomatically === undefined ? {} : { sepaCollectsAutomatically })}
      />
    );
  }

  it("apagada: la familia puede elegir la domiciliación, que dice que por ahora no se cobra sola", () => {
    stubFetch(() => success({}));
    renderWith(noneState(), false);

    // Con la tarjeta elegida no sale el aviso.
    expect(screen.queryByText(SEPA_MANUAL)).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Domiciliación bancaria" }));
    expect(screen.getByText(SEPA_MANUAL)).toBeInTheDocument();
    expect(screen.getByText(SEPA_TEXT)).toBeInTheDocument();
    // Puede seguir guardándola (Fase 2 sin cambios).
    fireEvent.click(screen.getByRole("checkbox", { name: "Acepto" }));
    expect(screen.getByRole("button", { name: "Continuar" })).toBeEnabled();
    expect(calls).toHaveLength(0);
  });

  it("apagada: con la tarjeta activa no cambia nada", () => {
    stubFetch(() => success({}));
    renderWith(activeState("card"), false);

    expect(screen.getByText("Pagas automáticamente con tarjeta desde el 10 de noviembre de 2026.")).toBeInTheDocument();
    expect(screen.queryByText(SEPA_MANUAL)).toBeNull();
  });

  it("encendida: la domiciliación activa se enseña como hoy, sin el aviso", () => {
    stubFetch(() => success({}));
    renderWith(activeState("sepa_debit"), true);

    expect(
      screen.getByText("Pagas automáticamente con domiciliación bancaria desde el 10 de noviembre de 2026.")
    ).toBeInTheDocument();
    expect(screen.queryByText(SEPA_MANUAL)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cambiar método" }));
    fireEvent.click(screen.getByRole("radio", { name: "Domiciliación bancaria" }));
    expect(screen.queryByText(SEPA_MANUAL)).toBeNull();
  });

  it("la vista de cuotas pasa la bandera a cada tarjeta (sin indicar, apagada)", () => {
    stubFetch(() => success({}));
    const academy: FamilyAcademyFees = {
      organizationId: ORGANIZATION_ID,
      organizationName: "Club Sintético",
      timezone: "Europe/Madrid",
      fees: [],
    };
    const cards = { [ORGANIZATION_ID]: [{ familyId: FAMILY_ID, state: activeState("sepa_debit") }] };

    const { unmount } = render(<FamilyFeesView academies={[academy]} automaticPayments={cards} />);
    expect(screen.getByText(SEPA_MANUAL)).toBeInTheDocument();
    unmount();

    render(<FamilyFeesView academies={[academy]} automaticPayments={cards} sepaCollectsAutomatically />);
    expect(screen.queryByText(SEPA_MANUAL)).toBeNull();
    expect(
      screen.getByText("Pagas automáticamente con domiciliación bancaria desde el 10 de noviembre de 2026.")
    ).toBeInTheDocument();
  });
});
