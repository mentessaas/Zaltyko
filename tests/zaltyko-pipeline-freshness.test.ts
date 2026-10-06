import { describe, expect, it } from "vitest";

import {
  derivePipelineFreshness,
  METRIC_FRESHNESS_SLA_SECONDS,
} from "@/modules/analytics/application/pipeline-freshness";

const now = new Date("2026-10-06T12:00:00.000Z");

describe("freshness del pipeline por outbox", () => {
  it("considera actual un pipeline sin eventos operativos sin resolver", () => {
    expect(
      derivePipelineFreshness({
        pendingEventCount: 0,
        processingEventCount: 0,
        failedEventCount: 0,
        oldestUnsettledAt: null,
        now,
      })
    ).toMatchObject({ status: "current", oldestUnsettledAgeSeconds: null });
  });

  it("distingue cambios recientes de cambios que superan el SLA estricto", () => {
    const pending = derivePipelineFreshness({
      pendingEventCount: 1,
      processingEventCount: 0,
      failedEventCount: 0,
      oldestUnsettledAt: new Date(now.getTime() - 900_000),
      now,
    });
    const stale = derivePipelineFreshness({
      pendingEventCount: 1,
      processingEventCount: 0,
      failedEventCount: 0,
      oldestUnsettledAt: new Date(now.getTime() - 900_001),
      now,
    });
    expect(pending.status).toBe("pending");
    expect(pending.slaSeconds).toBe(METRIC_FRESHNESS_SLA_SECONDS);
    expect(stale.status).toBe("stale");
  });

  it("eleva el estado a fallo en cuanto existe un evento terminalmente fallido", () => {
    expect(
      derivePipelineFreshness({
        pendingEventCount: 0,
        processingEventCount: 0,
        failedEventCount: 1,
        oldestUnsettledAt: new Date(now.getTime() - 1_000),
        now,
      }).status
    ).toBe("failed");
  });

  it("no produce lag negativo para eventos fechados en el futuro", () => {
    expect(
      derivePipelineFreshness({
        pendingEventCount: 1,
        processingEventCount: 0,
        failedEventCount: 0,
        oldestUnsettledAt: new Date(now.getTime() + 10_000),
        now,
      }).oldestUnsettledAgeSeconds
    ).toBe(0);
  });

  it("rechaza contadores inconsistentes y fechas inválidas", () => {
    expect(() =>
      derivePipelineFreshness({
        pendingEventCount: -1,
        processingEventCount: 0,
        failedEventCount: 0,
        oldestUnsettledAt: null,
        now,
      })
    ).toThrow(RangeError);
    expect(() =>
      derivePipelineFreshness({
        pendingEventCount: 1,
        processingEventCount: 0,
        failedEventCount: 0,
        oldestUnsettledAt: "not-a-date",
        now,
      })
    ).toThrow(RangeError);
  });
});
