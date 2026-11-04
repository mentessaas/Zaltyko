import { createHash, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
  ALL_KNOWN_CANONICAL_TABLE_NAMES,
  CANONICAL_EXPORT_TABLES,
  EXCLUDED_CANONICAL_TABLES,
} from "@/modules/data-rights/application/catalog";
import {
  validateCanonicalAcademyArchive,
} from "@/modules/data-rights/application/verify-canonical-academy-archive";

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
