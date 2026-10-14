import { PgDialect } from "drizzle-orm/pg-core";
import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";

import {
  getOwnerContractualConsentRequirement,
  OwnerSignupConsentError,
  recordOwnerSignupConsent,
  type OwnerSignupConsentDatabase,
  type OwnerSignupConsentTransaction,
} from "@/modules/organizations/application/owner-signup-consent";

vi.unmock("drizzle-orm");
vi.unmock("drizzle-orm/pg-core");

const policyVersion = "v1-2026-08-01";
const rolloutAt = "2026-10-14T10:00:00.000Z";
const oldCreatedAt = "2026-10-13T10:00:00.000Z";
const newCreatedAt = "2026-10-14T10:01:00.000Z";
const userId = "f0a8d116-459b-4e4c-b4d0-865f63180123";

type StoredConsent = {
  state: string;
  policy_version: string;
  revoked_at: string | null;
  consent_proof: string;
};

class FakeDatabase implements OwnerSignupConsentDatabase {
  existing?: StoredConsent;
  readonly audits: Array<Record<string, unknown>> = [];
  failAudit = false;
  private readonly dialect = new PgDialect();

  async transaction<T>(
    callback: (transaction: OwnerSignupConsentTransaction) => Promise<T>
  ): Promise<T> {
    const beforeConsent = this.existing && { ...this.existing };
    const beforeAudits = [...this.audits];
    const tx = {
      execute: async (query: SQL) => {
        const { sql: statement, params } = this.dialect.sqlToQuery(query);
        if (statement.includes("owner_signup_consent_policy")) {
          return {
            rows: [{ policy_version: policyVersion, rollout_at: rolloutAt }],
          };
        }
        if (statement.includes("select state, policy_version")) {
          return { rows: this.existing ? [{ ...this.existing }] : [] };
        }
        if (statement.includes("update zaltyko.owner_signup_consents")) {
          this.existing = {
            state: "granted",
            policy_version: policyVersion,
            revoked_at: null,
            consent_proof: "setup:updated-proof",
          };
          return { rows: [] };
        }
        if (statement.includes("insert into zaltyko.owner_signup_consents")) {
          this.existing = {
            state: "granted",
            policy_version: String(params[1]),
            revoked_at: null,
            consent_proof: String(params[3]),
          };
          return { rows: [] };
        }
        if (
          statement.includes("insert into zaltyko.owner_signup_consent_audits")
        ) {
          if (this.failAudit) throw new Error("simulated audit failure");
          this.audits.push({
            user_id: params[0],
            event: params[1],
            policy_version: params[2],
            source: params[3],
            consent_proof: params[4],
          });
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    try {
      return await callback(tx);
    } catch (error) {
      this.existing = beforeConsent;
      this.audits.splice(0, this.audits.length, ...beforeAudits);
      throw error;
    }
  }
}

function authUser(
  createdAt: string,
  userMetadata: Record<string, unknown> = {
    legal_consent_version: policyVersion,
  }
): User {
  return {
    id: userId,
    created_at: createdAt,
    user_metadata: userMetadata,
  } as unknown as User;
}

describe("Owner signup contractual consent", () => {
  it("no exige una segunda aceptación a un signup fresco con declaración vigente", async () => {
    const store = new FakeDatabase();
    await expect(
      getOwnerContractualConsentRequirement(authUser(newCreatedAt), store)
    ).resolves.toEqual({
      policyVersion,
      requiresAcceptance: false,
      reason: "fresh_signup_declaration",
    });
  });

  it("no convierte metadata histórica en grant cuando la identidad es anterior al rollout", async () => {
    const store = new FakeDatabase();
    await expect(
      recordOwnerSignupConsent(
        authUser(oldCreatedAt),
        { requestKey: "request-old-user-123" },
        store
      )
    ).rejects.toMatchObject<Partial<OwnerSignupConsentError>>({
      code: "CONSENT_REQUIRED",
    });
    expect(store.existing).toBeUndefined();
    expect(store.audits).toHaveLength(0);
    await expect(
      getOwnerContractualConsentRequirement(authUser(oldCreatedAt), store)
    ).resolves.toMatchObject({
      policyVersion,
      requiresAcceptance: true,
      reason: "existing_account",
    });
  });

  it("acepta un signup Auth posterior al rollout con declaración de versión vigente", async () => {
    const store = new FakeDatabase();
    await expect(
      recordOwnerSignupConsent(
        authUser(newCreatedAt),
        { requestKey: "request-new-user-123" },
        store
      )
    ).resolves.toBe("recorded");
    expect(store.existing).toMatchObject({
      state: "granted",
      policy_version: policyVersion,
    });
    expect(store.existing?.consent_proof).toMatch(/^signup:[a-f0-9]{64}$/);
    expect(store.audits).toHaveLength(1);
  });

  it("rechaza metadata malformada, sin convertir una versión anterior en grant", async () => {
    const store = new FakeDatabase();
    await expect(
      recordOwnerSignupConsent(
        authUser(newCreatedAt, { legal_consent_version: "broken" }),
        { requestKey: "request-bad-metadata-123" },
        store
      )
    ).rejects.toMatchObject({ code: "CONSENT_REJECTED" });
    await expect(
      recordOwnerSignupConsent(
        authUser(newCreatedAt, { legal_consent_version: "v1-2026-07-01" }),
        { requestKey: "request-old-policy-123" },
        store
      )
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(store.existing).toBeUndefined();
    expect(store.audits).toHaveLength(0);
  });

  it("permite aceptación explícita para cuenta existente y regrant revocado", async () => {
    const store = new FakeDatabase();
    await expect(
      recordOwnerSignupConsent(
        authUser(oldCreatedAt),
        {
          requestKey: "request-old-user-123",
          contractualAcceptance: { accepted: true, policyVersion },
        },
        store
      )
    ).resolves.toBe("recorded");
    store.existing = {
      state: "revoked",
      policy_version: policyVersion,
      revoked_at: "2026-10-14T11:00:00.000Z",
      consent_proof: "signup:previous-proof",
    };
    await expect(
      recordOwnerSignupConsent(
        authUser(oldCreatedAt),
        {
          requestKey: "request-regrant-user-123",
          contractualAcceptance: { accepted: true, policyVersion },
        },
        store
      )
    ).resolves.toBe("re_granted");
    expect(store.existing).toMatchObject({
      state: "granted",
      revoked_at: null,
    });
    expect(store.audits.map((audit) => audit.event)).toEqual([
      "grant",
      "re_grant",
    ]);
  });

  it("no reotorga una fila revocada desde metadata aunque Auth sea reciente", async () => {
    const store = new FakeDatabase();
    store.existing = {
      state: "revoked",
      policy_version: policyVersion,
      revoked_at: "2026-10-14T11:00:00.000Z",
      consent_proof: "signup:previous-proof",
    };
    await expect(
      recordOwnerSignupConsent(
        authUser(newCreatedAt),
        { requestKey: "request-fresh-revoked-123" },
        store
      )
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(store.existing.state).toBe("revoked");
    expect(store.audits).toHaveLength(0);
    await expect(
      getOwnerContractualConsentRequirement(authUser(newCreatedAt), store)
    ).resolves.toMatchObject({ requiresAcceptance: true, reason: "revoked" });
  });

  it("no sustituye una versión canónica obsoleta sin aceptación explícita", async () => {
    const store = new FakeDatabase();
    store.existing = {
      state: "granted",
      policy_version: "v1-2026-07-01",
      revoked_at: null,
      consent_proof: "signup:old-policy-proof",
    };
    await expect(
      recordOwnerSignupConsent(
        authUser(newCreatedAt),
        { requestKey: "request-stale-policy-123" },
        store
      )
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    await expect(
      getOwnerContractualConsentRequirement(authUser(newCreatedAt), store)
    ).resolves.toMatchObject({
      requiresAcceptance: true,
      reason: "policy_update",
    });
    expect(store.audits).toHaveLength(0);
  });

  it("replay activo no duplica auditoría aunque la identidad sea anterior al rollout", async () => {
    const store = new FakeDatabase();
    store.existing = {
      state: "granted",
      policy_version: policyVersion,
      revoked_at: null,
      consent_proof: "signup:existing-proof",
    };
    await expect(
      recordOwnerSignupConsent(
        authUser(oldCreatedAt),
        { requestKey: "request-replay-user-123" },
        store
      )
    ).resolves.toBe("already_active");
    expect(store.audits).toHaveLength(0);
  });

  it("rollback de auditoría revierte también el grant", async () => {
    const store = new FakeDatabase();
    store.failAudit = true;
    await expect(
      recordOwnerSignupConsent(
        authUser(newCreatedAt),
        { requestKey: "request-audit-fail-123" },
        store
      )
    ).rejects.toMatchObject({ code: "CONSENT_STORE_UNAVAILABLE" });
    expect(store.existing).toBeUndefined();
    expect(store.audits).toHaveLength(0);
  });
});
