import assert from "node:assert/strict";

import { Pool } from "pg";
import type { User } from "@supabase/supabase-js";

const currentPolicyVersion = "v1-2026-08-01";
const metadata = { legal_consent_version: currentPolicyVersion };
const oldUserId = "f0a8d116-459b-4e4c-b4d0-865f63180123";
const freshUserId = "f0a8d116-459b-4e4c-b4d0-865f63180124";
const revokedUserId = "f0a8d116-459b-4e4c-b4d0-865f63180125";
const auditFailureUserId = "f0a8d116-459b-4e4c-b4d0-865f63180126";

class LocalHarnessGuardError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function validateLocalDatabaseEnvironment(env: NodeJS.ProcessEnv): string {
  if (
    env.ZALTYKO_OWNER_SIGNUP_CONSENT_LOCAL_PG !== "1" ||
    env.NODE_ENV !== "test"
  ) {
    throw new LocalHarnessGuardError("LOCAL_HARNESS_OPT_IN_REQUIRED");
  }
  const expectedPort = env.ZALTYKO_OWNER_SIGNUP_CONSENT_TEST_PG_PORT;
  if (!expectedPort || !/^\d{1,5}$/.test(expectedPort)) {
    throw new LocalHarnessGuardError("LOCAL_PG_PORT_REQUIRED");
  }
  const port = Number(expectedPort);
  if (port < 1024 || port > 65535) {
    throw new LocalHarnessGuardError("LOCAL_PG_PORT_INVALID");
  }
  const urls = ["DATABASE_URL", "DATABASE_URL_POOL", "DATABASE_URL_DIRECT"].map(
    (key) => {
      const value = env[key];
      if (!value)
        throw new LocalHarnessGuardError("ALL_DATABASE_URLS_REQUIRED");
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
        parsed.hostname !== "127.0.0.1" ||
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
    }
  );
  if (
    urls.some(
      (url) => url.origin + url.pathname !== urls[0].origin + urls[0].pathname
    )
  ) {
    throw new LocalHarnessGuardError(
      "DATABASE_URLS_MUST_TARGET_LOCAL_POSTGRES"
    );
  }
  return env.DATABASE_URL!;
}

function authUser(
  id: string,
  createdAt: string,
  userMetadata = metadata
): User {
  return {
    id,
    created_at: createdAt,
    user_metadata: userMetadata,
  } as unknown as User;
}

async function rowCount(
  pool: Pool,
  table: string,
  userId: string
): Promise<number> {
  const result = await pool.query(
    `select count(*)::int as count from zaltyko.${table} where user_id = $1`,
    [userId]
  );
  return result.rows[0].count;
}

async function main(databaseUrl: string) {
  // Both app DB and service imports stay after the local URL guard.
  const { getOwnerContractualConsentRequirement, recordOwnerSignupConsent } =
    await import("@/modules/organizations/application/owner-signup-consent");
  const { db } = await import("@/db");
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const oldUser = authUser(oldUserId, "2026-10-13T10:00:00.000Z");
    assert.deepEqual(await getOwnerContractualConsentRequirement(oldUser), {
      policyVersion: currentPolicyVersion,
      requiresAcceptance: true,
      reason: "existing_account",
    });
    await assert.rejects(
      recordOwnerSignupConsent(oldUser, { requestKey: "request-old-user-123" }),
      { code: "CONSENT_REQUIRED" }
    );
    assert.equal(await rowCount(pool, "owner_signup_consents", oldUserId), 0);
    assert.equal(
      await rowCount(pool, "owner_signup_consent_audits", oldUserId),
      0
    );

    const freshUser = authUser(freshUserId, new Date().toISOString());
    assert.deepEqual(await getOwnerContractualConsentRequirement(freshUser), {
      policyVersion: currentPolicyVersion,
      requiresAcceptance: false,
      reason: "fresh_signup_declaration",
    });
    const freshResults = await Promise.all([
      recordOwnerSignupConsent(freshUser, {
        requestKey: "request-fresh-user-123",
      }),
      recordOwnerSignupConsent(freshUser, {
        requestKey: "request-fresh-user-123",
      }),
    ]);
    assert.deepEqual([...freshResults].sort(), ["already_active", "recorded"]);
    assert.equal(await rowCount(pool, "owner_signup_consents", freshUserId), 1);
    assert.equal(
      await rowCount(pool, "owner_signup_consent_audits", freshUserId),
      1
    );
    assert.deepEqual(await getOwnerContractualConsentRequirement(freshUser), {
      policyVersion: currentPolicyVersion,
      requiresAcceptance: false,
      reason: "already_current",
    });

    await recordOwnerSignupConsent(oldUser, {
      requestKey: "request-old-accept-123",
      contractualAcceptance: {
        accepted: true,
        policyVersion: currentPolicyVersion,
      },
    });
    assert.equal(await rowCount(pool, "owner_signup_consents", oldUserId), 1);
    assert.equal(
      await rowCount(pool, "owner_signup_consent_audits", oldUserId),
      1
    );

    await recordOwnerSignupConsent(
      authUser(revokedUserId, new Date().toISOString()),
      {
        requestKey: "request-revoke-seed-123",
      }
    );
    await pool.query(
      "update zaltyko.owner_signup_consents set state='revoked', revoked_at=now() where user_id=$1",
      [revokedUserId]
    );
    await assert.rejects(
      recordOwnerSignupConsent(
        authUser(revokedUserId, new Date().toISOString()),
        {
          requestKey: "request-revoke-denied-123",
        }
      ),
      { code: "CONSENT_REQUIRED" }
    );
    assert.deepEqual(
      await getOwnerContractualConsentRequirement(
        authUser(revokedUserId, new Date().toISOString())
      ),
      {
        policyVersion: currentPolicyVersion,
        requiresAcceptance: true,
        reason: "revoked",
      }
    );
    await recordOwnerSignupConsent(
      authUser(revokedUserId, new Date().toISOString()),
      {
        requestKey: "request-revoke-explicit-123",
        contractualAcceptance: {
          accepted: true,
          policyVersion: currentPolicyVersion,
        },
      }
    );
    assert.equal(
      await rowCount(pool, "owner_signup_consent_audits", revokedUserId),
      2
    );

    await assert.rejects(
      recordOwnerSignupConsent(
        authUser(auditFailureUserId, new Date().toISOString()),
        {
          requestKey: "request-audit-failure-123",
        }
      ),
      { code: "CONSENT_STORE_UNAVAILABLE" }
    );
    assert.equal(
      await rowCount(pool, "owner_signup_consents", auditFailureUserId),
      0
    );
    assert.equal(
      await rowCount(pool, "owner_signup_consent_audits", auditFailureUserId),
      0
    );

    const rlsClient = await pool.connect();
    try {
      await rlsClient.query("begin");
      await rlsClient.query("set local role authenticated");
      await rlsClient.query(
        `set local request.jwt.claim.sub = '${freshUserId}'`
      );
      const statusSelf = await rlsClient.query(
        "select count(*)::int as count from zaltyko.owner_signup_consents"
      );
      assert.equal(statusSelf.rows[0].count, 1);
      const auditSelf = await rlsClient.query(
        "select count(*)::int as count from zaltyko.owner_signup_consent_audits"
      );
      assert.equal(auditSelf.rows[0].count, 1);
      await rlsClient.query("commit");

      await rlsClient.query("begin");
      await rlsClient.query("set local role authenticated");
      await rlsClient.query(
        `set local request.jwt.claim.sub = '${auditFailureUserId}'`
      );
      const statusOther = await rlsClient.query(
        "select count(*)::int as count from zaltyko.owner_signup_consents"
      );
      assert.equal(statusOther.rows[0].count, 0);
      const auditOther = await rlsClient.query(
        "select count(*)::int as count from zaltyko.owner_signup_consent_audits"
      );
      assert.equal(auditOther.rows[0].count, 0);
      await rlsClient.query("commit");
    } finally {
      rlsClient.release();
    }
    const anonClient = await pool.connect();
    try {
      await anonClient.query("begin");
      await anonClient.query("set local role anon");
      await assert.rejects(
        anonClient.query("select count(*) from zaltyko.owner_signup_consents"),
        (error: { code?: string }) => error.code === "42501"
      );
      await anonClient.query("rollback");
    } finally {
      anonClient.release();
    }
    const auditForeignKeys = await pool.query(`
      select count(*)::int as count
      from pg_constraint
      where conrelid = 'zaltyko.owner_signup_consent_audits'::regclass
        and contype = 'f'
    `);
    assert.equal(auditForeignKeys.rows[0].count, 0);
    const profilesTable = await pool.query(
      "select to_regclass('public.profiles') as profiles"
    );
    assert.equal(profilesTable.rows[0].profiles, null);
    const serviceGrants = await pool.query(`
      select
        has_table_privilege('service_role', 'zaltyko.owner_signup_consents', 'UPDATE') as status_update,
        has_table_privilege('service_role', 'zaltyko.owner_signup_consent_audits', 'UPDATE') as audit_update,
        has_table_privilege('service_role', 'zaltyko.owner_signup_consent_audits', 'DELETE') as audit_delete,
        has_table_privilege('service_role', 'zaltyko.owner_signup_consent_audits', 'TRUNCATE') as audit_truncate
    `);
    assert.deepEqual(serviceGrants.rows[0], {
      status_update: true,
      audit_update: false,
      audit_delete: false,
      audit_truncate: false,
    });
    await assert.rejects(
      pool.query(
        "update zaltyko.owner_signup_consent_audits set source='setup' where user_id=$1",
        [freshUserId]
      ),
      /append-only/
    );
    await assert.rejects(
      pool.query(
        "delete from zaltyko.owner_signup_consent_audits where user_id=$1",
        [freshUserId]
      ),
      /append-only/
    );
    await assert.rejects(
      pool.query("truncate zaltyko.owner_signup_consent_audits"),
      /append-only/
    );
    await pool.query("delete from auth.users where id=$1", [oldUserId]);
    assert.equal(await rowCount(pool, "owner_signup_consents", oldUserId), 0);
    assert.equal(
      await rowCount(pool, "owner_signup_consent_audits", oldUserId),
      1
    );

    console.log(
      JSON.stringify({
        status: "PASS",
        freshness:
          "old auth metadata rejected; fresh auth declaration accepted",
        explicitAcceptance:
          "existing and revoked accounts recorded with setup source",
        concurrency: "one status row and one grant audit",
        auditFailure: "status grant rolled back",
        rls: "authenticated reads own rows only; anon denied",
        audit:
          "no FK, status deletion preserves events, UPDATE/DELETE/TRUNCATE rejected",
        legacyProfileDependency: "none; no public.profiles table exists",
      })
    );
  } finally {
    await pool.end();
    const appDb = db as unknown as { $client?: Pool };
    await appDb.$client?.end();
  }
}

try {
  const databaseUrl = validateLocalDatabaseEnvironment(process.env);
  main(databaseUrl).catch((error: unknown) => {
    if (error instanceof LocalHarnessGuardError) console.error(error.code);
    else console.error("LOCAL_DATABASE_VERIFICATION_FAILED", error);
    process.exitCode = 1;
  });
} catch (error) {
  if (error instanceof LocalHarnessGuardError) console.error(error.code);
  else console.error("LOCAL_DATABASE_VERIFICATION_FAILED");
  process.exitCode = 1;
}
