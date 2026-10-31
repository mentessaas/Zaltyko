// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OwnerAttendanceManager } from "@/components/owner-dashboard/OwnerAttendanceManager";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const sessionId = "10000000-0000-4000-8000-000000000003";
const secondSessionId = "10000000-0000-4000-8000-000000000005";
const enrollmentId = "10000000-0000-4000-8000-000000000004";
const mockFetch = vi.hoisted(() => vi.fn());
type SessionOptionFixture = {
  id: string;
  className: string;
  startsAt: string;
  timezone: string;
  retryOnly?: boolean;
};

const sessionOptions: SessionOptionFixture[] = [
  {
    id: sessionId,
    className: "Grupo sintético",
    startsAt: "2026-10-13T16:00:00.000Z",
    timezone: "Atlantic/Canary",
  },
];

const secondSessionOption = {
  id: secondSessionId,
  className: "Grupo alternativo",
  startsAt: "2026-10-14T16:00:00.000Z",
  timezone: "Atlantic/Canary",
};

function renderAttendance(
  sessions: SessionOptionFixture[] = sessionOptions,
  initialSessionId: string | null = sessionId,
  initialNextCursor: string | null = null,
  selectedSession: SessionOptionFixture | null = null
) {
  return render(
    <OwnerAttendanceManager
      organizationId={organizationId}
      locationId={locationId}
      sessions={sessions}
      initialSessionId={initialSessionId}
      initialNextCursor={initialNextCursor}
      selectedSession={selectedSession}
    />
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("crypto", { randomUUID: () => "10000000-0000-4000-8000-000000000007" });
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
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
        json: async () => ({
          ok: true,
          data: {
            id: "10000000-0000-4000-8000-000000000008",
            sessionId,
            enrollmentId,
            status: "present",
            recordedAt: "2026-10-13T17:00:00.000Z",
          },
        }),
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
      "Idempotency-Key": "owner-attendance:10000000-0000-4000-8000-000000000007",
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

  it("muestra el estado vacío de sesiones solo cuando no quedan páginas", () => {
    renderAttendance([], null, null);

    expect(screen.getByText(/Aún no hay sesiones para pasar lista/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cargar más sesiones" })).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("no confunde una primera página vacía con el final si existe cursor", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          organization: { id: organizationId },
          locationId,
          sessions: [secondSessionOption],
          nextCursor: null,
        },
      }),
    });

    renderAttendance([], null, "cursor-after-empty-page");
    expect(screen.queryByText(/Aún no hay sesiones para pasar lista/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cargar más sesiones" }));
    expect(
      await screen.findByRole("option", { name: /Grupo alternativo/ })
    ).toBeVisible();
  });

  it("conserva la lista si se vuelve a seleccionar la sesión actual y la recarga al cambiar", async () => {
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
            ],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            items: [
              {
                enrollmentId: "10000000-0000-4000-8000-000000000006",
                athleteName: "Gimnasta B",
                attendanceStatus: null,
              },
            ],
          },
        }),
      });

    renderAttendance([...sessionOptions, secondSessionOption]);
    expect(await screen.findByText("Gimnasta A")).toBeVisible();

    const sessionSelect = screen.getByRole("combobox", {
      name: "Seleccionar sesión",
    });
    fireEvent.change(sessionSelect, { target: { value: sessionId } });

    expect(screen.getByText("Gimnasta A")).toBeVisible();
    expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    fireEvent.change(sessionSelect, { target: { value: secondSessionId } });

    expect(await screen.findByText("Gimnasta B")).toBeVisible();
    expect(screen.queryByText("Gimnasta A")).not.toBeInTheDocument();
    expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]?.[0]).toBe(
      `/api/v1/owner/sessions/${secondSessionId}/attendance?organizationId=${organizationId}&locationId=${locationId}`
    );
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

  it("carga la página siguiente sin cambiar una sesión directa fuera de la primera ventana", async () => {
    const user = userEvent.setup();
    const directSession: SessionOptionFixture = {
      id: "10000000-0000-4000-8000-000000000006",
      className: "Sesión directa",
      startsAt: "2026-10-15T16:00:00.000Z",
      timezone: "Atlantic/Canary",
      retryOnly: true,
    };
    const nextSession: SessionOptionFixture = {
      id: "10000000-0000-4000-8000-000000000008",
      className: "Sesión página siguiente",
      startsAt: "2026-10-16T16:00:00.000Z",
      timezone: "Atlantic/Canary",
    };
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { items: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            organization: { id: organizationId },
            locationId,
            sessions: [nextSession],
            nextCursor: null,
          },
        }),
      });

    renderAttendance(sessionOptions, directSession.id, "opaque-cursor-2", directSession);
    const select = await screen.findByRole("combobox", {
      name: "Seleccionar sesión",
    });
    expect(select).toHaveValue(directSession.id);
    expect(screen.getByRole("option", { name: /Sesión directa/ })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Cargar más sesiones" }));

    expect(
      await screen.findByRole("option", { name: /Sesión página siguiente/ })
    ).toBeVisible();
    expect(select).toHaveValue(directSession.id);
    const pageRequest = new URL(
      String(mockFetch.mock.calls[1]?.[0]),
      "http://localhost"
    );
    expect(pageRequest.pathname).toBe("/api/v1/owner/attendance/sessions");
    expect(pageRequest.searchParams.get("organizationId")).toBe(organizationId);
    expect(pageRequest.searchParams.get("locationId")).toBe(locationId);
    expect(pageRequest.searchParams.get("cursor")).toBe("opaque-cursor-2");
    expect(mockFetch.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });

  it("permite reintentar una lectura de página fallida sin repetir escrituras", async () => {
    const user = userEvent.setup();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { items: [] } }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ detail: "Lectura temporalmente no disponible." }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            organization: { id: organizationId },
            locationId,
            sessions: [secondSessionOption],
            nextCursor: null,
          },
        }),
      });

    renderAttendance(sessionOptions, sessionId, "opaque-cursor-retry");
    await screen.findByRole("combobox", { name: "Seleccionar sesión" });
    await user.click(screen.getByRole("button", { name: "Cargar más sesiones" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Lectura temporalmente no disponible."
    );

    await user.click(
      screen.getByRole("button", { name: "Reintentar carga de sesiones" })
    );
    expect(
      await screen.findByRole("option", { name: /Grupo alternativo/ })
    ).toBeVisible();
    expect(screen.getByLabelText("Seleccionar sesión")).toHaveValue(sessionId);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    for (const call of mockFetch.mock.calls.slice(1)) {
      const requestUrl = new URL(String(call[0]), "http://localhost");
      expect(requestUrl.searchParams.get("cursor")).toBe("opaque-cursor-retry");
      expect(call[1]?.method).toBeUndefined();
    }
  });

  it("aborta y descarta páginas tardías al cambiar de academia o sede", async () => {
    const user = userEvent.setup();
    const otherOrganizationId = "20000000-0000-4000-8000-000000000001";
    const otherLocationId = "20000000-0000-4000-8000-000000000002";
    const otherSessionId = "20000000-0000-4000-8000-000000000003";
    const otherSession: SessionOptionFixture = {
      id: otherSessionId,
      className: "Sesión otra sede",
      startsAt: "2026-10-17T16:00:00.000Z",
      timezone: "Atlantic/Canary",
    };
    let resolveOldPage!: (value: unknown) => void;
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { items: [] } }),
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOldPage = resolve;
          })
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { items: [] } }),
      });

    const view = render(
      <OwnerAttendanceManager
        organizationId={organizationId}
        locationId={locationId}
        sessions={sessionOptions}
        initialSessionId={sessionId}
        initialNextCursor="old-scope-cursor"
      />
    );
    await screen.findByRole("combobox", { name: "Seleccionar sesión" });
    await user.click(screen.getByRole("button", { name: "Cargar más sesiones" }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    const oldSignal = mockFetch.mock.calls[1]?.[1]?.signal as AbortSignal;

    publishOwnerPlanUsage(otherOrganizationId, {
      readOnly: false,
      planCode: "free",
    });
    view.rerender(
      <OwnerAttendanceManager
        organizationId={otherOrganizationId}
        locationId={otherLocationId}
        sessions={[otherSession]}
        initialSessionId={otherSessionId}
        initialNextCursor={null}
      />
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    expect(oldSignal.aborted).toBe(true);

    await act(async () => {
      resolveOldPage({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            organization: { id: organizationId },
            locationId,
            sessions: [
              {
                id: "10000000-0000-4000-8000-000000000009",
                className: "Sesión antigua tardía",
                startsAt: "2026-10-18T16:00:00.000Z",
                timezone: "Atlantic/Canary",
              },
            ],
            nextCursor: null,
          },
        }),
      });
      await Promise.resolve();
    });

    expect(
      screen.getByRole("combobox", { name: "Seleccionar sesión" })
    ).toHaveValue(otherSessionId);
    expect(
      screen.queryByRole("option", { name: /Sesión antigua tardía/ })
    ).not.toBeInTheDocument();
  });
});
