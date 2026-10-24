// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerAttendanceManager } from "@/components/owner-dashboard/OwnerAttendanceManager";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";

const organizationId = "80000000-0000-4000-8000-000000000001";
const locationId = "80000000-0000-4000-8000-000000000002";
const sessionId = "80000000-0000-4000-8000-000000000003";
const enrollmentId = "80000000-0000-4000-8000-000000000004";
const otherOrganizationId = "80000000-0000-4000-8000-000000000005";
const otherLocationId = "80000000-0000-4000-8000-000000000006";
const otherSessionId = "80000000-0000-4000-8000-000000000007";
const otherEnrollmentId = "80000000-0000-4000-8000-000000000008";
const fetchMock = vi.fn();
const receipt = (url: string, init: { body?: string }) => {
  const command = JSON.parse(init.body ?? "{}") as { enrollmentId: string; status: string };
  const session = String(url).match(/\/sessions\/([^/]+)\/attendance/)?.[1] ?? sessionId;
  return { ok: true, data: { id: "80000000-0000-4000-8000-000000000009", sessionId: session, enrollmentId: command.enrollmentId, status: command.status, recordedAt: "2026-10-23T16:00:00.000Z" } };
};
const attendanceProblem = (status: number) => ({
  type: "https://zaltyko.com/problems/invalid-session-attendance-command",
  title: "Datos de asistencia incompletos",
  status,
  detail: "Comprueba el comando de asistencia.",
});

beforeEach(() => {
  window.sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
  publishOwnerPlanUsage(otherOrganizationId, { readOnly: false, planCode: "free" });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("asistencia Owner en solo lectura", () => {
  it("no sustituye una sesión inicial no disponible por la primera de la lista", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { items: [] } }),
    });

    render(
      <OwnerAttendanceManager
        organizationId={organizationId}
        locationId={locationId}
        sessions={[
          {
            id: sessionId,
            className: "Primera sesión",
            startsAt: "2026-10-23T16:00:00.000Z",
            timezone: "Europe/Madrid",
          },
        ]}
        initialSessionId={otherSessionId}
      />
    );

    expect(
      await screen.findByText(/La sesión solicitada no está disponible/)
    ).toBeVisible();
    expect(screen.getByLabelText("Seleccionar sesión")).toHaveValue("");
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Seleccionar sesión"), {
      target: { value: sessionId },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      `/sessions/${sessionId}/attendance?`
    );
  });

  it("mantiene vacía una selección que el usuario deselecciona sin mostrar un aviso falso", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { items: [] } }),
    });

    render(
      <OwnerAttendanceManager
        organizationId={organizationId}
        locationId={locationId}
        sessions={[
          {
            id: sessionId,
            className: "Sesión disponible",
            startsAt: "2026-10-23T16:00:00.000Z",
            timezone: "Europe/Madrid",
          },
        ]}
        initialSessionId={sessionId}
      />
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Seleccionar sesión"), {
      target: { value: "" },
    });

    expect(screen.getByLabelText("Seleccionar sesión")).toHaveValue("");
    expect(
      screen.queryByText(/La sesión solicitada no está disponible/)
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("en una sesión de recuperación no permite asistencias nuevas, pero conserva el reintento exacto", async () => {
    const originalRequest = {
      key: "owner-attendance:80000000-0000-4000-8000-000000000010",
      sessionId,
      uncertain: true,
      body: {
        organizationId,
        locationId,
        enrollmentId,
        status: "present",
      },
    };
    window.sessionStorage.setItem(
      "zaltyko:owner-attendance-pending:v1",
      JSON.stringify([originalRequest])
    );
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => receipt(String(url), init),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            items: [
              {
                enrollmentId,
                athleteName: "Ana Sintética",
                attendanceStatus: null,
              },
              {
                enrollmentId: otherEnrollmentId,
                athleteName: "Bea Sintética",
                attendanceStatus: null,
              },
            ],
          },
        }),
      };
    });

    render(
      <OwnerAttendanceManager
        organizationId={organizationId}
        locationId={locationId}
        sessions={[
          {
            id: sessionId,
            className: "Sesión anterior",
            startsAt: "2026-01-01T16:00:00.000Z",
            timezone: "Europe/Madrid",
            retryOnly: true,
          },
        ]}
        initialSessionId={sessionId}
      />
    );

    await screen.findByText("Ana Sintética");
    await screen.findByText("Bea Sintética");
    await waitFor(() =>
      expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument()
    );
    expect(screen.getByLabelText("Asistencia de Bea Sintética")).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Guardar asistencia de Bea Sintética",
      })
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Reintentar guardado de Ana Sintética",
      })
    ).toBeEnabled();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Reintentar guardado de Ana Sintética",
      })
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")
      ).toHaveLength(1)
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[1]?.headers).toMatchObject({
      "Idempotency-Key": originalRequest.key,
    });
    expect(JSON.parse(post?.[1]?.body ?? "{}")).toEqual(originalRequest.body);
  });

  it("permite recuperar una intención pendiente aunque la inscripción ya no esté en el roster", async () => {
    const originalRequest = {
      key: "owner-attendance:80000000-0000-4000-8000-000000000011",
      sessionId,
      uncertain: true,
      body: {
        organizationId,
        locationId,
        enrollmentId: otherEnrollmentId,
        status: "late",
      },
    };
    window.sessionStorage.setItem(
      "zaltyko:owner-attendance-pending:v1",
      JSON.stringify([originalRequest])
    );
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => receipt(String(url), init),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { items: [] } }),
      };
    });

    render(
      <OwnerAttendanceManager
        organizationId={organizationId}
        locationId={locationId}
        sessions={[
          {
            id: sessionId,
            className: "Sesión anterior",
            startsAt: "2026-01-01T16:00:00.000Z",
            timezone: "Europe/Madrid",
            retryOnly: true,
          },
        ]}
        initialSessionId={sessionId}
      />
    );

    expect(
      await screen.findByText(/inscripción vigente en esta sesión/)
    ).toBeVisible();
    const retry = screen.getByRole("button", {
      name: "Reintentar asistencia pendiente",
    });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")
      ).toHaveLength(1)
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[1]?.headers).toMatchObject({
      "Idempotency-Key": originalRequest.key,
    });
    expect(JSON.parse(post?.[1]?.body ?? "{}")).toEqual(originalRequest.body);
  });

  it("conserva la consulta de sesión e historial y desactiva el registro nuevo", async () => {
    publishOwnerPlanUsage(organizationId, { readOnly: true, planCode: "free" });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          items: [
            {
              enrollmentId,
              athleteName: "Ana Sintética",
              attendanceStatus: "present",
            },
          ],
        },
      }),
    });

    render(
      <OwnerAttendanceManager
        organizationId={organizationId}
        locationId={locationId}
        sessions={[
          {
            id: sessionId,
            className: "Clase sintética",
            startsAt: "2026-10-23T16:00:00.000Z",
            timezone: "Europe/Madrid",
          },
        ]}
      />
    );

    expect(await screen.findByText("Ana Sintética")).toBeVisible();
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    expect(screen.getByText(/La academia está en solo lectura/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Uso y regularización" })).toHaveAttribute(
      "href",
      `/owner/subscription?organizationId=${organizationId}#regularizar`
    );
    expect(screen.getByLabelText("Seleccionar sesión")).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Guardar asistencia de Ana Sintética" })
    ).toBeDisabled();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("ignora un segundo evento Guardar del mismo ámbito mientras el primer POST sigue pendiente", async () => {
    type MockResponse = {
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    };
    const postResolvers: Array<(response: MockResponse) => void> = [];
    fetchMock.mockImplementation((_url, init) => {
      if (init?.method === "POST") {
        return new Promise<MockResponse>((resolve) => {
          postResolvers.push(resolve);
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: { items: [{ enrollmentId, athleteName: "Ana Sintética", attendanceStatus: null }] },
        }),
      });
    });
    vi.stubGlobal("crypto", { randomUUID: () => "80000000-0000-4000-8000-000000000018" });
    render(
      <OwnerAttendanceManager
        organizationId={organizationId}
        locationId={locationId}
        sessions={[{ id: sessionId, className: "Clase sintética", startsAt: "2026-10-23T16:00:00.000Z", timezone: "Europe/Madrid" }]}
      />
    );
    await screen.findByText("Ana Sintética");
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Asistencia de Ana Sintética"), { target: { value: "absent" } });
    const saveButton = screen.getByRole("button", { name: "Guardar asistencia de Ana Sintética" });

    act(() => {
      fireEvent.click(saveButton);
      fireEvent.click(saveButton);
    });

    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1));
    const firstPost = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const retryStorageKey = "zaltyko:owner-attendance-pending:v1";
    const storedRetries = () => JSON.parse(window.sessionStorage.getItem(retryStorageKey) ?? "[]") as Array<{ key: string; sessionId: string; body: unknown; uncertain: boolean }>;
    const originalRetry = storedRetries();
    expect(originalRetry).toHaveLength(1);
    expect(originalRetry[0]).toMatchObject({
      key: firstPost?.[1]?.headers?.["Idempotency-Key"],
      sessionId,
      body: JSON.parse(firstPost?.[1]?.body ?? "{}"),
      uncertain: true,
    });

    await act(async () => {
      postResolvers[0]?.({ ok: false, status: 503, json: async () => ({ detail: "Sin confirmación" }) });
    });
    await screen.findByText(/No sabemos si se guardó/);
    expect(storedRetries()).toEqual(originalRetry);

    fireEvent.click(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2));
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts[1]?.[0]).toBe(posts[0]?.[0]);
    expect(posts[1]?.[1]).toEqual(posts[0]?.[1]);
    expect(storedRetries()).toEqual(originalRetry);

    await act(async () => {
      postResolvers[1]?.({ ok: true, status: 201, json: async () => receipt(String(posts[1]?.[0]), posts[1]?.[1] ?? {}) });
    });
    expect(await screen.findByText("Asistencia guardada.")).toBeVisible();

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
    expect(window.sessionStorage.getItem(retryStorageKey)).toBeNull();
  });

  it("permite únicamente el reintento original aunque después se confirme solo lectura", async () => {
    let postCount = 0;
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method === "POST") {
        postCount += 1;
        return postCount === 1
          ? { ok: false, status: 503, json: async () => ({ detail: "Sin confirmación" }) }
          : { ok: true, status: 201, json: async () => receipt(String(_url), init) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: { items: [{ enrollmentId, athleteName: "Ana Sintética", attendanceStatus: null }] } }),
      };
    });
    vi.stubGlobal("crypto", { randomUUID: () => "80000000-0000-4000-8000-000000000010" });
    render(
      <OwnerAttendanceManager
        organizationId={organizationId}
        locationId={locationId}
        sessions={[{ id: sessionId, className: "Clase sintética", startsAt: "2026-10-23T16:00:00.000Z", timezone: "Europe/Madrid" }]}
      />
    );
    await screen.findByText("Ana Sintética");
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Asistencia de Ana Sintética"), { target: { value: "absent" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar asistencia de Ana Sintética" }));
    await screen.findByText(/No sabemos si se guardó/);
    const firstRequest = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")?.[1];

    act(() => publishOwnerPlanUsage(organizationId, { readOnly: true, planCode: "free" }));
    expect(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" }));

    await waitFor(() => expect(postCount).toBe(2));
    const requests = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(requests).toHaveLength(2);
    expect(requests[1]?.[1]).toEqual(firstRequest);
    expect(requests[0]?.[1]?.headers).toMatchObject({ "Idempotency-Key": "owner-attendance:80000000-0000-4000-8000-000000000010" });
  });

  it("aísla roster y retry al cambiar de academia y vuelve a reintentar en la sesión original", async () => {
    let postCount = 0;
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        postCount += 1;
        return postCount === 1
          ? { ok: false, status: 503, json: async () => ({ detail: "Sin confirmación" }) }
          : { ok: true, status: 201, json: async () => receipt(String(url), init) };
      }
      const otherScope = String(url).includes(otherSessionId);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            items: [
              {
                enrollmentId: otherScope ? otherEnrollmentId : enrollmentId,
                athleteName: otherScope ? "Beatriz Sintética" : "Ana Sintética",
                attendanceStatus: null,
              },
            ],
          },
        }),
      };
    });
    vi.stubGlobal("crypto", { randomUUID: () => "80000000-0000-4000-8000-000000000011" });
    const originalProps = {
      organizationId,
      locationId,
      sessions: [{ id: sessionId, className: "Clase original", startsAt: "2026-10-23T16:00:00.000Z", timezone: "Europe/Madrid" }],
    };
    const view = render(<OwnerAttendanceManager {...originalProps} />);
    await screen.findByText("Ana Sintética");
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Asistencia de Ana Sintética"), { target: { value: "absent" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar asistencia de Ana Sintética" }));
    await screen.findByText(/No sabemos si se guardó/);
    const originalPost = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");

    view.rerender(
      <OwnerAttendanceManager
        organizationId={otherOrganizationId}
        locationId={otherLocationId}
        sessions={[{ id: otherSessionId, className: "Otra clase", startsAt: "2026-10-24T16:00:00.000Z", timezone: "Europe/Madrid" }]}
      />
    );
    await screen.findByText("Beatriz Sintética");
    expect(screen.queryByText("Ana Sintética")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Seleccionar sesión")).toHaveValue(otherSessionId);
    const returnLink = screen.getByRole("link", { name: "Volver a esa sesión" });
    expect(returnLink).toHaveAttribute(
      "href",
      `/owner/attendance?organizationId=${organizationId}&locationId=${locationId}&sessionId=${sessionId}`
    );
    expect(screen.queryByRole("button", { name: "Reintentar guardado de Beatriz Sintética" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);

    view.rerender(<OwnerAttendanceManager {...originalProps} />);
    await screen.findByText("Ana Sintética");
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" }));
    await waitFor(() => expect(postCount).toBe(2));
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts[1]?.[0]).toContain(`/sessions/${sessionId}/attendance`);
    expect(posts[1]?.[1]).toEqual(originalPost?.[1]);
  });

  it("mantiene el busy por ámbito cuando A termina mientras B guarda en paralelo", async () => {
    type MockResponse = {
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    };
    let resolvePostA!: (response: MockResponse) => void;
    let resolvePostB!: (response: MockResponse) => void;
    let postBReceipt: unknown;
    fetchMock.mockImplementation((url, init) => {
      const urlText = String(url);
      if (init?.method === "POST") {
        if (urlText.includes(sessionId)) {
          return new Promise<MockResponse>((resolve) => {
            resolvePostA = resolve;
          });
        }
        return new Promise<MockResponse>((resolve) => {
          postBReceipt = receipt(urlText, init);
          resolvePostB = resolve;
        });
      }
      const otherScope = urlText.includes(otherSessionId);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            items: [
              {
                enrollmentId: otherScope ? otherEnrollmentId : enrollmentId,
                athleteName: otherScope ? "Beatriz Sintética" : "Ana Sintética",
                attendanceStatus: null,
              },
            ],
          },
        }),
      });
    });
    let generatedCommand = 10;
    vi.stubGlobal("crypto", {
      randomUUID: () => `80000000-0000-4000-8000-${String(++generatedCommand).padStart(12, "0")}`,
    });
    const originalProps = {
      organizationId,
      locationId,
      sessions: [
        {
          id: sessionId,
          className: "Clase original",
          startsAt: "2026-10-23T16:00:00.000Z",
          timezone: "Europe/Madrid",
        },
      ],
    };
    const view = render(<OwnerAttendanceManager {...originalProps} />);
    await screen.findByText("Ana Sintética");
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Asistencia de Ana Sintética"), {
      target: { value: "absent" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar asistencia de Ana Sintética" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1));

    view.rerender(
      <OwnerAttendanceManager
        organizationId={otherOrganizationId}
        locationId={otherLocationId}
        sessions={[
          {
            id: otherSessionId,
            className: "Otra clase",
            startsAt: "2026-10-24T16:00:00.000Z",
            timezone: "Europe/Madrid",
          },
        ]}
      />
    );
    await screen.findByText("Beatriz Sintética");
    const bAttendance = screen.getByLabelText("Asistencia de Beatriz Sintética");
    expect(bAttendance).toBeEnabled();
    fireEvent.change(bAttendance, { target: { value: "present" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar asistencia de Beatriz Sintética" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2));
    const postsBeforeResolution = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    const headersA = postsBeforeResolution[0]?.[1]?.headers as Record<string, string>;
    const headersB = postsBeforeResolution[1]?.[1]?.headers as Record<string, string>;
    expect(headersA["Idempotency-Key"]).not.toBe(headersB["Idempotency-Key"]);

    await act(async () => {
      resolvePostA({
        ok: false,
        status: 503,
        json: async () => ({ detail: "Sin confirmación" }),
      });
    });
    expect(await screen.findByText(/Hay una asistencia cuyo resultado sigue sin confirmar/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardando asistencia de Beatriz Sintética" })).toBeDisabled();

    await act(async () => {
      resolvePostB({
        ok: true,
        status: 201,
        json: async () => postBReceipt,
      });
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Guardar asistencia de Beatriz Sintética" })).toBeEnabled()
    );
    expect(screen.getByRole("link", { name: "Volver a esa sesión" })).toHaveAttribute(
      "href",
      `/owner/attendance?organizationId=${organizationId}&locationId=${locationId}&sessionId=${sessionId}`
    );
  });

  it("conserva un 2xx con recibo contradictorio y reintenta la misma clave", async () => {
    let postCount = 0;
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        postCount += 1;
        return {
          ok: true,
          status: 201,
          json: async () => postCount === 1
            ? { ok: true, data: { ...receipt(String(url), init).data, status: "present" } }
            : receipt(String(url), init),
        };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, data: { items: [{ enrollmentId, athleteName: "Ana Sintética", attendanceStatus: null }] } }) };
    });
    vi.stubGlobal("crypto", { randomUUID: () => "80000000-0000-4000-8000-000000000013" });
    render(<OwnerAttendanceManager organizationId={organizationId} locationId={locationId} sessions={[{ id: sessionId, className: "Clase", startsAt: "2026-10-23T16:00:00.000Z", timezone: "Europe/Madrid" }]} />);
    await screen.findByText("Ana Sintética");
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Asistencia de Ana Sintética"), { target: { value: "absent" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar asistencia de Ana Sintética" }));
    expect(await screen.findByText(/recibo/i)).toBeVisible();
    expect(screen.queryByText("Asistencia guardada.")).not.toBeInTheDocument();
    const first = fetchMock.mock.calls.find(([, request]) => request?.method === "POST");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" }));
    await waitFor(() => expect(postCount).toBe(2));
    const posts = fetchMock.mock.calls.filter(([, request]) => request?.method === "POST");
    expect(posts[1]?.[1]).toEqual(first?.[1]);
    expect(await screen.findByText("Asistencia guardada.")).toBeVisible();
  });

  it("no libera una intención incierta ante 400 de validación y la recupera tras recargar", async () => {
    let postCount = 0;
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        postCount += 1;
        if (postCount === 1) return { ok: false, status: 503, json: async () => ({ detail: "Sin confirmación" }) };
        if (postCount === 2) return { ok: false, status: 400, json: async () => attendanceProblem(400) };
        return { ok: true, status: 201, json: async () => receipt(String(url), init) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, data: { items: [{ enrollmentId, athleteName: "Ana Sintética", attendanceStatus: null }] } }) };
    });
    vi.stubGlobal("crypto", { randomUUID: () => "80000000-0000-4000-8000-000000000015" });
    const props = { organizationId, locationId, sessions: [{ id: sessionId, className: "Clase", startsAt: "2026-10-23T16:00:00.000Z", timezone: "Europe/Madrid" }] };
    const original = render(<OwnerAttendanceManager {...props} />);
    await screen.findByText("Ana Sintética");
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Asistencia de Ana Sintética"), { target: { value: "absent" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar asistencia de Ana Sintética" }));
    await screen.findByText(/No sabemos si se guardó/);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" }));
    await waitFor(() => expect(postCount).toBe(2));
    await screen.findByText(/No sabemos si se guardó/);
    const postsBeforeReload = fetchMock.mock.calls.filter(([, request]) => request?.method === "POST");
    original.unmount();

    const recovered = render(<OwnerAttendanceManager {...props} />);
    await screen.findByText("Ana Sintética");
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" })).toBeEnabled();
    expect(postCount).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" }));
    await waitFor(() => expect(postCount).toBe(3));
    const allPosts = fetchMock.mock.calls.filter(([, request]) => request?.method === "POST");
    expect(allPosts[2]?.[1]).toEqual(postsBeforeReload[0]?.[1]);
    recovered.unmount();
  });

  it("marca incierto antes del POST y conserva 400 tras remount con el mismo comando", async () => {
    let postCount = 0;
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        postCount += 1;
        if (postCount === 1) return new Promise(() => {});
        return { ok: false, status: 400, json: async () => attendanceProblem(400) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, data: { items: [{ enrollmentId, athleteName: "Ana Sintética", attendanceStatus: null }] } }) };
    });
    vi.stubGlobal("crypto", { randomUUID: () => "80000000-0000-4000-8000-000000000017" });
    const props = { organizationId, locationId, sessions: [{ id: sessionId, className: "Clase", startsAt: "2026-10-23T16:00:00.000Z", timezone: "Europe/Madrid" }] };
    const original = render(<OwnerAttendanceManager {...props} />);
    await screen.findByText("Ana Sintética");
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Asistencia de Ana Sintética"), { target: { value: "absent" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar asistencia de Ana Sintética" }));
    await waitFor(() => expect(postCount).toBe(1));
    const first = fetchMock.mock.calls.find(([, request]) => request?.method === "POST");
    original.unmount();

    const recovered = render(<OwnerAttendanceManager {...props} />);
    await screen.findByText("Ana Sintética");
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" })).toBeEnabled();
    expect(postCount).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" }));
    await waitFor(() => expect(postCount).toBe(2));
    await screen.findByText(/No sabemos si se guardó/);
    expect(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" })).toBeEnabled();
    const posts = fetchMock.mock.calls.filter(([, request]) => request?.method === "POST");
    expect(posts[1]?.[1]).toEqual(first?.[1]);
    recovered.unmount();
  });

  it("libera un primer rechazo 400 de validación con envelope válido", async () => {
    let postCount = 0;
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        postCount += 1;
        return postCount === 1
          ? { ok: false, status: 400, json: async () => attendanceProblem(400) }
          : { ok: true, status: 201, json: async () => receipt(String(url), init) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, data: { items: [{ enrollmentId, athleteName: "Ana Sintética", attendanceStatus: null }] } }) };
    });
    let generatedCommand = 15;
    vi.stubGlobal("crypto", {
      randomUUID: () => `80000000-0000-4000-8000-${String(++generatedCommand).padStart(12, "0")}`,
    });
    render(<OwnerAttendanceManager organizationId={organizationId} locationId={locationId} sessions={[{ id: sessionId, className: "Clase", startsAt: "2026-10-23T16:00:00.000Z", timezone: "Europe/Madrid" }]} />);
    await screen.findByText("Ana Sintética");
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Asistencia de Ana Sintética"), { target: { value: "absent" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar asistencia de Ana Sintética" }));
    expect(await screen.findByText("Comprueba el comando de asistencia.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Guardar asistencia de Ana Sintética" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar asistencia de Ana Sintética" }));
    await waitFor(() => expect(postCount).toBe(2));
    const posts = fetchMock.mock.calls.filter(([, request]) => request?.method === "POST");
    const firstHeaders = posts[0]?.[1]?.headers as Record<string, string>;
    const secondHeaders = posts[1]?.[1]?.headers as Record<string, string>;
    expect(firstHeaders["Idempotency-Key"]).not.toBe(secondHeaders["Idempotency-Key"]);
    expect(posts[0]?.[1]?.body).toBe(posts[1]?.[1]?.body);
  });

  it.each([401, 429])("mantiene la intención incierta después de HTTP %i y recargar", async (status) => {
    let postCount = 0;
    fetchMock.mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        postCount += 1;
        if (postCount === 1) return { ok: false, status: 503, json: async () => ({ detail: "Sin confirmación" }) };
        if (postCount === 2) return { ok: false, status, json: async () => ({ detail: "No disponible" }) };
        return { ok: true, status: 201, json: async () => receipt(String(url), init) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, data: { items: [{ enrollmentId, athleteName: "Ana Sintética", attendanceStatus: null }] } }) };
    });
    vi.stubGlobal("crypto", { randomUUID: () => "80000000-0000-4000-8000-000000000014" });
    const props = { organizationId, locationId, sessions: [{ id: sessionId, className: "Clase", startsAt: "2026-10-23T16:00:00.000Z", timezone: "Europe/Madrid" }] };
    const view = render(<OwnerAttendanceManager {...props} />);
    await screen.findByText("Ana Sintética");
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Asistencia de Ana Sintética"), { target: { value: "absent" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar asistencia de Ana Sintética" }));
    await screen.findByText(/No sabemos si se guardó/);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" }));
    await waitFor(() => expect(postCount).toBe(2));
    view.unmount();
    const reloaded = render(<OwnerAttendanceManager {...props} />);
    await screen.findByText("Ana Sintética");
    await waitFor(() => expect(screen.queryByText("Cargando lista…")).not.toBeInTheDocument());
    const beforeClick = postCount;
    expect(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" })).toBeEnabled();
    expect(postCount).toBe(beforeClick);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar guardado de Ana Sintética" }));
    await waitFor(() => expect(postCount).toBe(3));
    const posts = fetchMock.mock.calls.filter(([, request]) => request?.method === "POST");
    expect(posts[2]?.[1]).toEqual(posts[0]?.[1]);
    reloaded.unmount();
  });
});
