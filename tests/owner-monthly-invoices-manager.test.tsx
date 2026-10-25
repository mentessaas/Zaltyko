// @vitest-environment jsdom
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerMonthlyInvoicesManager } from "@/components/owner-dashboard/OwnerMonthlyInvoicesManager";
import type { MonthlyInvoiceOptionsResponse } from "@/components/owner-dashboard/OwnerMonthlyInvoiceWorkspace";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const organizationId = "10000000-0000-4000-8000-000000000111";
const locationId = "10000000-0000-4000-8000-000000000112";
const familyId = "10000000-0000-4000-8000-000000000101";
const payerId = "10000000-0000-4000-8000-000000000102";
const enrollmentId = "10000000-0000-4000-8000-000000000103";
const athleteId = "10000000-0000-4000-8000-000000000201";
const createdFamilyId = "10000000-0000-4000-8000-000000000301";
const createdPayerId = "10000000-0000-4000-8000-000000000302";
const classTemplateId = "10000000-0000-4000-8000-000000000303";
const pricePlanId = "10000000-0000-4000-8000-000000000304";
const createdPricePlanId = "10000000-0000-4000-8000-000000000305";
const invoiceId = "10000000-0000-4000-8000-000000000306";

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
              pricePlanId,
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
            athleteId,
            athleteName: "Gimnasta sintética",
            pricePlanId,
            pricePlanName: "Tarifa sintética",
            amountCents: 2700,
            currency: "EUR",
            coveredEnrollments: [
              {
                enrollmentId,
                classTemplateId: "10000000-0000-4000-8000-000000000301",
                className: "Grupo sintético",
                assignmentId: "10000000-0000-4000-8000-000000000401",
              },
            ],
          },
        ],
        conflicts: [],
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

function optionsWithUnassignedTariff() {
  const family = monthlyOptions().families[0];
  return monthlyOptions({
    families: [
      {
        ...family,
        lines: [],
        totalAmountCents: null,
        currency: null,
        blockingReasons: ["PRICE_ASSIGNMENT_REQUIRED"],
        canIssue: false,
        quoteHash: null,
        enrollments: [
          {
            ...family.enrollments[0],
            assignedPrice: null,
            blockingReasons: ["PRICE_ASSIGNMENT_REQUIRED"],
          },
        ],
      },
    ],
  });
}

function optionsWithNewlyLinkedFamily(
  servicePeriod = "2026-10"
): MonthlyInvoiceOptionsResponse {
  const family = monthlyOptions().families[0];
  if (!family) throw new Error("Missing synthetic family fixture.");
  return monthlyOptions({
    servicePeriod,
    servicePeriodStart: `${servicePeriod}-01`,
    servicePeriodEnd: servicePeriod === "2026-11" ? "2026-11-30" : "2026-10-31",
    families: [
      {
        ...family,
        familyId: createdFamilyId,
        athleteNames: ["Gimnasta sin familia"],
        payers: [
          {
            familyPayerId: createdPayerId,
            displayName: "Persona adulta sintética",
            isPrimary: true,
          },
        ],
        enrollments: [
          {
            ...family.enrollments[0]!,
            enrollmentId,
            athleteId,
            athleteName: "Gimnasta sin familia",
            assignedPrice: null,
            blockingReasons: ["PRICE_ASSIGNMENT_REQUIRED"],
          },
        ],
        lines: [],
        totalAmountCents: null,
        currency: null,
        blockingReasons: ["PRICE_ASSIGNMENT_REQUIRED"],
        canIssue: false,
        quoteHash: null,
      },
    ],
    unassignedEnrollments: [],
  });
}

function response(data: unknown, status = 200) {
  const body = status >= 200 && status < 300 ? { ok: true, data } : data;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OwnerMonthlyInvoicesManager", () => {
  let currentOptions: MonthlyInvoiceOptionsResponse;
  let currentPricePlans: Array<{
    id: string;
    name: string;
    amountCents: number;
    currency: string;
    cadence: string;
  }>;
  let failPricePlanOptionsOnce: boolean;
  let familyAssociationResponse: unknown;
  let familyOptionsAfterAssociation: MonthlyInvoiceOptionsResponse | null;
  let failFamilyAssociationOnce: boolean;
  let deferFamilyAssociationResponse: (() => Promise<Response>) | null;
  let deferNextMonthlyOptions: (() => Promise<Response>) | null;

  beforeEach(() => {
    publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
    currentOptions = monthlyOptions();
    currentPricePlans = [
      {
        id: pricePlanId,
        name: "Tarifa sintética",
        amountCents: 2700,
        currency: "EUR",
        cadence: "monthly",
      },
    ];
    failPricePlanOptionsOnce = false;
    familyAssociationResponse = {
      familyId,
      familyPayerId: payerId,
      guardianId: "10000000-0000-4000-8000-000000000307",
    };
    familyOptionsAfterAssociation = null;
    failFamilyAssociationOnce = false;
    deferFamilyAssociationResponse = null;
    deferNextMonthlyOptions = null;
    vi.stubGlobal("crypto", { randomUUID: () => "10000000-0000-4000-8000-000000000911" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("monthly-invoices/options")) {
          if (deferNextMonthlyOptions) {
            const deferred = deferNextMonthlyOptions;
            deferNextMonthlyOptions = null;
            return deferred();
          }
          return response(currentOptions);
        }
        if (url.includes("price-plans/options")) {
          if (failPricePlanOptionsOnce) {
            failPricePlanOptionsOnce = false;
            return response({ detail: "Error temporal" }, 503);
          }
          return response({
            organizationId,
            locationId,
            items: currentPricePlans,
            classTemplates: [
              {
                id: classTemplateId,
                name: "Grupo sintético",
                effectiveFrom: "2026-09-01",
                effectiveTo: null,
              },
            ],
            classTemplatesHasMore: false,
          });
        }
        if (url.includes("/billing/price-plans")) {
          const body = JSON.parse(String(init?.body)) as {
            organizationId: string;
            locationId: string;
            name: string;
            amountCents: number;
          };
          const createdPlan = {
            id: createdPricePlanId,
            name: body.name,
            amountCents: body.amountCents,
            currency: "EUR",
            cadence: "monthly",
          };
          currentPricePlans = [createdPlan];
          return response(createdPlan, 201);
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
        if (url.includes("/price-plan")) {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return response({ id: enrollmentId, enrollmentId, ...body });
        }
        if (url.includes("families/associations")) {
          if (failFamilyAssociationOnce) {
            failFamilyAssociationOnce = false;
            return new Response(
              JSON.stringify({ detail: "Error temporal sintético" }),
              {
                status: 503,
                headers: { "content-type": "application/json" },
              }
            );
          }
          if (familyOptionsAfterAssociation) {
            currentOptions = familyOptionsAfterAssociation;
          }
          if (deferFamilyAssociationResponse) {
            const deferred = deferFamilyAssociationResponse;
            deferFamilyAssociationResponse = null;
            return deferred();
          }
          return response(familyAssociationResponse, 201);
        }
        if (url.includes("monthly-invoices/issue"))
          return response(
            {
              invoiceId,
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
        defaultCurrency="EUR"
        locations={[{ id: locationId, name: "Sede sintética" }]}
        initialLocationId={locationId}
        initialServicePeriod="2026-10"
      />
    );
  }

  async function findPrimaryFamilySelect() {
    const selects = await screen.findAllByLabelText("Familia");
    const select = selects[0];
    if (!select) throw new Error("No se encontró el selector principal de familia.");
    return select;
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

    await user.selectOptions(await findPrimaryFamilySelect(), familyId);

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
      "Idempotency-Key": "owner-price-assignment:10000000-0000-4000-8000-000000000911",
    });
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      organizationId,
      locationId,
      pricePlanId,
      startsOn: "2026-10-01",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Tarifa mensual asignada"
    );
  });

  it("crea una tarifa mensual desde el catálogo vacío y exige confirmar su asignación", async () => {
    currentPricePlans = [];
    currentOptions = optionsWithUnassignedTariff();
    const user = userEvent.setup();
    renderManager();

    await user.selectOptions(await findPrimaryFamilySelect(), familyId);
    await user.click(
      await screen.findByRole("button", {
        name: "Asignar tarifa mensual a Gimnasta sintética",
      })
    );
    await screen.findByRole("heading", {
      name: "Asignar tarifa a Gimnasta sintética",
    });
    expect(
      await screen.findByText(/No hay tarifas mensuales para esta sede/)
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nombre de la tarifa"), "Cuota base");
    await user.type(screen.getByLabelText("Importe mensual (EUR)"), "32,50");
    await user.click(screen.getByRole("checkbox", { name: "Grupo sintético" }));
    await user.click(
      screen.getByRole("button", { name: "Crear tarifa mensual" })
    );

    const createCall = await waitFor(() => {
      const call = vi
        .mocked(fetch)
        .mock.calls.find((entry) =>
          String(entry[0]).includes("/billing/price-plans")
        );
      expect(call).toBeDefined();
      return call!;
    });
    expect(createCall[1]?.method).toBe("POST");
    expect(createCall[1]?.headers).toMatchObject({
      "Idempotency-Key": "owner-monthly-price-plan:10000000-0000-4000-8000-000000000911",
    });
    expect(JSON.parse(String(createCall[1]?.body))).toEqual({
      organizationId,
      locationId,
      name: "Cuota base",
      amountCents: 3250,
      coverage: {
        classTemplateIds: [classTemplateId],
        startsOn: "2026-10-01",
        endsOn: null,
      },
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      /cobertura para 1 clase.*confirma aparte su asignación/
    );
    expect(screen.getByLabelText("Tarifa mensual")).toHaveValue(
      createdPricePlanId
    );
    expect(
      screen.getByRole("button", { name: "Guardar tarifa" })
    ).toBeEnabled();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some((entry) =>
          String(entry[0]).includes(`/enrollments/${enrollmentId}/price-plan`)
        )
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: "Guardar tarifa" }));
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some((entry) =>
            String(entry[0]).includes(`/enrollments/${enrollmentId}/price-plan`)
          )
      ).toBe(true)
    );
  });

  it("distingue el error de carga de un catálogo vacío y permite reintentar", async () => {
    failPricePlanOptionsOnce = true;
    currentPricePlans = [];
    currentOptions = optionsWithUnassignedTariff();
    const user = userEvent.setup();
    renderManager();

    await user.selectOptions(await findPrimaryFamilySelect(), familyId);
    await user.click(
      await screen.findByRole("button", {
        name: "Asignar tarifa mensual a Gimnasta sintética",
      })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Error temporal"
    );
    const retry = await screen.findByRole("button", {
      name: "Reintentar cargar tarifas",
    });
    expect(
      screen.queryByRole("button", { name: "Crear tarifa mensual" })
    ).not.toBeInTheDocument();

    await user.click(retry);
    const createButton = await screen.findByRole("button", {
      name: "Crear tarifa mensual",
    });
    expect(createButton).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Grupo sintético" }));
    expect(createButton).toBeEnabled();
  });

  it("rechaza importes fuera del límite PostgreSQL y nombres de más de 100 caracteres", async () => {
    currentPricePlans = [];
    currentOptions = optionsWithUnassignedTariff();
    const user = userEvent.setup();
    renderManager();

    await user.selectOptions(await findPrimaryFamilySelect(), familyId);
    await user.click(
      await screen.findByRole("button", {
        name: "Asignar tarifa mensual a Gimnasta sintética",
      })
    );
    const nameInput = await screen.findByLabelText("Nombre de la tarifa");
    const amountInput = screen.getByLabelText("Importe mensual (EUR)");
    expect(nameInput).toHaveAttribute("maxLength", "100");

    await user.type(nameInput, "Cuota base");
    await user.type(amountInput, "21474836,48");
    await user.click(screen.getByRole("checkbox", { name: "Grupo sintético" }));
    await user.click(
      screen.getByRole("button", { name: "Crear tarifa mensual" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /importe mensual válido/
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some((entry) =>
          String(entry[0]).includes("/billing/price-plans")
        )
    ).toBe(false);

    await user.clear(amountInput);
    await user.type(amountInput, "12,00");
    fireEvent.change(nameInput, { target: { value: "a".repeat(101) } });
    await user.click(
      screen.getByRole("button", { name: "Crear tarifa mensual" })
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /nombre de hasta 100 caracteres/
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some((entry) =>
          String(entry[0]).includes("/billing/price-plans")
        )
    ).toBe(false);
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
      "Idempotency-Key": "owner-family-association:10000000-0000-4000-8000-000000000911",
    });
  });

  it("selecciona la familia devuelta por el servidor y deja visible su tarifa sin elegir pagador", async () => {
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
    familyAssociationResponse = {
      familyId: createdFamilyId,
      familyPayerId: createdPayerId,
    };
    familyOptionsAfterAssociation = optionsWithNewlyLinkedFamily();
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "Vincular a una familia a Gimnasta sin familia",
      })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Guardar vínculo" })
      ).toBeEnabled()
    );
    await user.type(
      screen.getByLabelText("Nombre de la persona adulta"),
      "Persona"
    );
    await user.type(screen.getByLabelText("Apellidos"), "Adulta sintética");
    await user.click(screen.getByRole("button", { name: "Guardar vínculo" }));

    await waitFor(() => {
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some((call) =>
            String(call[0]).includes("families/associations")
          )
      ).toBe(true);
    });
    expect(screen.getAllByLabelText("Familia")[0]).toHaveValue(createdFamilyId);
    expect(screen.getByLabelText("Quién paga")).toHaveValue("");
    await user.click(
      await screen.findByRole("button", {
        name: "Asignar tarifa mensual a Gimnasta sin familia",
      })
    );
    expect(await screen.findByLabelText("Tarifa mensual")).toHaveValue(
      pricePlanId
    );
    expect(screen.getByLabelText("Quién paga")).toHaveValue("");
  });

  it(
    "mantiene incierta la asociación si la respuesta no confirma familyId",
    async () => {
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
      familyAssociationResponse = { familyPayerId: createdPayerId };
      const user = userEvent.setup();
      renderManager();

      await user.click(
        await screen.findByRole("button", {
          name: "Vincular a una familia a Gimnasta sin familia",
        })
      );
      await user.type(
        screen.getByLabelText("Nombre de la persona adulta"),
        "Persona"
      );
      await user.type(
        screen.getByLabelText("Apellidos"),
        "Adulta sintética"
      );
      await user.click(screen.getByRole("button", { name: "Guardar vínculo" }));

      expect(
        await screen.findByText(/La respuesta no confirma la relación familiar\./)
      ).toHaveAttribute("role", "alert");
      expect(
        screen.queryByText("Familia y persona pagadora vinculadas.", {
          exact: true,
        })
      ).not.toBeInTheDocument();
      expect(screen.getAllByLabelText("Familia")[0]).toHaveValue("");
      expect(screen.getByLabelText("Quién paga")).toHaveValue("");
    }
  );

  it(
    "no autoselecciona una familia confirmada que no está en las opciones actuales",
    async () => {
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
      familyAssociationResponse = {
        familyId: "10000000-0000-4000-8000-000000000399",
        familyPayerId: createdPayerId,
      };
      familyOptionsAfterAssociation = optionsWithNewlyLinkedFamily();
      const user = userEvent.setup();
      renderManager();

      await user.click(
        await screen.findByRole("button", {
          name: "Vincular a una familia a Gimnasta sin familia",
        })
      );
      await user.type(
        screen.getByLabelText("Nombre de la persona adulta"),
        "Persona"
      );
      await user.type(
        screen.getByLabelText("Apellidos"),
        "Adulta sintética"
      );
      await user.click(screen.getByRole("button", { name: "Guardar vínculo" }));

      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent(
          "Familia y persona pagadora vinculadas"
        )
      );
      expect(screen.getAllByLabelText("Familia")[0]).toHaveValue("");
      expect(screen.getByLabelText("Quién paga")).toHaveValue("");
    }
  );

  it.each([
    ["academia", { organizationId: "10000000-0000-4000-8000-000000000999" }],
    ["sede", { locationId: "10000000-0000-4000-8000-000000000999" }],
    ["mes", { servicePeriod: "2026-11" }],
  ])(
    "falla de forma cerrada si la respuesta pertenece a otro %s",
    async (_scope, mismatchedScope) => {
      currentOptions = monthlyOptions({
        ...mismatchedScope,
        families: [
          {
            ...monthlyOptions().families[0]!,
            familyId: createdFamilyId,
          },
        ],
      });
      renderManager();

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "La respuesta no corresponde a la academia, sede y mes solicitados. Vuelve a intentarlo."
      );
      expect(screen.queryByLabelText("Familia")).not.toBeInTheDocument();
    }
  );

  it("ignora una recarga antigua tras cambiar el periodo y conserva las opciones actuales", async () => {
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
    familyAssociationResponse = {
      familyId: createdFamilyId,
      familyPayerId: createdPayerId,
    };
    familyOptionsAfterAssociation = optionsWithNewlyLinkedFamily();
    let resolveOldOptions: ((result: Response) => void) | undefined;
    const novemberOptions = monthlyOptions({
      servicePeriod: "2026-11",
      servicePeriodStart: "2026-11-01",
      servicePeriodEnd: "2026-11-30",
    });
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "Vincular a una familia a Gimnasta sin familia",
      })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Guardar vínculo" })
      ).toBeEnabled()
    );
    await user.type(
      screen.getByLabelText("Nombre de la persona adulta"),
      "Persona"
    );
    await user.type(screen.getByLabelText("Apellidos"), "Adulta sintética");
    deferNextMonthlyOptions = () =>
      new Promise<Response>((resolve) => {
        resolveOldOptions = resolve;
      });
    await user.click(screen.getByRole("button", { name: "Guardar vínculo" }));

    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter((call) =>
            String(call[0]).includes("monthly-invoices/options")
          )
      ).toHaveLength(2)
    );

    currentOptions = novemberOptions;
    fireEvent.change(document.querySelector('input[type="month"]')!, {
      target: { value: "2026-11" },
    });
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some((call) =>
            String(call[0]).includes("servicePeriod=2026-11")
          )
      ).toBe(true)
    );
    await waitFor(() =>
      expect(document.querySelector('input[type="month"]')).toHaveValue(
        "2026-11"
      )
    );
    expect(screen.getAllByLabelText("Familia")[0]).toHaveValue("");

    expect(resolveOldOptions).toBeDefined();
    await act(async () => {
      resolveOldOptions?.(response(optionsWithNewlyLinkedFamily()));
    });

    expect(document.querySelector('input[type="month"]')).toHaveValue(
      "2026-11"
    );
    expect(screen.getAllByLabelText("Familia")[0]).toHaveValue("");
    expect(
      screen.queryByRole("button", {
        name: "Asignar tarifa mensual a Gimnasta sin familia",
      })
    ).not.toBeInTheDocument();
  });

  it("usa el periodo actual cuando la asociación responde después del cambio de mes", async () => {
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
    familyAssociationResponse = {
      familyId: createdFamilyId,
      familyPayerId: createdPayerId,
    };
    const novemberOptions = monthlyOptions({
      servicePeriod: "2026-11",
      servicePeriodStart: "2026-11-01",
      servicePeriodEnd: "2026-11-30",
    });
    familyOptionsAfterAssociation = novemberOptions;
    let resolveAssociation: ((result: Response) => void) | undefined;
    deferFamilyAssociationResponse = () =>
      new Promise<Response>((resolve) => {
        resolveAssociation = resolve;
      });
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "Vincular a una familia a Gimnasta sin familia",
      })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Guardar vínculo" })
      ).toBeEnabled()
    );
    await user.type(
      screen.getByLabelText("Nombre de la persona adulta"),
      "Persona"
    );
    await user.type(screen.getByLabelText("Apellidos"), "Adulta sintética");
    await user.click(screen.getByRole("button", { name: "Guardar vínculo" }));
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some((call) =>
            String(call[0]).includes("families/associations")
          )
      ).toBe(true)
    );

    fireEvent.change(document.querySelector('input[type="month"]')!, {
      target: { value: "2026-11" },
    });
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some((call) =>
            String(call[0]).includes("servicePeriod=2026-11")
          )
      ).toBe(true)
    );
    await waitFor(() =>
      expect(document.querySelector('input[type="month"]')).toHaveValue(
        "2026-11"
      )
    );

    expect(resolveAssociation).toBeDefined();
    await act(async () => {
      resolveAssociation?.(response(familyAssociationResponse, 201));
    });

    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter((call) =>
            String(call[0]).includes("monthly-invoices/options")
          )
          .at(-1)?.[0]
      ).toContain("servicePeriod=2026-11")
    );
    expect(screen.getAllByLabelText("Familia")[0]).toHaveValue("");
    expect(screen.getByLabelText("Quién paga")).toHaveValue("");
  });

  it("conserva la misma clave y el mismo cuerpo al reintentar una asociación incierta", async () => {
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
    familyAssociationResponse = {
      familyId: createdFamilyId,
      familyPayerId: createdPayerId,
    };
    familyOptionsAfterAssociation = optionsWithNewlyLinkedFamily();
    failFamilyAssociationOnce = true;
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("10000000-0000-4000-8000-000000000912")
        .mockReturnValueOnce("10000000-0000-4000-8000-000000000913"),
    });
    const user = userEvent.setup();
    renderManager();

    await user.click(
      await screen.findByRole("button", {
        name: "Vincular a una familia a Gimnasta sin familia",
      })
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Guardar vínculo" })
      ).toBeEnabled()
    );
    await user.type(
      screen.getByLabelText("Nombre de la persona adulta"),
      "Persona"
    );
    await user.type(screen.getByLabelText("Apellidos"), "Adulta sintética");
    await user.click(screen.getByRole("button", { name: "Guardar vínculo" }));
    expect(
      await screen.findByText("Error temporal sintético", { exact: true })
    ).toHaveAttribute("role", "alert");
    await user.click(
      screen.getByRole("button", {
        name: "Reintentar la misma operación",
      })
    );

    await waitFor(() => {
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter((call) =>
            String(call[0]).includes("families/associations")
          )
      ).toHaveLength(2);
    });
    const associationCalls = vi
      .mocked(fetch)
      .mock.calls.filter((call) =>
        String(call[0]).includes("families/associations")
      );
    expect(associationCalls[0]?.[1]?.headers).toEqual(
      associationCalls[1]?.[1]?.headers
    );
    expect(associationCalls[0]?.[1]?.body).toBe(associationCalls[1]?.[1]?.body);
    expect(associationCalls[0]?.[1]?.headers).toMatchObject({
      "Idempotency-Key":
        "owner-family-association:10000000-0000-4000-8000-000000000912",
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
    await user.selectOptions(await findPrimaryFamilySelect(), familyId);
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
      "Idempotency-Key": "owner-monthly-invoice:10000000-0000-4000-8000-000000000911",
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
