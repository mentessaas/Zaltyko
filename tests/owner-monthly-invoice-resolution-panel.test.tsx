// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import {
  OwnerMonthlyInvoiceResolutionPanel,
  PENDING_OWNER_MONTHLY_RESOLUTION_STORAGE_KEY,
} from "@/components/owner-dashboard/OwnerMonthlyInvoiceResolutionPanel";
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
const familyIdB = "80000000-0000-4000-8000-000000000002";
const athleteId = "90000000-0000-4000-8000-000000000001";
const primaryPayerId = "a0000000-0000-4000-8000-000000000001";
const secondaryPayerId = "a0000000-0000-4000-8000-000000000002";
const primaryPayerIdB = "a0000000-0000-4000-8000-000000000003";
const secondaryPayerIdB = "a0000000-0000-4000-8000-000000000004";
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
const familyAction = {
  kind: "family" as const,
  enrollmentId,
  athleteId,
  athleteName: "Gimnasta",
};
const payerAction = { kind: "payer" as const, familyId, athleteIds: [athleteId] };

function familyOptions(payers: Array<{ familyPayerId: string; displayName: string; isPrimary: boolean }>, id = familyId) {
  return jsonResponse({
    ok: true,
    data: {
      families: [{
        familyId: id,
        athletes: [{ athleteId, athleteName: "Gimnasta A" }],
        payers,
      }],
    },
  });
}

const primaryAndSecondaryPayers = [
  { familyPayerId: primaryPayerId, displayName: "María García", isPrimary: true },
  { familyPayerId: secondaryPayerId, displayName: "Luis García", isPrimary: false },
];

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
  window.sessionStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
  publishOwnerPlanUsage(organizationA, { readOnly: false, planCode: "free" });
  publishOwnerPlanUsage(organizationB, { readOnly: false, planCode: "free" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
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

  it("exige acuse para promocionar un pagador secundario y lo incluye solo tras marcarlo", async () => {
    fetchMock.mockResolvedValueOnce(familyOptions(primaryAndSecondaryPayers))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        data: { familyId, familyPayerId: secondaryPayerId },
      }, 201));
    render(<OwnerMonthlyInvoiceResolutionPanel {...panelProps({ action: familyAction })} />);
    await screen.findByRole("option", { name: "Gimnasta A" });
    fireEvent.change(screen.getByLabelText("Familia"), { target: { value: familyId } });
    fireEvent.change(screen.getByLabelText("Persona pagadora"), { target: { value: secondaryPayerId } });

    const confirmation = screen.getByRole("checkbox", { name: /cambiará el pagador principal de toda la familia/i });
    expect(confirmation).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Guardar vínculo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar vínculo" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole("button", { name: "Guardar vínculo" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1];
    expect(JSON.parse(String(post?.body))).toEqual({
      organizationId: organizationA,
      locationId: locationA,
      familyId,
      athleteIds: [athleteId],
      payer: { familyPayerId: secondaryPayerId, confirmPrimaryPayerChange: true },
      effectiveFrom: "2026-01-01",
    });
  });

  it("mantiene el pagador principal sin enviar el acuse", async () => {
    fetchMock.mockResolvedValueOnce(familyOptions(primaryAndSecondaryPayers))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        data: { familyId, familyPayerId: primaryPayerId },
      }, 201));
    render(<OwnerMonthlyInvoiceResolutionPanel {...panelProps({ action: familyAction })} />);
    await screen.findByRole("option", { name: "Gimnasta A" });
    fireEvent.change(screen.getByLabelText("Familia"), { target: { value: familyId } });
    fireEvent.change(screen.getByLabelText("Persona pagadora"), { target: { value: primaryPayerId } });

    expect(screen.queryByRole("checkbox", { name: /cambiará el pagador principal/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar vínculo" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1];
    expect(JSON.parse(String(post?.body))).toEqual({
      organizationId: organizationA,
      locationId: locationA,
      familyId,
      athleteIds: [athleteId],
      payer: { familyPayerId: primaryPayerId },
      effectiveFrom: "2026-01-01",
    });
  });

  it("pide acuse al añadir una persona adulta a una familia que ya tiene pagador principal", async () => {
    fetchMock.mockResolvedValueOnce(familyOptions([primaryAndSecondaryPayers[0]]))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        data: { familyId, familyPayerId: "a0000000-0000-4000-8000-000000000005" },
      }, 201));
    render(<OwnerMonthlyInvoiceResolutionPanel {...panelProps({ action: payerAction })} />);
    await screen.findByText("Familia: Gimnasta A");
    fireEvent.change(screen.getByLabelText("Nombre de la persona adulta"), { target: { value: "Lucía" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "García" } });

    const confirmation = screen.getByRole("checkbox", { name: /cambiará el pagador principal de toda la familia/i });
    expect(confirmation).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Guardar vínculo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar vínculo" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

    fireEvent.click(confirmation);
    fireEvent.click(screen.getByRole("button", { name: "Guardar vínculo" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1];
    expect(JSON.parse(String(post?.body))).toEqual({
      organizationId: organizationA,
      locationId: locationA,
      familyId,
      athleteIds: [athleteId],
      payer: {
        givenName: "Lucía",
        familyName: "García",
        relationship: "parent",
        confirmPrimaryPayerChange: true,
      },
      effectiveFrom: "2026-01-01",
    });
  });

  it("omits el acuse al crear familia nueva sin pagador previo", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, data: { families: [] } }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        data: { familyId, familyPayerId: primaryPayerId },
      }, 201));
    render(<OwnerMonthlyInvoiceResolutionPanel {...panelProps({ action: familyAction })} />);
    await screen.findByLabelText("Nombre de la persona adulta");
    fireEvent.change(screen.getByLabelText("Nombre de la persona adulta"), { target: { value: "Lucía" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "García" } });

    expect(screen.queryByRole("checkbox", { name: /cambiará el pagador principal/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar vínculo" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1];
    expect(JSON.parse(String(post?.body))).toEqual({
      organizationId: organizationA,
      locationId: locationA,
      athleteIds: [athleteId],
      payer: { givenName: "Lucía", familyName: "García", relationship: "parent" },
      effectiveFrom: "2026-01-01",
    });
  });

  it("invalida la confirmación al cambiar familia, pagador o fecha efectiva", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      ok: true,
      data: {
        families: [
          {
            familyId,
            athletes: [{ athleteId, athleteName: "Gimnasta A" }],
            payers: primaryAndSecondaryPayers,
          },
          {
            familyId: familyIdB,
            athletes: [{ athleteId, athleteName: "Gimnasta A" }],
            payers: [
              { familyPayerId: primaryPayerIdB, displayName: "Ana García", isPrimary: true },
              { familyPayerId: secondaryPayerIdB, displayName: "Bea García", isPrimary: false },
            ],
          },
        ],
      },
    }));
    render(<OwnerMonthlyInvoiceResolutionPanel {...panelProps({ action: familyAction })} />);
    const familySelect = await screen.findByLabelText("Familia");
    await waitFor(() =>
      expect(
        familySelect.querySelector(`option[value="${familyId}"]`)
      ).not.toBeNull()
    );
    fireEvent.change(familySelect, { target: { value: familyId } });
    fireEvent.change(screen.getByLabelText("Persona pagadora"), { target: { value: secondaryPayerId } });
    const confirmationName = /cambiará el pagador principal de toda la familia/i;
    fireEvent.click(screen.getByRole("checkbox", { name: confirmationName }));
    expect(screen.getByRole("checkbox", { name: confirmationName })).toBeChecked();

    fireEvent.change(screen.getByLabelText("Fecha efectiva"), { target: { value: "2026-01-02" } });
    expect(screen.getByRole("checkbox", { name: confirmationName })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Guardar vínculo" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: confirmationName }));
    fireEvent.change(screen.getByLabelText("Persona pagadora"), { target: { value: primaryPayerId } });
    expect(screen.queryByRole("checkbox", { name: confirmationName })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Persona pagadora"), { target: { value: secondaryPayerId } });
    expect(screen.getByRole("checkbox", { name: confirmationName })).not.toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: confirmationName }));
    fireEvent.change(screen.getByLabelText("Familia"), { target: { value: familyIdB } });
    expect(screen.getByRole("checkbox", { name: confirmationName })).not.toBeChecked();
  });

  it("invalida la confirmación al cambiar academia, sede y periodo", async () => {
    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(jsonResponse({ ok: true, data: { familyId, familyPayerId: secondaryPayerId } }, 201));
      }
      return Promise.resolve(familyOptions(primaryAndSecondaryPayers));
    });
    const props = panelProps({ action: familyAction });
    const view = render(<OwnerMonthlyInvoiceResolutionPanel {...props} />);
    await screen.findByRole("option", { name: "Gimnasta A" });
    fireEvent.change(screen.getByLabelText("Familia"), { target: { value: familyId } });
    fireEvent.change(screen.getByLabelText("Persona pagadora"), { target: { value: secondaryPayerId } });
    const confirmationName = /cambiará el pagador principal de toda la familia/i;
    fireEvent.click(screen.getByRole("checkbox", { name: confirmationName }));
    expect(screen.getByRole("checkbox", { name: confirmationName })).toBeChecked();

    view.rerender(
      <OwnerMonthlyInvoiceResolutionPanel
        {...props}
        organizationId={organizationB}
        locationId={locationB}
        servicePeriodStart="2026-02-01"
      />
    );

    const checkbox = await screen.findByRole("checkbox", { name: confirmationName });
    expect(checkbox).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Guardar vínculo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar vínculo" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
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

  it("restaura una asociación incierta sin autoenviarla y conserva body y clave incluso tras un 4xx ambiguo", async () => {
    let postCount = 0;
    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        postCount += 1;
        if (postCount === 1) return Promise.reject(new Error("respuesta perdida"));
        if (postCount === 2) {
          return Promise.resolve(jsonResponse({ detail: "Rechazo tras intento incierto" }, 422));
        }
        return Promise.resolve(jsonResponse({
          ok: true,
          data: { familyId, familyPayerId: primaryPayerId },
        }, 201));
      }
      return Promise.resolve(familyOptions([primaryAndSecondaryPayers[0]]));
    });
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const props = panelProps({ action: familyAction, onSaved });
    const firstMount = render(<OwnerMonthlyInvoiceResolutionPanel {...props} />);
    await screen.findByRole("option", { name: "Gimnasta A" });
    fireEvent.change(screen.getByLabelText("Familia"), { target: { value: familyId } });
    fireEvent.change(screen.getByLabelText("Persona pagadora"), { target: { value: primaryPayerId } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar vínculo" }));
    await screen.findByText(/No sabemos si se guardó/);

    const firstPost = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(firstPost).toBeDefined();
    const [, firstInit] = firstPost as [string, RequestInit];
    const exactBody = firstInit.body;
    const exactKey = new Headers(firstInit.headers).get("Idempotency-Key");
    expect(JSON.parse(String(exactBody))).toMatchObject({
      payer: { familyPayerId: primaryPayerId },
    });
    expect(JSON.parse(String(exactBody)).payer).not.toHaveProperty("confirmPrimaryPayerChange");
    firstMount.unmount();

    const restoredMount = render(<OwnerMonthlyInvoiceResolutionPanel {...props} />);
    const retry = await screen.findByRole("button", { name: "Reintentar la misma operación" });
    expect(postCount).toBe(1);
    fireEvent.click(retry);
    await screen.findByText("Rechazo tras intento incierto");
    expect(postCount).toBe(2);
    expect(window.sessionStorage.getItem(PENDING_OWNER_MONTHLY_RESOLUTION_STORAGE_KEY)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar la misma operación" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("family", familyId));

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(3);
    for (const [, init] of posts) {
      expect(init?.body).toBe(exactBody);
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(exactKey);
    }
    expect(window.sessionStorage.getItem(PENDING_OWNER_MONTHLY_RESOLUTION_STORAGE_KEY)).toBeNull();
    restoredMount.unmount();
  });

  it("no envía si sessionStorage rechaza la persistencia antes del POST", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("storage denied", "QuotaExceededError");
    });
    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) =>
      init?.method === "POST"
        ? Promise.resolve(jsonResponse({ ok: true, data: { familyId, familyPayerId: primaryPayerId } }, 201))
        : Promise.resolve(jsonResponse({ ok: true, data: { families: [] } }))
    );
    render(<OwnerMonthlyInvoiceResolutionPanel {...panelProps({ action: familyAction })} />);
    await screen.findByLabelText("Nombre de la persona adulta");
    fireEvent.change(screen.getByLabelText("Nombre de la persona adulta"), { target: { value: "Lucía" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "García" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar vínculo" }));

    expect(await screen.findByText(/No pudimos guardar y releer la operación exacta/)).toBeVisible();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("bloquea operaciones si sessionStorage contiene JSON malformado", async () => {
    window.sessionStorage.setItem(PENDING_OWNER_MONTHLY_RESOLUTION_STORAGE_KEY, "{bad-json");
    fetchMock.mockResolvedValue(planOptions(organizationA, locationA));
    render(<OwnerMonthlyInvoiceResolutionPanel {...panelProps()} />);

    expect(await screen.findByText(/marcador de una operación anterior no supera la validación/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar tarifa" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar tarifa" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH" || init?.method === "POST")).toBe(false);
  });

  it("rechaza un marcador cuyo endpoint o fingerprint no coincide con el comando", async () => {
    const actionKey = `tariff:${enrollmentId}`;
    const scopeKey = JSON.stringify([organizationA, locationA, "2026-01", actionKey]);
    const serializedBody = JSON.stringify({
      organizationId: organizationA,
      locationId: locationA,
      pricePlanId,
      startsOn: "2026-01-01",
    });
    const record = {
      version: 1,
      scopeKey,
      organizationId: organizationA,
      locationId: locationA,
      servicePeriod: "2026-01",
      actionKey,
      operation: "assign-tariff",
      endpoint: "/api/v1/owner/enrollments/wrong/price-plan",
      method: "PATCH",
      key: "owner-price-assignment:90000000-0000-4000-8000-000000000002",
      hasAmbiguousAttempt: true,
      serializedBody,
      fingerprint: JSON.stringify([
        scopeKey,
        organizationA,
        locationA,
        "2026-01",
        actionKey,
        "assign-tariff",
        "/api/v1/owner/enrollments/wrong/price-plan",
        "PATCH",
        "owner-price-assignment:90000000-0000-4000-8000-000000000002",
        serializedBody,
      ]),
    };
    window.sessionStorage.setItem(PENDING_OWNER_MONTHLY_RESOLUTION_STORAGE_KEY, JSON.stringify(record));
    fetchMock.mockResolvedValue(planOptions(organizationA, locationA));
    const endpointView = render(<OwnerMonthlyInvoiceResolutionPanel {...panelProps()} />);

    expect(await screen.findByText(/marcador de una operación anterior no supera la validación/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar tarifa" })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    endpointView.unmount();

    window.sessionStorage.setItem(PENDING_OWNER_MONTHLY_RESOLUTION_STORAGE_KEY, JSON.stringify({
      ...record,
      endpoint: `/api/v1/owner/enrollments/${enrollmentId}/price-plan`,
      fingerprint: "stale-fingerprint",
    }));
    render(<OwnerMonthlyInvoiceResolutionPanel {...panelProps()} />);
    expect(await screen.findByText(/marcador de una operación anterior no supera la validación/)).toBeVisible();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("limpia un rechazo 4xx definitivo del primer intento y permite un comando nuevo", async () => {
    let postCount = 0;
    fetchMock.mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        postCount += 1;
        return Promise.resolve(postCount === 1
          ? jsonResponse({ detail: "Datos rechazados" }, 422)
          : jsonResponse({ ok: true, data: { familyId, familyPayerId: primaryPayerId } }, 201));
      }
      return Promise.resolve(familyOptions([primaryAndSecondaryPayers[0]]));
    });
    const props = panelProps({ action: familyAction });
    render(<OwnerMonthlyInvoiceResolutionPanel {...props} />);
    await screen.findByRole("option", { name: "Gimnasta A" });
    fireEvent.change(screen.getByLabelText("Familia"), { target: { value: familyId } });
    fireEvent.change(screen.getByLabelText("Persona pagadora"), { target: { value: primaryPayerId } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar vínculo" }));
    await screen.findByText("Datos rechazados");
    expect(window.sessionStorage.getItem(PENDING_OWNER_MONTHLY_RESOLUTION_STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Guardar vínculo" }));
    await waitFor(() => expect(postCount).toBe(2));
  });
});
