// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerClassesManager } from "@/components/owner-dashboard/OwnerClassesManager";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

const organizationId = "10000000-0000-4000-8000-000000000003";
const locationId = "10000000-0000-4000-8000-000000000004";
const programId = "10000000-0000-4000-8000-000000000005";

function bundle(classes: unknown[] = []) {
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
      { id: programId, name: "Gimnasia rítmica", kind: "gymnastics_sport" },
    ],
    classes,
    selectedLocationId: locationId,
    localTodayByLocation: { [locationId]: "2026-10-13" },
  } as never;
}

describe("OwnerClassesManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", { randomUUID: () => "synthetic-command-id" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              id: "10000000-0000-4000-8000-000000000006",
              sessionCount: 36,
              generatedThrough: "2027-02-10",
            },
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        )
      )
    );
  });

  it("presenta un único formulario con campos nombrados y una alternativa clara al ratón", () => {
    render(<OwnerClassesManager bundle={bundle()} />);

    expect(
      screen.getByRole("heading", { name: "Clases recurrentes" })
    ).toBeTruthy();
    expect(screen.getByLabelText(/Actividad/)).toBeTruthy();
    expect(screen.getByLabelText("Nombre de la clase")).toBeTruthy();
    expect(screen.getByLabelText("Plazas disponibles")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Horario semanal" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Añadir otro horario" })
    ).toBeTruthy();
    expect(screen.getByText(/No se crean matrículas ni cobros/)).toBeTruthy();
  });

  it("crea clase y sesiones en un envío idempotente", async () => {
    render(<OwnerClassesManager bundle={bundle()} />);
    fireEvent.change(screen.getByLabelText("Nombre de la clase"), {
      target: { value: "Iniciación rítmica" },
    });
    fireEvent.submit(
      screen.getByRole("form", { name: "Crear clase recurrente" })
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, request] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/v1/owner/classes");
    expect(request.method).toBe("POST");
    expect(request.headers).toEqual(
      expect.objectContaining({
        "idempotency-key": "owner-class:synthetic-command-id",
      })
    );
    expect(JSON.parse(String(request.body))).toMatchObject({
      organizationId,
      locationId,
      programId,
      name: "Iniciación rítmica",
      effectiveFrom: "2026-10-13",
      schedule: [
        { isoWeekday: 1, startsAtLocal: "17:00", endsAtLocal: "18:00" },
      ],
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "36 sesiones preparadas"
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("explica el estado vacío sin inventar clases", () => {
    render(<OwnerClassesManager bundle={bundle()} />);
    expect(screen.getByText(/Aún no hay clases recurrentes/)).toBeTruthy();
  });
});
