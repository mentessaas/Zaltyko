// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerMonthlyInvoicesManager } from "@/components/owner-dashboard/OwnerMonthlyInvoicesManager";
import type { MonthlyInvoiceOptionsResponse } from "@/components/owner-dashboard/OwnerMonthlyInvoiceWorkspace";

const organizationId = "10000000-0000-4000-8000-000000000111";
const locationId = "10000000-0000-4000-8000-000000000112";
const familyId = "10000000-0000-4000-8000-000000000101";
const payerId = "10000000-0000-4000-8000-000000000102";
const enrollmentId = "10000000-0000-4000-8000-000000000103";
const athleteId = "10000000-0000-4000-8000-000000000201";

function monthlyOptions(
  overrides: Partial<MonthlyInvoiceOptionsResponse> = {}
): MonthlyInvoiceOptionsResponse {
  return {
    organizationId,
    locationId,
    servicePeriod: "2026-10",
    servicePeriodStart: "2026-10-01",
    servicePeriodEnd: "2026-10-31",
    timezone: "Europe/Madrid",
    pricingNote: "Sin prorrateo.",
    pricePlans: [],
    families: [
      {
        familyId,
        athleteNames: ["Gimnasta sintética"],
        payers: [
          {
            familyPayerId: payerId,
            displayName: "Pagador sintético",
            isPrimary: true,
          },
        ],
        enrollments: [
          {
            enrollmentId,
            athleteId,
            athleteName: "Gimnasta sintética",
            status: "active",
            billable: true,
            blockingReasons: [],
            assignedPrice: {
              pricePlanId: "price-plan-id",
              name: "Tarifa sintética",
              amountCents: 2700,
              currency: "EUR",
              startsOn: "2026-10-01",
              endsOn: null,
            },
          },
        ],
        lines: [
          {
            enrollmentId,
            athleteName: "Gimnasta sintética",
            pricePlanId: "price-plan-id",
            pricePlanName: "Tarifa sintética",
            amountCents: 2700,
            currency: "EUR",
          },
        ],
        totalAmountCents: 2700,
        currency: "EUR",
        blockingReasons: [],
        canIssue: true,
        quoteHash: "quote-synthetic",
        existingInvoiceId: null,
        existingInvoiceVoided: false,
      },
    ],
    unassignedEnrollments: [],
    ...overrides,
  };
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OwnerMonthlyInvoicesManager", () => {
  let currentOptions: MonthlyInvoiceOptionsResponse;

  beforeEach(() => {
    currentOptions = monthlyOptions();
    vi.stubGlobal("crypto", { randomUUID: () => "synthetic-idempotency-key" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("monthly-invoices/options")) {
          return response(currentOptions);
        }
        if (url.includes("price-plans/options")) {
          return response({
            items: [
              {
                id: "price-plan-id",
                name: "Tarifa sintética",
                amountCents: 2700,
                currency: "EUR",
                cadence: "monthly",
              },
            ],
          });
        }
        if (url.includes("families/options")) {
          return response({
            families: [
              {
                familyId,
                athletes: [{ athleteId, athleteName: "Gimnasta sintética" }],
                payers: [
                  {
                    familyPayerId: payerId,
                    displayName: "Pagador sintético",
                    isPrimary: true,
                  },
                ],
              },
            ],
          });
        }
        if (url.includes("/price-plan")) return response({ id: enrollmentId });
        if (url.includes("families/associations"))
          return response(
            {
              familyId,
              familyPayerId: payerId,
              guardianId: "guardian-synthetic",
            },
            201
          );
        if (url.includes("monthly-invoices/issue"))
          return response(
            {
              invoiceId: "invoice-synthetic",
              status: "issued",
              totalAmountCents: 2700,
              currency: "EUR",
              servicePeriod: "2026-10",
              dueDate: "2026-10-31",
              dueAt: "2026-11-01T00:00:00Z",
              lines: [],
            },
            201
          );
        throw new Error(`Unexpected request ${init?.method ?? "GET"} ${url}`);
      })
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function renderManager() {
    render(
      <OwnerMonthlyInvoicesManager
        organizationId={organizationId}
        organizationName="Academia sintética"
        locations={[{ id: locationId, name: "Sede sintética" }]}
        initialLocationId={locationId}
        initialServicePeriod="2026-10"
      />
    );
  }

  it("asigna una tarifa desde el catálogo con PATCH y recarga el presupuesto", async () => {
    currentOptions = monthlyOptions({
      families: [
        {
          ...monthlyOptions().families[0],
          lines: [],
          totalAmountCents: null,
          currency: null,
          blockingReasons: ["PRICE_ASSIGNMENT_REQUIRED"],
          canIssue: false,
          quoteHash: null,
          enrollments: [
            {
              ...monthlyOptions().families[0].enrollments[0],
              assignedPrice: null,
              blockingReasons: ["PRICE_ASSIGNMENT_REQUIRED"],
            },
          ],
        },
      ],
    });
    const user = userEvent.setup();
    renderManager();

    await user.selectOptions(await screen.findByLabelText("Familia"), familyId);

    await user.click(
      await screen.findByRole("button", {
        name: "Asignar tarifa mensual a Gimnasta sintética",
      })
    );
    await screen.findByRole("heading", {
      name: "Asignar tarifa a Gimnasta sintética",
    });
    await user.click(screen.getByRole("button", { name: "Guardar tarifa" }));

    await waitFor(() => {
      const calls = vi.mocked(fetch).mock.calls;
      expect(
        calls.some((call) =>
          String(call[0]).includes(`/enrollments/${enrollmentId}/price-plan`)
        )
      ).toBe(true);
    });
    const patchCall = vi
      .mocked(fetch)
      .mock.calls.find((call) =>
        String(call[0]).includes(`/enrollments/${enrollmentId}/price-plan`)
      );
    expect(patchCall?.[1]?.method).toBe("PATCH");
    expect(patchCall?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "owner-price-assignment:synthetic-idempotency-key",
    });
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      organizationId,
      locationId,
      pricePlanId: "price-plan-id",
      startsOn: "2026-10-01",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Tarifa mensual asignada"
    );
  });

  it("crea una familia y vincula explícitamente una persona adulta pagadora", async () => {
    currentOptions = monthlyOptions({
      families: [],
      unassignedEnrollments: [
        {
          enrollmentId,
          athleteId,
          athleteName: "Gimnasta sin familia",
          status: "active",
          blockingReasons: ["FAMILY_REQUIRED"],
        },
      ],
    });
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "Vincular a una familia a Gimnasta sin familia",
      })
    );
    await screen.findByRole("heading", {
      name: /Vincular a Gimnasta sin familia/,
    });
    await user.type(
      screen.getByLabelText("Nombre de la persona adulta"),
      "Persona"
    );
    await user.type(screen.getByLabelText("Apellidos"), "Adulta sintética");
    await user.click(screen.getByRole("button", { name: "Guardar vínculo" }));

    const associationCall = await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find((item) =>
          String(item[0]).includes("families/associations")
        );
      expect(call).toBeDefined();
      return call;
    });
    expect(associationCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(associationCall?.[1]?.body))).toEqual({
      organizationId,
      locationId,
      athleteIds: [athleteId],
      payer: {
        givenName: "Persona",
        familyName: "Adulta sintética",
        relationship: "parent",
      },
      effectiveFrom: "2026-10-01",
    });
    expect(associationCall?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "owner-family-association:synthetic-idempotency-key",
    });
  });

  it("permite seleccionar una persona pagadora existente al vincular una gimnasta", async () => {
    currentOptions = monthlyOptions({
      families: [],
      unassignedEnrollments: [
        {
          enrollmentId,
          athleteId,
          athleteName: "Gimnasta sin familia",
          status: "active",
          blockingReasons: ["FAMILY_REQUIRED"],
        },
      ],
    });
    const user = userEvent.setup();
    renderManager();
    await user.click(
      await screen.findByRole("button", {
        name: "Vincular a una familia a Gimnasta sin familia",
      })
    );
    await screen.findByRole("heading", {
      name: /Vincular a Gimnasta sin familia/,
    });
    const familySelects = screen.getAllByLabelText("Familia");
    await user.selectOptions(familySelects[1], familyId);
    await user.selectOptions(
      screen.getByLabelText("Persona pagadora"),
      payerId
    );
    await user.click(screen.getByRole("button", { name: "Guardar vínculo" }));

    const associationCall = await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find((item) =>
          String(item[0]).includes("families/associations")
        );
      expect(call).toBeDefined();
      return call;
    });
    expect(JSON.parse(String(associationCall?.[1]?.body))).toEqual({
      organizationId,
      locationId,
      familyId,
      athleteIds: [athleteId],
      payer: { familyPayerId: payerId },
      effectiveFrom: "2026-10-01",
    });
  });

  it("emite con el total del servidor y conserva el copy cuando el DTO no confirma chargeStatus", async () => {
    const user = userEvent.setup();
    renderManager();
    await user.selectOptions(await screen.findByLabelText("Familia"), familyId);
    await user.selectOptions(screen.getByLabelText("Quién paga"), payerId);
    fireEvent.change(screen.getByLabelText("Fecha de vencimiento"), {
      target: { value: "2026-10-31" },
    });
    await user.click(
      screen.getByRole("button", { name: /Emitir factura pendiente/ })
    );

    const issueCall = await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find((item) =>
          String(item[0]).includes("monthly-invoices/issue")
        );
      expect(call).toBeDefined();
      return call;
    });
    expect(issueCall?.[1]?.method).toBe("POST");
    expect(issueCall?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "owner-monthly-invoice:synthetic-idempotency-key",
    });
    const body = JSON.parse(String(issueCall?.[1]?.body));
    expect(body).toEqual({
      organizationId,
      locationId,
      familyId,
      familyPayerId: payerId,
      servicePeriod: "2026-10",
      dueDate: "2026-10-31",
      quoteHash: "quote-synthetic",
    });
    expect(body).not.toHaveProperty("amountCents");
    expect(body).not.toHaveProperty("enrollmentIds");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Factura emitida; no se ha registrado ni iniciado un pago."
    );
  });
});
