// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerEnrollmentsManager } from "@/components/owner-dashboard/OwnerEnrollmentsManager";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

const organizationId = "10000000-0000-4000-8000-000000000003";
const locationId = "10000000-0000-4000-8000-000000000004";
const classTemplateId = "10000000-0000-4000-8000-000000000006";
const athleteId = "10000000-0000-4000-8000-000000000005";
const enrollmentId = "10000000-0000-4000-8000-000000000007";

function bundle(enrollments: unknown[] = []) {
  return {
    organization: {
      id: organizationId,
      name: "Academia Sintética",
      defaultCurrency: "EUR",
    },
    member: { id: "member", role: "owner", locationScopeMode: "all" },
    locations: [
      { id: locationId, name: "Sede Centro", timezone: "Europe/Madrid" },
    ],
    programs: [
      {
        id: "10000000-0000-4000-8000-000000000008",
        name: "Gimnasia rítmica",
        kind: "gymnastics_sport",
      },
    ],
    classes: [
      {
        id: classTemplateId,
        name: "Iniciación rítmica",
        locationId,
        locationName: "Sede Centro",
        programId: "10000000-0000-4000-8000-000000000008",
        programName: "Gimnasia rítmica",
        programKind: "gymnastics_sport",
        capacity: 12,
        spaceCapacity: null,
        effectiveFrom: "2026-10-13",
        effectiveTo: null,
        occupied: 2,
        availableSeats: 10,
      },
    ],
    enrollments,
    totalsByStatus: { pending: 0, active: 0, paused: 0 },
    total: enrollments.length,
    page: 1,
    pages: 1,
    pageSize: 50,
    selectedLocationId: locationId,
    filterLocationId: null,
    localTodayByLocation: { [locationId]: "2026-10-13" },
  } as never;
}

function enrollment(status = "active") {
  return {
    id: enrollmentId,
    athleteId,
    athleteName: "Luz Sintética",
    givenName: "Luz",
    preferredName: null,
    familyName: "Sintética",
    status,
    startsOn: "2026-10-13",
    endsOn: null,
    version: 1,
    classTemplateId,
    className: "Iniciación rítmica",
    locationId,
    locationName: "Sede Centro",
    programName: "Gimnasia rítmica",
  };
}

describe("OwnerEnrollmentsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
    vi.stubGlobal("crypto", { randomUUID: () => "synthetic-command-id" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          async (_input: RequestInfo | URL, init?: RequestInit) => {
            if (init?.method === "POST") {
              const body = String(init.body);
              const idempotencyKey = new Headers(init.headers).get("idempotency-key");
              const command = JSON.parse(body) as {
                startsOn: string;
                pricePlanId: string | null;
              };
              return new Response(
                JSON.stringify({
                  ok: true,
                  data: {
                    id: enrollmentId,
                    status: "pending",
                    version: 1,
                    startsOn: command.startsOn,
                    pricePlanId: command.pricePlanId,
                    commandReceipt: { body, idempotencyKey },
                  },
                }),
                { status: 201, headers: { "content-type": "application/json" } }
              );
            }
            if (init?.method === "PATCH") {
              return new Response(
                JSON.stringify({
                  ok: true,
                  data: {
                    id: enrollmentId,
                    status: "paused",
                    version: 2,
                    startsOn: "2026-10-13",
                    endsOn: null,
                  },
                }),
                { status: 200, headers: { "content-type": "application/json" } }
              );
            }
            if (String(_input).includes("/owner/price-plans/options")) {
              return new Response(
                JSON.stringify({
                  ok: true,
                  data: {
                    items: [
                      {
                        id: "10000000-0000-4000-8000-000000000009",
                        name: "Tarifa mensual sintética",
                        amountCents: 2700,
                        currency: "EUR",
                        cadence: "monthly",
                      },
                    ],
                    organizationId,
                    locationId,
                  },
                }),
                { status: 200, headers: { "content-type": "application/json" } }
              );
            }
            return new Response(
              JSON.stringify({
                ok: true,
                data: { items: [{ id: athleteId, name: "Luz Sintética" }] },
              }),
              { status: 200, headers: { "content-type": "application/json" } }
            );
          }
        )
    );
  });

  it("crea una inscripción pendiente en un formulario y avisa que no cobra", async () => {
    const user = userEvent.setup();
    render(<OwnerEnrollmentsManager bundle={bundle()} selectedStatus="all" />);
    expect(screen.getByRole("heading", { name: "Inscripciones" })).toBeTruthy();
    expect(screen.getByText(/No crea una cuota ni inicia cobros/)).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Clase"), classTemplateId);
    await user.type(screen.getByLabelText("Gimnasta"), "Luz");
    const candidate = await screen.findByRole("button", {
      name: "Luz Sintética",
    });
    await user.click(candidate);

    const submit = screen.getByRole("button", {
      name: "Registrar inscripción pendiente",
    });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await waitFor(() =>
      expect(
        vi.mocked(fetch).mock.calls.some(
          ([url, init]) =>
            String(url) === "/api/v1/owner/enrollments" &&
            init?.method === "POST"
        )
      ).toBe(true)
    );
    const createCall = vi
      .mocked(fetch)
      .mock.calls.find(([, init]) => init?.method === "POST");
    expect(createCall?.[0]).toBe("/api/v1/owner/enrollments");
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      organizationId,
      locationId,
      athleteId,
      classTemplateId,
      startsOn: "2026-10-13",
      pricePlanId: "10000000-0000-4000-8000-000000000009",
    });
    const successStatus = await screen.findByText(
      "Inscripción registrada. Consulta el estado actualizado en el listado. Este envío no genera ningún cobro."
    );
    expect(successStatus).toHaveAttribute("role", "status");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("muestra la lista antes del resumen para priorizar la tarea", () => {
    render(<OwnerEnrollmentsManager bundle={bundle()} selectedStatus="all" />);

    const list = screen.getByRole("region", {
      name: "Inscripciones de la academia",
    });
    const summary = screen.getByRole("region", {
      name: "Resumen de inscripciones",
    });

    expect(
      list.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("pausa una inscripción con su versión y fecha local", async () => {
    render(
      <OwnerEnrollmentsManager
        bundle={bundle([enrollment()])}
        selectedStatus="all"
      />
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /^Pausar inscripción de Luz Sintética/,
      })
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/owner/enrollments/" + enrollmentId);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      organizationId,
      expectedVersion: 1,
      toStatus: "paused",
      effectiveOn: "2026-10-13",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Operación confirmada. Consulta el estado actualizado en el listado."
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("no ofrece activar antes de la fecha local de inicio", () => {
    render(
      <OwnerEnrollmentsManager
        bundle={bundle([{ ...enrollment("pending"), startsOn: "2026-10-20" }])}
        selectedStatus="all"
      />
    );

    expect(screen.queryByRole("button", { name: "Activar" })).toBeNull();
    expect(screen.getByText(/Podrás activarla ese día/)).toBeTruthy();
  });

  it("pide confirmación antes de finalizar una inscripción", async () => {
    render(
      <OwnerEnrollmentsManager
        bundle={bundle([enrollment("active")])}
        selectedStatus="all"
      />
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /^Finalizar inscripción de Luz Sintética/,
      })
    );

    const confirmation = screen.getByRole("group", {
      name: /Confirmar finalización de/,
    });
    fireEvent.click(
      within(confirmation).getByRole("button", {
        name: /Confirmar finalización de/,
      })
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/owner/enrollments/" + enrollmentId);
    expect(JSON.parse(String(init.body))).toMatchObject({
      organizationId,
      expectedVersion: 1,
      toStatus: "completed",
      effectiveOn: "2026-10-13",
    });
  });

  it("exige confirmación visible antes de dar de baja", () => {
    render(
      <OwnerEnrollmentsManager
        bundle={bundle([enrollment("active")])}
        selectedStatus="all"
      />
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /^Dar de baja inscripción de Luz Sintética/,
      })
    );

    const confirmation = screen.getByRole("group", {
      name: /Confirmar baja de/,
    });
    expect(
      within(confirmation).getByRole("button", { name: /Confirmar baja de/ })
    ).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("mantiene el formulario de ejemplo en modo solo lectura", () => {
    render(
      <OwnerEnrollmentsManager
        bundle={bundle([enrollment()])}
        selectedStatus="all"
        previewMode
        previewCreateForm
      />
    );
    const form = screen.getByRole("form", { name: "Crear inscripción" });

    expect(
      screen.getByRole("button", { name: "Solo vista de ejemplo" })
    ).toBeDisabled();
    expect(screen.getByLabelText("Sede")).toBeDisabled();
    fireEvent.submit(form);
    expect(fetch).not.toHaveBeenCalled();
  });
});
