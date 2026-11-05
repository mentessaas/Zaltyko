import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { CANONICAL_EXPORT_TABLES } from "@/modules/data-rights/application/catalog";
import { preflightCanonicalAcademyRecovery } from "@/modules/data-rights/application/preflight-canonical-academy-recovery";
import { validateCanonicalAcademyArchive } from "@/modules/data-rights/application/verify-canonical-academy-archive";

type Database = typeof import("@/db").db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Row = Record<string, unknown>;

export class CanonicalAthleteRecoveryRehearsalError extends Error {
  constructor(public readonly code: string) {
    super("Disposable canonical athlete recovery rehearsal refused.");
    this.name = "CanonicalAthleteRecoveryRehearsalError";
  }
}

/** Pure guard: call BEFORE importing @/db, opening a pool or executing SQL. */
export function assertCanonicalAthleteRecoveryDisposableTarget(): URL {
  if (process.env.ZALTYKO_PG_INTEGRATION !== "1" || process.env.GITHUB_ACTIONS !== "true" ||
      process.env.RUNNER_OS !== "Linux" || process.platform !== "linux" || process.env.NODE_ENV !== "test" || process.env.NEXT_PHASE) {
    throw new CanonicalAthleteRecoveryRehearsalError("disposable_target_required");
  }
  const connectionString = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  let parsed: URL;
  try { parsed = new URL(connectionString ?? ""); }
  catch { throw new CanonicalAthleteRecoveryRehearsalError("disposable_target_required"); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) ||
      parsed.username !== "supabase_admin" || !parsed.port || !parsed.password ||
      parsed.pathname !== "/postgres" || (parsed.search !== "" && parsed.search !== "?sslmode=disable") || parsed.hash ||
      [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT].some((value) => value !== connectionString)) {
    throw new CanonicalAthleteRecoveryRehearsalError("disposable_target_required");
  }
  for (const name of [
    "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_URL", "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY", "E2E_TARGET_SUPABASE_PROJECT_REF",
    "STRIPE_SECRET_KEY", "STRIPE_SAAS_TEST_SECRET_KEY", "STRIPE_SAAS_LIVE_SECRET_KEY", "VERCEL_TOKEN",
  ]) {
    // tests/setup.ts supplies only this exact synthetic key. The runner still
    // refuses external credentials before Vitest; every other value is denied.
    if (name === "STRIPE_SECRET_KEY" && process.env[name] === "sk_test_mock") continue;
    if (process.env[name]) throw new CanonicalAthleteRecoveryRehearsalError("external_credentials_present");
  }
  return parsed;
}

interface Fingerprint {
  schema_name: string;
  table_name: string;
  row_count: number;
  content_hash: string;
}

export interface CanonicalAthleteRecoverySnapshot {
  all: Fingerprint[];
  /** All Auth / canonical rows except this instance's two recovery rows. */
  protected: Fingerprint[];
}

/**
 * TEST-ONLY closed scenario. No caller-supplied body, IDs, SQL, destination,
 * path, mapping or arbitrary selection. Every ID is allocated by this instance
 * after the disposable guard, seeded here, and removed by its own cleanup.
 *
 * Millisecond timestamps are intentional: node-pg Date -> JSON loses stored
 * microseconds. The controlled microsecond variant measures that loss against
 * its still-present SQL originals and REFUSES loss / recovery. This is not a
 * fidelity oracle for arbitrary archives, nor a product recovery capability.
 */
export async function createCanonicalAthleteRecoveryRehearsal(
  options: {
    timestampPrecision?: "milliseconds" | "microseconds";
    recordVariant?: "populated" | "nullable";
  } = {}
) {
  const target = assertCanonicalAthleteRecoveryDisposableTarget();
  if ((options.timestampPrecision !== undefined && !["milliseconds", "microseconds"].includes(options.timestampPrecision)) ||
      (options.recordVariant !== undefined && !["populated", "nullable"].includes(options.recordVariant))) {
    throw new CanonicalAthleteRecoveryRehearsalError("unsupported_fixture_variant");
  }
  const { db } = await import("@/db");
  // dotenv/config can be evaluated by that import; revalidate before access.
  assertCanonicalAthleteRecoveryDisposableTarget();
  const sessionResult = await db.execute(sql`
    select session_user as login_role, current_user as role_name, current_database() as database_name,
      inet_server_addr()::text as server_address, inet_server_port() as server_port,
      current_setting('role') as configured_role,
      current_setting('session_replication_role') as replication_role
  `);
  const session = sessionResult.rows[0] as unknown as {
    login_role: string; role_name: string; configured_role: string; database_name: string; server_address: string;
    server_port: number; replication_role: string;
  } | undefined;
  // The pinned native stack's supabase_admin login starts as postgres (runner
  // documents this). The CLI's separate SET ROLE NONE does not affect Node's
  // pool. Validate both identities without issuing SET ROLE or changing grants.
  if (!session || session.login_role !== "supabase_admin" || session.role_name !== "postgres" ||
      session.configured_role !== "postgres" || session.database_name !== "postgres" ||
      !["127.0.0.1", "::1"].includes(session.server_address) || session.server_port !== Number(target.port) ||
      session.replication_role !== "origin") {
    throw new CanonicalAthleteRecoveryRehearsalError("unexpected_database_session");
  }

  const ids = {
    organization: randomUUID(), otherOrganization: randomUUID(), user: randomUUID(),
    member: randomUUID(), otherMember: randomUUID(), location: randomUUID(), otherLocation: randomUUID(),
    scope: randomUUID(), otherScope: randomUUID(), person: randomUUID(), athlete: randomUUID(),
    otherPerson: randomUUID(), otherAthlete: randomUUID(), collisionPerson: randomUUID(),
  };
  const email = `ci-athlete-recovery-${ids.user}@example.invalid`;
  const timestamp = options.timestampPrecision === "microseconds"
    ? "2026-11-05 12:34:56.123456+00" : "2026-11-05 12:34:56.123+00";
  const updatedTimestamp = options.timestampPrecision === "microseconds"
    ? "2026-11-06 13:45:57.789456+00" : "2026-11-06 13:45:57.789+00";
  const nullable = options.recordVariant === "nullable";
  let closed = false;
  let seeded = false;
  let lost = false;

  const guard = () => {
    assertCanonicalAthleteRecoveryDisposableTarget();
    if (closed) throw new CanonicalAthleteRecoveryRehearsalError("rehearsal_closed");
  };
  const lockOwnedOrganization = async (tx: Transaction) => {
    const result = await tx.execute(sql`
      select organizations.id from zaltyko.organizations as organizations
      inner join zaltyko.organization_members as members on members.organization_id = organizations.id
      where organizations.id = ${ids.organization}::uuid and members.id = ${ids.member}::uuid
        and members.user_id = ${ids.user}::uuid and members.role = 'owner' and members.status = 'active'
        and members.location_scope_mode = 'all' and organizations.status = 'active'
      for update of organizations
    `);
    if (result.rows.length !== 1) throw new CanonicalAthleteRecoveryRehearsalError("fixture_scope_changed");
  };
  const cleanup = async () => {
    if (closed) return;
    guard();
    if (seeded) {
      await db.transaction(async (tx) => {
        // Only our fresh IDs. No user / organization selectors from a caller.
        await tx.execute(sql`delete from zaltyko.organizations where id in (${ids.organization}::uuid, ${ids.otherOrganization}::uuid)`);
        await tx.execute(sql`delete from auth.users where id = ${ids.user}::uuid and email = ${email}`);
      });
    }
    closed = true;
  };

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`insert into auth.users (id, email) values (${ids.user}::uuid, ${email})`);
      await tx.execute(sql`
        insert into zaltyko.organizations (id, name, status) values
          (${ids.organization}::uuid, 'Synthetic recovery source', 'active'),
          (${ids.otherOrganization}::uuid, 'Synthetic protected academy', 'active')
      `);
      await tx.execute(sql`
        insert into zaltyko.locations (id, organization_id, code, name) values
          (${ids.location}::uuid, ${ids.organization}::uuid, 'recovery-a', 'Synthetic A'),
          (${ids.otherLocation}::uuid, ${ids.otherOrganization}::uuid, 'recovery-b', 'Synthetic B')
      `);
      await tx.execute(sql`
        insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode) values
          (${ids.member}::uuid, ${ids.organization}::uuid, ${ids.user}::uuid, 'owner', 'active', 'all'),
          (${ids.otherMember}::uuid, ${ids.otherOrganization}::uuid, ${ids.user}::uuid, 'owner', 'active', 'all')
      `);
      await tx.execute(sql`
        insert into zaltyko.member_location_scopes (id, organization_id, member_id, location_id) values
          (${ids.scope}::uuid, ${ids.organization}::uuid, ${ids.member}::uuid, ${ids.location}::uuid),
          (${ids.otherScope}::uuid, ${ids.otherOrganization}::uuid, ${ids.otherMember}::uuid, ${ids.otherLocation}::uuid)
      `);
      await tx.execute(sql`
        insert into zaltyko.people (id, organization_id, given_name, family_name, preferred_name, date_of_birth, created_at, updated_at) values
          (${ids.person}::uuid, ${ids.organization}::uuid, 'Synthetic', 'Recovered athlete', ${nullable ? null : 'Synthetic preferred'}, ${nullable ? null : '2008-02-29'}::date, ${timestamp}::timestamptz, ${updatedTimestamp}::timestamptz),
          (${ids.otherPerson}::uuid, ${ids.otherOrganization}::uuid, 'Synthetic', 'Protected athlete', 'Synthetic B', null, ${timestamp}::timestamptz, ${updatedTimestamp}::timestamptz)
      `);
      await tx.execute(sql`
        insert into zaltyko.athletes (id, organization_id, person_id, external_reference, is_active, created_at, updated_at) values
          (${ids.athlete}::uuid, ${ids.organization}::uuid, ${ids.person}::uuid, ${nullable ? null : 'SYNTHETIC_RECOVERY_A'}, false, ${timestamp}::timestamptz, ${updatedTimestamp}::timestamptz),
          (${ids.otherAthlete}::uuid, ${ids.otherOrganization}::uuid, ${ids.otherPerson}::uuid, 'SYNTHETIC_PROTECTED_B', false, ${timestamp}::timestamptz, ${updatedTimestamp}::timestamptz)
      `);
    });
    seeded = true;

    guard();
    const { exportCanonicalAcademyData } = await import("@/modules/data-rights/application/canonical-academy-return");
    const { body } = await exportCanonicalAcademyData({ userId: ids.user, organizationId: ids.organization });
    validateCanonicalAcademyArchive({ body, organizationId: ids.organization });
    const source = (JSON.parse(body) as { data: Record<string, Row[]>; coverage: { excludedTables: Array<{ countScope: string; rowCount: unknown }> } });
    const allowedNonempty = new Set(["organizations", "locations", "organization_members", "member_location_scopes", "people", "athletes"]);
    if (Object.entries(source.data).some(([table, rows]) => rows.length > 0 && !allowedNonempty.has(table)) ||
        source.coverage.excludedTables.some((table) => table.countScope === "organization_id" && table.rowCount !== 0)) {
      throw new CanonicalAthleteRecoveryRehearsalError("fixture_has_unrecovered_dependencies");
    }
    const person = source.data.people?.[0];
    const athlete = source.data.athletes?.[0];
    if (source.data.people?.length !== 1 || source.data.athletes?.length !== 1 ||
        !person || !athlete || person.id !== ids.person || athlete.id !== ids.athlete ||
        person.organization_id !== ids.organization || athlete.organization_id !== ids.organization || athlete.person_id !== ids.person) {
      throw new CanonicalAthleteRecoveryRehearsalError("unexpected_fixture_archive");
    }
    const fixedColumns: Record<string, string[]> = {
      people: "id organization_id given_name family_name preferred_name date_of_birth created_at updated_at".split(" "),
      athletes: "id organization_id person_id external_reference is_active created_at updated_at".split(" "),
    };
    for (const table of ["people", "athletes"]) {
      const spec = CANONICAL_EXPORT_TABLES.find((entry) => entry.name === table)!;
      if (spec.expectedColumns.length !== fixedColumns[table]!.length ||
          spec.exportColumns.length !== fixedColumns[table]!.length ||
          fixedColumns[table]!.some((column) => !spec.exportColumns.includes(column))) {
        throw new CanonicalAthleteRecoveryRehearsalError("required_values_omitted");
      }
    }
    const preflight = preflightCanonicalAcademyRecovery({ body, organizationId: ids.organization });
    if (preflight.status !== "blocked" || preflight.restorable !== false || preflight.diagnostics.some((issue) => issue.classification === "violation")) {
      throw new CanonicalAthleteRecoveryRehearsalError("unexpected_general_preflight");
    }

    // Measure against the original SQL rows BEFORE simulating loss. A rounded
    // archive alone cannot prove whether its source ever had microseconds.
    const precisionResult = await db.execute(sql`
      select
        (extract(epoch from (people.created_at - ${person.created_at}::timestamptz)) * 1000000)::int as person_created,
        (extract(epoch from (people.updated_at - ${person.updated_at}::timestamptz)) * 1000000)::int as person_updated,
        (extract(epoch from (athletes.created_at - ${athlete.created_at}::timestamptz)) * 1000000)::int as athlete_created,
        (extract(epoch from (athletes.updated_at - ${athlete.updated_at}::timestamptz)) * 1000000)::int as athlete_updated
      from zaltyko.people as people inner join zaltyko.athletes as athletes
        on athletes.organization_id = people.organization_id and athletes.person_id = people.id
      where people.id = ${ids.person}::uuid and athletes.id = ${ids.athlete}::uuid
    `);
    const timestampDeltas = precisionResult.rows[0] as unknown as {
      person_created: number; person_updated: number; athlete_created: number; athlete_updated: number;
    };
    if (precisionResult.rows.length !== 1) throw new CanonicalAthleteRecoveryRehearsalError("fixture_changed_before_precision_check");
    const exactFixtureTimestamps = timestampDeltas && Object.values(timestampDeltas).every((value) => value === 0);
    const requireExactFixture = () => {
      guard();
      if (!exactFixtureTimestamps) throw new CanonicalAthleteRecoveryRehearsalError("source_timestamp_precision_loss");
    };

    const snapshot = async (): Promise<CanonicalAthleteRecoverySnapshot> => {
      guard();
      return db.transaction(async (tx) => {
        await tx.execute(sql.raw("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY"));
        await tx.execute(sql.raw("SET LOCAL TIME ZONE 'UTC'"));
        const catalog = await tx.execute(sql`
          select table_schema, table_name from information_schema.tables
          where table_schema in ('zaltyko', 'auth') and table_type = 'BASE TABLE'
          order by table_schema, table_name
        `);
        const tables = catalog.rows as unknown as Array<{ table_schema: string; table_name: string }>;
        const fingerprints = async (protect: boolean): Promise<Fingerprint[]> => {
          const queries = tables.map((table) => {
            const recoveryTable = table.table_schema === "zaltyko" && ["people", "athletes"].includes(table.table_name);
            const excludedId = table.table_name === "people" ? ids.person : ids.athlete;
            const filter = protect && recoveryTable
              ? sql`where not (row_data.organization_id = ${ids.organization}::uuid and row_data.id = ${excludedId}::uuid)` : sql``;
            return sql`
              select ${table.table_schema}::text as schema_name, ${table.table_name}::text as table_name,
                count(*)::int as row_count,
                md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) as content_hash
              from ${sql.identifier(table.table_schema)}.${sql.identifier(table.table_name)} as row_data ${filter}
            `;
          });
          const result = await tx.execute(sql`${sql.join(queries, sql` union all `)} order by schema_name, table_name`);
          return result.rows as unknown as Fingerprint[];
        };
        return { all: await fingerprints(false), protected: await fingerprints(true) };
      });
    };

    return {
      // Reports contain no archive values / fixture IDs. General recovery stays blocked.
      preflight,
      timestampDeltas,
      exactFixtureTimestamps: Boolean(exactFixtureTimestamps),
      recordShape: {
        isActive: athlete.is_active,
        preferredNameIsNull: person.preferred_name === null,
        dateOfBirthIsNull: person.date_of_birth === null,
        dateOfBirthIsLeapDay: person.date_of_birth === "2008-02-29",
        externalReferenceIsNull: athlete.external_reference === null,
        timestampsDistinct: person.created_at !== person.updated_at && athlete.created_at !== athlete.updated_at,
      },
      snapshot,
      cleanup,
      async loseFixtureRows() {
        requireExactFixture();
        if (lost) throw new CanonicalAthleteRecoveryRehearsalError("fixture_already_lost");
        await db.transaction(async (tx) => {
          await lockOwnedOrganization(tx);
          const deletedAthlete = await tx.execute(sql`delete from zaltyko.athletes where id = ${ids.athlete}::uuid and organization_id = ${ids.organization}::uuid returning id`);
          const deletedPerson = await tx.execute(sql`delete from zaltyko.people where id = ${ids.person}::uuid and organization_id = ${ids.organization}::uuid returning id`);
          if (deletedAthlete.rows.length !== 1 || deletedPerson.rows.length !== 1) throw new CanonicalAthleteRecoveryRehearsalError("fixture_changed_before_loss");
        });
        lost = true;
      },
      /** Synthetic collision controls only, using this instance's private IDs. */
      async occupyId(entity: "person" | "athlete", scope: "same" | "other") {
        guard();
        if (!lost) throw new CanonicalAthleteRecoveryRehearsalError("fixture_not_lost");
        const organization = scope === "same" ? ids.organization : ids.otherOrganization;
        await db.transaction(async (tx) => {
          const personId = entity === "person" ? ids.person : ids.collisionPerson;
          await tx.execute(sql`
            insert into zaltyko.people (id, organization_id, given_name, family_name, created_at, updated_at)
            values (${personId}::uuid, ${organization}::uuid, 'Synthetic occupied', 'Do not overwrite', ${timestamp}::timestamptz, ${timestamp}::timestamptz)
          `);
          if (entity === "athlete") await tx.execute(sql`
            insert into zaltyko.athletes (id, organization_id, person_id, created_at, updated_at)
            values (${ids.athlete}::uuid, ${organization}::uuid, ${personId}::uuid, ${timestamp}::timestamptz, ${timestamp}::timestamptz)
          `);
        });
      },
      async recover(options: { failAfterPerson?: boolean } = {}) {
        requireExactFixture();
        if (!lost) throw new CanonicalAthleteRecoveryRehearsalError("fixture_not_lost");
        try {
          return await db.transaction(async (tx) => {
            await lockOwnedOrganization(tx);
            // Global PK lookups deliberately include the other organization.
            const conflicts = await tx.execute(sql`
              select id from zaltyko.people where id = ${ids.person}::uuid
              union all select id from zaltyko.athletes where id = ${ids.athlete}::uuid
            `);
            if (conflicts.rows.length > 0) throw new CanonicalAthleteRecoveryRehearsalError("target_id_conflict");
            await tx.execute(sql`
              insert into zaltyko.people (id, organization_id, given_name, family_name, preferred_name, date_of_birth, created_at, updated_at)
              values (${person.id}::uuid, ${person.organization_id}::uuid, ${person.given_name}, ${person.family_name},
                ${person.preferred_name}, ${person.date_of_birth}::date, ${person.created_at}::timestamptz, ${person.updated_at}::timestamptz)
            `);
            // Test-only failpoint AFTER the first real INSERT, proving rollback
            // rather than a rejection before any write. No runtime code imports it.
            if (options.failAfterPerson) {
              const inserted = await tx.execute(sql`select id from zaltyko.people where id = ${ids.person}::uuid and organization_id = ${ids.organization}::uuid`);
              if (inserted.rows.length !== 1) throw new CanonicalAthleteRecoveryRehearsalError("failpoint_person_not_inserted");
              throw new CanonicalAthleteRecoveryRehearsalError("injected_after_person_insert");
            }
            await tx.execute(sql`
              insert into zaltyko.athletes (id, organization_id, person_id, external_reference, is_active, created_at, updated_at)
              values (${athlete.id}::uuid, ${athlete.organization_id}::uuid, ${athlete.person_id}::uuid,
                ${athlete.external_reference}, ${athlete.is_active}, ${athlete.created_at}::timestamptz, ${athlete.updated_at}::timestamptz)
            `);
            return { scenario: "disposable_bare_athlete_v1" as const, people: 1, athletes: 1, generalRecoveryRestorable: false as const };
          });
        } catch (error) {
          if (error instanceof CanonicalAthleteRecoveryRehearsalError) throw error;
          // SQL errors must not disclose row values, URLs or credentials.
          throw new CanonicalAthleteRecoveryRehearsalError("recovery_transaction_failed");
        }
      },
    };
  } catch (error) {
    await cleanup();
    if (error instanceof CanonicalAthleteRecoveryRehearsalError) throw error;
    throw new CanonicalAthleteRecoveryRehearsalError("fixture_setup_failed");
  }
}
