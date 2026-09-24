import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDashboardAlerts } from "@/lib/dashboard/alerts";

describe("loadDashboardAlerts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lee las tres fuentes una sola vez y comparte los IDs de capacidad", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/capacity?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ok: true,
              data: { items: [{ classId: "class-1", className: "Aro", currentCapacity: 19, maxCapacity: 20, percentage: 95 }] },
            }),
            { status: 200 }
          )
        );
      }
      if (url.includes("/payments?")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ ok: true, data: { items: [{ chargeId: "charge-1", athleteName: "Ana", amount: 25, currency: "EUR", daysOverdue: 2 }] } }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ ok: true, data: { items: [{ athleteId: "athlete-1", athleteName: "Luis", attendanceRate: 40, threshold: 75 }] } }),
          { status: 200 }
        )
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadDashboardAlerts({ academyId: "academy/1", academyCountry: "ES" });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        "/api/alerts/capacity?academyId=academy%2F1",
        "/api/alerts/payments?academyId=academy%2F1",
        "/api/alerts/attendance?academyId=academy%2F1",
      ])
    );
    expect(result.capacityClassIds).toEqual(["class-1"]);
    expect(result.alerts.map((alert) => alert.id)).toEqual([
      "capacity-class-1",
      "payment-charge-1",
      "attendance-athlete-1",
    ]);
    expect(result.failedSources).toEqual([]);
  });

  it("conserva las fuentes disponibles cuando una respuesta falla", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/payments?")) return Promise.reject(new Error("timeout"));
      return Promise.resolve(new Response(JSON.stringify({ data: { items: [] } }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadDashboardAlerts({ academyId: "academy-1", academyCountry: null });

    expect(result.failedSources).toEqual(["payments"]);
    expect(result.alerts).toEqual([]);
  });
});
