// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import {
  clearPendingManualPayment,
  createManualPaymentRetrySnapshot,
  persistPendingManualPayment,
  readPendingManualPayments,
} from "@/components/owner-dashboard/manual-payment-retry-storage";

const organizationId = "74000000-0000-4000-8000-000000000001";
const chargeId = "74000000-0000-4000-8000-000000000002";
const actorA = "a".repeat(64);
const actorB = "b".repeat(64);

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("crypto", webcrypto);
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe("almacenamiento de reintentos de pagos manuales", () => {
  it("separa por identidad y borra solo el comando exacto resuelto", async () => {
    const makeSnapshot = (actorScopeHash: string, suffix: string) =>
      createManualPaymentRetrySnapshot({
        actorScopeHash,
        currency: "EUR",
        expectedOutstandingCents: 5000,
        idempotencyKey: `owner-manual-payment:74000000-0000-4000-8000-00000000000${suffix}`,
        body: {
          organizationId,
          chargeId,
          amountCents: 1250,
          method: "bank_transfer",
          receivedAt: "2026-10-28T10:00:00.000Z",
        },
      });
    const snapshotA = await makeSnapshot(actorA, "3");
    const snapshotB = await makeSnapshot(actorB, "4");
    expect(snapshotA).not.toBeNull();
    expect(snapshotB).not.toBeNull();
    expect(persistPendingManualPayment(window.localStorage, snapshotA!)).toBe(true);
    expect(persistPendingManualPayment(window.localStorage, snapshotB!)).toBe(true);

    expect(readPendingManualPayments(window.localStorage, actorA)).toMatchObject({
      status: "pending",
      snapshots: [{ actorScopeHash: actorA }],
    });
    expect(readPendingManualPayments(window.localStorage, actorB)).toMatchObject({
      status: "pending",
      snapshots: [{ actorScopeHash: actorB }],
    });

    expect(clearPendingManualPayment(window.localStorage, snapshotA!)).toBe(true);
    expect(readPendingManualPayments(window.localStorage, actorA)).toEqual({
      status: "none",
    });
    expect(readPendingManualPayments(window.localStorage, actorB)).toMatchObject({
      status: "pending",
      snapshots: [{ idempotencyKey: snapshotB!.idempotencyKey }],
    });
  });
});
