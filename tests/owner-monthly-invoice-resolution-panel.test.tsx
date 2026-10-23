// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { OwnerMonthlyInvoiceResolutionPanel } from "@/components/owner-dashboard/OwnerMonthlyInvoiceResolutionPanel";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const organizationA = "10000000-0000-4000-8000-000000000001";
const locationA = "20000000-0000-4000-8000-000000000001";
const organizationB = "10000000-0000-4000-8000-000000000002";
const locationB = "20000000-0000-4000-8000-000000000002";
const enrollmentId = "50000000-0000-4000-8000-000000000001";
const pricePlanId = "60000000-0000-4000-8000-000000000001";
const pricePlanIdB = "60000000-0000-4000-8000-000000000002";
const classTemplateId = "70000000-0000-4000-8000-000000000001";
const familyId = "80000000-0000-4000-8000-000000000001";
const fetchMock = vi.fn();

function jsonResponse(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}

function planOptions(
  organizationId: string,
  locationId: string,
  items = [
    { id: pricePlanId, name: "Tarifa academia A", amountCents: 5000, currency: "EUR", cadence: "monthly" },
  ]
) {
  return jsonResponse({
    ok: true,
    data: {
      organizationId,
      locationId,
      items,
      classTemplates: [
        { id: classTemplateId, name: "Rítmica iniciación", effectiveFrom: "2025-01-01", effectiveTo: null },
      ],
      classTemplatesHasMore: false,
    },
  });
}

const tariffAction = { kind: "tariff" as const, enrollmentId, athleteName: "Gimnasta" };

type PanelProps = ComponentProps<typeof OwnerMonthlyInvoiceResolutionPanel>;

function panelProps(overrides: Partial<PanelProps> = {}) {
  return {
    action: tariffAction,
    organizationId: organizationA,
    writesBlocked: false,
    locationId: locationA,
    defaultCurrency: "EUR",
    servicePeriodStart: "2026-01-01",
    onCancel: vi.fn(),
    onSaved: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  publishOwnerPlanUsage(organizationA, { readOnly: false, planCode: "free" });
  publishOwnerPlanUsage(organizationB, { readOnly: false, planCode: "free" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ámbito del panel de resolución de facturas", () => {
  it("oculta inmediatamente las tarifas A y bloquea su asignación al cambiar a B", async () => {
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const params = new URL(String(input), "http://localhost").searchParams;
      if (params.get("organizationId") === organizationB) return new Promise(() => undefined);
      return Promise.resolve(planOptions(organizationA, locationA));
    });
    const props = panelProps();
    const view = render(<OwnerMonthlyInvoiceResolutionPanel {...props} />);
    expect(await screen.findByRole("option", { name: /Tarifa academia A/ })).toBeVisible();

    view.rerender(
      <OwnerMonthlyInvoiceResolutionPanel
        {...props}
        organizationId={organizationB}
        locationId={locationB}
        servicePeriodStart="2026-02-01"
      />
    );

    expect(screen.queryByRole("option", { name: /Tarifa academia A/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar tarifa" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar tarifa" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("oculta inmediatamente las familias A al cambiar a B antes de recibir su catálogo", async () => {
    const familyAction = {
      kind: "family" as const,
      enrollmentId,
      athleteId: "90000000-0000-4000-8000-000000000001",
      athleteName: "Gimnasta",
    };
    fetchMock.mockImplementation((input: string | URL | Request) => {
      const params = new URL(String(input), "http://localhost").searchParams;
      if (params.get("organizationId") === organizationB) return new Promise(() => undefined);
      return Promise.resolve(
        jsonResponse({
          ok: true,
          data: {
            families: [
              {
                familyId,
                athletes: [{ athleteId: "90000000-0000-4000-8000-000000000001", athleteName: "Gimnasta A" }],
                payers: [],
              },
            ],
          },
        })
      );
    });
    const props = panelProps({ action: familyAction });
    const view = render(<OwnerMonthlyInvoiceResolutionPanel {...props} />);
    expect(await screen.findByRole("option", { name: "Gimnasta A" })).toBeVisible();

    view.rerender(
      <OwnerMonthlyInvoiceResolutionPanel
        {...props}
        organizationId={organizationB}
        locationId={locationB}
        servicePeriodStart="2026-02-01"
      />
    );

    expect(screen.queryByRole("option", { name: "Gimnasta A" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar vínculo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar vínculo" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("confirma una tarifa creada tarde en A sin alterar catálogo ni aviso de B", async () => {
    let finishCreate!: (value: ReturnType<typeof jsonResponse>) => void;
    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const params = new URL(String(input), "http://localhost").searchParams;
      if (init?.method === "POST") {
        return new Promise((resolve) => {
          finishCreate = resolve as typeof finishCreate;
        });
      }
      if (params.get("organizationId") === organizationB) {
        return Promise.resolve(planOptions(organizationB, locationB, [
          { id: pricePlanIdB, name: "Tarifa academia B", amountCents: 6200, currency: "EUR", cadence: "monthly" },
        ]));
      }
      return Promise.resolve(planOptions(organizationA, locationA, []));
    });
    const props = panelProps();
    const view = render(<OwnerMonthlyInvoiceResolutionPanel {...props} />);
    fireEvent.change(await screen.findByLabelText("Nombre de la tarifa"), {
      target: { value: "Tarifa nueva A" },
    });
    fireEvent.change(screen.getByLabelText(/Importe mensual/), {
      target: { value: "42,00" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Rítmica iniciación" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear tarifa mensual" }));

    view.rerender(
      <OwnerMonthlyInvoiceResolutionPanel
        {...props}
        organizationId={organizationB}
        locationId={locationB}
        servicePeriodStart="2026-02-01"
      />
    );
    await screen.findByRole("option", { name: /Tarifa academia B/ });
    finishCreate(
      jsonResponse({
        ok: true,
        data: {
          id: pricePlanId,
          name: "Tarifa nueva A",
          amountCents: 4200,
          currency: "EUR",
          cadence: "monthly",
        },
      })
    );

    expect(await screen.findByText(/se creó correctamente en la operación iniciada para su ámbito original/)).toBeVisible();
    expect(screen.queryByRole("option", { name: /Tarifa nueva A/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Tarifa academia B/ })).toBeVisible();
    expect(screen.queryByText(/Tarifa creada con cobertura/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al ámbito de la operación" })).toHaveAttribute(
      "href",
      expect.stringContaining("organizationId=" + organizationA)
    );
  });

  it("libera una primera 422 para corregir y conserva la nueva clave tras un replay 429", async () => {
    let patchCount = 0;
    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patchCount += 1;
        if (patchCount === 1) {
          return Promise.resolve(jsonResponse({ detail: "La fecha efectiva no es válida" }, 422));
        }
        if (patchCount === 2) {
          return Promise.resolve(jsonResponse({ detail: "Fallo temporal" }, 503));
        }
        if (patchCount === 3) {
          return Promise.resolve(jsonResponse({ detail: "Demasiadas solicitudes" }, 429));
        }
        return Promise.resolve(jsonResponse({
          ok: true,
          data: { id: enrollmentId, enrollmentId, pricePlanId, startsOn: "2026-01-02" },
        }));
      }
      const params = new URL(String(input), "http://localhost").searchParams;
      return Promise.resolve(planOptions(
        params.get("organizationId") ?? "",
        params.get("locationId") ?? ""
      ));
    });
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<OwnerMonthlyInvoiceResolutionPanel {...panelProps({ onSaved })} />);
    await screen.findByRole("button", { name: "Guardar tarifa" });

    fireEvent.click(screen.getByRole("button", { name: "Guardar tarifa" }));
    await screen.findByText("La fecha efectiva no es válida");
    expect(screen.getByRole("button", { name: "Guardar tarifa" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();
    fireEvent.change(screen.getAllByLabelText("Vigente desde")[0], {
      target: { value: "2026-01-02" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar tarifa" }));
    await screen.findByText("Fallo temporal");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await screen.findByText("Demasiadas solicitudes");
    expect(screen.getByRole("button", { name: "Reintentar la misma operación" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("tariff"));

    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches).toHaveLength(4);
    const firstKey = new Headers(patches[0][1]?.headers).get("Idempotency-Key");
    const correctedKey = new Headers(patches[1][1]?.headers).get("Idempotency-Key");
    expect(correctedKey).not.toBe(firstKey);
    for (const replay of patches.slice(2)) {
      expect(replay[1]?.body).toBe(patches[1][1]?.body);
      expect(new Headers(replay[1]?.headers).get("Idempotency-Key")).toBe(correctedKey);
    }
  });

  it("reintenta la tarifa pendiente con el endpoint, body y clave originales", async () => {
    let patchCount = 0;
    let finishSuccess!: (value: ReturnType<typeof jsonResponse>) => void;
    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patchCount += 1;
        return Promise.resolve(
          patchCount === 1
            ? jsonResponse({ detail: "Respuesta temporalmente no disponible" }, 503)
            : patchCount === 2
              ? jsonResponse({ detail: "Demasiadas solicitudes" }, 429)
              : new Promise((resolve) => {
                  finishSuccess = resolve as typeof finishSuccess;
                })
        );
      }
      const params = new URL(String(input), "http://localhost").searchParams;
      return Promise.resolve(planOptions(params.get("organizationId") ?? "", params.get("locationId") ?? ""));
    });
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const latestOnSaved = vi.fn().mockResolvedValue(undefined);
    const props = panelProps({ onSaved });
    const view = render(<OwnerMonthlyInvoiceResolutionPanel {...props} />);
    await screen.findByRole("button", { name: "Guardar tarifa" });
    fireEvent.click(screen.getByRole("button", { name: "Guardar tarifa" }));
    await screen.findByRole("alert");
    const firstPatch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    const [originalEndpoint, originalInit] = firstPatch as [string, RequestInit];

    view.rerender(
      <OwnerMonthlyInvoiceResolutionPanel
        {...props}
        organizationId={organizationB}
        locationId={locationB}
        servicePeriodStart="2026-02-01"
      />
    );
    expect(await screen.findByRole("link", { name: "Volver a su academia, sede y periodo" })).toHaveAttribute(
      "href",
      expect.stringContaining("organizationId=" + organizationA)
    );
    view.rerender(<OwnerMonthlyInvoiceResolutionPanel {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar la misma operación" }));
    await screen.findByText("Demasiadas solicitudes");
    expect(screen.getByRole("button", { name: "Reintentar la misma operación" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await waitFor(() => expect(patchCount).toBe(3));
    view.rerender(
      <OwnerMonthlyInvoiceResolutionPanel {...props} onSaved={latestOnSaved} />
    );
    finishSuccess(
      jsonResponse({
        ok: true,
        data: { id: enrollmentId, enrollmentId, pricePlanId, startsOn: "2026-01-01" },
      })
    );
    await waitFor(() => expect(latestOnSaved).toHaveBeenCalledWith("tariff"));
    expect(onSaved).not.toHaveBeenCalled();

    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches).toHaveLength(3);
    expect(patches[1][0]).toBe(originalEndpoint);
    expect(patches[1][1]?.body).toBe(originalInit.body);
    expect(new Headers(patches[1][1]?.headers).get("Idempotency-Key")).toBe(
      new Headers(originalInit.headers).get("Idempotency-Key")
    );
    expect(patches[2][0]).toBe(originalEndpoint);
    expect(patches[2][1]?.body).toBe(originalInit.body);
    expect(new Headers(patches[2][1]?.headers).get("Idempotency-Key")).toBe(
      new Headers(originalInit.headers).get("Idempotency-Key")
    );
  });
});
