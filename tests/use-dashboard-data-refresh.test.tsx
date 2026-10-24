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
    expect(view.result.current.data).toBe(updatedData);
    expect(view.result.current.error).toBeNull();
    expect(view.result.current.loading).toBe(false);
  });

  it("rechaza una respuesta sin métricas y conserva la última información válida", async () => {
    const initialData = makeDashboardData(4);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, data: { plan: {} } }),
    }));

    const view = renderHook(() => useDashboardData({
      academyId: "academy-a",
      tenantId: null,
      initialData,
    }));

    await waitFor(() => expect(view.result.current.error).toBe("La respuesta del dashboard no tiene un formato válido."));
    expect(view.result.current.data).toBe(initialData);
  });
});
