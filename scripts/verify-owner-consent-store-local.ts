import assert from "node:assert/strict";

import { Pool } from "pg";
import type { User } from "@supabase/supabase-js";

const currentPolicyVersion = "v1-2026-08-01";
const signupMetadata = {
  legal_consent_version: currentPolicyVersion,
  legal_consent_proof: "signup:register-form-v1",
};
const concurrentOwnerId = "f0a8d116-459b-4e4c-b4d0-865f63180123";
const auditFailureOwnerId = "f0a8d116-459b-4e4c-b4d0-865f63180124";
const noProfileOwnerId = "f0a8d116-459b-4e4c-b4d0-865f63180125";

class LocalHarnessGuardError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function validateLocalDatabaseEnvironment(env: NodeJS.ProcessEnv) {
  if (env.ZALTYKO_OWNER_CONSENT_LOCAL_PG !== "1" || env.NODE_ENV !== "test") {
    throw new LocalHarnessGuardError("LOCAL_HARNESS_OPT_IN_REQUIRED");
  }

  const expectedPort = env.ZALTYKO_OWNER_CONSENT_TEST_PG_PORT;
  if (!expectedPort || !/^[0-9]{1,5}$/.test(expectedPort)) {
    throw new LocalHarnessGuardError("LOCAL_PG_PORT_REQUIRED");
  }
  const portNumber = Number(expectedPort);
  if (portNumber < 1024 || portNumber > 65535) {
    throw new LocalHarnessGuardError("LOCAL_PG_PORT_INVALID");
  }

  const names = ["DATABASE_URL", "DATABASE_URL_POOL", "DATABASE_URL_DIRECT"];
  const urls = names.map((name) => {
    const value = env[name];
    if (!value) throw new LocalHarnessGuardError("ALL_DATABASE_URLS_REQUIRED");

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new LocalHarnessGuardError(
        "DATABASE_URLS_MUST_TARGET_LOCAL_POSTGRES"
      );
    }
    if (
      !["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !["127.0.0.1", "::1", "localhost"].includes(parsed.hostname) ||
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.port !== expectedPort ||
      parsed.pathname !== "/postgres" ||
      parsed.search !== "" ||
      parsed.hash !== ""
    ) {
      throw new LocalHarnessGuardError(
        "DATABASE_URLS_MUST_TARGET_LOCAL_POSTGRES"
      );
    }
    return parsed;
  });

  const target = urls[0].origin + urls[0].pathname;
  if (urls.some((url) => url.origin + url.pathname !== target)) {
    throw new LocalHarnessGuardError(
      "DATABASE_URLS_MUST_TARGET_LOCAL_POSTGRES"
    );
  }
  return env.DATABASE_URL!;
}

function authUser(id: string, userMetadata = signupMetadata): User {
  return { id, user_metadata: userMetadata } as unknown as User;
}

async function countRows(
  pool: Pool,
  table: "owner_consent" | "owner_consent_audit",
  ownerId: string
): Promise<number> {
  const result = await pool.query(
    "select count(*)::int as count from " + table + " where owner_id = $1",
    [ownerId]
  );
  return result.rows[0].count;
}

async function main(databaseUrl: string) {
  // Import the app database only after the explicit local-only guard succeeds.
  const { recordOwnerSignupConsent } =
    await import("@/lib/consent/owner-consent-store");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const concurrentResults = await Promise.all([
      recordOwnerSignupConsent(authUser(concurrentOwnerId)),
      recordOwnerSignupConsent(authUser(concurrentOwnerId)),
    ]);
    assert.deepEqual([...concurrentResults].sort(), [
      "already_active",
      "recorded",
    ]);
    assert.equal(await countRows(pool, "owner_consent", concurrentOwnerId), 1);
    assert.equal(
      await countRows(pool, "owner_consent_audit", concurrentOwnerId),
      1
    );

    await pool.query(
      "update owner_consent set state = 'revoked', revoked_at = now() where owner_id = $1",
      [concurrentOwnerId]
    );
    await assert.rejects(
      recordOwnerSignupConsent(authUser(concurrentOwnerId)),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "CONSENT_REQUIRED"
    );
    const [revoked] = (
      await pool.query(
        "select state, revoked_at from owner_consent where owner_id = $1",
        [concurrentOwnerId]
      )
    ).rows;
    assert.equal(revoked.state, "revoked");
    assert.ok(revoked.revoked_at);

    await assert.rejects(
      recordOwnerSignupConsent(authUser(auditFailureOwnerId)),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "CONSENT_STORE_UNAVAILABLE"
    );
    assert.equal(
      await countRows(pool, "owner_consent", auditFailureOwnerId),
      0
    );
    assert.equal(
      await countRows(pool, "owner_consent_audit", auditFailureOwnerId),
      0
    );

    await assert.rejects(
      recordOwnerSignupConsent(authUser(noProfileOwnerId)),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "CONSENT_REQUIRED"
    );
    assert.equal(await countRows(pool, "owner_consent", noProfileOwnerId), 0);

    console.log(
      JSON.stringify({
        status: "PASS",
        concurrentGrant: "one consent row, one audit row",
        revoked: "no implicit regrant",
        auditFailure: "consent insert rolled back",
        missingProfile: "no consent row",
      })
    );
  } finally {
    await pool.end();
  }
}

try {
  const databaseUrl = validateLocalDatabaseEnvironment(process.env);
  main(databaseUrl).catch((error: unknown) => {
    if (error instanceof LocalHarnessGuardError) {
      console.error(error.code);
    } else {
      console.error("LOCAL_DATABASE_VERIFICATION_FAILED");
    }
    process.exitCode = 1;
  });
} catch (error) {
  if (error instanceof LocalHarnessGuardError) {
    console.error(error.code);
  } else {
    console.error("LOCAL_DATABASE_VERIFICATION_FAILED");
  }
  process.exitCode = 1;
}
