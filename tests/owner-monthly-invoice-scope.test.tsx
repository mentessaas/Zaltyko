// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerMonthlyInvoicesManager } from "@/components/owner-dashboard/OwnerMonthlyInvoicesManager";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

vi.mock("@/components/owner-dashboard/OwnerMonthlyInvoiceResolutionPanel", () => ({
  OwnerMonthlyInvoiceResolutionPanel: () => null,
}));
vi.mock("@/components/owner-dashboard/OwnerOperationalReadOnlyNotice", () => ({
  OwnerOperationalReadOnlyNotice: () => null,
}));

vi.mock("@/components/owner-dashboard/OwnerMonthlyInvoiceWorkspace", () => ({
  OwnerMonthlyInvoiceWorkspace: (props: {
    state: string;
    options?: { organizationId: string; locationId: string; servicePeriod: string };
    onIssue: (command: {
      organizationId: string;
      locationId: string;
      familyId: string;
      familyPayerId: string;
      servicePeriod: string;
      dueDate: string;
      quoteHash: string;
    }) => void;
  }) => (
    <div>
      <output data-testid="workspace-state">{props.state}</output>
      <output data-testid="workspace-scope">
        {props.options
          ? `${props.options.organizationId}:${props.options.locationId}:${props.options.servicePeriod}`
          : "sin-opciones"}
      </output>
      <button
        type="button"
        onClick={() =>
          props.onIssue({
            organizationId: "10000000-0000-4000-8000-000000000001",
            locationId: "20000000-0000-4000-8000-000000000001",
            familyId: "30000000-0000-4000-8000-000000000001",
            familyPayerId: "40000000-0000-4000-8000-000000000001",
            servicePeriod: "2026-01",
            dueDate: "2026-01-31",
            quoteHash: "quote-from-academy-a",
          })
        }
      >
        Emitir cotización anterior
      </button>
      <button
        type="button"
        onClick={() =>
          props.onIssue({
            organizationId: "10000000-0000-4000-8000-000000000001",
            locationId: "20000000-0000-4000-8000-000000000001",
            familyId: "30000000-0000-4000-8000-000000000001",
            familyPayerId: "40000000-0000-4000-8000-000000000001",
            servicePeriod: "2026-01",
            dueDate: "2026-02-05",
            quoteHash: "corrected-quote-after-stale-response",
          })
        }
      >
        Emitir cotización corregida
      </button>
    </div>
  ),
}));

const organizationA = "10000000-0000-4000-8000-000000000001";
const locationA = "20000000-0000-4000-8000-000000000001";
const organizationB = "10000000-0000-4000-8000-000000000002";
const locationB = "20000000-0000-4000-8000-000000000002";
const fetchMock = vi.fn();

function optionsResponse(organizationId: string, locationId: string, servicePeriod: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      data: {
        organizationId,
        locationId,
        servicePeriod,
        servicePeriodStart: `${servicePeriod}-01`,
        servicePeriodEnd: `${servicePeriod}-28`,
        timezone: "Europe/Madrid",
        pricingNote: "",
        pricePlans: [],
        families: [],
        unassignedEnrollments: [],
      },
    }),
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation((input: string | URL | Request) => {
    const url = String(input);
    const params = new URL(url, "http://localhost").searchParams;
    return Promise.resolve(
      optionsResponse(
        params.get("organizationId") ?? "",
        params.get("locationId") ?? "",
        params.get("servicePeriod") ?? ""
      )
    );
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ámbito de facturas mensuales", () => {
  it("oculta las opciones anteriores y rechaza emitir A tras cambiar a la academia B", async () => {
    publishOwnerPlanUsage(organizationA, { readOnly: false, planCode: "free" });
    publishOwnerPlanUsage(organizationB, { readOnly: false, planCode: "free" });
    const props = {
      organizationName: "Academia",
      defaultCurrency: "EUR",
      locations: [
        { id: locationA, name: "Sede A" },
        { id: locationB, name: "Sede B" },
      ],
    };
    const view = render(
      <OwnerMonthlyInvoicesManager
        {...props}
        organizationId={organizationA}
        initialLocationId={locationA}
        initialServicePeriod="2026-01"
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId("workspace-scope")).toHaveTextContent(
        `${organizationA}:${locationA}:2026-01`
      )
    );

    fetchMock.mockImplementationOnce(() => new Promise(() => undefined));
    view.rerender(
      <OwnerMonthlyInvoicesManager
        {...props}
        organizationId={organizationB}
        initialLocationId={locationB}
        initialServicePeriod="2026-02"
      />
    );

    expect(screen.getByTestId("workspace-state")).toHaveTextContent("loading");
    expect(screen.getByTestId("workspace-scope")).toHaveTextContent("sin-opciones");
    fireEvent.click(screen.getByRole("button", { name: "Emitir cotización anterior" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/issue"))).toBe(false);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La cotización ya no corresponde a la academia, sede y periodo visibles"
    );
  });

  it("conserva la clave de emisión tras 503 y 429 hasta recibir un recibo válido", async () => {
    publishOwnerPlanUsage(organizationA, { readOnly: false, planCode: "free" });
    let issueCount = 0;
    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        issueCount += 1;
        if (issueCount === 1) {
          return Promise.resolve({ ok: false, status: 503, json: async () => ({ detail: "Fallo temporal" }) });
        }
        if (issueCount === 2) {
          return Promise.resolve({ ok: false, status: 429, json: async () => ({ detail: "Demasiadas solicitudes" }) });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, data: { invoiceId: "a0000000-0000-4000-8000-000000000001" } }) });
      }
      const params = new URL(String(input), "http://localhost").searchParams;
      return Promise.resolve(optionsResponse(
        params.get("organizationId") ?? "",
        params.get("locationId") ?? "",
        params.get("servicePeriod") ?? ""
      ));
    });
    render(
      <OwnerMonthlyInvoicesManager
        organizationId={organizationA}
        organizationName="Academia A"
        defaultCurrency="EUR"
        locations={[{ id: locationA, name: "Sede A" }]}
        initialLocationId={locationA}
        initialServicePeriod="2026-01"
      />
    );
    await waitFor(() => expect(screen.getByTestId("workspace-state")).toHaveTextContent("empty"));
    fireEvent.click(screen.getByRole("button", { name: "Emitir cotización anterior" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la emisión pendiente" }));
    await screen.findByText("Demasiadas solicitudes");
    expect(screen.getByRole("button", { name: "Reintentar la emisión pendiente" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la emisión pendiente" }));
    await waitFor(() => expect(issueCount).toBe(3));

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(3);
    expect(posts[1][1]?.body).toBe(posts[0][1]?.body);
    expect(posts[2][1]?.body).toBe(posts[0][1]?.body);
    expect(new Headers(posts[1][1]?.headers).get("Idempotency-Key")).toBe(
      new Headers(posts[0][1]?.headers).get("Idempotency-Key")
    );
    expect(new Headers(posts[2][1]?.headers).get("Idempotency-Key")).toBe(
      new Headers(posts[0][1]?.headers).get("Idempotency-Key")
    );
  });

  it("libera una cotización tras el 422 pre-write de QUOTE_STALE para aceptar la corregida", async () => {
    publishOwnerPlanUsage(organizationA, { readOnly: false, planCode: "free" });
    let issueCount = 0;
    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        issueCount += 1;
        return Promise.resolve(
          issueCount === 1
            ? { ok: false, status: 422, json: async () => ({ code: "QUOTE_STALE", detail: "Cotización caducada" }) }
            : { ok: true, status: 201, json: async () => ({ ok: true, data: { invoiceId: "a0000000-0000-4000-8000-000000000002" } }) }
        );
      }
      const params = new URL(String(input), "http://localhost").searchParams;
      return Promise.resolve(optionsResponse(
        params.get("organizationId") ?? "",
        params.get("locationId") ?? "",
        params.get("servicePeriod") ?? ""
      ));
    });
    render(
      <OwnerMonthlyInvoicesManager
        organizationId={organizationA}
        organizationName="Academia A"
        defaultCurrency="EUR"
        locations={[{ id: locationA, name: "Sede A" }]}
        initialLocationId={locationA}
        initialServicePeriod="2026-01"
      />
    );
    await waitFor(() => expect(screen.getByTestId("workspace-state")).toHaveTextContent("empty"));
    fireEvent.click(screen.getByRole("button", { name: "Emitir cotización anterior" }));
    await screen.findByText("Cotización caducada");
    await waitFor(() => expect(screen.getByTestId("workspace-state")).toHaveTextContent("empty"));
    expect(screen.queryByRole("button", { name: "Reintentar la emisión pendiente" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Emitir cotización corregida" }));
    await waitFor(() => expect(issueCount).toBe(2));
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(new Headers(posts[0][1]?.headers).get("Idempotency-Key")).not.toBe(
      new Headers(posts[1][1]?.headers).get("Idempotency-Key")
    );
    expect(JSON.parse(String(posts[1][1]?.body))).toMatchObject({
      dueDate: "2026-02-05",
      quoteHash: "corrected-quote-after-stale-response",
    });
  });

  it("mantiene recibo y enlace de A si la emisión termina mientras se muestra B", async () => {
    publishOwnerPlanUsage(organizationA, { readOnly: false, planCode: "free" });
    publishOwnerPlanUsage(organizationB, { readOnly: false, planCode: "free" });
    let finishIssue!: (value: { ok: boolean; status: number; json: () => Promise<unknown> }) => void;
    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Promise((resolve) => {
          finishIssue = resolve as typeof finishIssue;
        });
      }
      const params = new URL(String(input), "http://localhost").searchParams;
      if (params.get("organizationId") === organizationB) return new Promise(() => undefined);
      return Promise.resolve(optionsResponse(
        params.get("organizationId") ?? "",
        params.get("locationId") ?? "",
        params.get("servicePeriod") ?? ""
      ));
    });
    const props = {
      organizationName: "Academia",
      defaultCurrency: "EUR",
      locations: [
        { id: locationA, name: "Sede A" },
        { id: locationB, name: "Sede B" },
      ],
    };
    const view = render(
      <OwnerMonthlyInvoicesManager
        {...props}
        organizationId={organizationA}
        initialLocationId={locationA}
        initialServicePeriod="2026-01"
      />
    );
    await waitFor(() => expect(screen.getByTestId("workspace-scope")).toHaveTextContent(`${organizationA}:${locationA}:2026-01`));
    fireEvent.click(screen.getByRole("button", { name: "Emitir cotización anterior" }));

    view.rerender(
      <OwnerMonthlyInvoicesManager
        {...props}
        organizationId={organizationB}
        initialLocationId={locationB}
        initialServicePeriod="2026-02"
      />
    );
    finishIssue({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, data: { invoiceId: "a0000000-0000-4000-8000-000000000003" } }),
    });

    expect(await screen.findByText(/factura se emitió correctamente en la operación iniciada para el ámbito original/)).toBeVisible();
    expect(screen.getByTestId("workspace-scope")).toHaveTextContent("sin-opciones");
    expect(screen.getByRole("link", { name: "Volver al ámbito de la emisión" })).toHaveAttribute(
      "href",
      expect.stringContaining("organizationId=" + organizationA)
    );
  });
});
