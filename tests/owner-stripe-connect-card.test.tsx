// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerStripeConnectCard } from "@/components/owner-dashboard/OwnerStripeConnectCard";
import type { ConnectScreenState } from "@/modules/payments-connect/application/connect-onboarding-service";

const ORGANIZATION_ID = "82000000-0000-4000-8000-000000000001";
const STRIPE_URL = "https://connect.stripe.com/setup/s/sintetico";
const ENDPOINT = "/api/v1/owner/payments/connect";

type Call = { url: string; init?: RequestInit };

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function problem(status: number, type: string, errors?: unknown) {
  return reply(status, {
    type: `https://zaltyko.com/problems/${type}`,
    title: "Problema",
    status,
    detail: "Detalle",
    ...(errors ? { errors } : {}),
  });
}

function account(
  kind: "needs_details" | "in_review" | "ready" | "problem",
  overrides: Partial<{ card: string; sepa: string; disabled: boolean }> = {}
): ConnectScreenState {
  return { kind, card: "inactive", sepa: "inactive", disabled: false, ...overrides };
}

let calls: Call[];

function stubFetch(
  state: ConnectScreenState,
  onPost: (call: Call) => Response | Promise<Response> = () => reply(200, { url: STRIPE_URL })
) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: String(input), init };
      calls.push(call);
      if (init?.method === "POST") return onPost(call);
      return reply(200, state);
    })
  );
}

const gets = () => calls.filter((call) => (call.init?.method ?? "GET") === "GET");
const posts = () => calls.filter((call) => call.init?.method === "POST");

let originalUrl: string;

beforeEach(() => {
  originalUrl = window.location.href;
  window.history.replaceState({}, "", `/owner/settings?organizationId=${ORGANIZATION_ID}`);
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", originalUrl);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OwnerStripeConnectCard", () => {
  it("sin cuenta: invita a conectar Stripe con su nota", async () => {
    stubFetch({ kind: "not_connected" });
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={vi.fn()} />);

    expect(
      await screen.findByText(
        "Conecta tu cuenta de Stripe para que las cuotas se cobren solas. El dinero llega directo a tu cuenta."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cobro automático de cuotas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conectar Stripe" })).toBeEnabled();
    expect(
      screen.getByText(
        "Stripe te pedirá los datos de tu academia y tu cuenta bancaria. Zaltyko no se queda ninguna comisión."
      )
    ).toBeInTheDocument();
    expect(document.getElementById("cobro-automatico")).not.toBeNull();
    expect(gets()).toHaveLength(1);
    expect(gets()[0].url).toBe(`${ENDPOINT}?organizationId=${ORGANIZATION_ID}`);
  });

  it("faltan datos: pide seguir en Stripe", async () => {
    stubFetch(account("needs_details"));
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={vi.fn()} />);

    expect(await screen.findByText("Stripe necesita más datos de tu academia.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seguir en Stripe" })).toBeEnabled();
  });

  it("en revisión: solo informa, sin botón", async () => {
    stubFetch(account("in_review"));
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={vi.fn()} />);

    expect(
      await screen.findByText("Stripe está revisando tus datos. Te avisaremos aquí cuando esté lista.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lista: enseña tarjeta y domiciliación, el panel de Stripe y la nota de la próxima actualización", async () => {
    stubFetch(account("ready", { card: "active", sepa: "pending" }));
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={vi.fn()} />);

    expect(await screen.findByText("Lista para cobrar.")).toBeInTheDocument();
    expect(screen.getByText("Tarjeta: activa · Domiciliación: pendiente")).toBeInTheDocument();
    const dashboardLink = screen.getByRole("link", { name: "Abrir mi panel de Stripe (se abre en otra pestaña)" });
    expect(dashboardLink).toHaveAttribute("href", "https://dashboard.stripe.com/");
    expect(dashboardLink).toHaveAttribute("target", "_blank");
    expect(
      screen.getByText("El cobro automático de cuotas a las familias llegará en una próxima actualización.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lista con las dos formas activas", async () => {
    stubFetch(account("ready", { card: "active", sepa: "active" }));
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={vi.fn()} />);

    expect(await screen.findByText("Tarjeta: activa · Domiciliación: activa")).toBeInTheDocument();
  });

  it("problema: ofrece resolverlo en Stripe", async () => {
    stubFetch(account("problem"));
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={vi.fn()} />);

    expect(await screen.findByText("Stripe ha encontrado un problema con tu cuenta.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolverlo en Stripe" })).toBeEnabled();
  });

  it("cuenta cerrada: pide escribir a Zaltyko, sin botón", async () => {
    stubFetch(account("problem", { disabled: true }));
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={vi.fn()} />);

    const contact = await screen.findByRole("link", { name: "hola@zaltyko.com" });
    expect(contact).toHaveAttribute("href", "mailto:hola@zaltyko.com");
    expect(screen.getByRole("alert")).toHaveTextContent("Esta cuenta está cerrada. Escríbenos a hola@zaltyko.com.");
    expect(screen.queryByText("Stripe ha encontrado un problema con tu cuenta.")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sin plan de pago: enseña los planes", async () => {
    stubFetch({ kind: "unavailable", reason: "paid_plan_required" });
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={vi.fn()} />);

    expect(await screen.findByText("El cobro automático está incluido en Starter y Growth.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver planes" }).getAttribute("href")).toMatch(/^\/owner\/subscription/);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("país sin cobro automático: pide registrar los pagos a mano", async () => {
    stubFetch({ kind: "unavailable", reason: "country_not_supported" });
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={vi.fn()} />);

    expect(
      await screen.findByText(
        "El cobro automático llegará más adelante a tu país. Mientras tanto, registra los pagos a mano."
      )
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("cualquier otro motivo: la tarjeta no se muestra", async () => {
    stubFetch({ kind: "unavailable", reason: "role_not_allowed" });
    const { container } = render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={vi.fn()} />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(screen.queryByText("Cobro automático de cuotas")).toBeNull();
  });

  it("«Conectar Stripe» hace POST y redirige a la dirección devuelta", async () => {
    stubFetch({ kind: "not_connected" });
    const navigate = vi.fn();
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={navigate} />);

    fireEvent.click(await screen.findByRole("button", { name: "Conectar Stripe" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(STRIPE_URL));
    expect(posts()).toHaveLength(1);
    expect(posts()[0].url).toBe(ENDPOINT);
    expect(JSON.parse(String(posts()[0].init?.body))).toEqual({ organizationId: ORGANIZATION_ID });
    expect(screen.getByRole("button", { name: "Conectar Stripe" })).toBeDisabled();
  });

  it("un doble clic hace un solo POST y el botón espera desactivado", async () => {
    let release: (response: Response) => void = () => undefined;
    stubFetch(
      { kind: "not_connected" },
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        })
    );
    const navigate = vi.fn();
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={navigate} />);

    const button = await screen.findByRole("button", { name: "Conectar Stripe" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.doubleClick(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(posts()).toHaveLength(1);

    release(reply(200, { url: STRIPE_URL }));
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
    expect(posts()).toHaveLength(1);
  });

  it("al volver de Stripe (?stripe=vuelta) pide el estado con refresh=1", async () => {
    window.history.replaceState(
      {},
      "",
      `/owner/settings?organizationId=${ORGANIZATION_ID}&stripe=vuelta#cobro-automatico`
    );
    stubFetch(account("in_review"));
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={vi.fn()} />);

    await screen.findByText("Stripe está revisando tus datos. Te avisaremos aquí cuando esté lista.");
    expect(gets()[0].url).toBe(`${ENDPOINT}?organizationId=${ORGANIZATION_ID}&refresh=1`);
    expect(window.location.search).toBe(`?organizationId=${ORGANIZATION_ID}`);
    expect(window.location.hash).toBe("#cobro-automatico");
  });

  it("?stripe=error avisa de que no se pudo abrir Stripe", async () => {
    window.history.replaceState({}, "", `/owner/settings?organizationId=${ORGANIZATION_ID}&stripe=error`);
    stubFetch({ kind: "not_connected" });
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={vi.fn()} />);

    expect(await screen.findByText("No hemos podido abrir Stripe. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(gets()[0].url).toBe(`${ENDPOINT}?organizationId=${ORGANIZATION_ID}`);
  });

  it("un 409 paid_plan_required al conectar enseña el texto de planes", async () => {
    stubFetch({ kind: "not_connected" }, () =>
      problem(409, "connect-unavailable", { reason: "paid_plan_required" })
    );
    const navigate = vi.fn();
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={navigate} />);

    fireEvent.click(await screen.findByRole("button", { name: "Conectar Stripe" }));

    expect(await screen.findByText("El cobro automático está incluido en Starter y Growth.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver planes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Conectar Stripe" })).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("si Stripe no responde al conectar, avisa y deja reintentar", async () => {
    stubFetch({ kind: "not_connected" }, () => problem(502, "connect-provider-unavailable"));
    const navigate = vi.fn();
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={navigate} />);

    fireEvent.click(await screen.findByRole("button", { name: "Conectar Stripe" }));

    expect(await screen.findByText("No hemos podido abrir Stripe. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conectar Stripe" })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("un 409 CONCURRENCY_RETRY (Stripe aún prepara la cuenta) enseña el aviso de reintento", async () => {
    stubFetch({ kind: "not_connected" }, () => problem(409, "concurrency-retry"));
    const navigate = vi.fn();
    render(<OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={navigate} />);

    fireEvent.click(await screen.findByRole("button", { name: "Conectar Stripe" }));

    expect(await screen.findByText("No hemos podido abrir Stripe. Inténtalo de nuevo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Conectar Stripe" })).toBeEnabled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("el texto de la tarjeta no usa jerga técnica", async () => {
    for (const state of [
      { kind: "not_connected" } as ConnectScreenState,
      account("needs_details"),
      account("in_review"),
      account("ready", { card: "active", sepa: "active" }),
      account("problem"),
      account("problem", { disabled: true }),
      { kind: "unavailable", reason: "paid_plan_required" } as ConnectScreenState,
    ]) {
      stubFetch(state);
      const { container, unmount } = render(
        <OwnerStripeConnectCard organizationId={ORGANIZATION_ID} navigate={vi.fn()} />
      );
      await waitFor(() => expect(container.textContent).not.toContain("Cargando"));
      expect(container.textContent ?? "").not.toMatch(/onboarding|capabilit|connect|webhook/i);
      unmount();
    }
  });
});
