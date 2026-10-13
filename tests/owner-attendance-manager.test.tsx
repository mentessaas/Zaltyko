// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerAttendanceManager } from "@/components/owner-dashboard/OwnerAttendanceManager";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const sessionId = "10000000-0000-4000-8000-000000000003";
const enrollmentId = "10000000-0000-4000-8000-000000000004";
const mockFetch = vi.hoisted(() => vi.fn());

const sessionOptions = [
  {
    id: sessionId,
    className: "Grupo sintético",
    startsAt: "2026-10-13T16:00:00.000Z",
    timezone: "Atlantic/Canary",
  },
];

function renderAttendance() {
  return render(
    <OwnerAttendanceManager
      organizationId={organizationId}
      locationId={locationId}
      sessions={sessionOptions}
      initialSessionId={sessionId}
    />
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("crypto", { randomUUID: () => "synthetic-attendance-key" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("pase de lista Owner (mock del contrato greenfield acordado)", () => {
  it("lee el roster y guarda/reintenta una inscripción con la ruta y payload acordados", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            items: [
              {
                enrollmentId,
                athleteName: "Gimnasta sintética",
                attendanceStatus: null,
              },
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: "Resultado incierto." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: {} }),
      });

    renderAttendance();
    expect(await screen.findByText("Gimnasta sintética")).toBeVisible();
    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Asistencia de Gimnasta sintética",
      }),
      "present"
    );
    await user.click(
      screen.getByRole("button", {
        name: "Guardar asistencia de Gimnasta sintética",
      })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No sabemos si se guardó"
    );
    expect(
      screen.getByRole("combobox", { name: "Seleccionar sesión" })
    ).toBeDisabled();
    await user.click(
      screen.getByRole("button", {
        name: "Reintentar guardado de Gimnasta sintética",
      })
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));

    const getRequest = mockFetch.mock.calls[0]?.[0] as string;
    expect(getRequest).toBe(
      `/api/v1/owner/sessions/${sessionId}/attendance?organizationId=${organizationId}&locationId=${locationId}`
    );
    const firstPost = mockFetch.mock.calls[1];
    const retryPost = mockFetch.mock.calls[2];
    expect(firstPost?.[0]).toBe(
      `/api/v1/owner/sessions/${sessionId}/attendance`
    );
    expect(firstPost?.[1]?.headers).toEqual(retryPost?.[1]?.headers);
    expect(firstPost?.[1]?.body).toBe(retryPost?.[1]?.body);
    expect(firstPost?.[1]?.headers).toMatchObject({
      "Idempotency-Key": "owner-attendance:synthetic-attendance-key",
    });
    expect(JSON.parse(String(firstPost?.[1]?.body))).toEqual({
      organizationId,
      locationId,
      enrollmentId,
      status: "present",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Asistencia guardada."
    );
  });

  it("formatea la hora con la zona de la sede", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { items: [] } }),
    });

    renderAttendance();
    expect(
      await screen.findByRole("combobox", { name: "Seleccionar sesión" })
    ).toHaveTextContent("17:00");
  });

  it("distingue los botones por gimnasta y serializa los guardados", async () => {
    const user = userEvent.setup();
    let resolvePost!: (value: unknown) => void;
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            items: [
              {
                enrollmentId,
                athleteName: "Gimnasta A",
                attendanceStatus: null,
              },
              {
                enrollmentId: "10000000-0000-4000-8000-000000000005",
                athleteName: "Gimnasta B",
                attendanceStatus: null,
              },
            ],
          },
        }),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePost = resolve;
          })
      );

    renderAttendance();
    const saveA = await screen.findByRole("button", {
      name: "Guardar asistencia de Gimnasta A",
    });
    const saveB = screen.getByRole("button", {
      name: "Guardar asistencia de Gimnasta B",
    });
    expect(saveA).toBeVisible();
    expect(saveB).toBeVisible();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Asistencia de Gimnasta A" }),
      "present"
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Asistencia de Gimnasta B" }),
      "absent"
    );
    await user.click(saveA);

    expect(
      await screen.findByRole("button", {
        name: "Guardando asistencia de Gimnasta A",
      })
    ).toBeDisabled();
    expect(saveB).toBeDisabled();
    expect(
      screen.getByRole("combobox", { name: "Asistencia de Gimnasta B" })
    ).toBeDisabled();
    expect(mockFetch).toHaveBeenCalledTimes(2);

    resolvePost({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: {} }),
    });
    await waitFor(() => expect(saveB).toBeEnabled());
  });

  it("presenta el estado vacío cuando una sesión no tiene inscripciones vigentes", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { items: [] } }),
    });

    renderAttendance();
    expect(
      await screen.findByText(
        "No hay gimnastas con inscripción vigente en esta sesión."
      )
    ).toBeVisible();
  });

  it("expone carga y error recuperable sin mostrar una lista vacía falsa", async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: unknown) => void;
    mockFetch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          })
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { items: [] } }),
      });

    renderAttendance();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando lista");
    resolveFetch({
      ok: false,
      status: 500,
      json: async () => ({ detail: "No disponible." }),
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No disponible."
    );
    expect(
      screen.queryByText(
        "No hay gimnastas con inscripción vigente en esta sesión."
      )
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Volver a intentar" }));
    expect(
      await screen.findByText(
        "No hay gimnastas con inscripción vigente en esta sesión."
      )
    ).toBeVisible();
  });
});
