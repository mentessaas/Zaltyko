// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// El panel relee la página (router.refresh) tras un conflicto de versión.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

import {
  OwnerFamilyPaymentMethodsPanel,
  type OwnerFamilyPaymentMethod,
} from "@/components/owner-dashboard/OwnerFamilyPaymentMethodsPanel";

const ORGANIZATION_ID = "82000000-0000-4000-8000-000000000001";
const ENDPOINT = "/api/v1/owner/payments/family-methods";
const CARD_SINCE = "2026-11-10T10:00:00.000Z";

const CARD: OwnerFamilyPaymentMethod = {
  authorizationId: "83000000-0000-4000-8000-000000000001",
  familyId: "84000000-0000-4000-8000-000000000001",
  payerName: "Lucía Martín",
  method: "card",
  since: CARD_SINCE,
};

const SEPA: OwnerFamilyPaymentMethod = {
  authorizationId: "83000000-0000-4000-8000-000000000002",
  familyId: "84000000-0000-4000-8000-000000000002",
  payerName: "Pablo Ruiz",
  method: "sepa_debit",
  since: "2026-11-12T08:30:00.000Z",
};

const madridDate = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Madrid" }).format(
    new Date(iso)
  );

type Call = { url: string; init?: RequestInit };
let calls: Call[];

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function problem(status: number, type: string, detail: string) {
  return reply(status, { type: `https://zaltyko.com/problems/${type}`, title: "Problema", status, detail });
}

function stubFetch(onPost: (call: Call) => Response | Promise<Response>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: String(input), init };
      calls.push(call);
      return onPost(call);
    })
  );
}

function renderPanel(methods: OwnerFamilyPaymentMethod[] = [CARD, SEPA]) {
  return render(<OwnerFamilyPaymentMethodsPanel organizationId={ORGANIZATION_ID} methods={methods} />);
}

function rowOf(name: string) {
  const row = screen.getByText(name).closest("li");
  if (!row) throw new Error(`Sin fila para ${name}`);
  return row;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OwnerFamilyPaymentMethodsPanel", () => {
  it("lista a cada tutor pagador con su método, la fecha y el botón para dejar de cobrar", () => {
    stubFetch(() => reply(200, { outcome: "revoked" }));
    renderPanel();

    expect(screen.getByRole("heading", { name: "Pago automático de las familias" })).toBeInTheDocument();
    expect(screen.getByText("Revocar no anula los cobros ya enviados.")).toBeInTheDocument();

    const card = rowOf("Lucía Martín");
    expect(within(card).getByText("Tarjeta")).toBeInTheDocument();
    expect(within(card).getByText(`desde el ${madridDate(CARD_SINCE)}`)).toBeInTheDocument();
    expect(within(card).getByText("Dejar de cobrar automáticamente")).toBeInTheDocument();

    const sepa = rowOf("Pablo Ruiz");
    expect(within(sepa).getByText("Domiciliación bancaria")).toBeInTheDocument();
    expect(within(sepa).getByText(`desde el ${madridDate(SEPA.since)}`)).toBeInTheDocument();
    // La domiciliación todavía no se cobra sola (por defecto): se «quita», no se «deja de cobrar».
    expect(within(sepa).getByText("Quitar la domiciliación guardada")).toBeInTheDocument();

    expect(screen.getAllByRole("button", { name: /^Dejar de cobrar automáticamente a / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Quitar la domiciliación guardada de Pablo Ruiz" })).toBeInTheDocument();
    expect(screen.queryByText("Ninguna familia ha guardado todavía un método de pago.")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("vacío: dice que ninguna familia ha guardado un método", () => {
    stubFetch(() => reply(200, { outcome: "revoked" }));
    renderPanel([]);

    expect(screen.getByText("Ninguna familia ha guardado todavía un método de pago.")).toBeInTheDocument();
    expect(screen.getByText("Revocar no anula los cobros ya enviados.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("pide confirmación antes de enviar y «Cancelar» no envía nada", () => {
    stubFetch(() => reply(200, { outcome: "revoked" }));
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Dejar de cobrar automáticamente a Lucía Martín" }));

    const confirm = screen.getByRole("group", { name: "Confirmar que dejas de cobrar automáticamente a Lucía Martín" });
    expect(confirm).toHaveTextContent("Revocar no anula los cobros ya enviados.");
    expect(calls).toHaveLength(0);

    fireEvent.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("group")).toBeNull();
    expect(screen.getByText("Lucía Martín")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("al confirmar hace un solo POST con la academia y la autorización y quita la fila", async () => {
    let release: (response: Response) => void = () => undefined;
    stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        })
    );
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Dejar de cobrar automáticamente a Lucía Martín" }));
    const yes = screen.getByRole("button", { name: "Sí, dejar de cobrar" });
    fireEvent.click(yes);
    fireEvent.click(yes);

    await waitFor(() => expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled());
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(ENDPOINT);
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      organizationId: ORGANIZATION_ID,
      authorizationId: CARD.authorizationId,
    });

    release(reply(200, { outcome: "revoked" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ya no se cobrará automáticamente a Lucía Martín.");
    expect(screen.queryByText("Lucía Martín")).toBeNull();
    expect(screen.getByText("Pablo Ruiz")).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });

  it("si ya no estaba activo («none») también quita la fila; con la última, queda el vacío", async () => {
    stubFetch(() => reply(200, { outcome: "none" }));
    renderPanel([CARD]);

    fireEvent.click(screen.getByRole("button", { name: "Dejar de cobrar automáticamente a Lucía Martín" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, dejar de cobrar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Lucía Martín ya no tenía el pago automático activo.");
    expect(screen.getByText("Ninguna familia ha guardado todavía un método de pago.")).toBeInTheDocument();
  });

  it("error de la API: enseña su detalle, deja la fila y permite reintentar", async () => {
    stubFetch(() => problem(503, "feature-not-available", "El pago automático no está disponible ahora mismo."));
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Dejar de cobrar automáticamente a Lucía Martín" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, dejar de cobrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El pago automático no está disponible ahora mismo.");
    expect(screen.getByText("Lucía Martín")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sí, dejar de cobrar" })).toBeEnabled();
  });

  it("sin respuesta o con una respuesta inesperada: aviso genérico y la fila sigue", async () => {
    stubFetch(() => {
      throw new TypeError("network");
    });
    const { unmount } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Dejar de cobrar automáticamente a Lucía Martín" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, dejar de cobrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No hemos podido dejar de cobrar automáticamente a esta familia. Inténtalo de nuevo."
    );
    expect(screen.getByText("Lucía Martín")).toBeInTheDocument();
    unmount();

    stubFetch(() => reply(200, { outcome: "otra-cosa" }));
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Dejar de cobrar automáticamente a Lucía Martín" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, dejar de cobrar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No hemos podido dejar de cobrar automáticamente a esta familia. Inténtalo de nuevo."
    );
    expect(screen.getByText("Lucía Martín")).toBeInTheDocument();
  });

  it("el texto del panel no usa jerga técnica", () => {
    stubFetch(() => reply(200, { outcome: "revoked" }));
    const { container } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Dejar de cobrar automáticamente a Lucía Martín" }));

    expect(container.textContent ?? "").not.toMatch(/setupintent|mandat|connect|webhook|sepa|stripe/i);
  });
});

describe("OwnerFamilyPaymentMethodsPanel: domiciliación sin activar (D2, «Primero solo tarjeta»)", () => {
  const SEPA_MANUAL = "Por ahora la domiciliación no se cobra sola: esta familia paga como siempre.";
  // Lucía tiene tarjeta; Pablo solo domiciliación.
  const collection = {
    available: true,
    families: {
      [CARD.familyId]: { automatic: false, version: 1, requiresConfirmation: false },
      [SEPA.familyId]: { automatic: false, version: 1, requiresConfirmation: false },
    },
  };

  it("apagada (por defecto): la domiciliación lo dice y su familia no puede pasar a cobro automático", () => {
    stubFetch(() => reply(200, {}));
    render(<OwnerFamilyPaymentMethodsPanel organizationId={ORGANIZATION_ID} methods={[CARD, SEPA]} collection={collection} />);

    expect(within(rowOf("Pablo Ruiz")).getByText(SEPA_MANUAL)).toBeInTheDocument();
    expect(within(rowOf("Lucía Martín")).queryByText(SEPA_MANUAL)).toBeNull();
    expect(screen.getByRole("switch", { name: "Cobrar automáticamente a Pablo Ruiz" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Cobrar automáticamente a Lucía Martín" })).toBeEnabled();
    // Sigue pudiendo quitar la domiciliación guardada.
    expect(screen.getByRole("button", { name: "Quitar la domiciliación guardada de Pablo Ruiz" })).toBeEnabled();
    expect(calls).toHaveLength(0);
  });

  it("apagada: quitar la domiciliación no dice que hoy se cobre sola", async () => {
    stubFetch(() => reply(200, { outcome: "revoked" }));
    renderPanel([CARD, SEPA]);

    expect(screen.queryByRole("button", { name: "Dejar de cobrar automáticamente a Pablo Ruiz" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Quitar la domiciliación guardada de Pablo Ruiz" }));

    const confirm = screen.getByRole("group", { name: "Confirmar que quitas la domiciliación guardada de Pablo Ruiz" });
    expect(confirm).toHaveTextContent(
      "¿Quitar la domiciliación guardada de Pablo Ruiz? Tendrá que volver a guardarla si quiere usarla más adelante. Sus cuotas se siguen pagando como siempre."
    );
    expect(confirm.textContent ?? "").not.toMatch(/automáticamente|dejar de cobrar/i);
    expect(calls).toHaveLength(0);

    fireEvent.click(within(confirm).getByRole("button", { name: "Sí, quitar la domiciliación" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Has quitado la domiciliación guardada de Pablo Ruiz.");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      organizationId: ORGANIZATION_ID,
      authorizationId: SEPA.authorizationId,
    });
    expect(screen.queryByText("Pablo Ruiz")).toBeNull();
    expect(screen.getByText("Lucía Martín")).toBeInTheDocument();
  });

  it("apagada: sin domiciliación activa o con un fallo, lo dice con las mismas palabras", async () => {
    stubFetch(() => reply(200, { outcome: "none" }));
    const { unmount } = renderPanel([SEPA]);

    fireEvent.click(screen.getByRole("button", { name: "Quitar la domiciliación guardada de Pablo Ruiz" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, quitar la domiciliación" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Pablo Ruiz ya no tenía la domiciliación guardada.");
    expect(screen.getByText("Ninguna familia ha guardado todavía un método de pago.")).toBeInTheDocument();
    unmount();

    stubFetch(() => {
      throw new TypeError("network");
    });
    renderPanel([SEPA]);
    fireEvent.click(screen.getByRole("button", { name: "Quitar la domiciliación guardada de Pablo Ruiz" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, quitar la domiciliación" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No hemos podido quitar la domiciliación guardada. Inténtalo de nuevo."
    );
    expect(screen.getByText("Pablo Ruiz")).toBeInTheDocument();
  });

  it("encendida: la domiciliación se deja de cobrar como hoy", () => {
    stubFetch(() => reply(200, {}));
    render(
      <OwnerFamilyPaymentMethodsPanel organizationId={ORGANIZATION_ID} methods={[SEPA]} sepaCollectsAutomatically />
    );

    expect(screen.queryByRole("button", { name: "Quitar la domiciliación guardada de Pablo Ruiz" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dejar de cobrar automáticamente a Pablo Ruiz" }));
    expect(
      screen.getByRole("group", { name: "Confirmar que dejas de cobrar automáticamente a Pablo Ruiz" })
    ).toHaveTextContent("¿Dejar de cobrar automáticamente a Pablo Ruiz?");
    expect(screen.getByRole("button", { name: "Sí, dejar de cobrar" })).toBeEnabled();
  });

  it("apagada: si ya estaba encendido, se puede apagar", () => {
    stubFetch(() => reply(200, {}));
    render(
      <OwnerFamilyPaymentMethodsPanel
        organizationId={ORGANIZATION_ID}
        methods={[SEPA]}
        collection={{ available: true, families: { [SEPA.familyId]: { automatic: true, version: 2, requiresConfirmation: false } } }}
      />
    );

    const toggle = screen.getByRole("switch", { name: "Cobrar automáticamente a Pablo Ruiz" });
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
  });

  it("una familia con tarjeta y domiciliación puede pasar a cobro automático (con la tarjeta)", () => {
    stubFetch(() => reply(200, {}));
    const sepaOfLucia: OwnerFamilyPaymentMethod = {
      ...SEPA,
      authorizationId: "83000000-0000-4000-8000-000000000003",
      familyId: CARD.familyId,
      payerName: "Lucía Martín",
    };
    render(
      <OwnerFamilyPaymentMethodsPanel organizationId={ORGANIZATION_ID} methods={[sepaOfLucia, CARD]} collection={collection} />
    );

    expect(screen.getByRole("switch", { name: "Cobrar automáticamente a Lucía Martín" })).toBeEnabled();
  });

  it("encendida: sin aviso y el interruptor de la domiciliación funciona como hoy", () => {
    stubFetch(() => reply(200, {}));
    render(
      <OwnerFamilyPaymentMethodsPanel
        organizationId={ORGANIZATION_ID}
        methods={[CARD, SEPA]}
        collection={collection}
        sepaCollectsAutomatically
      />
    );

    expect(screen.queryByText(SEPA_MANUAL)).toBeNull();
    expect(screen.getByRole("switch", { name: "Cobrar automáticamente a Pablo Ruiz" })).toBeEnabled();
  });

  it("sin los interruptores del cobro automático, la domiciliación también lo dice", () => {
    stubFetch(() => reply(200, {}));
    const { container } = renderPanel([SEPA]);

    expect(screen.getByText(SEPA_MANUAL)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(container.textContent ?? "").not.toMatch(/setupintent|mandat|connect|webhook|sepa|stripe/i);
  });
});
