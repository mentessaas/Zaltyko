import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
  ALL_KNOWN_CANONICAL_TABLE_NAMES,
  CANONICAL_EXPORT_TABLES,
  EXCLUDED_CANONICAL_TABLES,
  OPTIONAL_INCLUDED_EXPORT_TABLES,
} from "@/modules/data-rights/application/catalog";
import {
  validateCanonicalAcademyArchive,
} from "@/modules/data-rights/application/verify-canonical-academy-archive";
import {
  preflightCanonicalAcademyRecovery,
} from "@/modules/data-rights/application/preflight-canonical-academy-recovery";

const { getCurrentUserMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: getCurrentUserMock,
}));

import { GET } from "@/app/api/v1/owner/data-export/route";

const describeDisposablePg = describe.skipIf(
  process.env.ZALTYKO_PG_INTEGRATION !== "1"
);

type ExportFixture = {
  organizationAId: string;
  organizationBId: string;
  ownerAUserId: string;
  ownerBUserId: string;
  managerAUserId: string;
  adminAUserId: string;
  selectedOwnerAUserId: string;
  inactiveOwnerAUserId: string;
  sharedAuthUserId: string;
  userIds: string[];
  aOrganizationMarker: string;
  bOrganizationMarker: string;
  aGuardianMarker: string;
  bGuardianMarker: string;
  aAthleteMarker: string;
  bAthleteMarker: string;
  aGroupOneMarker: string;
  aGroupTwoMarker: string;
  bGroupMarker: string;
  authSecretCanary: string;
  accessTokenCanary: string;
  serviceRoleCanary: string;
  consentProofCanary: string;
  metricKey: string;
  metricValueCanary: string;
};

function assertDisposableTarget() {
  if (
    process.env.ZALTYKO_PG_INTEGRATION !== "1" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_OS !== "Linux" ||
    process.env.NODE_ENV !== "test"
  ) {
    throw new Error("This suite is restricted to the disposable GitHub Linux database");
  }

  const connectionString = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  const configuredUrls = [
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_POOL,
    process.env.DATABASE_URL_DIRECT,
  ];
  let parsed: URL;
  try {
    parsed = new URL(connectionString ?? "");
  } catch {
    throw new Error("The disposable PostgreSQL target is invalid");
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    parsed.username !== "supabase_admin" ||
    !parsed.port ||
    !parsed.password ||
    parsed.pathname !== "/postgres" ||
    configuredUrls.some((value) => value !== connectionString)
  ) {
    throw new Error("The integration suite refuses an unexpected PostgreSQL identity");
  }

  const forbidden = [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_TARGET_SUPABASE_PROJECT_REF",
    "STRIPE_SAAS_TEST_SECRET_KEY",
    "STRIPE_SAAS_LIVE_SECRET_KEY",
    "VERCEL_TOKEN",
  ];
  const activeForbidden = forbidden.filter((name) => Boolean(process.env[name]));
  if (activeForbidden.length > 0) {
    throw new Error(
      `The integration runner contains forbidden external credential variables: ${activeForbidden.join(", ")}`
    );
  }
}

async function seedFixture(): Promise<ExportFixture> {
  const suffix = randomUUID();
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const locationAOneId = randomUUID();
  const locationATwoId = randomUUID();
  const locationBId = randomUUID();
  const ownerAUserId = randomUUID();
  const managerAUserId = randomUUID();
  const adminAUserId = randomUUID();
  const selectedOwnerAUserId = randomUUID();
  const inactiveOwnerAUserId = randomUUID();
  const ownerBUserId = randomUUID();
  const sharedAuthUserId = randomUUID();
  const ownerAMemberId = randomUUID();
  const managerAMemberId = randomUUID();
  const adminAMemberId = randomUUID();
  const selectedOwnerAMemberId = randomUUID();
  const inactiveOwnerAMemberId = randomUUID();
  const ownerBMemberId = randomUUID();
  const aGuardianPersonId = randomUUID();
  const aAthletePersonId = randomUUID();
  const bGuardianPersonId = randomUUID();
  const bAthletePersonId = randomUUID();
  const aGuardianId = randomUUID();
  const bGuardianId = randomUUID();
  const aAthleteId = randomUUID();
  const bAthleteId = randomUUID();
  const aFamilyId = randomUUID();
  const bFamilyId = randomUUID();
  const aFamilyPayerId = randomUUID();
  const bFamilyPayerId = randomUUID();
  const aGroupOneId = randomUUID();
  const aGroupTwoId = randomUUID();
  const bGroupId = randomUUID();
  const metricRunId = randomUUID();
  const metricKey = `ci_export_${suffix.replaceAll("-", "")}`;

  const aOrganizationMarker = `EXPORT_A_ORG_${suffix}`;
  const bOrganizationMarker = `EXPORT_B_ORG_${suffix}`;
  const aGuardianMarker = `EXPORT_A_GUARDIAN_${suffix}`;
  const bGuardianMarker = `EXPORT_B_GUARDIAN_${suffix}`;
  const aAthleteMarker = `EXPORT_A_ATHLETE_${suffix}`;
  const bAthleteMarker = `EXPORT_B_ATHLETE_${suffix}`;
  const aGroupOneMarker = `EXPORT_A_GROUP_ONE_${suffix}`;
  const aGroupTwoMarker = `EXPORT_A_GROUP_TWO_${suffix}`;
  const bGroupMarker = `EXPORT_B_GROUP_${suffix}`;
  const authSecretCanary = `SYNTHETIC_EXPORT_PASSWORD_HASH_${suffix}`;
  const accessTokenCanary = `SYNTHETIC_EXPORT_ACCESS_TOKEN_${suffix}`;
  const serviceRoleCanary = `SYNTHETIC_EXPORT_SERVICE_ROLE_${suffix}`;
  const consentProofCanary = `signup:ci-export-${suffix.replaceAll("-", "")}`;
  const metricValueCanary = `SYNTHETIC_EXPORT_METRIC_VALUE_${suffix}`;

  const userIds = [
    ownerAUserId,
    ownerBUserId,
    managerAUserId,
    adminAUserId,
    selectedOwnerAUserId,
    inactiveOwnerAUserId,
    sharedAuthUserId,
  ];
  await db.execute(sql`
    insert into auth.users (id, email)
    values ${sql.join(
      userIds.map((id, index) => sql`(
        ${id}::uuid,
        ${`ci-canonical-export-${index}-${suffix}@example.invalid`}
      )`),
      sql`, `
    )}
  `);
  await db.execute(sql`
    update auth.users
    set encrypted_password = ${authSecretCanary},
        raw_app_meta_data = jsonb_build_object(
          'access_token', ${accessTokenCanary}::text,
          'service_role_key', ${serviceRoleCanary}::text
        )
    where id = ${sharedAuthUserId}::uuid
  `);
  await db.execute(sql`
    insert into zaltyko.owner_signup_consents (
      user_id, state, policy_version, source, consent_proof
    ) values (
      ${sharedAuthUserId}::uuid,
      'granted',
      'v1-2026-11-04',
      'signup',
      ${consentProofCanary}
    )
  `);
  await db.execute(sql`
    insert into zaltyko.owner_signup_consent_audits (
      user_id, event, policy_version, source, consent_proof
    ) values (
      ${sharedAuthUserId}::uuid,
      'grant',
      'v1-2026-11-04',
      'signup',
      ${consentProofCanary}
    )
  `);

  await db.execute(sql`
    insert into zaltyko.organizations (id, name)
    values
      (${organizationAId}::uuid, ${aOrganizationMarker}),
      (${organizationBId}::uuid, ${bOrganizationMarker})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name, timezone)
    values
      (${locationAOneId}::uuid, ${organizationAId}::uuid, ${`exp-a1-${suffix.slice(0, 8)}`}, 'Export A sede 1', 'Europe/Madrid'),
      (${locationATwoId}::uuid, ${organizationAId}::uuid, ${`exp-a2-${suffix.slice(0, 8)}`}, 'Export A sede 2', 'Europe/Madrid'),
      (${locationBId}::uuid, ${organizationBId}::uuid, ${`exp-b-${suffix.slice(0, 8)}`}, 'Export B sede', 'Europe/Madrid')
  `);
  await db.execute(sql`
    insert into zaltyko.metric_definitions (
      key, name, description, unit, direction, grain, formula_version, owner, formula
    ) values (
      ${metricKey},
      'CI export exclusion fixture',
      'Synthetic baseline-only metric used by the export contract test.',
      'count',
      'neutral',
      'month',
      1,
      'ci-export-test',
      'synthetic fixture only'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.metric_runs (
      id, organization_id, authorization_location_id, period_start, period_end,
      currency, formula_set_version, status, source_watermark, idempotency_key,
      started_at, completed_at
    ) values (
      ${metricRunId}::uuid,
      ${organizationAId}::uuid,
      ${locationAOneId}::uuid,
      current_date,
      current_date,
      'EUR',
      'ci-export-v1',
      'succeeded',
      statement_timestamp(),
      ${`ci-export-metric-run-${suffix}`},
      statement_timestamp(),
      statement_timestamp()
    )
  `);
  await db.execute(sql`
    insert into zaltyko.metric_run_values (
      organization_id, metric_run_id, location_id, metric_key, period_start,
      period_end, value_numeric, currency, coverage, quality, dimensions,
      dimensions_sha256, formula_version, computed_at, source_watermark, diagnostics
    ) values (
      ${organizationAId}::uuid,
      ${metricRunId}::uuid,
      ${locationAOneId}::uuid,
      ${metricKey},
      current_date,
      current_date,
      1,
      'EUR',
      1,
      'complete',
      '{}'::jsonb,
      ${"a".repeat(64)},
      1,
      statement_timestamp(),
      statement_timestamp(),
      jsonb_build_object('marker', ${metricValueCanary}::text)
    )
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values
      (${ownerAMemberId}::uuid, ${organizationAId}::uuid, ${ownerAUserId}::uuid, 'owner', 'active', 'all'),
      (${managerAMemberId}::uuid, ${organizationAId}::uuid, ${managerAUserId}::uuid, 'manager', 'active', 'all'),
      (${adminAMemberId}::uuid, ${organizationAId}::uuid, ${adminAUserId}::uuid, 'admin', 'active', 'all'),
      (${selectedOwnerAMemberId}::uuid, ${organizationAId}::uuid, ${selectedOwnerAUserId}::uuid, 'owner', 'active', 'selected'),
      (${inactiveOwnerAMemberId}::uuid, ${organizationAId}::uuid, ${inactiveOwnerAUserId}::uuid, 'owner', 'suspended', 'all'),
      (${ownerBMemberId}::uuid, ${organizationBId}::uuid, ${ownerBUserId}::uuid, 'owner', 'active', 'all')
  `);
  await db.execute(sql`
    insert into zaltyko.member_location_scopes (
      organization_id, member_id, location_id
    ) values (
      ${organizationAId}::uuid,
      ${selectedOwnerAMemberId}::uuid,
      ${locationAOneId}::uuid
    )
  `);

  await db.execute(sql`
    insert into zaltyko.people (
      id, organization_id, given_name, family_name, date_of_birth
    )
    values
      (${aGuardianPersonId}::uuid, ${organizationAId}::uuid, ${aGuardianMarker}, 'Synthetic', null),
      (${aAthletePersonId}::uuid, ${organizationAId}::uuid, ${aAthleteMarker}, 'Synthetic', '2014-04-12'::date),
      (${bGuardianPersonId}::uuid, ${organizationBId}::uuid, ${bGuardianMarker}, 'Synthetic', null),
      (${bAthletePersonId}::uuid, ${organizationBId}::uuid, ${bAthleteMarker}, 'Synthetic', null)
  `);
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id)
    values
      (${aAthleteId}::uuid, ${organizationAId}::uuid, ${aAthletePersonId}::uuid),
      (${bAthleteId}::uuid, ${organizationBId}::uuid, ${bAthletePersonId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.families (id, organization_id)
    values
      (${aFamilyId}::uuid, ${organizationAId}::uuid),
      (${bFamilyId}::uuid, ${organizationBId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.guardians (id, organization_id, person_id, auth_user_id)
    values
      (${aGuardianId}::uuid, ${organizationAId}::uuid, ${aGuardianPersonId}::uuid, ${sharedAuthUserId}::uuid),
      (${bGuardianId}::uuid, ${organizationBId}::uuid, ${bGuardianPersonId}::uuid, ${sharedAuthUserId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.guardian_contacts (
      organization_id, guardian_id, kind, value, normalized_value, is_primary
    ) values
      (${organizationAId}::uuid, ${aGuardianId}::uuid, 'email', ${`a-${suffix}@example.invalid`}, ${`a-${suffix}@example.invalid`}, true),
      (${organizationBId}::uuid, ${bGuardianId}::uuid, 'email', ${`b-${suffix}@example.invalid`}, ${`b-${suffix}@example.invalid`}, true)
  `);
  await db.execute(sql`
    insert into zaltyko.family_guardians (
      organization_id, family_id, guardian_id, relationship, is_active
    ) values
      (${organizationAId}::uuid, ${aFamilyId}::uuid, ${aGuardianId}::uuid, 'parent', true),
      (${organizationBId}::uuid, ${bFamilyId}::uuid, ${bGuardianId}::uuid, 'parent', true)
  `);
  await db.execute(sql`
    insert into zaltyko.family_members (
      organization_id, family_id, athlete_id, relationship, starts_on
    ) values
      (${organizationAId}::uuid, ${aFamilyId}::uuid, ${aAthleteId}::uuid, 'other', current_date),
      (${organizationBId}::uuid, ${bFamilyId}::uuid, ${bAthleteId}::uuid, 'other', current_date)
  `);
  await db.execute(sql`
    insert into zaltyko.family_payers (
      id, organization_id, family_id, guardian_id, is_primary, starts_on
    ) values
      (${aFamilyPayerId}::uuid, ${organizationAId}::uuid, ${aFamilyId}::uuid, ${aGuardianId}::uuid, true, current_date),
      (${bFamilyPayerId}::uuid, ${organizationBId}::uuid, ${bFamilyId}::uuid, ${bGuardianId}::uuid, true, current_date)
  `);
  await db.execute(sql`
    insert into zaltyko.groups (
      id, organization_id, location_id, name, capacity, status
    ) values
      (${aGroupOneId}::uuid, ${organizationAId}::uuid, ${locationAOneId}::uuid, ${aGroupOneMarker}, 20, 'active'),
      (${aGroupTwoId}::uuid, ${organizationAId}::uuid, ${locationATwoId}::uuid, ${aGroupTwoMarker}, 20, 'active'),
      (${bGroupId}::uuid, ${organizationBId}::uuid, ${locationBId}::uuid, ${bGroupMarker}, 20, 'active')
  `);
  await db.execute(sql`
    insert into zaltyko.group_memberships (
      organization_id, group_id, athlete_id, status, starts_on
    ) values
      (${organizationAId}::uuid, ${aGroupOneId}::uuid, ${aAthleteId}::uuid, 'active', current_date),
      (${organizationAId}::uuid, ${aGroupTwoId}::uuid, ${aAthleteId}::uuid, 'active', current_date),
      (${organizationBId}::uuid, ${bGroupId}::uuid, ${bAthleteId}::uuid, 'active', current_date)
  `);

  return {
    organizationAId,
    organizationBId,
    ownerAUserId,
    ownerBUserId,
    managerAUserId,
    adminAUserId,
    selectedOwnerAUserId,
    inactiveOwnerAUserId,
    sharedAuthUserId,
    userIds,
    aOrganizationMarker,
    bOrganizationMarker,
    aGuardianMarker,
    bGuardianMarker,
    aAthleteMarker,
    bAthleteMarker,
    aGroupOneMarker,
    aGroupTwoMarker,
    bGroupMarker,
    authSecretCanary,
    accessTokenCanary,
    serviceRoleCanary,
    consentProofCanary,
    metricKey,
    metricValueCanary,
  };
}

async function snapshot(
  organizationIds: string[],
  userIds: string[],
  metricKeys: string[]
) {
  const organizationIdsSql = sql.join(
    organizationIds.map((organizationId) => sql`${organizationId}::uuid`),
    sql`, `
  );
  const baselineTables = await db.execute(sql`
    select distinct tables.table_name
    from information_schema.tables as tables
    inner join information_schema.columns as columns
      on columns.table_schema = tables.table_schema
     and columns.table_name = tables.table_name
    where tables.table_schema = 'zaltyko'
      and tables.table_type = 'BASE TABLE'
      and (columns.column_name = 'organization_id' or tables.table_name = 'organizations')
    order by tables.table_name
  `);
  const tenantTableNames = baselineTables.rows.map((row) => String(row.table_name));
  const tableQueries = tenantTableNames.map((table) => sql`
    select ${table}::text as table_name,
      count(*)::int as row_count,
      md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) as content_hash
    from ${sql.identifier("zaltyko")}.${sql.identifier(table)} as row_data
    where ${
      table === "organizations"
        ? sql`row_data.id in (${organizationIdsSql})`
        : sql`row_data.organization_id in (${organizationIdsSql})`
    }
  `);
  const rows = await db.execute(
    sql`select * from (${sql.join(tableQueries, sql` union all `)}) tables order by table_name`
  );
  const authUsers = await db.execute(sql`
    select count(*)::int as row_count,
      md5(coalesce(jsonb_agg(to_jsonb(user_row) order by user_row.id)::text, '[]')) as content_hash
    from auth.users as user_row
    where user_row.id in (${sql.join(
      userIds.map((userId) => sql`${userId}::uuid`),
      sql`, `
    )})
  `);
  const identityRows = await db.execute(sql`
    select 'owner_signup_consents'::text as table_name,
      count(*)::int as row_count,
      md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) as content_hash
    from zaltyko.owner_signup_consents as row_data
    where row_data.user_id in (${sql.join(
      userIds.map((userId) => sql`${userId}::uuid`),
      sql`, `
    )})
    union all
    select 'owner_signup_consent_audits'::text as table_name,
      count(*)::int as row_count,
      md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) as content_hash
    from zaltyko.owner_signup_consent_audits as row_data
    where row_data.user_id in (${sql.join(
      userIds.map((userId) => sql`${userId}::uuid`),
      sql`, `
    )})
  `);
  const metricDefinitions = await db.execute(sql`
    select count(*)::int as row_count,
      md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.key)::text, '[]')) as content_hash
    from zaltyko.metric_definitions as row_data
    where row_data.key in (${sql.join(metricKeys.map((key) => sql`${key}`), sql`, `)})
  `);
  const consentPolicy = await db.execute(sql`
    select count(*)::int as row_count,
      md5(coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.singleton)::text, '[]')) as content_hash
    from zaltyko.owner_signup_consent_policy as row_data
  `);
  return {
    organizationRows: rows.rows,
    authUsers: authUsers.rows,
    identityRows: identityRows.rows,
    metricDefinitions: metricDefinitions.rows,
    consentPolicy: consentPolicy.rows,
  };
}

async function readSchemaBaseline() {
  const result = await db.execute(sql`
    select tables.table_name, columns.column_name
    from information_schema.tables as tables
    inner join information_schema.columns as columns
      on columns.table_schema = tables.table_schema
     and columns.table_name = tables.table_name
    where tables.table_schema = 'zaltyko'
      and tables.table_type = 'BASE TABLE'
    order by tables.table_name, columns.ordinal_position
  `);
  const columnsByTable = new Map<string, string[]>();
  for (const row of result.rows) {
    const table = String(row.table_name);
    const columns = columnsByTable.get(table) ?? [];
    columns.push(String(row.column_name));
    columnsByTable.set(table, columns);
  }
  return columnsByTable;
}

function exportText(value: unknown, seen = new WeakSet<object>()): string {
  if (typeof value === "string") {
    try {
      return `${value}\n${exportText(JSON.parse(value), seen)}`;
    } catch {
      return value;
    }
  }
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  if (Array.isArray(value)) return value.map((item) => exportText(item, seen)).join("\n");
  if (value && typeof value === "object") {
    if (seen.has(value)) return "";
    seen.add(value);
    return Object.entries(value)
      .map(([key, item]) => `${key}\n${exportText(item, seen)}`)
      .join("\n");
  }
  return "";
}

function assertSafeBlockedRecoveryReport(
  report: ReturnType<typeof preflightCanonicalAcademyRecovery>,
  fixture: ExportFixture
) {
  expect(report).toMatchObject({
    status: "blocked",
    partial: true,
    restorable: false,
    authenticityVerified: false,
    authorizationVerified: false,
    destinationVerified: false,
    referentialIntegrityVerified: false,
    sourceCompletenessVerified: false,
    archiveChecksumsVerified: true,
    outsideOrganizationIdConflicts: "unknown",
  });
  expect(report.tables).toHaveLength(46);
  expect(report.tables.map(table => table.table).sort())
    .toEqual(CANONICAL_EXPORT_TABLES.map(table => table.name).sort());
  for (const field of ["body", "data", "source", "destination", "organizationId"]) {
    expect(report).not.toHaveProperty(field);
  }

  const serialized = JSON.stringify(report);
  // Assert on booleans so a privacy regression never prints a leaked value as
  // the assertion's received/expected payload in the CI log.
  expect(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialized)).toBe(false);
  expect([
    fixture.aOrganizationMarker, fixture.bOrganizationMarker,
    fixture.aGuardianMarker, fixture.bGuardianMarker,
    fixture.aAthleteMarker, fixture.bAthleteMarker,
    fixture.aGroupOneMarker, fixture.aGroupTwoMarker, fixture.bGroupMarker,
    fixture.authSecretCanary, fixture.accessTokenCanary, fixture.serviceRoleCanary,
    fixture.consentProofCanary, fixture.metricValueCanary,
  ].some(value => serialized.includes(value))).toBe(false);
}

async function requestExportAs(
  userId: string,
  organizationId: string
) {
  getCurrentUserMock.mockResolvedValue({ id: userId });
  return GET(
    new Request(
      `http://localhost/api/v1/owner/data-export?organizationId=${organizationId}`
    )
  );
}

describeDisposablePg("canonical Owner academy data export in disposable PostgreSQL", () => {
  let fixture: Awaited<ReturnType<typeof seedFixture>>;

  beforeAll(async () => {
    assertDisposableTarget();
    fixture = await seedFixture();
  });

  it("exports only organization A across its locations and linked family/group rows, without writing", async () => {
    const before = await snapshot(
      [fixture.organizationAId, fixture.organizationBId],
      fixture.userIds, [fixture.metricKey]
    );

    const response = await requestExportAs(
      fixture.ownerAUserId,
      fixture.organizationAId
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(/no-store/i);
    expect(response.headers.get("content-type")).toMatch(/application\/json/i);
    const responseBytes = new Uint8Array(await response.arrayBuffer());
    expect(responseBytes.byteLength).toBeLessThanOrEqual(3_500_000);
    const exportedBody = new TextDecoder().decode(responseBytes);
    const verification = validateCanonicalAcademyArchive({
      body: exportedBody,
      organizationId: fixture.organizationAId,
    });
    expect(verification).toMatchObject({
      valid: true,
      checksumsVerified: true,
      tenantScopeVerified: true,
      restorable: false,
    });
    const exported = JSON.parse(exportedBody) as {
      coverage: {
        complete: boolean;
        organizationId: string;
        includedTables: Array<{ table: string; rowCount: number; checksumSha256: string }>;
        excludedTables: Array<{ table: string; rowCount: number | string | null; valuesExported: boolean }>;
      };
      data: Record<string, Record<string, unknown>[]>;
      integrity: { bundleChecksumSha256: string };
    };
    const output = exportText(exported);
    const { integrity, ...basePackage } = exported;
    expect(createHash("sha256").update(JSON.stringify(basePackage)).digest("hex"))
      .toBe(integrity.bundleChecksumSha256);
    expect(exported.coverage.complete).toBe(false);
    expect(exported.coverage.organizationId).toBe(fixture.organizationAId);
    expect(
      exported.data.people.find(
        (row) => row.given_name === fixture.aAthleteMarker
      )?.date_of_birth
    ).toBe("2014-04-12");
    expect(Object.keys(exported.data).sort()).toEqual(CANONICAL_EXPORT_TABLES.map(table => table.name).sort());
    for (const table of exported.coverage.includedTables) {
      const rows = exported.data[table.table];
      expect(rows.length).toBe(table.rowCount);
      const digest = createHash("sha256");
      rows.forEach(row => digest.update(`${JSON.stringify(row)}\n`));
      expect(digest.digest("hex")).toBe(table.checksumSha256);
      const spec = CANONICAL_EXPORT_TABLES.find(spec => spec.name === table.table)!;
      rows.forEach(row => expect(Object.keys(row).sort()).toEqual([...spec.exportColumns].sort()));
    }
    const observedSchema = await readSchemaBaseline();
    expect([...observedSchema.keys()].sort()).toEqual([...ALL_KNOWN_CANONICAL_TABLE_NAMES].sort());
    for (const spec of CANONICAL_EXPORT_TABLES) {
      expect(observedSchema.get(spec.name)?.sort()).toEqual([...spec.expectedColumns].sort());
    }
    expect(exported.coverage.excludedTables.map(table => table.table).sort())
      .toEqual(EXCLUDED_CANONICAL_TABLES.map(table => table.table).sort());
    expect(exported.coverage.excludedTables.every(table => table.valuesExported === false)).toBe(true);
    expect(exported.coverage.excludedTables.find(table => table.table === "metric_run_values")?.rowCount).toBe(1);
    expect(exported.coverage.excludedTables.find(table => table.table === "owner_signup_consents")?.rowCount).toBeNull();
    expect(output).toContain(fixture.aOrganizationMarker);
    expect(output).toContain(fixture.aGuardianMarker);
    expect(output).toContain(fixture.aAthleteMarker);
    expect(output).toContain(fixture.aGroupOneMarker);
    expect(output).toContain(fixture.aGroupTwoMarker);
    expect(output).not.toContain(fixture.bOrganizationMarker);
    expect(output).not.toContain(fixture.bGuardianMarker);
    expect(output).not.toContain(fixture.bAthleteMarker);
    expect(output).not.toContain(fixture.bGroupMarker);
    expect(output).not.toContain(fixture.authSecretCanary);
    expect(output).not.toContain(fixture.accessTokenCanary);
    expect(output).not.toContain(fixture.serviceRoleCanary);
    expect(output).not.toContain(fixture.sharedAuthUserId);
    expect(output).not.toContain(fixture.consentProofCanary);
    expect(output).not.toContain(fixture.metricValueCanary);

    // Consume the exact route response, without resealing or repairing rows for
    // the preflight. A missing dependency here is a finding about the real
    // exported projection, not permission to manufacture its parent fixture.
    const recovery = preflightCanonicalAcademyRecovery({
      body: exportedBody,
      organizationId: fixture.organizationAId,
    });
    assertSafeBlockedRecoveryReport(recovery, fixture);
    expect(recovery.destinationComparison).toBe("not_supplied");
    expect(recovery.diagnostics.filter(issue => issue.classification === "violation"))
      .toHaveLength(0);
    for (const table of recovery.tables) {
      expect(table.sourceRows).toBe(exported.data[table.table].length);
      expect(table.declaredDestinationRows).toBeNull();
    }

    // Even the identical archive is a declared target, not authoritative live
    // state. Every existing PK must block an overwrite; no import is attempted.
    const collisionRecovery = preflightCanonicalAcademyRecovery({
      body: exportedBody,
      organizationId: fixture.organizationAId,
      destination: { body: exportedBody },
    });
    assertSafeBlockedRecoveryReport(collisionRecovery, fixture);
    expect(collisionRecovery.destinationComparison).toBe("declared_same_organization_archive");
    const collisions = collisionRecovery.diagnostics
      .filter(issue => issue.code === "destination_primary_key_collision")
      .map(issue => ({ table: issue.table, occurrences: issue.occurrences }))
      .sort((left, right) => left.table.localeCompare(right.table));
    const expectedCollisions = exported.coverage.includedTables
      .filter(table => table.rowCount > 0)
      .map(table => ({ table: table.table, occurrences: table.rowCount }))
      .sort((left, right) => left.table.localeCompare(right.table));
    expect(expectedCollisions.length).toBeGreaterThan(0);
    expect(collisions).toEqual(expectedCollisions);
    for (const table of collisionRecovery.tables) {
      expect(table.declaredDestinationRows).toBe(exported.data[table.table].length);
    }

    const after = await snapshot(
      [fixture.organizationAId, fixture.organizationBId],
      fixture.userIds, [fixture.metricKey]
    );
    expect(after).toEqual(before);
  });

  it.each([
    ["manager with all-location scope", "managerAUserId", 403],
    ["admin with all-location scope", "adminAUserId", 403],
    ["Owner with selected-location scope", "selectedOwnerAUserId", 403],
    ["inactive Owner membership", "inactiveOwnerAUserId", 404],
  ] as const)("fails closed for %s", async (_label, actorKey, status) => {
    const before = await snapshot([fixture.organizationAId, fixture.organizationBId], fixture.userIds, [fixture.metricKey]);
    const response = await requestExportAs(
      fixture[actorKey],
      fixture.organizationAId
    );
    expect(response.status).toBe(status);
    expect(response.headers.get("content-disposition")).toBeNull();
    expect(await snapshot([fixture.organizationAId, fixture.organizationBId], fixture.userIds, [fixture.metricKey])).toEqual(before);
  });

  it("returns the same not-found boundary for a foreign or unknown organization", async () => {
    const before = await snapshot([fixture.organizationAId, fixture.organizationBId], fixture.userIds, [fixture.metricKey]);
    const foreignResponse = await requestExportAs(
      fixture.ownerAUserId,
      fixture.organizationBId
    );
    const unknownResponse = await requestExportAs(
      fixture.ownerAUserId,
      randomUUID()
    );
    expect(foreignResponse.status).toBe(404);
    expect(unknownResponse.status).toBe(404);
    expect(await foreignResponse.text()).toBe(await unknownResponse.text());
    expect(await snapshot([fixture.organizationAId, fixture.organizationBId], fixture.userIds, [fixture.metricKey])).toEqual(before);
  });

  it("returns 413 for a package over 4.5 MB without exposing the row or writing", async () => {
    const oversizedMarker = `SYNTHETIC_EXPORT_OVERSIZE_${randomUUID()}`;
    const oversizedName = `${oversizedMarker}${"x".repeat(4_600_000)}`;
    await db.execute(sql`
      update zaltyko.groups
      set name = ${oversizedName}
      where id = (
        select id from zaltyko.groups
        where organization_id = ${fixture.organizationBId}::uuid
        order by id
        limit 1
      )
    `);

    const before = await snapshot([fixture.organizationBId], fixture.userIds, [fixture.metricKey]);
    const response = await requestExportAs(
      fixture.ownerBUserId,
      fixture.organizationBId
    );
    const body = await response.text();
    expect(response.status).toBe(413);
    expect(body.length).toBeLessThan(4_500);
    expect(body).not.toContain(oversizedMarker);
    expect(await snapshot([fixture.organizationBId], fixture.userIds, [fixture.metricKey])).toEqual(before);
  });
});

// Funciones activadas en producción el 12-11-2026: instala sus candidatos solo
// en esta base desechable, exporta con filas reales y deja la base como estaba.
const ACTIVATED_CANDIDATES = [
  "20261111120000_athlete_progress_candidate.sql",
  "20261111200000_session_plans_candidate.sql",
  "20261111180000_coach_assignment_candidate.sql",
  "20261110120000_admission_requests_candidate.sql",
  "20261114120000_skill_levels_candidate.sql",
] as const;
const activatedCandidate = (name: string) =>
  readFileSync(resolve(process.cwd(), `docs/deployment/candidates/${name}`), "utf8");

async function seedActivatedModules(organizationId: string, marker: string) {
  const one = async (query: ReturnType<typeof sql>) => {
    const result = await db.execute(query);
    return String((result.rows[0] as { id: string }).id);
  };
  const memberId = await one(sql`
    select id::text as id from zaltyko.organization_members
    where organization_id = ${organizationId}::uuid and role = 'owner' and status = 'active' and location_scope_mode = 'all'
    order by id limit 1
  `);
  const athleteId = await one(sql`select id::text as id from zaltyko.athletes where organization_id = ${organizationId}::uuid order by id limit 1`);
  const locationId = await one(sql`select id::text as id from zaltyko.locations where organization_id = ${organizationId}::uuid order by id limit 1`);
  const staffPersonId = randomUUID();
  const staffProfileId = randomUUID();
  const classTemplateId = randomUUID();
  const sessionId = randomUUID();
  const objectiveId = randomUUID();
  const planId = randomUUID();
  const linkId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values (${staffPersonId}::uuid, ${organizationId}::uuid, ${`${marker}_STAFF`}, 'Synthetic')
  `);
  await db.execute(sql`
    insert into zaltyko.staff_profiles (id, organization_id, person_id, member_id, is_active)
    values (${staffProfileId}::uuid, ${organizationId}::uuid, ${staffPersonId}::uuid, null, true)
  `);
  await db.execute(sql`
    insert into zaltyko.class_templates (id, organization_id, location_id, name, capacity, status, effective_from)
    values (${classTemplateId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${`${marker}_CLASS`}, 12, 'active', '2026-09-01')
  `);
  await db.execute(sql`
    insert into zaltyko.sessions (id, organization_id, location_id, class_template_id, status, starts_at, ends_at)
    values (${sessionId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${classTemplateId}::uuid, 'completed',
      '2026-11-10T16:30:00Z'::timestamptz, '2026-11-10T18:00:00Z'::timestamptz)
  `);
  await db.execute(sql`
    insert into zaltyko.athlete_objectives (
      id, organization_id, athlete_id, location_id, client_request_id, title, discipline, apparatus,
      target_date, created_by_member_id, status_changed_by_member_id
    ) values (
      ${objectiveId}::uuid, ${organizationId}::uuid, ${athleteId}::uuid, ${locationId}::uuid, ${randomUUID()}::uuid,
      ${`${marker}_OBJECTIVE`}, 'gaf', 'beam', '2026-12-15', ${memberId}::uuid, ${memberId}::uuid
    )
  `);
  await db.execute(sql`
    insert into zaltyko.athlete_objective_status_history (
      organization_id, objective_id, revision, from_status, to_status, changed_by_member_id
    ) values (${organizationId}::uuid, ${objectiveId}::uuid, 1, null, 'in_progress', ${memberId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.athlete_observations (
      organization_id, athlete_id, location_id, client_request_id, body, observed_on, session_id,
      objective_id, author_member_id, updated_by_member_id
    ) values (
      ${organizationId}::uuid, ${athleteId}::uuid, ${locationId}::uuid, ${randomUUID()}::uuid, ${`${marker}_OBSERVATION`},
      '2026-11-10', ${sessionId}::uuid, ${objectiveId}::uuid, ${memberId}::uuid, ${memberId}::uuid
    )
  `);
  await db.execute(sql`
    insert into zaltyko.class_template_staff (organization_id, class_template_id, staff_profile_id, assigned_by_member_id)
    values (${organizationId}::uuid, ${classTemplateId}::uuid, ${staffProfileId}::uuid, ${memberId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.session_staff_overrides (organization_id, session_id, reason, changed_by_member_id)
    values (${organizationId}::uuid, ${sessionId}::uuid, 'absence', ${memberId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.session_plans (
      id, organization_id, location_id, session_id, client_request_id, last_request_id, focus,
      created_by_member_id, updated_by_member_id
    ) values (
      ${planId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${sessionId}::uuid, ${randomUUID()}::uuid,
      ${randomUUID()}::uuid, ${`${marker}_FOCUS`}, ${memberId}::uuid, ${memberId}::uuid
    )
  `);
  await db.execute(sql`
    insert into zaltyko.session_plan_blocks (organization_id, plan_id, position, kind, discipline, apparatus, content, duration_minutes)
    values (${organizationId}::uuid, ${planId}::uuid, 1, 'technique', 'gaf', 'beam', ${`${marker}_BLOCK`}, 30)
  `);
  await db.execute(sql`
    insert into zaltyko.session_plan_objectives (organization_id, plan_id, athlete_id, objective_id)
    values (${organizationId}::uuid, ${planId}::uuid, ${athleteId}::uuid, ${objectiveId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.class_plan_templates (organization_id, location_id, class_template_id, focus, blocks, updated_by_member_id)
    values (${organizationId}::uuid, ${locationId}::uuid, ${classTemplateId}::uuid, ${`${marker}_TEMPLATE`},
      jsonb_build_array(
        jsonb_build_object('kind', 'warmup', 'content', ${`${marker}_TEMPLATE_BLOCK`}::text, 'durationMinutes', 15,
          'privateNote', ${`${marker}_UNCLASSIFIED_KEY`}::text),
        jsonb_build_object('kind', 'technique', 'discipline', 'gaf', 'apparatus', 'beam', 'content', 'Paloma')
      ), ${memberId}::uuid)
  `);
  // Niveles y progresión (candidato 20261114120000).
  const skillTemplateId = randomUUID();
  const skillLevelId = randomUUID();
  const skillElementId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.skill_templates (id, organization_id, client_request_id, discipline, name, created_by_member_id, updated_by_member_id)
    values (${skillTemplateId}::uuid, ${organizationId}::uuid, ${randomUUID()}::uuid, 'artistic_female', ${`${marker}_SKILL_TEMPLATE`},
      ${memberId}::uuid, ${memberId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.skill_levels (id, organization_id, template_id, position, name)
    values (${skillLevelId}::uuid, ${organizationId}::uuid, ${skillTemplateId}::uuid, 1, ${`${marker}_SKILL_LEVEL`})
  `);
  await db.execute(sql`
    insert into zaltyko.skill_elements (id, organization_id, template_id, level_id, position, apparatus, name)
    values (${skillElementId}::uuid, ${organizationId}::uuid, ${skillTemplateId}::uuid, ${skillLevelId}::uuid, 1, 'beam', ${`${marker}_SKILL_ELEMENT`})
  `);
  await db.execute(sql`
    insert into zaltyko.athlete_skill_progress (organization_id, athlete_id, template_id, element_id, location_id, status, achieved_on, evaluated_by_member_id)
    values (${organizationId}::uuid, ${athleteId}::uuid, ${skillTemplateId}::uuid, ${skillElementId}::uuid, ${locationId}::uuid,
      'achieved', '2026-11-11', ${memberId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.athlete_level_passes (organization_id, athlete_id, template_id, level_id, location_id, client_request_id, passed_on, passed_by_member_id)
    values (${organizationId}::uuid, ${athleteId}::uuid, ${skillTemplateId}::uuid, ${skillLevelId}::uuid, ${locationId}::uuid,
      ${randomUUID()}::uuid, '2026-11-12', ${memberId}::uuid)
  `);
  const token = randomUUID().replaceAll("-", "");
  await db.execute(sql`
    insert into zaltyko.admission_links (id, organization_id, location_id, token, created_by_member_id)
    values (${linkId}::uuid, ${organizationId}::uuid, ${locationId}::uuid, ${token}, ${memberId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.admission_requests (
      organization_id, location_id, link_id, submission_id, contact_name, contact_email, contact_phone,
      athlete_given_name, athlete_birth_year, message, privacy_consent_version, privacy_consent_at
    ) values (
      ${organizationId}::uuid, ${locationId}::uuid, ${linkId}::uuid, ${randomUUID()}::uuid, ${`${marker}_FAMILY`},
      ${`${marker.toLowerCase()}@example.invalid`}, '600000000', ${`${marker}_CHILD`}, 2016, ${`${marker}_MESSAGE`},
      '2026-11-10', now()
    )
  `);
  return { token, blockMarker: `${marker}_TEMPLATE_BLOCK`, unclassifiedMarker: `${marker}_UNCLASSIFIED_KEY` };
}

describeDisposablePg("academy export with the modules activated on 2026-11-12", () => {
  let fixture: Awaited<ReturnType<typeof seedFixture>>;
  let secrets: { a: Awaited<ReturnType<typeof seedActivatedModules>>; b: Awaited<ReturnType<typeof seedActivatedModules>> };
  const markerA = `ACTIVATED_A_${randomUUID().slice(0, 8).toUpperCase()}`;
  const markerB = `ACTIVATED_B_${randomUUID().slice(0, 8).toUpperCase()}`;

  beforeAll(async () => {
    assertDisposableTarget();
    fixture = await seedFixture();
    for (const name of ACTIVATED_CANDIDATES) await db.execute(sql.raw(activatedCandidate(name)));
    secrets = {
      a: await seedActivatedModules(fixture.organizationAId, markerA),
      b: await seedActivatedModules(fixture.organizationBId, markerB),
    };
  }, 90_000);

  afterAll(async () => {
    if (process.env.ZALTYKO_PG_INTEGRATION !== "1") return;
    // Deja la base compartida como estaba (mismo orden que las suites de cada candidato).
    await db.transaction(async (tx) => {
      for (const table of [
        "athlete_level_passes", "athlete_skill_progress", "skill_elements", "skill_levels", "skill_templates",
        "admission_requests", "admission_links",
        "session_plan_objectives", "session_plan_blocks", "session_plans", "class_plan_templates",
        "athlete_observations", "athlete_objective_status_history", "athlete_objectives",
        "session_staff_overrides", "class_template_staff",
      ]) {
        await tx.execute(sql.raw(`drop table if exists zaltyko.${table}`));
      }
      await tx.execute(sql`grant select on table zaltyko.session_staff to authenticated`);
      await tx.execute(sql`alter table zaltyko.session_staff drop constraint if exists session_staff_profile_fk`);
      await tx.execute(sql`
        alter table zaltyko.session_staff add constraint session_staff_profile_fk
          foreign key (organization_id, staff_profile_id) references zaltyko.staff_profiles (organization_id, id) on delete restrict
      `);
    });
  });

  it("exports every activated table of academy A with values and nothing from academy B", async () => {
    const response = await requestExportAs(fixture.ownerAUserId, fixture.organizationAId);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(validateCanonicalAcademyArchive({ body, organizationId: fixture.organizationAId })).toMatchObject({
      valid: true,
      includedTableCount: CANONICAL_EXPORT_TABLES.length + OPTIONAL_INCLUDED_EXPORT_TABLES.length,
    });
    const exported = JSON.parse(body) as {
      coverage: { excludedColumns: Array<{ table: string; column: string }> };
      data: Record<string, Record<string, unknown>[]>;
    };
    for (const table of OPTIONAL_INCLUDED_EXPORT_TABLES) {
      const rows = exported.data[table.name];
      expect(rows, table.name).toHaveLength(1);
      expect(Object.keys(rows[0]!), table.name).toEqual([...table.exportColumns]);
      expect(rows[0]!.organization_id).toBe(fixture.organizationAId);
    }
    expect(exported.data.athlete_objectives[0]!.target_date).toBe("2026-12-15");
    expect(exported.data.athlete_observations[0]!.observed_on).toBe("2026-11-10");
    expect(exported.data.athlete_skill_progress[0]!.achieved_on).toBe("2026-11-11");
    expect(exported.data.athlete_level_passes[0]!.passed_on).toBe("2026-11-12");
    expect(exported.data.admission_links[0]!.enabled).toBe(true);
    expect(exported.data.admission_requests[0]!.athlete_birth_year).toBe(2016);
    expect(exported.coverage.excludedColumns).toEqual(expect.arrayContaining([
      { table: "admission_links", column: "token", reason: expect.any(String) },
    ]));
    expect(exported.coverage.excludedColumns.some(entry => entry.table === "class_plan_templates")).toBe(false);
    // Los bloques salen con los campos clasificados, en su orden, sin claves ajenas.
    expect(exported.data.class_plan_templates[0]!.blocks).toEqual([
      { kind: "warmup", discipline: null, apparatus: null, content: secrets.a.blockMarker, durationMinutes: 15 },
      { kind: "technique", discipline: "gaf", apparatus: "beam", content: "Paloma", durationMinutes: null },
    ]);
    // Booleanos: un fallo nunca imprime el valor filtrado en el log de CI.
    expect([markerA, `${markerA.toLowerCase()}@example.invalid`].every(value => body.includes(value))).toBe(true);
    expect([markerB, secrets.a.token, secrets.b.token, secrets.a.unclassifiedMarker, "privateNote"].some(value => body.includes(value))).toBe(false);
    expect(preflightCanonicalAcademyRecovery({ body, organizationId: fixture.organizationAId }).status).toBe("blocked");
  });

  it("fails closed while one activated module is only partially installed", async () => {
    // Fuera de transacción: la exportación usa su propia conexión y debe ver el cambio.
    await db.execute(sql`alter table zaltyko.session_plan_objectives set schema public`);
    try {
      const response = await requestExportAs(fixture.ownerAUserId, fixture.organizationAId);
      expect(response.status).toBe(503);
    } finally {
      await db.execute(sql`alter table public.session_plan_objectives set schema zaltyko`);
    }
  });
});
