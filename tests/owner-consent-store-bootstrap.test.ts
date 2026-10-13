import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  OwnerSignupConsentError,
  recordOwnerSignupConsent,
  type OwnerConsentDatabase,
  type OwnerConsentTransaction,
} from "@/lib/consent/owner-consent-store";

const ownerId = "f0a8d116-459b-4e4c-b4d0-865f63180123";
const policyVersion = "v1-2026-10-14";
const user = (metadata: Record<string, unknown> = {}): User =>
  ({ id: ownerId, user_metadata: metadata }) as User;
const validMetadata = {
  legal_consent_version: policyVersion,
  legal_consent_proof: "signup:register-form-v1",
};

function fakeDatabase(options?: {
  currentPolicy?: string | null;
  existing?: {
    state: string;
    policy_version: string;
    revoked_at?: string | null;
  };
  conflictOnInsert?: boolean;
  conflictReread?: {
    state: string;
    policy_version: string;
    revoked_at?: string | null;
  } | null;
  profile?: boolean;
  failAudit?: boolean;
}) {
  const state = {
    consent: options?.existing
      ? { ...options.existing }
      : (null as null | Record<string, unknown>),
    audits: [] as Record<string, unknown>[],
    transactions: 0,
  };
  let tail = Promise.resolve();
  const database: OwnerConsentDatabase = {
    async transaction<T>(
      callback: (tx: OwnerConsentTransaction) => Promise<T>
    ) {
      const prior = tail;
      let release = () => {};
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await prior;
      const snapshot = structuredClone(state);
      state.transactions += 1;
      let queryIndex = 0;
      const tx: OwnerConsentTransaction = {
        async execute() {
          const index = queryIndex++;
          if (index === 0) return { rows: [] };
          if (index === 1) {
            return {
              rows:
                options?.currentPolicy === null
                  ? []
                  : [{ value: options?.currentPolicy ?? policyVersion }],
            };
          }
          if (index === 2)
            return { rows: state.consent ? [state.consent] : [] };
          if (index === 3)
            return {
              rows: options?.profile === false ? [] : [{ "?column?": 1 }],
            };
          if (index === 4) {
            if (options?.conflictOnInsert) return { rows: [] };
            if (state.consent) return { rows: [] };
            state.consent = {
              state: "granted",
              policy_version: policyVersion,
              revoked_at: null,
            };
            return { rows: [{ id: "consent-row" }] };
          }
          if (index === 5) {
            if (options?.conflictOnInsert) {
              return {
                rows: options.conflictReread ? [options.conflictReread] : [],
              };
            }
            if (options?.failAudit)
              throw new Error("simulated audit write failure");
            state.audits.push({ event: "grant", ownerId });
            return { rows: [] };
          }
          throw new Error("unexpected query " + index);
        },
      };
      try {
        return await callback(tx);
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      } finally {
        release();
      }
    },
  };
  return { database, state };
}

describe("recordOwnerSignupConsent para bootstrap", () => {
  it("rechaza ausencia de consentimiento sin escribir filas", async () => {
    const fake = fakeDatabase();
    await expect(
      recordOwnerSignupConsent(user(), fake.database)
    ).rejects.toMatchObject({
      code: "CONSENT_REQUIRED",
    });
    expect(fake.state.consent).toBeNull();
    expect(fake.state.audits).toHaveLength(0);
  });

  it("rechaza versión obsoleta y consentimiento inválido", async () => {
    const stale = fakeDatabase();
    await expect(
      recordOwnerSignupConsent(
        user({
          ...validMetadata,
          legal_consent_version: "v1-2026-10-13",
        }),
        stale.database
      )
    ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    const malformed = fakeDatabase();
    await expect(
      recordOwnerSignupConsent(
        user({
          ...validMetadata,
          legal_consent_proof: "settings:wrong-source",
        }),
        malformed.database
      )
    ).rejects.toMatchObject({ code: "CONSENT_REJECTED" });
    expect(stale.state.consent).toBeNull();
    expect(malformed.state.consent).toBeNull();
  });

  it.each([
    [
      "revocado",
      {
        state: "revoked",
        policy_version: policyVersion,
        revoked_at: "2026-10-14T00:00:00Z",
      },
    ],
    [
      "versión antigua",
      { state: "granted", policy_version: "v1-2026-10-13", revoked_at: null },
    ],
  ])(
    "no re-concede consentimiento %s desde metadata",
    async (_label, existing) => {
      const fake = fakeDatabase({ existing });
      await expect(
        recordOwnerSignupConsent(user(validMetadata), fake.database)
      ).rejects.toMatchObject({
        code: "CONSENT_REQUIRED",
      });
      expect(fake.state.consent).toEqual(existing);
      expect(fake.state.audits).toHaveLength(0);
    }
  );

  it("no acepta metadata como sustituto del perfil requerido por la FK", async () => {
    const fake = fakeDatabase({ profile: false });
    await expect(
      recordOwnerSignupConsent(user(validMetadata), fake.database)
    ).rejects.toMatchObject({
      code: "CONSENT_REQUIRED",
    });
    expect(fake.state.consent).toBeNull();
    expect(fake.state.audits).toHaveLength(0);
  });

  it.each([
    ["ausente", null],
    [
      "incompleta",
      {
        state: "granted",
        policy_version: policyVersion,
        revoked_at: undefined,
      },
    ],
  ])(
    "falla cerrado si el reread tras conflicto es %s",
    async (_label, conflictReread) => {
      const fake = fakeDatabase({ conflictOnInsert: true, conflictReread });
      await expect(
        recordOwnerSignupConsent(user(validMetadata), fake.database)
      ).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
      expect(fake.state.audits).toHaveLength(0);
    }
  );

  it("reutiliza consentimiento ya activo sin releer metadata de signup", async () => {
    const existing = {
      state: "granted",
      policy_version: policyVersion,
      revoked_at: null,
    };
    const fake = fakeDatabase({ existing });
    await expect(recordOwnerSignupConsent(user(), fake.database)).resolves.toBe(
      "already_active"
    );
    expect(fake.state.audits).toHaveLength(0);
  });

  it("replay concurrente crea una concesión y una auditoría", async () => {
    const fake = fakeDatabase();
    const outcomes = await Promise.all([
      recordOwnerSignupConsent(user(validMetadata), fake.database),
      recordOwnerSignupConsent(user(validMetadata), fake.database),
    ]);
    expect(outcomes.sort()).toEqual(["already_active", "recorded"]);
    expect(fake.state.audits).toHaveLength(1);
  });

  it("revierte la concesión si falla la auditoría", async () => {
    const fake = fakeDatabase({ failAudit: true });
    await expect(
      recordOwnerSignupConsent(user(validMetadata), fake.database)
    ).rejects.toBeInstanceOf(OwnerSignupConsentError);
    expect(fake.state.consent).toBeNull();
    expect(fake.state.audits).toHaveLength(0);
  });

  it("falla cerrado si falta la versión de política del servidor", async () => {
    const fake = fakeDatabase({ currentPolicy: null });
    await expect(
      recordOwnerSignupConsent(user(validMetadata), fake.database)
    ).rejects.toMatchObject({
      code: "CONSENT_STORE_UNAVAILABLE",
    });
    expect(fake.state.consent).toBeNull();
  });
});
