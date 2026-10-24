// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDashboardData } from "@/hooks/useDashboardData";
import type { DashboardData } from "@/lib/dashboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function makeDashboardData(athletes: number): DashboardData {
  return {
    metrics: {
      athletes,
      coaches: 0,
      groups: 0,
      classesThisWeek: 0,
      assessments: 0,
      attendancePercent: 0,
    },
    plan: {
      planCode: "FREE",
      planNickname: null,
      status: "active",
      athleteLimit: 30,
      classLimit: 10,
      usedAthletes: athletes,
      usedClasses: 0,
      athletePercent: 0,
      classPercent: 0,
    },
    upcomingClasses: [],
    recentActivity: [],
    groups: [],
    sportConfigBreakdown: [],
  };
}

describe("useDashboardData: recuperación de la consulta principal", () => {
  it("conserva los datos visibles, informa del fallo y permite reintentar", async () => {
    const initialData = makeDashboardData(7);
    const updatedData = makeDashboardData(8);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Unavailable" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, data: updatedData }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const view = renderHook(() => useDashboardData({
      academyId: "academy-a",
      tenantId: null,
      initialData,
    }));

    await waitFor(() => expect(view.result.current.error).toBe("No se pudieron actualizar los datos del dashboard."));
    expect(view.result.current.data).toBe(initialData);
    expect(view.result.current.loading).toBe(false);

    await act(async () => {
      await view.result.current.refresh();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(view.result.current.data).toEqual(updatedData);
    expect(view.result.current.error).toBeNull();
    expect(view.result.current.loading).toBe(false);
  });

  it("rechaza una respuesta incompleta y conserva la última información válida", async () => {
    const initialData = makeDashboardData(4);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: { metrics: makeDashboardData(3).metrics } }),
    }));

    const view = renderHook(() => useDashboardData({
      academyId: "academy-a",
      tenantId: null,
      initialData,
    }));

    await waitFor(() => expect(view.result.current.error).toBe("La respuesta del dashboard no tiene un formato válido."));
    expect(view.result.current.data).toBe(initialData);
  });

  it.each([
    ["una clase incompleta", { upcomingClasses: [{ id: "class-a" }] }],
    ["una actividad con fecha inválida", {
      recentActivity: [{
        id: "activity-a",
        action: "athlete.created",
        description: "Alta",
        createdAt: "no-es-una-fecha",
        userName: null,
      }],
    }],
  ])("rechaza %s y conserva los datos anteriores", async (_description, partial) => {
    const initialData = makeDashboardData(4);
    const malformedData = { ...makeDashboardData(5), ...partial };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: malformedData }),
    }));

    const view = renderHook(() => useDashboardData({
      academyId: "academy-a",
      tenantId: null,
      initialData,
    }));

    await waitFor(() => expect(view.result.current.error).toBe("La respuesta del dashboard no tiene un formato válido."));
    expect(view.result.current.data).toBe(initialData);
  });

  it("convierte las fechas ISO de actividad del JSON en Date válidas", async () => {
    const initialData = makeDashboardData(4);
    const updatedData = {
      ...makeDashboardData(5),
      recentActivity: [{
        id: "activity-a",
        action: "athlete.created",
        description: "Alta",
        createdAt: "2026-10-24T15:00:00.000Z",
        userName: null,
      }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: updatedData }),
    }));

    const view = renderHook(() => useDashboardData({
      academyId: "academy-a",
      tenantId: null,
      initialData,
    }));

    await waitFor(() => expect(view.result.current.data.metrics.athletes).toBe(5));
    expect(view.result.current.data.recentActivity[0]?.createdAt).toBeInstanceOf(Date);
    expect(view.result.current.data.recentActivity[0]?.createdAt.toISOString()).toBe("2026-10-24T15:00:00.000Z");
  });
});
