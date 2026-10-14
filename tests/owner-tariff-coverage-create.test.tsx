// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerMonthlyInvoiceResolutionPanel } from "@/components/owner-dashboard/OwnerMonthlyInvoiceResolutionPanel";

const organizationId = "10000000-0000-4000-8000-000000000111";
const locationId = "10000000-0000-4000-8000-000000000112";
const artClassId = "10000000-0000-4000-8000-000000000401";
const rhythmicClassId = "10000000-0000-4000-8000-000000000402";
const complementaryClassId = "10000000-0000-4000-8000-000000000403";

const classTemplates = [
  {
    id: artClassId,
    name: "Gimnasia artística",
    effectiveFrom: "2026-09-01",
    effectiveTo: null,
  },
  {
    id: rhythmicClassId,
    name: "Gimnasia rítmica",
    effectiveFrom: "2026-09-01",
    effectiveTo: null,
  },
  {
    id: complementaryClassId,
    name: "Preparación física complementaria",
    effectiveFrom: "2026-10-01",
    effectiveTo: null,
  },
];

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderPanel() {
  render(
    <OwnerMonthlyInvoiceResolutionPanel
      action={{
        kind: "tariff",
        enrollmentId: "10000000-0000-4000-8000-000000000201",
        athleteName: "Gimnasta sintética",
      }}
      organizationId={organizationId}
      locationId={locationId}
      defaultCurrency="EUR"
      servicePeriodStart="2026-10-01"
      onCancel={vi.fn()}
      onSaved={vi.fn(async () => {})}
    />
  );
}

describe("cobertura de clases al crear una tarifa Owner", () => {
  let currentItems: Array<{
    id: string;
    name: string;
    amountCents: number;
    currency: string;
    cadence: string;
  }>;
  let optionsOverride: Record<string, unknown>;
  let failedOptionsRemaining: number;
  let failedCreatesRemaining: number;

  beforeEach(() => {
    currentItems = [];
    optionsOverride = {};
    failedOptionsRemaining = 0;
    failedCreatesRemaining = 0;
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("tariff-coverage-key")
        .mockReturnValue("tariff-coverage-key-next"),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/price-plans/options")) {
          if (failedOptionsRemaining > 0) {
            failedOptionsRemaining -= 1;
            return new Response(
              JSON.stringify({ detail: "Error de opciones" }),
              {
                status: 503,
                headers: { "content-type": "application/json" },
              }
            );
          }
          return response({
            organizationId,
            locationId,
            items: currentItems,
            classTemplates,
            classTemplatesHasMore: false,
            ...optionsOverride,
          });
        }
        if (url.includes("/billing/price-plans")) {
          if (failedCreatesRemaining > 0) {
            failedCreatesRemaining -= 1;
            return new Response(JSON.stringify({ detail: "Error temporal" }), {
              status: 503,
              headers: { "content-type": "application/json" },
            });
          }
          const body = JSON.parse(String(init?.body)) as {
            name: string;
            amountCents: number;
          };
          const created = {
            id: "10000000-0000-4000-8000-000000000501",
            name: body.name,
            amountCents: body.amountCents,
            currency: "EUR",
            cadence: "monthly",
          };
          currentItems = [created];
          return response(created, 201);
        }
        return response({});
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  async function enterPlanDetails(user: ReturnType<typeof userEvent.setup>) {
    await user.type(
      await screen.findByLabelText("Nombre de la tarifa"),
      "Cuota base"
    );
    await user.type(
      await screen.findByLabelText("Importe mensual (EUR)"),
      "35,00"
    );
  }

  function planCreationCalls() {
    return vi
      .mocked(fetch)
      .mock.calls.filter((call) =>
        String(call[0]).includes("/api/v1/owner/billing/price-plans")
      );
  }

  it("no crea ni envía clases si no se marca cobertura", async () => {
    const user = userEvent.setup();
    renderPanel();
    await enterPlanDetails(user);

    expect(screen.getByLabelText("Vigente desde")).toHaveValue("2026-10-01");
    expect(
      screen.getByRole("checkbox", { name: "Sin fecha de fin" })
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Crear tarifa mensual" })
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", { name: "Crear tarifa mensual" })
    );

    expect(planCreationCalls()).toHaveLength(0);
  });

  it("crea con dos clases explícitas en un POST y permite una lista parcial", async () => {
    const user = userEvent.setup();
    optionsOverride = { classTemplatesHasMore: true };
    renderPanel();
    await enterPlanDetails(user);

    const coverageGroup = screen.getByRole("group", {
      name: "Clases cubiertas",
    });
    expect(
      within(coverageGroup).getAllByRole("checkbox", {
        name: /Gimnasia|Preparación física/,
      })
    ).toHaveLength(3);
    expect(
      screen.getByText(/Hay más de 100 clases activas.*lista es parcial/)
    ).toBeVisible();

    const rhythmicClass = screen.getByRole("checkbox", {
      name: "Gimnasia rítmica",
    });
    rhythmicClass.focus();
    await user.keyboard(" ");
    expect(rhythmicClass).toBeChecked();
    expect(rhythmicClass).toHaveFocus();
    expect(rhythmicClass.closest("label")).toHaveClass("min-h-11");
    await user.click(
      screen.getByRole("checkbox", { name: "Gimnasia artística" })
    );
    expect(
      screen.getByRole("checkbox", {
        name: "Preparación física complementaria",
      })
    ).not.toBeChecked();

    await user.click(
      screen.getByRole("button", { name: "Crear tarifa mensual" })
    );
    const postCalls = planCreationCalls();
    expect(postCalls).toHaveLength(1);
    expect(postCalls[0]?.[1]?.method).toBe("POST");
    expect(postCalls[0]?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "owner-monthly-price-plan:tariff-coverage-key",
    });
    expect(JSON.parse(String(postCalls[0]?.[1]?.body))).toEqual({
      organizationId,
      locationId,
      name: "Cuota base",
      amountCents: 3500,
      coverage: {
        classTemplateIds: [artClassId, rhythmicClassId],
        startsOn: "2026-10-01",
        endsOn: null,
      },
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      /cobertura para 2 clases/
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Tarifa mensual")).toHaveValue(
        "10000000-0000-4000-8000-000000000501"
      )
    );
    expect(planCreationCalls()).toHaveLength(1);
  });

  it.each([
    ["academia", { organizationId: "10000000-0000-4000-8000-000000000999" }],
    ["sede", { locationId: "10000000-0000-4000-8000-000000000999" }],
  ])(
    "rechaza las clases de otra %s sin mostrarlas",
    async (_scope, mismatch) => {
      optionsOverride = mismatch;
      renderPanel();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Las opciones recibidas no corresponden a esta academia y sede. Reintenta la carga."
      );
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Reintentar cargar tarifas" })
      ).toBeEnabled();
    }
  );

  it("no crea clases falsas si falla la carga y permite reintentar opciones", async () => {
    const user = userEvent.setup();
    failedOptionsRemaining = 1;
    renderPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error de opciones"
    );
    expect(
      screen.queryByRole("checkbox", {
        name: /Gimnasia|Preparación física/,
      })
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Reintentar cargar tarifas" })
    );
    expect(
      await screen.findByRole("checkbox", { name: "Gimnasia artística" })
    ).toBeInTheDocument();
  });

  it("muestra el vacío de clases sin inventar opciones ni permitir el POST", async () => {
    const user = userEvent.setup();
    optionsOverride = { classTemplates: [] };
    renderPanel();
    await enterPlanDetails(user);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "No hay clases activas disponibles en esta sede. No se puede crear una tarifa sin cobertura explícita."
    );
    expect(
      screen.queryByRole("checkbox", {
        name: /Gimnasia|Preparación física/,
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Crear tarifa mensual" })
    ).toBeDisabled();
    expect(planCreationCalls()).toHaveLength(0);
  });

  it("rechaza una vigencia cuyo fin precede al inicio", async () => {
    const user = userEvent.setup();
    renderPanel();
    await enterPlanDetails(user);
    await user.click(
      screen.getByRole("checkbox", { name: "Gimnasia artística" })
    );
    await user.click(
      screen.getByRole("checkbox", { name: "Sin fecha de fin" })
    );
    fireEvent.change(await screen.findByLabelText(/Vigente hasta/), {
      target: { value: "2026-09-30" },
    });
    await user.click(
      screen.getByRole("button", { name: "Crear tarifa mensual" })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Indica una vigencia válida: la fecha de inicio es obligatoria y el fin no puede ser anterior."
    );
    expect(planCreationCalls()).toHaveLength(0);
  });

  it("reutiliza clave y cuerpo si el intento es incierto, y rota la clave si cambia la cobertura", async () => {
    const user = userEvent.setup();
    failedCreatesRemaining = 2;
    renderPanel();
    await enterPlanDetails(user);
    await user.click(
      screen.getByRole("checkbox", { name: "Gimnasia artística" })
    );

    await user.click(
      screen.getByRole("button", { name: "Crear tarifa mensual" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error temporal"
    );
    await user.click(
      screen.getByRole("button", { name: "Crear tarifa mensual" })
    );
    await waitFor(() => expect(planCreationCalls()).toHaveLength(2));
    const callsAfterRetry = planCreationCalls();
    expect(callsAfterRetry[0]?.[1]?.body).toBe(callsAfterRetry[1]?.[1]?.body);
    expect(callsAfterRetry[0]?.[1]?.headers).toEqual(
      callsAfterRetry[1]?.[1]?.headers
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Gimnasia rítmica" })
    );
    await user.click(
      screen.getByRole("button", { name: "Crear tarifa mensual" })
    );
    await waitFor(() => expect(planCreationCalls()).toHaveLength(3));
    const finalCalls = planCreationCalls();
    expect(finalCalls[2]?.[1]?.headers).not.toEqual(
      finalCalls[1]?.[1]?.headers
    );
    expect(
      JSON.parse(String(finalCalls[2]?.[1]?.body)).coverage.classTemplateIds
    ).toEqual([artClassId, rhythmicClassId]);
  });
});
