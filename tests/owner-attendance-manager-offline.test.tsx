// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER = "99999999-9999-4999-8999-999999999999";
const hoisted = vi.hoisted(() => ({
  sync: vi.fn(),
  store: null as null | import("@/lib/offline-attendance/store").OfflineStore,
}));

vi.mock("@/lib/offline-attendance/runtime", async () => {
  const { createMemoryStore } = await import("@/lib/offline-attendance/store");
  const store = createMemoryStore();
  hoisted.store = store;
  return {
    getOfflineStore: () => store,
    resolveUserId: async () => "99999999-9999-4999-8999-999999999999",
    notifyOfflineAttendanceChanged: (change: unknown = {}) =>
      window.dispatchEvent(
        new CustomEvent("zaltyko:offline-attendance-changed", { detail: change })
      ),
    syncPendingAttendance: hoisted.sync,
  };
});

import { OwnerAttendanceManager } from "@/components/owner-dashboard/OwnerAttendanceManager";
import { publishOwnerPlanUsage } from "@/components/owner-dashboard/owner-plan-usage-store";
import { queueKey } from "@/lib/offline-attendance/types";

const organizationId = "10000000-0000-4000-8000-000000000001";
const locationId = "10000000-0000-4000-8000-000000000002";
const sessionId = "10000000-0000-4000-8000-000000000003";
const enrollmentId = "10000000-0000-4000-8000-000000000004";
const mockFetch = vi.hoisted(() => vi.fn());

const sessions = [
  {
    id: sessionId,
    className: "Grupo sintético",
    startsAt: "2026-10-13T16:00:00.000Z",
    timezone: "Atlantic/Canary",
  },
];

function roster(attendanceStatus: string | null = null, recordedAt: string | null = null) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      data: {
        items: [{ enrollmentId, athleteName: "Gimnasta sintética", attendanceStatus, recordedAt }],
      },
    }),
  };
}

/** El almacén simulado nace al cargar el módulo: se carga aquí si hace falta. */
async function store() {
  await import("@/lib/offline-attendance/runtime");
  return hoisted.store!;
}

function renderAttendance() {
  return render(
    <OwnerAttendanceManager
      organizationId={organizationId}
      locationId={locationId}
      sessions={sessions}
      initialSessionId={sessionId}
    />
  );
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
}

function queuedMark(overrides: Record<string, unknown> = {}) {
  return {
    key: queueKey(sessionId, enrollmentId, USER),
    source: "owner" as const,
    opId: "70000000-0000-4000-8000-00000000000a",
    userId: USER,
    academyId: organizationId,
    sessionId,
    athleteId: enrollmentId,
    status: "present" as const,
    markedAt: "2026-10-13T16:30:00.000Z",
    seenRecordedAt: null,
    state: "pending" as const,
    attempts: 0,
    ...overrides,
  };
}

beforeEach(async () => {
  mockFetch.mockReset();
  hoisted.sync.mockReset().mockResolvedValue(null);
  vi.stubGlobal("fetch", mockFetch);
  vi.stubGlobal("crypto", { randomUUID: () => "10000000-0000-4000-8000-000000000007" });
  publishOwnerPlanUsage(organizationId, { readOnly: false, planCode: "free" });
  // Este móvil ya guardó una lista antes (así la pantalla busca la cola).
  localStorage.setItem("zaltyko:offline-attendance:user", USER);
  setOnline(true);
  await (await store()).clearAll();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  Reflect.deleteProperty(window.navigator, "onLine");
});

describe("asistencia de /owner sin conexión", () => {
  it("sin red guarda la marca en el móvil, no llama al servidor y la muestra como «Pendiente de enviar»", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce(roster("absent", "2026-10-13T15:00:00.000Z"));
    renderAttendance();
    expect(await screen.findByText("Gimnasta sintética")).toBeVisible();
    expect(screen.getByTestId("attendance-save-label")).toHaveTextContent("Guardado");

    setOnline(false);
    await user.click(screen.getByRole("button", { name: "Presente: Gimnasta sintética" }));

    await waitFor(() =>
      expect(screen.getByTestId("attendance-save-label")).toHaveTextContent("Pendiente de enviar")
    );
    // Solo la lectura de la lista: nada se envía sin red.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Sin conexión: marca guardada en este móvil. Se enviará sola cuando vuelva la conexión."
    );
    expect(screen.getByTestId("offline-attendance-state")).toHaveTextContent(
      "Sin conexión · lo que marques se guarda en este móvil. 1 marca pendiente de enviar."
    );
    expect(screen.getByRole("button", { name: "Presente: Gimnasta sintética" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    const queued = await (await store()).listQueued();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      source: "owner",
      userId: USER,
      academyId: organizationId,
      sessionId,
      athleteId: enrollmentId,
      status: "present",
      state: "pending",
      // Lo que se veía en pantalla: el servidor decide con ello si hubo conflicto.
      seenRecordedAt: "2026-10-13T15:00:00.000Z",
    });
    expect(hoisted.sync).toHaveBeenCalled();
  });

  it("al volver la red y salir la marca, la fila pasa a «Guardado» sin recargar", async () => {
    mockFetch.mockResolvedValueOnce(roster(null, null));
    await (await store()).putQueued(queuedMark());
    renderAttendance();
    await waitFor(() =>
      expect(screen.getByTestId("attendance-save-label")).toHaveTextContent("Pendiente de enviar")
    );

    await (await store()).deleteQueued(queuedMark().key);
    act(() => {
      window.dispatchEvent(
        new CustomEvent("zaltyko:offline-attendance-changed", {
          detail: {
            flush: {
              confirmed: [{ ...queuedMark(), serverRecordedAt: "2026-10-13T16:30:00.000Z" }],
              supersededMarks: [],
            },
          },
        })
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId("attendance-save-label")).toHaveTextContent("Guardado")
    );
    expect(screen.queryByTestId("offline-attendance-state")).toBeNull();
    expect(screen.getByRole("button", { name: "Presente: Gimnasta sintética" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("si otro dispositivo tenía una marca más reciente, vuelve a leer la lista", async () => {
    mockFetch.mockResolvedValueOnce(roster(null, null)).mockResolvedValueOnce(roster("absent", "2026-10-13T17:00:00.000Z"));
    await (await store()).putQueued(queuedMark());
    renderAttendance();
    await screen.findByText("Gimnasta sintética");
    await (await store()).deleteQueued(queuedMark().key);
    act(() => {
      window.dispatchEvent(
        new CustomEvent("zaltyko:offline-attendance-changed", {
          detail: { flush: { confirmed: [], supersededMarks: [queuedMark()] } },
        })
      );
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Ausente: Gimnasta sintética" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
  });

  it("una marca rechazada por el servidor se avisa como «No se pudo enviar»", async () => {
    mockFetch.mockResolvedValueOnce(roster(null, null));
    await (await store()).putQueued(queuedMark({ state: "failed", lastError: "http-409" }));
    renderAttendance();
    await waitFor(() =>
      expect(screen.getByTestId("attendance-save-label")).toHaveTextContent("No se pudo enviar")
    );
    expect(screen.getByTestId("offline-attendance-state")).toHaveTextContent(
      "1 marca no se pudo enviar: vuelve a marcarla."
    );
  });

  it("no muestra marcas de otra persona ni del panel antiguo", async () => {
    mockFetch.mockResolvedValueOnce(roster("late", "2026-10-13T15:00:00.000Z"));
    await (await store()).putQueued(
      queuedMark({ key: queueKey(sessionId, enrollmentId, "otra"), userId: "otra" })
    );
    await (await store()).putQueued(queuedMark({ source: undefined, key: "legacy" }));
    renderAttendance();
    expect(await screen.findByText("Gimnasta sintética")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId("attendance-save-label")).toHaveTextContent("Guardado")
    );
    expect(screen.queryByTestId("offline-attendance-state")).toBeNull();
  });

  it("sin nada guardado en este móvil la pantalla en línea no toca la cola", async () => {
    localStorage.clear();
    mockFetch.mockResolvedValueOnce(roster(null, null));
    renderAttendance();
    expect(await screen.findByText("Gimnasta sintética")).toBeVisible();
    expect(screen.queryByTestId("attendance-save-label")).toBeNull();
    expect(screen.queryByTestId("offline-attendance-state")).toBeNull();
  });
});
