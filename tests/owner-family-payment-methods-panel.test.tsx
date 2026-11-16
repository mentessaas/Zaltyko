// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

    expect(screen.getAllByRole("button", { name: /^Dejar de cobrar automáticamente a / })).toHaveLength(2);
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
    renderPanel([SEPA]);

    fireEvent.click(screen.getByRole("button", { name: "Dejar de cobrar automáticamente a Pablo Ruiz" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, dejar de cobrar" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Pablo Ruiz ya no tenía el pago automático activo.");
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
