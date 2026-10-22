import type { User } from "@supabase/supabase-js";
import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  assertConsentProofMatchesSource,
  isValidPolicyVersion,
  isValidConsentProof,
} from "@/lib/consent/owner-consent";

type ConsentMetadata = {
  legal_consent_version?: unknown;
  legal_consent_proof?: unknown;
};

export type OwnerSignupConsentErrorCode =
  "CONSENT_REQUIRED" | "CONSENT_REJECTED" | "CONSENT_STORE_UNAVAILABLE";

export class OwnerSignupConsentError extends Error {
  constructor(readonly code: OwnerSignupConsentErrorCode) {
    super(code);
    this.name = "OwnerSignupConsentError";
  }
}

type QueryResult = { rows: Record<string, unknown>[] };
export interface OwnerConsentTransaction {
  execute(query: SQL): Promise<QueryResult>;
}
export interface OwnerConsentDatabase {
  transaction<T>(
    callback: (transaction: OwnerConsentTransaction) => Promise<T>
  ): Promise<T>;
}

const database = db as unknown as OwnerConsentDatabase;

function required(): never {
  throw new OwnerSignupConsentError("CONSENT_REQUIRED");
}

function assertCurrentConsent(
  consent: Record<string, unknown> | undefined,
  currentPolicyVersion: string
): void {
  if (!consent) required();
  const active =
    consent.state === "granted" &&
    consent.revoked_at === null &&
    consent.policy_version === currentPolicyVersion;
  if (!active) required();
}

/**
 * Gate de bootstrap Owner. user_metadata solo transporta lo declarado en el
 * signup; el consentimiento efectivo queda en owner_consent y su auditoría.
 */
export async function recordOwnerSignupConsent(
  user: User,
  storeDatabase: OwnerConsentDatabase = database
): Promise<"recorded" | "already_active"> {
  try {
    return await storeDatabase.transaction(async (tx) => {
      // Serializa reintentos concurrentes para que exista un único grant/audit.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`owner-consent:${user.id}`}, 0))`
      );

      const config = await tx.execute(sql`
        select value from app_config
        where key = 'consent.policy_version'
        limit 1
      `);
      const currentPolicyVersion = config.rows[0]?.value;
      if (!isValidPolicyVersion(currentPolicyVersion)) {
        throw new OwnerSignupConsentError("CONSENT_STORE_UNAVAILABLE");
      }

      const existingResult = await tx.execute(sql`
        select state, policy_version, revoked_at
        from owner_consent
        where owner_id = ${user.id}::uuid
        for update
      `);
      const existing = existingResult.rows[0];
      if (existing) {
        assertCurrentConsent(existing, currentPolicyVersion);
        return "already_active";
      }

      const metadata = (user.user_metadata ?? {}) as ConsentMetadata;
      const policyVersion = metadata.legal_consent_version;
      const consentProof = metadata.legal_consent_proof;
      if (policyVersion === undefined && consentProof === undefined) required();
      if (
        !isValidPolicyVersion(policyVersion) ||
        !isValidConsentProof(consentProof)
      ) {
        throw new OwnerSignupConsentError("CONSENT_REJECTED");
      }
      try {
        assertConsentProofMatchesSource("signup", consentProof);
      } catch {
        throw new OwnerSignupConsentError("CONSENT_REJECTED");
      }
      if (policyVersion !== currentPolicyVersion) required();

      // owner_consent.owner_id references profiles.user_id. Do not create a
      // profile from editable Auth metadata merely to satisfy this FK.
      const profileResult = await tx.execute(sql`
        select 1 from profiles where user_id = ${user.id}::uuid limit 1
      `);
      if (!profileResult.rows[0]) required();

      const inserted = await tx.execute(sql`
        insert into owner_consent
          (owner_id, state, policy_version, source, consent_proof)
        values
          (${user.id}::uuid, 'granted', ${policyVersion}, 'signup', ${consentProof})
        on conflict (owner_id) do nothing
        returning id
      `);
      if (!inserted.rows[0]) {
        // A writer outside this lock may have won the unique-key race.
        const reread = await tx.execute(sql`
          select state, policy_version, revoked_at
          from owner_consent where owner_id = ${user.id}::uuid for update
        `);
        assertCurrentConsent(reread.rows[0], currentPolicyVersion);
        return "already_active";
      }

      await tx.execute(sql`
        insert into owner_consent_audit
          (owner_id, event, policy_version, source, consent_proof, actor)
        values
          (${user.id}::uuid, 'grant', ${policyVersion}, 'signup', ${consentProof}, ${`owner:${user.id}`})
      `);
      return "recorded";
    });
  } catch (error) {
    if (error instanceof OwnerSignupConsentError) throw error;
    // Suppress database/config/FK/audit diagnostics at the route boundary.
    throw new OwnerSignupConsentError("CONSENT_STORE_UNAVAILABLE");
  }
}
