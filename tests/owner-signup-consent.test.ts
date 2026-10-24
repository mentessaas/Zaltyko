import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { SQL } from "drizzle-orm";

import {
  getOwnerContractualConsentRequirement,
  OwnerSignupConsentError,
  recordOwnerSignupConsent,
  type OwnerSignupConsentDatabase,
  type OwnerSignupConsentTransaction,
} from "@/modules/organizations/application/owner-signup-consent";

const userId = "10000000-0000-4000-8000-000000000001";
const policyVersion = "v2-2026-10-01";
const rolloutAt = "2026-10-01T00:00:00.000Z";

function authUser(input: {
  createdAt?: string;
  metadata?: Record<string, unknown>;
} = {}): User {
  return {
    id: userId,
    created_at: input.createdAt ?? "2026-10-02T00:00:00.000Z",
    user_metadata: input.metadata ?? {},
  } as User;
}

function storeWith(results: Array<{ rows: Record<string, unknown>[] }>) {
  const execute = vi.fn(
    async (_query: SQL) => results.shift() ?? { rows: [] }
  );
  const transaction = vi.fn(
    <T>(callback: (transaction: OwnerSignupConsentTransaction) => Promise<T>) =>
      callback({ execute })
  );
  return {
    store: { transaction } as unknown as OwnerSignupConsentDatabase,
    execute,
    transaction,
  };
}

const lockResult = { rows: [] };
const policyResult = {
  rows: [{ policy_version: policyVersion, rollout_at: rolloutAt }],
};

describe("Owner contractual signup consent", () => {
  it("does not ask again when the stored grant matches the current policy", async () => {
    const { store } = storeWith([
      policyResult,
      {
        rows: [
          {
            state: "granted",
            policy_version: policyVersion,
            revoked_at: null,
          },
        ],
      },
    ]);

    await expect(
      getOwnerContractualConsentRequirement(authUser(), store)
    ).resolves.toEqual({
      policyVersion,
      requiresAcceptance: false,
      reason: "already_current",
    });
  });

  it("allows only a fresh signup declaration for a newly created identity", async () => {
    const user = authUser({
      metadata: { legal_consent_version: policyVersion },
    });
    const { store } = storeWith([policyResult, { rows: [] }]);

    await expect(
      getOwnerContractualConsentRequirement(user, store)
    ).resolves.toEqual({
      policyVersion,
      requiresAcceptance: false,
      reason: "fresh_signup_declaration",
    });
  });

  it("requires a fresh explicit acceptance from an existing identity", async () => {
    const user = authUser({
      createdAt: "2026-09-30T23:59:59.000Z",
      metadata: { legal_consent_version: policyVersion },
    });
    const { store } = storeWith([policyResult, { rows: [] }]);

    await expect(
      getOwnerContractualConsentRequirement(user, store)
    ).resolves.toEqual({
      policyVersion,
      requiresAcceptance: true,
      reason: "existing_account",
    });
  });

  it("issues consent and audit statements in the same transaction callback", async () => {
    const { store, execute, transaction } = storeWith([
      lockResult,
      policyResult,
      { rows: [] },
      { rows: [{ user_id: userId }] },
      { rows: [] },
    ]);

    await expect(
      recordOwnerSignupConsent(
        authUser({ metadata: { legal_consent_version: policyVersion } }),
        { requestKey: "owner-signup-request-01" },
        store
      )
    ).resolves.toBe("recorded");

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it("fails closed for an existing identity without explicit acceptance", async () => {
    const { store, execute } = storeWith([
      lockResult,
      policyResult,
      { rows: [] },
    ]);

    await expect(
      recordOwnerSignupConsent(
        authUser({ createdAt: "2026-09-30T23:59:59.000Z" }),
        { requestKey: "owner-signup-request-02" },
        store
      )
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed signup policy metadata without writing a grant", async () => {
    const { store, execute } = storeWith([
      lockResult,
      policyResult,
      { rows: [] },
    ]);

    await expect(
      recordOwnerSignupConsent(
        authUser({ metadata: { legal_consent_version: "current" } }),
        { requestKey: "owner-signup-request-03" },
        store
      )
    ).rejects.toMatchObject({ code: "CONSENT_REJECTED" });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("records an explicit current-policy acceptance for an existing identity", async () => {
    const { store, execute, transaction } = storeWith([
      lockResult,
      policyResult,
      { rows: [] },
      { rows: [{ user_id: userId }] },
      { rows: [] },
    ]);

    await expect(
      recordOwnerSignupConsent(
        authUser({ createdAt: "2026-09-30T23:59:59.000Z" }),
        {
          requestKey: "owner-setup-request-01",
          contractualAcceptance: {
            accepted: true,
            policyVersion,
          },
        },
        store
      )
    ).resolves.toBe("recorded");

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it("fails closed when the consent store is unavailable", async () => {
    const store = {
      transaction: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    } as unknown as OwnerSignupConsentDatabase;

    await expect(
      getOwnerContractualConsentRequirement(authUser(), store)
    ).rejects.toBeInstanceOf(OwnerSignupConsentError);
    await expect(
      getOwnerContractualConsentRequirement(authUser(), store)
    ).rejects.toMatchObject({ code: "CONSENT_STORE_UNAVAILABLE" });
  });
});
