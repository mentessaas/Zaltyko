import { createHash } from "node:crypto";

import type { User } from "@supabase/supabase-js";
import { sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  assertConsentProofMatchesSource,
  isValidConsentProof,
  isValidPolicyVersion,
} from "@/lib/consent/owner-consent";

export type OwnerSignupConsentErrorCode =
  "CONSENT_REQUIRED" | "CONSENT_REJECTED" | "CONSENT_STORE_UNAVAILABLE";

export class OwnerSignupConsentError extends Error {
  constructor(readonly code: OwnerSignupConsentErrorCode) {
    super(code);
    this.name = "OwnerSignupConsentError";
  }
}

type QueryResult = { rows: Record<string, unknown>[] };
export interface OwnerSignupConsentTransaction {
  execute(query: SQL): Promise<QueryResult>;
}
export interface OwnerSignupConsentDatabase {
  transaction<T>(
    callback: (transaction: OwnerSignupConsentTransaction) => Promise<T>
  ): Promise<T>;
}

export interface ExplicitOwnerContractualAcceptance {
  accepted: true;
  policyVersion: string;
}

export type OwnerContractualConsentReason =
  | "already_current"
  | "fresh_signup_declaration"
  | "existing_account"
  | "revoked"
  | "policy_update"
  | "fresh_signup_consent_missing";

export interface OwnerContractualConsentRequirement {
  policyVersion: string;
  requiresAcceptance: boolean;
  reason: OwnerContractualConsentReason;
}

const database = db as unknown as OwnerSignupConsentDatabase;

function required(): never {
  throw new OwnerSignupConsentError("CONSENT_REQUIRED");
}

function signupDeclarationMatches(user: User, policyVersion: string): boolean {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const proof = metadata?.legal_consent_proof;
  if (
    metadata?.legal_consent_version !== policyVersion ||
    !isValidConsentProof(proof)
  ) {
    return false;
  }
  try {
    assertConsentProofMatchesSource("signup", proof);
    return true;
  } catch {
    return false;
  }
}

function hasMalformedSignupConsentDeclaration(user: User): boolean {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const version = metadata?.legal_consent_version;
  const proof = metadata?.legal_consent_proof;
  if (version === undefined && proof === undefined) return false;
  if (!isValidPolicyVersion(version) || !isValidConsentProof(proof)) return true;
  try {
    assertConsentProofMatchesSource("signup", proof);
    return false;
  } catch {
    return true;
  }
}

function isFreshAuthUser(user: User, rolloutAt: unknown): boolean {
  if (typeof user.created_at !== "string") return false;
  const createdAt = Date.parse(user.created_at);
  const rollout =
    rolloutAt instanceof Date
      ? rolloutAt.getTime()
      : typeof rolloutAt === "string"
        ? Date.parse(rolloutAt)
        : Number.NaN;
  return (
    Number.isFinite(createdAt) &&
    Number.isFinite(rollout) &&
    createdAt >= rollout
  );
}

async function readPolicy(tx: OwnerSignupConsentTransaction) {
  const result = await tx.execute(sql`
    select policy_version, rollout_at
    from zaltyko.owner_signup_consent_policy
    where singleton = true
    limit 1
  `);
  const policyVersion = result.rows[0]?.policy_version;
  const rolloutAt = result.rows[0]?.rollout_at;
  if (!isValidPolicyVersion(policyVersion) || !rolloutAt) {
    throw new OwnerSignupConsentError("CONSENT_STORE_UNAVAILABLE");
  }
  return { policyVersion, rolloutAt };
}

/**
 * Returns the live policy version for the public registration form. The form
 * may declare that version after explicit acceptance, but bootstrap still
 * verifies the declaration against this same database policy in its own
 * transaction. If the policy store is unavailable, callers must omit the
 * declaration and let Owner setup require a fresh explicit acceptance.
 */
export async function getOwnerSignupConsentPolicyVersion(
  storeDatabase: OwnerSignupConsentDatabase = database
): Promise<string> {
  try {
    return await storeDatabase.transaction(async (tx) => {
      const policy = await readPolicy(tx);
      return policy.policyVersion;
    });
  } catch (error) {
    if (error instanceof OwnerSignupConsentError) throw error;
    throw new OwnerSignupConsentError("CONSENT_STORE_UNAVAILABLE");
  }
}

async function readExisting(tx: OwnerSignupConsentTransaction, userId: string) {
  const result = await tx.execute(sql`
    select state, policy_version, revoked_at
    from zaltyko.owner_signup_consents
    where user_id = ${userId}::uuid
    for update
  `);
  return result.rows[0];
}

function currentActive(
  existing: Record<string, unknown> | undefined,
  policyVersion: string
) {
  return (
    existing?.state === "granted" &&
    existing.revoked_at === null &&
    existing.policy_version === policyVersion
  );
}

function reasonFor(
  user: User,
  policyVersion: string,
  rolloutAt: unknown,
  existing: Record<string, unknown> | undefined
): OwnerContractualConsentRequirement {
  if (currentActive(existing, policyVersion)) {
    return {
      policyVersion,
      requiresAcceptance: false,
      reason: "already_current",
    };
  }
  if (
    existing &&
    (existing.state === "revoked" || existing.revoked_at !== null)
  ) {
    return { policyVersion, requiresAcceptance: true, reason: "revoked" };
  }
  if (existing) {
    return { policyVersion, requiresAcceptance: true, reason: "policy_update" };
  }
  if (!isFreshAuthUser(user, rolloutAt)) {
    return {
      policyVersion,
      requiresAcceptance: true,
      reason: "existing_account",
    };
  }
  if (signupDeclarationMatches(user, policyVersion)) {
    return {
      policyVersion,
      requiresAcceptance: false,
      reason: "fresh_signup_declaration",
    };
  }
  return {
    policyVersion,
    requiresAcceptance: true,
    reason: "fresh_signup_consent_missing",
  };
}

/**
 * DTO for Owner setup to decide whether to show an explicit contractual
 * acceptance control. It uses the full Auth user returned by verified getUser.
 */
export async function getOwnerContractualConsentRequirement(
  verifiedAuthUser: User,
  storeDatabase: OwnerSignupConsentDatabase = database
): Promise<OwnerContractualConsentRequirement> {
  try {
    return await storeDatabase.transaction(async (tx) => {
      const policy = await readPolicy(tx);
      const existing = await readExisting(tx, verifiedAuthUser.id);
      return reasonFor(
        verifiedAuthUser,
        policy.policyVersion,
        policy.rolloutAt,
        existing
      );
    });
  } catch (error) {
    if (error instanceof OwnerSignupConsentError) throw error;
    throw new OwnerSignupConsentError("CONSENT_STORE_UNAVAILABLE");
  }
}

/**
 * Persist the contractual grant before Owner bootstrap. Auth metadata is used
 * only for a post-rollout signup declaration; pre-existing identities must
 * submit a fresh explicit acceptance in the bootstrap request.
 */
export async function recordOwnerSignupConsent(
  verifiedAuthUser: User,
  input: {
    requestKey: string;
    contractualAcceptance?: ExplicitOwnerContractualAcceptance;
  },
  storeDatabase: OwnerSignupConsentDatabase = database
): Promise<"recorded" | "already_active" | "re_granted"> {
  try {
    if (!input.requestKey || input.requestKey.length < 8) {
      throw new OwnerSignupConsentError("CONSENT_REJECTED");
    }
    return await storeDatabase.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`owner-signup-consent:${verifiedAuthUser.id}`}, 0))`
      );
      const policy = await readPolicy(tx);
      const existing = await readExisting(tx, verifiedAuthUser.id);
      if (currentActive(existing, policy.policyVersion))
        return "already_active";

      const explicitAcceptance = input.contractualAcceptance;
      if (explicitAcceptance && explicitAcceptance.accepted !== true) {
        throw new OwnerSignupConsentError("CONSENT_REJECTED");
      }
      if (
        explicitAcceptance &&
        explicitAcceptance.policyVersion !== policy.policyVersion
      ) {
        throw new OwnerSignupConsentError("CONSENT_REJECTED");
      }
      const freshSignupAccepted =
        !existing &&
        isFreshAuthUser(verifiedAuthUser, policy.rolloutAt) &&
        signupDeclarationMatches(verifiedAuthUser, policy.policyVersion);
      const freshAuthIdentity = isFreshAuthUser(
        verifiedAuthUser,
        policy.rolloutAt
      );
      if (
        !explicitAcceptance &&
        freshAuthIdentity &&
        hasMalformedSignupConsentDeclaration(verifiedAuthUser)
      ) {
        throw new OwnerSignupConsentError("CONSENT_REJECTED");
      }
      if (!explicitAcceptance && !freshSignupAccepted) required();

      const source = explicitAcceptance ? "setup" : "signup";
      const event = existing ? "re_grant" : "grant";
      const consentProof = `${source}:${createHash("sha256")
        .update(input.requestKey)
        .digest("hex")}`;
      if (existing) {
        await tx.execute(sql`
          update zaltyko.owner_signup_consents
          set state = 'granted',
              policy_version = ${policy.policyVersion},
              source = ${source},
              consent_proof = ${consentProof},
              granted_at = now(),
              revoked_at = null,
              updated_at = now()
          where user_id = ${verifiedAuthUser.id}::uuid
        `);
      } else {
        await tx.execute(sql`
          insert into zaltyko.owner_signup_consents
            (user_id, state, policy_version, source, consent_proof)
          values
            (${verifiedAuthUser.id}::uuid, 'granted', ${policy.policyVersion}, ${source}, ${consentProof})
        `);
      }
      await tx.execute(sql`
        insert into zaltyko.owner_signup_consent_audits
          (user_id, event, policy_version, source, consent_proof)
        values
          (${verifiedAuthUser.id}::uuid, ${event}, ${policy.policyVersion}, ${source}, ${consentProof})
      `);
      return existing ? "re_granted" : "recorded";
    });
  } catch (error) {
    if (error instanceof OwnerSignupConsentError) throw error;
    throw new OwnerSignupConsentError("CONSENT_STORE_UNAVAILABLE");
  }
}
