import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// This helper has no static @/db import. Its guard precedes DB initialization.
import {
  assertCanonicalAthleteRecoveryDisposableTarget,
  assertCanonicalAthleteRecoverySessionContext,
  createCanonicalAthleteRecoveryRehearsal,
  type CanonicalAthleteRecoverySessionContext,
  type CanonicalAthleteRecoverySnapshot,
} from "./helpers/canonical-athlete-recovery-rehearsal";

const describeDisposablePg = describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1");
const externalFetch = vi.fn();
type Rehearsal = Awaited<ReturnType<typeof createCanonicalAthleteRecoveryRehearsal>>;

async function withRehearsal(
  run: (fixture: Rehearsal) => Promise<void>,
  options: Parameters<typeof createCanonicalAthleteRecoveryRehearsal>[0] = {}
) {
  const fixture = await createCanonicalAthleteRecoveryRehearsal(options);
  try { await run(fixture); }
  // Closes only this handle. The runner tears down the whole disposable cluster;
  // immutable Free bootstrap history and every protected snapshot stay intact.
  finally { await fixture.cleanup(); }
}

function assertGeneralRecoveryBlocked(fixture: Rehearsal) {
  expect(fixture.preflight).toMatchObject({
    status: "blocked", partial: true, restorable: false,
    authenticityVerified: false, authorizationVerified: false,
    destinationVerified: false, referentialIntegrityVerified: false,
    sourceCompletenessVerified: false, archiveChecksumsVerified: true,
  });
  expect(fixture.preflight.tables).toHaveLength(46);
  expect(fixture.preflight.diagnostics.some((issue) => issue.classification === "violation")).toBe(false);
}

function count(snapshot: CanonicalAthleteRecoverySnapshot, table: string): number {
  const entry = snapshot.all.find((row) => row.schema_name === "zaltyko" && row.table_name === table);
  if (!entry) throw new Error("Missing synthetic snapshot table");
  return entry.row_count;
}

beforeEach(() => {
  externalFetch.mockReset();
  externalFetch.mockImplementation(() => { throw new Error("External effects are forbidden in this rehearsal"); });
  vi.stubGlobal("fetch", externalFetch);
});
afterEach(() => {
  try { expect(externalFetch).not.toHaveBeenCalled(); }
  finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
});

describeDisposablePg("closed bare-athlete recovery in disposable GitHub PostgreSQL", () => {
  const nativeSession: CanonicalAthleteRecoverySessionContext = {
    login_role: "supabase_admin", login_is_superuser: true,
    role_name: "supabase_admin", effective_is_superuser: true, configured_role: "none",
    database_name: "postgres", server_address: "127.0.0.1", server_port: 54322,
    replication_role: "origin",
  };

  it("checks complete Node-login and CLI role pairs without setting roles or inferring a remote target", () => {
    expect(() => assertCanonicalAthleteRecoverySessionContext(nativeSession, 54322)).not.toThrow();
    expect(() => assertCanonicalAthleteRecoverySessionContext({
      ...nativeSession, role_name: "postgres", configured_role: "postgres", effective_is_superuser: false,
    }, 54322)).not.toThrow();
  });

  it("accepts the runner's native Unix backend only with both transport fields null", () => {
    const socketSession = { ...nativeSession, server_address: null, server_port: null };
    expect(() => assertCanonicalAthleteRecoverySessionContext(socketSession, 54322)).not.toThrow();
    expect(() => assertCanonicalAthleteRecoverySessionContext({
      ...socketSession, role_name: "postgres", configured_role: "postgres", effective_is_superuser: false,
    }, 54322)).not.toThrow();
  });

  it.each([
    { login_role: "postgres" },
    { login_is_superuser: false },
    { role_name: "postgres", configured_role: "none", effective_is_superuser: false },
    { role_name: "supabase_admin", configured_role: "postgres" },
    { role_name: "authenticated", configured_role: "authenticated", effective_is_superuser: false },
    { effective_is_superuser: false },
    { role_name: "postgres", configured_role: "postgres", effective_is_superuser: true },
    { database_name: "other_database" },
    { server_address: "192.0.2.1" },
    { server_address: null },
    { server_port: null },
    { server_address: "192.0.2.1", server_port: null },
    { server_port: 54323 },
    { replication_role: "replica" },
  ] as const)("refuses a mismatched session contract with boolean-only diagnostics", (override) => {
    try {
      assertCanonicalAthleteRecoverySessionContext({ ...nativeSession, ...override }, 54322);
      throw new Error("Expected session rejection");
    } catch (error) {
      expect(error).toMatchObject({ code: "unexpected_database_session" });
      const message = error instanceof Error ? error.message : String(error);
      const checks = JSON.parse(message.slice(message.indexOf("{"))) as Record<string, unknown>;
      expect(Object.keys(checks).sort()).toEqual(["login", "loginSuper", "rolePair", "effectivePrivilege", "database", "transport", "port", "origin"].sort());
      expect(Object.values(checks).every((value) => typeof value === "boolean")).toBe(true);
      expect(Object.values(checks).some((value) => value === false)).toBe(true);
      expect(message.includes("192.0.2.1") || message.includes("54322") || message.includes("supabase_admin")).toBe(false);
    }
  });

  it.each([
    ["GITHUB_ACTIONS", "false"],
    ["RUNNER_OS", "macOS"],
    ["ZALTYKO_PG_INTEGRATION", "0"],
    ["NODE_ENV", "production"],
    ["NEXT_PHASE", "phase-production-build"],
    ["SUPABASE_SERVICE_ROLE_KEY", "synthetic-forbidden-value"],
    ["SUPABASE_DB_URL", "synthetic-forbidden-value"],
    ["STRIPE_SECRET_KEY", "synthetic-forbidden-value"],
    ["VERCEL_TOKEN", "synthetic-forbidden-value"],
  ] as const)("refuses %s before importing the database or creating its fixture", async (name, value) => {
    vi.stubEnv(name, value);
    expect(() => assertCanonicalAthleteRecoveryDisposableTarget()).toThrow();
    await expect(createCanonicalAthleteRecoveryRehearsal()).rejects.toMatchObject({
      code: name.startsWith("SUPABASE_") || name === "STRIPE_SECRET_KEY" || name === "VERCEL_TOKEN" ? "external_credentials_present" : "disposable_target_required",
    });
  });

  it.each([
    "postgresql://supabase_admin:synthetic-only@db.example.invalid:6543/postgres",
    "postgresql://postgres:synthetic-only@127.0.0.1:6543/postgres",
    "postgresql://supabase_admin:synthetic-only@127.0.0.1:6543/other_database",
    "postgresql://supabase_admin:synthetic-only@127.0.0.1:6543/postgres?options=-c%20role%3Dpostgres",
    "postgresql://supabase_admin:synthetic-only@127.0.0.1:6543/postgres?sslmode=require",
    "postgresql://supabase_admin:synthetic-only@127.0.0.1:6543/postgres?sslmode=disable&sslmode=disable",
    "postgresql://supabase_admin:synthetic-only@127.0.0.1:6543/postgres?sslmode=disable&user=postgres",
  ])("refuses an unexpected connection target before accessing PostgreSQL", async (value) => {
    for (const name of ["ZALTYKO_PG_INTEGRATION_DATABASE_URL", "DATABASE_URL", "DATABASE_URL_POOL", "DATABASE_URL_DIRECT"]) vi.stubEnv(name, value);
    await expect(createCanonicalAthleteRecoveryRehearsal()).rejects.toMatchObject({ code: "disposable_target_required" });
  });

  it("accepts only the exact setup Stripe stub or absence and the runner's explicit local TLS setting", () => {
    const target = new URL(process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL!);
    target.search = "?sslmode=disable";
    for (const name of ["ZALTYKO_PG_INTEGRATION_DATABASE_URL", "DATABASE_URL", "DATABASE_URL_POOL", "DATABASE_URL_DIRECT"]) vi.stubEnv(name, target.toString());
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_mock");
    expect(assertCanonicalAthleteRecoveryDisposableTarget().search).toBe("?sslmode=disable");
    vi.stubEnv("STRIPE_SECRET_KEY", undefined);
    expect(assertCanonicalAthleteRecoveryDisposableTarget().search).toBe("?sslmode=disable");
  });

  it("refuses a mismatched application pool URL before accessing PostgreSQL", async () => {
    vi.stubEnv("DATABASE_URL_POOL", "postgresql://synthetic:synthetic@db.example.invalid:6543/postgres");
    await expect(createCanonicalAthleteRecoveryRehearsal()).rejects.toMatchObject({ code: "disposable_target_required" });
  });

  it("recovers the exact millisecond-aligned fixture from its unmodified real export and rejects replay", async () => {
    await withRehearsal(async (fixture) => {
      assertGeneralRecoveryBlocked(fixture);
      expect(fixture.exactFixtureTimestamps).toBe(true);
      expect(fixture.timestampDeltas).toEqual({ person_created: 0, person_updated: 0, athlete_created: 0, athlete_updated: 0 });
      expect(fixture.sourceTimestampMicrosecondRemainders).toEqual({ person_created: 0, person_updated: 0, athlete_created: 0, athlete_updated: 0 });
      expect(fixture.recordShape).toEqual({
        isActive: false, preferredNameIsNull: false, dateOfBirthIsNull: false,
        dateOfBirthIsLeapDay: true, externalReferenceIsNull: false, timestampsDistinct: true,
      });
      const original = await fixture.snapshot();
      // Protected fingerprints cover ALL canonical and Auth tables, including
      // the other academy, shared synthetic Auth identity, scopes and ledger.
      for (const table of ["organization_members", "member_location_scopes", "audit_log", "outbox_events", "invoices", "charges", "payments", "payment_allocations", "refunds"]) {
        expect(original.protected.some((r) => r.schema_name === "zaltyko" && r.table_name === table)).toBe(true);
      }
      expect(original.protected.some((r) => r.schema_name === "auth" && r.table_name === "users")).toBe(true);
      for (const table of ["organization_entitlements", "organization_entitlement_changes"]) {
        const protectedState = original.protected.find((row) => row.schema_name === "zaltyko" && row.table_name === table);
        expect(protectedState?.row_count).toBeGreaterThanOrEqual(2);
        expect(protectedState).toEqual(original.all.find((row) => row.schema_name === "zaltyko" && row.table_name === table));
      }
      await fixture.loseFixtureRows();
      const lost = await fixture.snapshot();
      expect(count(lost, "people")).toBe(count(original, "people") - 1);
      expect(count(lost, "athletes")).toBe(count(original, "athletes") - 1);
      expect(lost.protected).toEqual(original.protected);

      const receipt = await fixture.recover();
      expect(receipt).toEqual({ scenario: "disposable_bare_athlete_v1", people: 1, athletes: 1, generalRecoveryRestorable: false });
      // Exact database fingerprints also prove original IDs, DOB/nulls,
      // is_active and timestamps survived for these two known synthetic rows.
      const restored = await fixture.snapshot();
      expect(restored).toEqual(original);
      await expect(fixture.recover()).rejects.toMatchObject({ code: "target_id_conflict" });
      expect(await fixture.snapshot()).toEqual(restored);
      assertGeneralRecoveryBlocked(fixture);
    });
  });

  it("preserves the closed nullable-field variant without defaults or reactivation", async () => {
    await withRehearsal(async (fixture) => {
      assertGeneralRecoveryBlocked(fixture);
      expect(fixture.exactFixtureTimestamps).toBe(true);
      expect(fixture.sourceTimestampMicrosecondRemainders).toEqual({ person_created: 0, person_updated: 0, athlete_created: 0, athlete_updated: 0 });
      expect(fixture.recordShape).toEqual({
        isActive: false, preferredNameIsNull: true, dateOfBirthIsNull: true,
        dateOfBirthIsLeapDay: false, externalReferenceIsNull: true, timestampsDistinct: true,
      });
      const original = await fixture.snapshot();
      await fixture.loseFixtureRows();
      expect((await fixture.snapshot()).protected).toEqual(original.protected);
      expect(await fixture.recover()).toEqual({ scenario: "disposable_bare_athlete_v1", people: 1, athletes: 1, generalRecoveryRestorable: false });
      expect(await fixture.snapshot()).toEqual(original);
      await expect(fixture.recover()).rejects.toMatchObject({ code: "target_id_conflict" });
      expect(await fixture.snapshot()).toEqual(original);
    }, { recordVariant: "nullable" });
  });

  it.each([
    ["person", "same"], ["person", "other"],
    ["athlete", "same"], ["athlete", "other"],
  ] as const)("refuses an occupied %s PK in the %s organization without overwriting anything", async (entity, scope) => {
    await withRehearsal(async (fixture) => {
      await fixture.loseFixtureRows();
      await fixture.occupyId(entity, scope);
      const occupied = await fixture.snapshot();
      await expect(fixture.recover()).rejects.toMatchObject({ code: "target_id_conflict" });
      expect(await fixture.snapshot()).toEqual(occupied);
    });
  });

  it("rolls back a real person INSERT when the controlled failpoint rejects the second step", async () => {
    await withRehearsal(async (fixture) => {
      const original = await fixture.snapshot();
      await fixture.loseFixtureRows();
      const lost = await fixture.snapshot();
      // The helper SELECTs the inserted person inside the transaction before
      // throwing this exact code, so this cannot pass by failing before INSERT.
      await expect(fixture.recover({ failAfterPerson: true })).rejects.toMatchObject({ code: "injected_after_person_insert" });
      expect(await fixture.snapshot()).toEqual(lost);
      await fixture.recover();
      expect(await fixture.snapshot()).toEqual(original);
    });
  });

  it("recovers exact microseconds after comparing the unmodified export against SQL originals", async () => {
    await withRehearsal(async (fixture) => {
      assertGeneralRecoveryBlocked(fixture);
      expect(fixture.exactFixtureTimestamps).toBe(true);
      expect(fixture.timestampDeltas).toEqual({ person_created: 0, person_updated: 0, athlete_created: 0, athlete_updated: 0 });
      expect(fixture.sourceTimestampMicrosecondRemainders).toEqual({ person_created: 456, person_updated: 456, athlete_created: 456, athlete_updated: 456 });
      const original = await fixture.snapshot();
      await fixture.loseFixtureRows();
      const lost = await fixture.snapshot();
      expect(count(lost, "people")).toBe(count(original, "people") - 1);
      expect(count(lost, "athletes")).toBe(count(original, "athletes") - 1);
      expect(lost.protected).toEqual(original.protected);
      expect(await fixture.recover()).toEqual({ scenario: "disposable_bare_athlete_v1", people: 1, athletes: 1, generalRecoveryRestorable: false });
      // SQL JSON fingerprints retain microseconds, so equality checks the
      // original precision as well as IDs, all other values and protected rows.
      expect(await fixture.snapshot()).toEqual(original);
      await expect(fixture.recover()).rejects.toMatchObject({ code: "target_id_conflict" });
      expect(await fixture.snapshot()).toEqual(original);
      assertGeneralRecoveryBlocked(fixture);
    }, { timestampPrecision: "microseconds" });
  });

  it("closes only its handle without mutating any database row and refuses later access", async () => {
    await withRehearsal(async (observer) => {
      const fixture = await createCanonicalAthleteRecoveryRehearsal();
      try {
        const before = await observer.snapshot();
        await fixture.cleanup();
        await fixture.cleanup();
        expect(await observer.snapshot()).toEqual(before);
        await expect(fixture.snapshot()).rejects.toMatchObject({ code: "rehearsal_closed" });
        await expect(fixture.loseFixtureRows()).rejects.toMatchObject({ code: "rehearsal_closed" });
        await expect(fixture.recover()).rejects.toMatchObject({ code: "rehearsal_closed" });
      } finally { await fixture.cleanup(); }
    });
  });
});
