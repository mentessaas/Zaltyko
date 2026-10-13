// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OwnerMonthlyInvoiceWorkspace,
  type MonthlyInvoiceOptionsResponse,
} from "@/components/owner-dashboard/OwnerMonthlyInvoiceWorkspace";

const familyId = "10000000-0000-4000-8000-000000000101";
const payerId = "10000000-0000-4000-8000-000000000102";
const enrollmentA = "10000000-0000-4000-8000-000000000103";
const enrollmentB = "10000000-0000-4000-8000-000000000104";

function options(
  overrides: Partial<MonthlyInvoiceOptionsResponse> = {}
): MonthlyInvoiceOptionsResponse {
  return {
    organizationId: "10000000-0000-4000-8000-000000000111",
    locationId: "10000000-0000-4000-8000-000000000112",
    servicePeriod: "2026-10",
    servicePeriodStart: "2026-10-01",
    servicePeriodEnd: "2026-10-31",
    timezone: "Europe/Madrid",
    pricingNote: "Tarifa mensual completa; no se prorratea.",
    pricePlans: [],
    families: [
      {
        familyId,
        athleteNames: ["Gimnasta sintética A", "Gimnasta sintética B"],
        payers: [
          {
            familyPayerId: payerId,
            displayName: "Pagador adulto sintético",
            isPrimary: true,
          },
        ],
        enrollments: [
          {
            enrollmentId: enrollmentA,
            athleteId: "10000000-0000-4000-8000-000000000201",
            athleteName: "Gimnasta sintética A",
            status: "active",
            billable: true,
            blockingReasons: [],
            assignedPrice: {
              pricePlanId: "plan-a",
              name: "Tarifa mensual sintética A",
              amountCents: 1500,
              currency: "EUR",
              startsOn: "2026-09-01",
              endsOn: null,
            },
          },
          {
            enrollmentId: enrollmentB,
            athleteId: "10000000-0000-4000-8000-000000000202",
            athleteName: "Gimnasta sintética B",
            status: "active",
            billable: true,
            blockingReasons: [],
            assignedPrice: {
              pricePlanId: "plan-b",
              name: "Tarifa mensual sintética B",
              amountCents: 1200,
              currency: "EUR",
              startsOn: "2026-09-01",
              endsOn: null,
            },
          },
        ],
        lines: [
          {
            enrollmentId: enrollmentA,
            athleteName: "Gimnasta sintética A",
            pricePlanId: "plan-a",
            pricePlanName: "Tarifa mensual sintética A",
            amountCents: 1500,
            currency: "EUR",
          },
          {
            enrollmentId: enrollmentB,
            athleteName: "Gimnasta sintética B",
            pricePlanId: "plan-b",
            pricePlanName: "Tarifa mensual sintética B",
            amountCents: 1200,
            currency: "EUR",
          },
        ],
        totalAmountCents: 2700,
        currency: "EUR",
        blockingReasons: [],
        canIssue: true,
        quoteHash: "synthetic-server-quote-hash",
        existingInvoiceId: null,
        existingInvoiceVoided: false,
      },
    ],
    unassignedEnrollments: [],
    ...overrides,
  };
}

function renderWorkspace(
  props: Partial<React.ComponentProps<typeof OwnerMonthlyInvoiceWorkspace>> = {}
) {
  const handlers = {
    onFamilyChange: vi.fn(),
    onServicePeriodChange: vi.fn(),
    onDueDateChange: vi.fn(),
    onRetry: vi.fn(),
    onAssignTariff: vi.fn(),
    onLinkFamily: vi.fn(),
    onAssignPayer: vi.fn(),
    onIssue: vi.fn(),
  };
  render(
    <OwnerMonthlyInvoiceWorkspace
      state="ready"
      options={options()}
      selectedFamilyId={familyId}
      dueDate="2026-10-31"
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

afterEach(cleanup);

describe("OwnerMonthlyInvoiceWorkspace", () => {
  it("presenta las líneas y el total del servidor, sin seleccionar líneas ni registrar pagos", () => {
    renderWorkspace();

    expect(screen.getByText("Gimnasta sintética A")).toBeVisible();
    expect(screen.getByText("Gimnasta sintética B")).toBeVisible();
    expect(
      screen.getByText("Total de la factura").parentElement
    ).toHaveTextContent(/27,00\s*€/);
    expect(
      screen.getByRole("button", { name: /Emitir factura pendiente · 27,00/ })
    ).toBeDisabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Registrar pago/ })
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quién paga")).toHaveValue("");
    expect(
      screen.queryByRole("group", { name: /¿Emitir/ })
    ).not.toBeInTheDocument();
  });

  it("emite con un clic la familia, pagador, periodo, fecha y quoteHash sin mandar importe ni líneas", async () => {
    const user = userEvent.setup();
    const handlers = renderWorkspace();

    await user.selectOptions(screen.getByLabelText("Quién paga"), payerId);
    await user.click(
      screen.getByRole("button", { name: /Emitir factura pendiente/ })
    );

    expect(handlers.onIssue).toHaveBeenCalledWith({
      organizationId: "10000000-0000-4000-8000-000000000111",
      locationId: "10000000-0000-4000-8000-000000000112",
      familyId,
      familyPayerId: payerId,
      servicePeriod: "2026-10",
      dueDate: "2026-10-31",
      quoteHash: "synthetic-server-quote-hash",
    });
  });

  it("usa canIssue y bloqueo de servidor; los unassigned avisan sin bloquear otras familias", async () => {
    const user = userEvent.setup();
    const handlers = renderWorkspace({
      options: options({
        unassignedEnrollments: [
          {
            enrollmentId: enrollmentA,
            athleteId: "10000000-0000-4000-8000-000000000201",
            athleteName: "Gimnasta sin familia",
            status: "active",
            blockingReasons: ["FAMILY_REQUIRED"],
          },
        ],
      }),
    });
    await user.selectOptions(screen.getByLabelText("Quién paga"), payerId);
    expect(screen.getByText("Inscripciones sin familia")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Emitir factura pendiente/ })
    ).toBeEnabled();
    await user.click(
      screen.getByRole("button", {
        name: /Vincular a una familia a Gimnasta sin familia/,
      })
    );
    expect(handlers.onLinkFamily).toHaveBeenCalledWith(enrollmentA);

    cleanup();
    renderWorkspace({
      options: options({
        families: [
          {
            ...options().families[0],
            canIssue: false,
            blockingReasons: ["PRICE_ASSIGNMENT_REQUIRED"],
          },
        ],
      }),
    });
    expect(
      screen.getByRole("button", { name: /Emitir factura pendiente/ })
    ).toBeDisabled();
    expect(screen.getByText("Falta asignar una tarifa mensual.")).toBeVisible();
  });

  it("ofrece corregir tarifa, familia y pagador de una familia seleccionada", async () => {
    const user = userEvent.setup();
    const handlers = renderWorkspace({
      options: options({
        families: [
          {
            ...options().families[0],
            payers: [],
            enrollments: [
              {
                ...options().families[0].enrollments[0],
                assignedPrice: null,
                blockingReasons: [
                  "PRICE_ASSIGNMENT_REQUIRED",
                  "FAMILY_REQUIRED",
                ],
              },
            ],
            lines: [],
            totalAmountCents: null,
            currency: null,
            blockingReasons: ["FAMILY_PAYER_REQUIRED"],
            canIssue: false,
            quoteHash: null,
          },
        ],
      }),
    });
    await user.click(
      screen.getByRole("button", {
        name: /Asignar tarifa mensual a Gimnasta sintética A/,
      })
    );
    await user.click(
      screen.getByRole("button", {
        name: /Vincular a una familia a Gimnasta sintética A/,
      })
    );
    await user.click(
      screen.getByRole("button", { name: "Asignar un pagador adulto" })
    );
    expect(handlers.onAssignTariff).toHaveBeenCalledWith(enrollmentA);
    expect(handlers.onLinkFamily).toHaveBeenCalledWith(enrollmentA);
    expect(handlers.onAssignPayer).toHaveBeenCalledWith(familyId);
  });

  it("expone carga y permite reintentar errores; muestra actualización de cotización", async () => {
    const user = userEvent.setup();
    const handlers = renderWorkspace({ state: "loading", options: undefined });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Cargando opciones de facturación"
    );

    cleanup();
    const errorHandlers = renderWorkspace({
      state: "error",
      options: undefined,
      errorMessage: "No disponible.",
    });
    expect(screen.getByRole("alert")).toHaveTextContent("No disponible.");
    await user.click(screen.getByRole("button", { name: "Volver a intentar" }));
    expect(errorHandlers.onRetry).toHaveBeenCalledOnce();
    expect(handlers.onRetry).not.toHaveBeenCalled();

    cleanup();
    renderWorkspace({ quoteNeedsReview: true });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "La cuota ha cambiado."
    );
  });
});
