/**
 * Tests para el gate de envío de emails transaccionales soft.
 *
 * Issue: ZAL-328 [D-006/WD→P&S] Modelar status semánticas academy.
 * Spec:   ZAL-139 v0.2 §6 + ZAL-315 §3 (criterios de seguridad B3).
 *
 * Cobertura objetivo: >=80% sobre src/lib/academy-status.ts.
 * Estos tests son unitarios (db mockeado). El test SQL real se valida
 * por separado con `pnpm test:rls:local` en PostgreSQL efímero.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const { mockSelect } = vi.hoisted(() => {
  return { mockSelect: vi.fn() };
});

// Mock del módulo db antes de importar el helper.
vi.mock("@/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

// Mockeamos el logger para silenciar errores esperados.
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import {
  isAcademyBlockedFromSending,
  getAcademySendingEligibilityBulk,
  describeBlockingReason,
  academyMayReceiveOnboardingEmail,
  BLOCKED_SENDING_STATUS_VALUES,
  type AcademySendingEligibility,
} from "@/lib/academy-status";

interface DbRow {
  id: string;
  status: string | null;
  isSuspended: boolean | null;
}

/**
 * Construye un chainable que devuelve las filas pedidas.
 */
function buildChain(rows: DbRow[] | Error) {
  const chain: Record<string, unknown> = {};
  const makeThenable = (resolved: DbRow[] | Error) => {
    Object.defineProperty(chain, "then", {
      value: (onFulfilled: (v: DbRow[]) => unknown) => {
        if (resolved instanceof Error) {
          return Promise.reject(resolved).catch(onFulfilled);
        }
        return Promise.resolve(resolved).then(onFulfilled);
      },
      writable: true,
    });
  };
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  if (rows instanceof Error) makeThenable(rows);
  else makeThenable(rows);
  return chain;
}

describe("academy-status sending gate", () => {
  beforeEach(() => {
    mockSelect.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("isAcademyBlockedFromSending", () => {
    it("returns not_found for empty academyId", async () => {
      const result = await isAcademyBlockedFromSending("");
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe("not_found");
      expect(result.status).toBeNull();
      expect(result.isFraudHold).toBe(false);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("returns not_found when academy does not exist", async () => {
      mockSelect.mockReturnValue(buildChain([]));
      const result = await isAcademyBlockedFromSending("00000000-0000-0000-0000-000000000000");
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe("not_found");
      expect(result.status).toBeNull();
    });

    it("returns blocked=false for status=active", async () => {
      mockSelect.mockReturnValue(
        buildChain([
          { id: "a1", status: "active", isSuspended: false },
        ])
      );
      const result = await isAcademyBlockedFromSending("a1");
      expect(result.blocked).toBe(false);
      expect(result.reason).toBeNull();
      expect(result.status).toBe("active");
      expect(result.isFraudHold).toBe(false);
    });

    it("returns blocked=false for status=trial", async () => {
      mockSelect.mockReturnValue(
        buildChain([
          { id: "a1", status: "trial", isSuspended: false },
        ])
      );
      const result = await isAcademyBlockedFromSending("a1");
      expect(result.blocked).toBe(false);
      expect(result.status).toBe("trial");
    });

    it("returns blocked=true with reason=suspended for status=suspended", async () => {
      mockSelect.mockReturnValue(
        buildChain([
          { id: "a1", status: "suspended", isSuspended: true },
        ])
      );
      const result = await isAcademyBlockedFromSending("a1");
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe("suspended");
      expect(result.status).toBe("suspended");
      expect(result.isFraudHold).toBe(false);
    });

    it("returns blocked=true with reason=churned for status=churned", async () => {
      mockSelect.mockReturnValue(
        buildChain([
          { id: "a1", status: "churned", isSuspended: false },
        ])
      );
      const result = await isAcademyBlockedFromSending("a1");
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe("churned");
      expect(result.status).toBe("churned");
      expect(result.isFraudHold).toBe(false);
    });

    it("returns blocked=true with reason=fraud_hold for status=fraud_hold", async () => {
      mockSelect.mockReturnValue(
        buildChain([
          { id: "a1", status: "fraud_hold", isSuspended: false },
        ])
      );
      const result = await isAcademyBlockedFromSending("a1");
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe("fraud_hold");
      expect(result.status).toBe("fraud_hold");
      expect(result.isFraudHold).toBe(true);
    });

    it("returns blocked=true with reason=is_suspended_legacy when status=active but isSuspended=true", async () => {
      // Esto no debería ocurrir tras la migración (el trigger sync lo evita),
      // pero defense in depth: si el legacy flag está a true, bloqueamos.
      mockSelect.mockReturnValue(
        buildChain([
          { id: "a1", status: "active", isSuspended: true },
        ])
      );
      const result = await isAcademyBlockedFromSending("a1");
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe("is_suspended_legacy");
      expect(result.status).toBe("active");
    });

    it("fraud_hold wins over isSuspended=false (security priority)", async () => {
      mockSelect.mockReturnValue(
        buildChain([
          { id: "a1", status: "fraud_hold", isSuspended: false },
        ])
      );
      const result = await isAcademyBlockedFromSending("a1");
      expect(result.blocked).toBe(true);
      expect(result.reason).toBe("fraud_hold");
      expect(result.isFraudHold).toBe(true);
    });

    it("returns blocked=true when DB query fails (fail-closed)", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        mockSelect.mockReturnValue(buildChain(new Error("DB down")));
        const result = await isAcademyBlockedFromSending("a1");
        expect(result.blocked).toBe(true);
        expect(result.reason).toBe("not_found");
        expect(result.status).toBeNull();
      } finally {
        consoleError.mockRestore();
      }
    });

    it("normalizes null status to 'active' lookup semantics", async () => {
      // Si status es null (sin backfill), no debe bloquear — el default es 'active'.
      // El check constraint NOT NULL DEFAULT 'active' lo impide en la práctica,
      // pero validamos la rama defensiva.
      mockSelect.mockReturnValue(
        buildChain([
          { id: "a1", status: null, isSuspended: false },
        ])
      );
      const result = await isAcademyBlockedFromSending("a1");
      expect(result.blocked).toBe(false);
      expect(result.status).toBeNull();
    });
  });

  describe("BLOCKED_SENDING_STATUS_VALUES", () => {
    it("includes suspended, churned, fraud_hold", () => {
      expect(BLOCKED_SENDING_STATUS_VALUES).toContain("suspended");
      expect(BLOCKED_SENDING_STATUS_VALUES).toContain("churned");
      expect(BLOCKED_SENDING_STATUS_VALUES).toContain("fraud_hold");
    });

    it("does NOT include active or trial (these are eligible)", () => {
      expect(BLOCKED_SENDING_STATUS_VALUES).not.toContain("active");
      expect(BLOCKED_SENDING_STATUS_VALUES).not.toContain("trial");
    });
  });

  describe("getAcademySendingEligibilityBulk", () => {
    it("returns empty map for empty input", async () => {
      const result = await getAcademySendingEligibilityBulk([]);
      expect(result.size).toBe(0);
    });

    it("returns not_found for empty academyId without hitting DB", async () => {
      const result = await getAcademySendingEligibilityBulk(["", "  "]);
      expect(result.size).toBe(2);
      for (const v of result.values()) {
        expect(v.blocked).toBe(true);
        expect(v.reason).toBe("not_found");
      }
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("returns bulk eligibility for mixed statuses", async () => {
      mockSelect.mockReturnValue(
        buildChain([
          { id: "a1", status: "active", isSuspended: false },
          { id: "a2", status: "churned", isSuspended: false },
          { id: "a3", status: "fraud_hold", isSuspended: false },
          { id: "a4", status: "trial", isSuspended: false },
        ])
      );
      const result = await getAcademySendingEligibilityBulk(["a1", "a2", "a3", "a4", "missing"]);
      expect(result.size).toBe(5);
      const a1 = result.get("a1");
      const a2 = result.get("a2");
      const a3 = result.get("a3");
      const a4 = result.get("a4");
      const missing = result.get("missing");
      expect(a1?.blocked).toBe(false);
      expect(a2?.blocked).toBe(true);
      expect(a2?.reason).toBe("churned");
      expect(a3?.blocked).toBe(true);
      expect(a3?.reason).toBe("fraud_hold");
      expect(a3?.isFraudHold).toBe(true);
      expect(a4?.blocked).toBe(false);
      expect(a4?.status).toBe("trial");
      expect(missing?.blocked).toBe(true);
      expect(missing?.reason).toBe("not_found");
    });

    it("deduplicates input IDs", async () => {
      mockSelect.mockReturnValue(
        buildChain([{ id: "a1", status: "active", isSuspended: false }])
      );
      const result = await getAcademySendingEligibilityBulk(["a1", "a1", "a1"]);
      expect(result.size).toBe(1);
      expect(result.get("a1")?.blocked).toBe(false);
    });

    it("blocks via legacy isSuspended flag in bulk path", async () => {
      mockSelect.mockReturnValue(
        buildChain([
          { id: "a1", status: "active", isSuspended: true },
        ])
      );
      const result = await getAcademySendingEligibilityBulk(["a1"]);
      expect(result.get("a1")?.blocked).toBe(true);
      expect(result.get("a1")?.reason).toBe("is_suspended_legacy");
      expect(result.get("a1")?.status).toBe("active");
    });

    it("fails closed: blocks all on DB error", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        mockSelect.mockReturnValue(buildChain(new Error("DB down")));
        const result = await getAcademySendingEligibilityBulk(["a1", "a2"]);
        expect(result.size).toBe(2);
        for (const v of result.values()) {
          expect(v.blocked).toBe(true);
          expect(v.reason).toBe("not_found");
        }
      } finally {
        consoleError.mockRestore();
      }
    });
  });

  describe("describeBlockingReason", () => {
    it("returns 'eligible' when not blocked", () => {
      expect(
        describeBlockingReason({ blocked: false, reason: null, isFraudHold: false })
      ).toBe("eligible");
    });

    it("returns fraud_hold metric when reason matches", () => {
      expect(
        describeBlockingReason({
          blocked: true,
          reason: "fraud_hold",
          isFraudHold: true,
        })
      ).toBe("blocked_sending:fraud_hold");
    });

    it("returns churned metric", () => {
      expect(
        describeBlockingReason({
          blocked: true,
          reason: "churned",
          isFraudHold: false,
        })
      ).toBe("blocked_sending:churned");
    });

    it("returns suspended metric", () => {
      expect(
        describeBlockingReason({
          blocked: true,
          reason: "suspended",
          isFraudHold: false,
        })
      ).toBe("blocked_sending:suspended");
    });

    it("returns is_suspended_legacy metric (defense in depth)", () => {
      expect(
        describeBlockingReason({
          blocked: true,
          reason: "is_suspended_legacy",
          isFraudHold: false,
        })
      ).toBe("blocked_sending:is_suspended_legacy");
    });

    it("returns not_found metric when reason is null but blocked (fail-closed)", () => {
      expect(
        describeBlockingReason({
          blocked: true,
          reason: null,
          isFraudHold: false,
        })
      ).toBe("blocked_sending:not_found");
    });
  });

  describe("academyMayReceiveOnboardingEmail", () => {
    it("returns true for active academies", async () => {
      mockSelect.mockReturnValue(
        buildChain([{ id: "a1", status: "active", isSuspended: false }])
      );
      const result = await academyMayReceiveOnboardingEmail("a1");
      expect(result).toBe(true);
    });

    it("returns false for churned", async () => {
      mockSelect.mockReturnValue(
        buildChain([{ id: "a1", status: "churned", isSuspended: false }])
      );
      const result = await academyMayReceiveOnboardingEmail("a1");
      expect(result).toBe(false);
    });

    it("returns false for fraud_hold", async () => {
      mockSelect.mockReturnValue(
        buildChain([{ id: "a1", status: "fraud_hold", isSuspended: false }])
      );
      const result = await academyMayReceiveOnboardingEmail("a1");
      expect(result).toBe(false);
    });

    it("returns false for missing academy", async () => {
      mockSelect.mockReturnValue(buildChain([]));
      const result = await academyMayReceiveOnboardingEmail("missing");
      expect(result).toBe(false);
    });
  });

  describe("integration: full status matrix", () => {
    it("decision matrix matches spec v0.2 §6", async () => {
      const cases: Array<{
        status: string;
        isSuspended: boolean;
        blocked: boolean;
        reason: AcademySendingEligibility["reason"];
      }> = [
        { status: "active", isSuspended: false, blocked: false, reason: null },
        { status: "trial", isSuspended: false, blocked: false, reason: null },
        { status: "suspended", isSuspended: false, blocked: true, reason: "suspended" },
        { status: "suspended", isSuspended: true, blocked: true, reason: "suspended" },
        { status: "churned", isSuspended: false, blocked: true, reason: "churned" },
        { status: "churned", isSuspended: true, blocked: true, reason: "churned" },
        { status: "fraud_hold", isSuspended: false, blocked: true, reason: "fraud_hold" },
        { status: "fraud_hold", isSuspended: true, blocked: true, reason: "fraud_hold" },
        // Drift: status=active pero legacy isSuspended=true. Defense in depth.
        { status: "active", isSuspended: true, blocked: true, reason: "is_suspended_legacy" },
      ];

      for (const c of cases) {
        mockSelect.mockReturnValue(
          buildChain([{ id: "x", status: c.status, isSuspended: c.isSuspended }])
        );
        const result = await isAcademyBlockedFromSending("x");
        expect(result.blocked).toBe(c.blocked);
        expect(result.reason).toBe(c.reason);
      }
    });
  });
});
