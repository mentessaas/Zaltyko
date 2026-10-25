import { randomUUID } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getOrganizationUsage } from "@/modules/saas-billing/application/organization-usage";
import {
  createOperationalGroup,
  updateOperationalGroupDetails,
} from "@/modules/groups/application/group-management-service";
import {
  createAthleteForGroup,
  updateAthleteProfileForGroup,
} from "@/modules/groups/application/group-membership-service";
import {
  createScheduledClass,
  updateClassDetails,
} from "@/modules/scheduling/application/class-management-service";
import { createEnrollment } from "@/modules/enrollments/application/enrollment-service";
import { recordAttendance } from "@/modules/attendance/application/attendance-service";
import { getOwnerSessionAttendance } from "@/modules/attendance/application/owner-session-attendance";
import { getOwnerOperationalSummary } from "@/modules/owner-dashboard/application/operational-summary";
import {
  associateOwnerFamily,
  getOwnerFamilyOptions,
} from "@/modules/families/application/owner-family-association";
import {
  updateOwnerFamilyLifecycle,
  updateOwnerFamilyPayerProfile,
} from "@/modules/families/application/owner-family-management";
import {
  bootstrapOrganization,
  type BootstrapOrganizationCommand,
} from "@/modules/organizations/application/bootstrap-organization";
import {
  getOwnerContractualConsentRequirement,
  recordOwnerSignupConsent,
} from "@/modules/organizations/application/owner-signup-consent";

const snapshotTables = [
  "athletes",
  "attendance_records",
  "audit_log",
  "class_template_groups",
  "class_template_weekdays",
  "class_templates",
  "enrollments",
  "enrollment_status_history",
  "families",
  "family_guardians",
  "family_members",
  "family_payers",
  "group_membership_history",
  "group_memberships",
  "groups",
  "guardians",
  "member_location_scopes",
  "organization_members",
  "outbox_events",
  "people",
  "session_staff",
  "sessions",
  "staff_profiles",
] as const;

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
    parsed.protocol !== "postgres:" &&
    parsed.protocol !== "postgresql:"
  ) {
    throw new Error("The disposable PostgreSQL target must use PostgreSQL");
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
    throw new Error("The integration suite refuses non-loopback PostgreSQL");
  }
  if (
    parsed.username !== "supabase_admin" ||
    parsed.port === null ||
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
  // The parent shell rejects STRIPE_SECRET_KEY before Vitest starts. The
  // shared setup mutates this name inside Vitest's worker, so it is not a
  // reliable external-credential signal here.
  if (activeForbidden.length > 0) {
    // Names are safe to log; secret values are deliberately never included.
    throw new Error(
      `The integration runner contains forbidden external credential variables: ${activeForbidden.join(", ")}`
    );
  }
}

async function snapshot(organizationId: string) {
  const rows = sql.join(
    snapshotTables.map((table) => sql`
      select ${table}::text as table_name,
        count(*)::int as count,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]')) as content_hash
      from ${sql.identifier("zaltyko")}.${sql.identifier(table)} r
      where r.organization_id = ${organizationId}::uuid
    `),
    sql` union all `
  );
  const result = await db.execute(
    sql`select * from (${rows}) snapshots order by table_name`
  );
  return result.rows;
}

function expectSnapshotDeltas(
  before: Awaited<ReturnType<typeof snapshot>>,
  after: Awaited<ReturnType<typeof snapshot>>,
  expectedDeltas: Partial<Record<(typeof snapshotTables)[number], number>>
) {
  const beforeByTable = new Map(
    before.map((row) => [String(row.table_name), row])
  );
  const afterByTable = new Map(
    after.map((row) => [String(row.table_name), row])
  );
  for (const table of snapshotTables) {
    const beforeRow = beforeByTable.get(table);
    const afterRow = afterByTable.get(table);
    expect(beforeRow, `${table} before`).toBeDefined();
    expect(afterRow, `${table} after`).toBeDefined();
    const expected = expectedDeltas[table] ?? 0;
    expect(Number(afterRow?.count) - Number(beforeRow?.count), table).toBe(
      expected
    );
    if (expected === 0) {
      expect(afterRow?.content_hash, `${table} content`).toBe(
        beforeRow?.content_hash
      );
    } else {
      expect(afterRow?.content_hash, `${table} content`).not.toBe(
        beforeRow?.content_hash
      );
    }
  }
}

async function snapshotOwnerConsent(userId: string) {
  const result = await db.execute(sql`
    select
      (select count(*)::int from zaltyko.owner_signup_consents
        where user_id = ${userId}::uuid) as consent_count,
      (select count(*)::int from zaltyko.owner_signup_consent_audits
        where user_id = ${userId}::uuid) as audit_count
  `);
  return result.rows[0];
}

async function snapshotBootstrap(organizationId: string, userId: string) {
  const result = await db.execute(sql`
    select * from (
      select 'organizations'::text as table_name, count(*)::int as row_count,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]')) as content_hash
      from zaltyko.organizations r where r.id = ${organizationId}::uuid
      union all
      select 'locations', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.locations r where r.organization_id = ${organizationId}::uuid
      union all
      select 'organization_members', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.organization_members r where r.organization_id = ${organizationId}::uuid
      union all
      select 'organization_sports', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.organization_sports r where r.organization_id = ${organizationId}::uuid
      union all
      select 'programs', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.programs r where r.organization_id = ${organizationId}::uuid
      union all
      select 'audit_log', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.audit_log r where r.organization_id = ${organizationId}::uuid
      union all
      select 'outbox_events', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.outbox_events r where r.organization_id = ${organizationId}::uuid
      union all
      select 'organization_bootstrap_commands', count(*)::int,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]'))
      from zaltyko.organization_bootstrap_commands r where r.user_id = ${userId}::uuid
    ) snapshots
    order by table_name
  `);
  return result.rows;
}

async function usage(organizationId: string) {
  return db.transaction((tx) => getOrganizationUsage(tx, organizationId));
}

async function profileVersion(organizationId: string, athleteId: string) {
  const result = await db.execute(sql`
    select to_char(
      p.updated_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ) as profile_version
    from zaltyko.athletes a
    inner join zaltyko.people p
      on p.organization_id = a.organization_id and p.id = a.person_id
    where a.organization_id = ${organizationId}::uuid
      and a.id = ${athleteId}::uuid
  `);
  const value = result.rows[0]?.profile_version;
  if (typeof value !== "string") throw new Error("Synthetic athlete version is missing");
  return value;
}

function assertFreeUsage(
  value: Awaited<ReturnType<typeof usage>>,
  expected: [number, number, number],
  readOnly = false
) {
  expect(value.planCode).toBe("free");
  expect(value.readOnly).toBe(readOnly);
  expect(value.resources.map((item) => item.current)).toEqual(expected);
  expect(value.resources.map((item) => item.limit)).toEqual([30, 3, 10]);
}

async function oneCapacityWinner<T>(attempts: Array<() => Promise<T>>) {
  const results = await Promise.allSettled(attempts.map((attempt) => attempt()));
  const winners = results.flatMap((result, index) =>
    result.status === "fulfilled" ? [{ index, value: result.value }] : []
  );
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  expect(winners).toHaveLength(1);
  expect(failures).toHaveLength(1);
  expect(failures[0]?.reason).toMatchObject({
    code: "CAPACITY_FULL",
    status: 409,
  });
  return winners[0]!;
}

function futureLocalDateAndWeekday() {
  const candidate = new Date(Date.now() + 5 * 86_400_000);
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
  }).format(candidate);
  const weekday = new Date(date + "T12:00:00.000Z").getUTCDay() || 7;
  return { date, weekday };
}

async function seedFreeAcademy() {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const memberId = randomUUID();
  const locationId = randomUUID();
  const groupIds = [randomUUID(), randomUUID()];
  const classIds = Array.from({ length: 9 }, () => randomUUID());
  const athleteRows = Array.from({ length: 29 }, () => ({
    personId: randomUUID(),
    athleteId: randomUUID(),
  }));

  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${"ci-" + userId + "@example.invalid"})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name)
    values (${organizationId}::uuid, ${"CI capacity " + organizationId})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name)
    values (
      ${locationId}::uuid,
      ${organizationId}::uuid,
      'ci-capacity',
      'CI synthetic location'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    )
    values (
      ${memberId}::uuid,
      ${organizationId}::uuid,
      ${userId}::uuid,
      'owner',
      'active',
      'all'
    )
  `);

  const peopleValues = sql.join(
    athleteRows.map((row, index) => sql`(
      ${row.personId}::uuid,
      ${organizationId}::uuid,
      ${"Synthetic " + (index + 1)},
      'Capacity CI'
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values ${peopleValues}
  `);

  const athleteValues = sql.join(
    athleteRows.map((row) => sql`(
      ${row.athleteId}::uuid,
      ${organizationId}::uuid,
      ${row.personId}::uuid
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id)
    values ${athleteValues}
  `);

  const groupValues = sql.join(
    groupIds.map((id, index) => sql`(
      ${id}::uuid,
      ${organizationId}::uuid,
      ${locationId}::uuid,
      ${"Synthetic group " + (index + 1)},
      30,
      'active'
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.groups (
      id, organization_id, location_id, name, capacity, status
    )
    values ${groupValues}
  `);

  const classValues = sql.join(
    classIds.map((id, index) => sql`(
      ${id}::uuid,
      ${organizationId}::uuid,
      ${locationId}::uuid,
      ${"Synthetic class " + (index + 1)},
      30,
      'active',
      current_date
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    )
    values ${classValues}
  `);

  return {
    organizationId,
    locationId,
    actor: { userId, memberId },
    groupIds,
    classIds,
    athleteRows,
  };
}

async function seedEnrollmentEligibilityAcademy() {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const memberId = randomUUID();
  const locationIds = [randomUUID(), randomUUID()];
  const groupIds = [randomUUID(), randomUUID()];
  const classTemplateIds = [randomUUID(), randomUUID()];
  const athletes = [0, 1].map(() => ({
    personId: randomUUID(),
    athleteId: randomUUID(),
  }));

  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${"ci-enrollment-" + userId + "@example.invalid"})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name)
    values (${organizationId}::uuid, ${"CI enrollment " + organizationId})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name)
    values
      (${locationIds[0]}::uuid, ${organizationId}::uuid, 'ci-enroll-a', 'CI enrollment site A'),
      (${locationIds[1]}::uuid, ${organizationId}::uuid, 'ci-enroll-b', 'CI enrollment site B')
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    )
    values (
      ${memberId}::uuid,
      ${organizationId}::uuid,
      ${userId}::uuid,
      'owner',
      'active',
      'all'
    )
  `);

  const peopleValues = sql.join(
    athletes.map((athlete, index) => sql`(
      ${athlete.personId}::uuid,
      ${organizationId}::uuid,
      ${"Enrollment athlete " + (index + 1)},
      'Synthetic'
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values ${peopleValues}
  `);
  const athleteValues = sql.join(
    athletes.map((athlete) => sql`(
      ${athlete.athleteId}::uuid,
      ${organizationId}::uuid,
      ${athlete.personId}::uuid
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id)
    values ${athleteValues}
  `);
  await db.execute(sql`
    insert into zaltyko.groups (
      id, organization_id, location_id, name, capacity, status
    )
    values
      (${groupIds[0]}::uuid, ${organizationId}::uuid, ${locationIds[0]}::uuid, 'CI enrollment group A', 10, 'active'),
      (${groupIds[1]}::uuid, ${organizationId}::uuid, ${locationIds[1]}::uuid, 'CI enrollment group B', 10, 'active')
  `);
  await db.execute(sql`
    insert into zaltyko.group_memberships (
      organization_id, group_id, athlete_id, status, starts_on
    )
    values
      (${organizationId}::uuid, ${groupIds[0]}::uuid, ${athletes[0]!.athleteId}::uuid, 'active', current_date),
      (${organizationId}::uuid, ${groupIds[1]}::uuid, ${athletes[1]!.athleteId}::uuid, 'active', current_date)
  `);
  await db.execute(sql`
    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    )
    values
      (${classTemplateIds[0]}::uuid, ${organizationId}::uuid, ${locationIds[0]}::uuid, 'CI enrollment class A', 10, 'active', current_date),
      (${classTemplateIds[1]}::uuid, ${organizationId}::uuid, ${locationIds[1]}::uuid, 'CI enrollment class B', 10, 'active', current_date)
  `);
  const [dateRow] = (await db.execute(sql`select current_date::text as date`)).rows as Array<{
    date: string;
  }>;

  return {
    organizationId,
    classTemplateId: classTemplateIds[0]!,
    otherSiteClassTemplateId: classTemplateIds[1]!,
    targetGroupId: groupIds[0]!,
    targetLocationId: locationIds[0]!,
    otherSiteLocationId: locationIds[1]!,
    targetAthleteId: athletes[0]!.athleteId,
    otherSiteOnlyAthleteId: athletes[1]!.athleteId,
    startsOn: dateRow!.date,
    actor: { userId, memberId },
  };
}

async function classTemplateVersion(organizationId: string, classTemplateId: string) {
  const result = await db.execute(sql`
    select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as version
    from zaltyko.class_templates
    where organization_id = ${organizationId}::uuid
      and id = ${classTemplateId}::uuid
  `);
  const version = result.rows[0]?.version;
  if (typeof version !== "string") throw new Error("Class version was not returned");
  return version;
}

async function groupVersion(organizationId: string, groupId: string) {
  const result = await db.execute(sql`
    select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as version
    from zaltyko.groups
    where organization_id = ${organizationId}::uuid
      and id = ${groupId}::uuid
  `);
  const version = result.rows[0]?.version;
  if (typeof version !== "string") throw new Error("Group version was not returned");
  return version;
}

function expectOnlyClassDetailsWrites(
  before: Awaited<ReturnType<typeof snapshot>>,
  after: Awaited<ReturnType<typeof snapshot>>
) {
  const mutableTables = new Set(["class_templates", "audit_log", "outbox_events"]);
  const beforeByTable = new Map(before.map((row) => [String(row.table_name), row]));
  const afterByTable = new Map(after.map((row) => [String(row.table_name), row]));
  for (const [table, beforeRow] of beforeByTable) {
    const afterRow = afterByTable.get(table);
    expect(afterRow, `${table} after`).toBeDefined();
    const countDelta = table === "audit_log" || table === "outbox_events" ? 1 : 0;
    expect(Number(afterRow?.count) - Number(beforeRow.count), table).toBe(countDelta);
    if (mutableTables.has(table)) {
      expect(afterRow?.content_hash, `${table} content`).not.toBe(beforeRow.content_hash);
    } else {
      expect(afterRow?.content_hash, `${table} content`).toBe(beforeRow.content_hash);
    }
  }
}

function expectOnlyGroupDetailsWrites(
  before: Awaited<ReturnType<typeof snapshot>>,
  after: Awaited<ReturnType<typeof snapshot>>
) {
  const mutableTables = new Set(["groups", "audit_log", "outbox_events"]);
  const beforeByTable = new Map(before.map((row) => [String(row.table_name), row]));
  const afterByTable = new Map(after.map((row) => [String(row.table_name), row]));
  for (const [table, beforeRow] of beforeByTable) {
    const afterRow = afterByTable.get(table);
    expect(afterRow, `${table} after`).toBeDefined();
    const countDelta = table === "audit_log" || table === "outbox_events" ? 1 : 0;
    expect(Number(afterRow?.count) - Number(beforeRow.count), table).toBe(countDelta);
    if (mutableTables.has(table)) {
      expect(afterRow?.content_hash, `${table} content`).not.toBe(beforeRow.content_hash);
    } else {
      expect(afterRow?.content_hash, `${table} content`).toBe(beforeRow.content_hash);
    }
  }
}

describe("operational capacity concurrency on disposable PostgreSQL", () => {
  it("updates group details atomically, rejects capacity below occupancy, and replays without duplicate writes", async () => {
    assertDisposableTarget();
    const academy = await seedEnrollmentEligibilityAcademy();
    await createAthleteForGroup({
      organizationId: academy.organizationId,
      groupId: academy.targetGroupId,
      givenName: "Group-details occupancy",
      familyName: "Synthetic athlete",
      idempotencyKey: `ci-group-details-member-${randomUUID()}`,
      actor: academy.actor,
    });
    const expectedUpdatedAt = await groupVersion(
      academy.organizationId,
      academy.targetGroupId
    );
    const beforeRejectedUpdate = await snapshot(academy.organizationId);
    const blockedCommand = {
      organizationId: academy.organizationId,
      groupId: academy.targetGroupId,
      expectedUpdatedAt,
      name: "Should not be saved",
      capacity: 1,
      idempotencyKey: `ci-group-details-blocked-${randomUUID()}`,
      actor: academy.actor,
    };

    await expect(updateOperationalGroupDetails(blockedCommand)).rejects.toMatchObject({
      code: "GROUP_CAPACITY_BELOW_OCCUPANCY",
      status: 409,
      details: { openMemberships: 2, nextCapacity: 1 },
    });
    expectSnapshotDeltas(
      beforeRejectedUpdate,
      await snapshot(academy.organizationId),
      {}
    );

    const command = {
      organizationId: academy.organizationId,
      groupId: academy.targetGroupId,
      expectedUpdatedAt,
      name: "CI group edited",
      capacity: 3,
      idempotencyKey: `ci-group-details-success-${randomUUID()}`,
      actor: academy.actor,
    };
    const beforeUpdate = await snapshot(academy.organizationId);
    const updated = await updateOperationalGroupDetails(command);
    expect(updated).toMatchObject({
      id: academy.targetGroupId,
      name: command.name,
      capacity: command.capacity,
    });
    expect(typeof updated.updatedAtVersion).toBe("string");
    const afterUpdate = await snapshot(academy.organizationId);
    expectOnlyGroupDetailsWrites(beforeUpdate, afterUpdate);

    const eventRows = await db.execute(sql`
      select payload::text as payload
      from zaltyko.outbox_events
      where organization_id = ${academy.organizationId}::uuid
        and event_name = 'group.details_updated'
        and idempotency_key = ${command.idempotencyKey}
    `);
    const eventPayload = String(eventRows.rows[0]?.payload ?? "");
    expect(eventPayload).toContain("requestedLabelDigest");
    expect(eventPayload).not.toContain(command.name);
    const auditRows = await db.execute(sql`
      select coalesce("before"::text, '') || coalesce("after"::text, '') as details
      from zaltyko.audit_log
      where organization_id = ${academy.organizationId}::uuid
        and action = 'group.details_updated'
        and idempotency_key = ${command.idempotencyKey}
    `);
    const auditDetails = String(auditRows.rows[0]?.details ?? "");
    expect(auditDetails).toContain("labelDigest");
    expect(auditDetails).not.toContain(command.name);

    await expect(updateOperationalGroupDetails(command)).resolves.toMatchObject({
      id: academy.targetGroupId,
      name: command.name,
      capacity: command.capacity,
      updatedAtVersion: updated.updatedAtVersion,
    });
    expectSnapshotDeltas(afterUpdate, await snapshot(academy.organizationId), {});

    const staleCommand = {
      ...command,
      name: "Stale group edit",
      idempotencyKey: `ci-group-details-stale-${randomUUID()}`,
    };
    const beforeStaleUpdate = await snapshot(academy.organizationId);
    await expect(updateOperationalGroupDetails(staleCommand)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
    });
    expectSnapshotDeltas(
      beforeStaleUpdate,
      await snapshot(academy.organizationId),
      {}
    );
  });

  it("admits only one athlete into the final group place with no partial loser rows", async () => {
    assertDisposableTarget();
    const academy = await seedEnrollmentEligibilityAcademy();
    await db.execute(sql`
      update zaltyko.groups set capacity = 2
      where organization_id = ${academy.organizationId}::uuid
        and id = ${academy.targetGroupId}::uuid
    `);
    const commands = [0, 1].map((index) => ({
      organizationId: academy.organizationId,
      groupId: academy.targetGroupId,
      givenName: `Concurrent group-capacity ${index}`,
      familyName: "Synthetic athlete",
      idempotencyKey: `ci-group-seat-${randomUUID()}`,
      actor: academy.actor,
    }));
    const before = await snapshot(academy.organizationId);

    const results = await Promise.allSettled(
      commands.map((command) => createAthleteForGroup(command))
    );
    const winners = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(winners).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toMatchObject({
      code: "GROUP_CAPACITY_FULL",
      status: 409,
    });

    const after = await snapshot(academy.organizationId);
    expectSnapshotDeltas(before, after, {
      audit_log: 1,
      athletes: 1,
      group_membership_history: 1,
      group_memberships: 1,
      outbox_events: 2,
      people: 1,
    });
    const occupancy = await db.execute(sql`
      select count(*)::int as count
      from zaltyko.group_memberships
      where organization_id = ${academy.organizationId}::uuid
        and group_id = ${academy.targetGroupId}::uuid
        and status in ('pending', 'active', 'paused')
    `);
    expect(Number(occupancy.rows[0]?.count)).toBe(2);
    const attemptedPeople = await db.execute(sql`
      select count(*)::int as count
      from zaltyko.people
      where organization_id = ${academy.organizationId}::uuid
        and given_name in (${commands[0]!.givenName}, ${commands[1]!.givenName})
    `);
    expect(Number(attemptedPeople.rows[0]?.count)).toBe(1);
  });

  it("admits only one enrollment into the final class place with no partial loser rows", async () => {
    assertDisposableTarget();
    const academy = await seedEnrollmentEligibilityAcademy();
    const startsOn = academy.startsOn;
    const firstClassmate = await createAthleteForGroup({
      organizationId: academy.organizationId,
      groupId: academy.targetGroupId,
      givenName: "Class-capacity first",
      familyName: "Synthetic athlete",
      idempotencyKey: `ci-classmate-first-${randomUUID()}`,
      actor: academy.actor,
    });
    const secondClassmate = await createAthleteForGroup({
      organizationId: academy.organizationId,
      groupId: academy.targetGroupId,
      givenName: "Class-capacity second",
      familyName: "Synthetic athlete",
      idempotencyKey: `ci-classmate-second-${randomUUID()}`,
      actor: academy.actor,
    });
    await createEnrollment({
      organizationId: academy.organizationId,
      locationId: academy.targetLocationId,
      athleteId: academy.targetAthleteId,
      classTemplateId: academy.classTemplateId,
      status: "active",
      startsOn,
      source: "owner",
      idempotencyKey: `ci-class-capacity-existing-${randomUUID()}`,
      actor: academy.actor,
    });
    await db.execute(sql`
      update zaltyko.class_templates set capacity = 2
      where organization_id = ${academy.organizationId}::uuid
        and id = ${academy.classTemplateId}::uuid
    `);
    const commands = [firstClassmate.athleteId, secondClassmate.athleteId].map(
      (athleteId) => ({
        organizationId: academy.organizationId,
        locationId: academy.targetLocationId,
        athleteId,
        classTemplateId: academy.classTemplateId,
        status: "active" as const,
        startsOn,
        source: "owner" as const,
        idempotencyKey: `ci-class-seat-${randomUUID()}`,
        actor: academy.actor,
      })
    );
    const before = await snapshot(academy.organizationId);

    const results = await Promise.allSettled(
      commands.map((command) => createEnrollment(command))
    );
    const winners = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    expect(winners).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.reason).toMatchObject({
      code: "CAPACITY_FULL",
      status: 409,
    });

    const after = await snapshot(academy.organizationId);
    expectSnapshotDeltas(before, after, {
      audit_log: 1,
      enrollment_status_history: 1,
      enrollments: 1,
      outbox_events: 1,
    });
    const persisted = await db.execute(sql`
      select count(*)::int as count
      from zaltyko.enrollments
      where organization_id = ${academy.organizationId}::uuid
        and class_template_id = ${academy.classTemplateId}::uuid
        and status in ('pending', 'trial', 'active', 'paused')
    `);
    expect(Number(persisted.rows[0]?.count)).toBe(2);
    const receipts = await db.execute(sql`
      select count(*)::int as count
      from zaltyko.outbox_events
      where organization_id = ${academy.organizationId}::uuid
        and idempotency_key in (
          ${commands[0]!.idempotencyKey},
          ${commands[1]!.idempotencyKey}
        )
    `);
    expect(Number(receipts.rows[0]?.count)).toBe(1);
  });
});

describe("Owner class details on disposable PostgreSQL", () => {
  it("updates class details once, keeps names out of audit events and replays without writes", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    const command = {
      organizationId: fixture.organizationId,
      classTemplateId: fixture.classTemplateId,
      expectedUpdatedAt: await classTemplateVersion(fixture.organizationId, fixture.classTemplateId),
      name: "CI artistic advanced class",
      capacity: 16,
      idempotencyKey: `ci-class-details-${randomUUID()}`,
      actor: fixture.actor,
    };
    const before = await snapshot(fixture.organizationId);

    const updated = await updateClassDetails(command);

    expect(updated).toMatchObject({
      id: fixture.classTemplateId,
      name: command.name,
      capacity: command.capacity,
    });
    expect(updated.updatedAtVersion).not.toBe(command.expectedUpdatedAt);
    const after = await snapshot(fixture.organizationId);
    expectOnlyClassDetailsWrites(before, after);

    const records = await db.execute(sql`
      select payload::text as content
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
        and idempotency_key = ${command.idempotencyKey}
      union all
      select to_jsonb(a)::text
      from zaltyko.audit_log a
      where organization_id = ${fixture.organizationId}::uuid
        and idempotency_key = ${command.idempotencyKey}
    `);
    expect(records.rows).toHaveLength(2);
    for (const record of records.rows) {
      expect(String(record.content)).not.toContain(command.name);
      expect(String(record.content)).not.toContain('"name"');
    }

    await expect(updateClassDetails(command)).resolves.toEqual(updated);
    expect(await snapshot(fixture.organizationId)).toEqual(after);
    const receipts = await db.execute(sql`
      select count(*)::int as count
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
        and event_name = 'class_template.details_updated'
        and idempotency_key = ${command.idempotencyKey}
    `);
    expect(Number(receipts.rows[0]?.count)).toBe(1);
  });

  it("rejects stale class versions without changing tenant records", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    const before = await snapshot(fixture.organizationId);

    await expect(updateClassDetails({
      organizationId: fixture.organizationId,
      classTemplateId: fixture.classTemplateId,
      expectedUpdatedAt: "2000-01-01T00:00:00.000000Z",
      name: "Stale class edit",
      idempotencyKey: `ci-class-details-stale-${randomUUID()}`,
      actor: fixture.actor,
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });

    expect(await snapshot(fixture.organizationId)).toEqual(before);
  });

  it("rejects edits outside the actor's assigned location without partial writes", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    await db.execute(sql`
      update zaltyko.organization_members
      set location_scope_mode = 'selected'
      where organization_id = ${fixture.organizationId}::uuid
        and id = ${fixture.actor.memberId}::uuid
    `);
    await db.execute(sql`
      insert into zaltyko.member_location_scopes (
        organization_id, member_id, location_id
      ) values (
        ${fixture.organizationId}::uuid,
        ${fixture.actor.memberId}::uuid,
        ${fixture.otherSiteLocationId}::uuid
      )
    `);
    const before = await snapshot(fixture.organizationId);

    await expect(updateClassDetails({
      organizationId: fixture.organizationId,
      classTemplateId: fixture.classTemplateId,
      expectedUpdatedAt: await classTemplateVersion(fixture.organizationId, fixture.classTemplateId),
      name: "Denied other-site class edit",
      idempotencyKey: `ci-class-details-other-site-${randomUUID()}`,
      actor: fixture.actor,
    })).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });

    expect(await snapshot(fixture.organizationId)).toEqual(before);
  });

  it("serializes concurrent edits from one version and commits only one", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    const expectedUpdatedAt = await classTemplateVersion(fixture.organizationId, fixture.classTemplateId);
    const commands = ["Concurrent class A", "Concurrent class B"].map((name) => ({
      organizationId: fixture.organizationId,
      classTemplateId: fixture.classTemplateId,
      expectedUpdatedAt,
      name,
      idempotencyKey: `ci-class-details-concurrent-${randomUUID()}`,
      actor: fixture.actor,
    }));
    const before = await snapshot(fixture.organizationId);

    const outcomes = await Promise.allSettled(commands.map((command) => updateClassDetails(command)));

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { code: "VERSION_CONFLICT", status: 409 },
    });
    expectOnlyClassDetailsWrites(before, await snapshot(fixture.organizationId));
    const receipts = await db.execute(sql`
      select count(*)::int as count
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
        and event_name = 'class_template.details_updated'
        and idempotency_key in (${commands[0]!.idempotencyKey}, ${commands[1]!.idempotencyKey})
    `);
    expect(Number(receipts.rows[0]?.count)).toBe(1);
  });

  it("keeps capacity above open enrollment occupancy and rolls back the whole edit", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    const secondAthlete = await createAthleteForGroup({
      organizationId: fixture.organizationId,
      groupId: fixture.targetGroupId,
      givenName: "Class capacity second",
      familyName: "Synthetic athlete",
      idempotencyKey: `ci-class-capacity-second-${randomUUID()}`,
      actor: fixture.actor,
    });
    for (const athleteId of [fixture.targetAthleteId, secondAthlete.athleteId]) {
      await createEnrollment({
        organizationId: fixture.organizationId,
        locationId: fixture.targetLocationId,
        athleteId,
        classTemplateId: fixture.classTemplateId,
        status: "active",
        startsOn: fixture.startsOn,
        source: "owner",
        idempotencyKey: `ci-class-capacity-enrollment-${randomUUID()}`,
        actor: fixture.actor,
      });
    }
    const before = await snapshot(fixture.organizationId);

    await expect(updateClassDetails({
      organizationId: fixture.organizationId,
      classTemplateId: fixture.classTemplateId,
      expectedUpdatedAt: await classTemplateVersion(fixture.organizationId, fixture.classTemplateId),
      name: "Must roll back with capacity",
      capacity: 1,
      idempotencyKey: `ci-class-capacity-reject-${randomUUID()}`,
      actor: fixture.actor,
    })).rejects.toMatchObject({ code: "CAPACITY_FULL", status: 409 });

    expect(await snapshot(fixture.organizationId)).toEqual(before);
  });

  it("blocks writes for over-limit Free academies without partial changes", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    const extraAthletes = Array.from({ length: 29 }, () => ({
      personId: randomUUID(),
      athleteId: randomUUID(),
    }));
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values ${sql.join(extraAthletes.map((row) => sql`(
        ${row.personId}::uuid,
        ${fixture.organizationId}::uuid,
        'Synthetic excess',
        'Class capacity QA'
      )`), sql`, `)}
    `);
    await db.execute(sql`
      insert into zaltyko.athletes (id, organization_id, person_id)
      values ${sql.join(extraAthletes.map((row) => sql`(
        ${row.athleteId}::uuid,
        ${fixture.organizationId}::uuid,
        ${row.personId}::uuid
      )`), sql`, `)}
    `);
    assertFreeUsage(await usage(fixture.organizationId), [31, 2, 2], true);
    const before = await snapshot(fixture.organizationId);

    await expect(updateClassDetails({
      organizationId: fixture.organizationId,
      classTemplateId: fixture.classTemplateId,
      expectedUpdatedAt: await classTemplateVersion(fixture.organizationId, fixture.classTemplateId),
      name: "Blocked while over Free limit",
      idempotencyKey: `ci-class-free-readonly-${randomUUID()}`,
      actor: fixture.actor,
    })).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY", status: 409 });

    expect(await snapshot(fixture.organizationId)).toEqual(before);
  });
});

async function seedAttendanceFixture() {
  const academy = await seedEnrollmentEligibilityAcademy();
  const enrollment = await createEnrollment({
    organizationId: academy.organizationId,
    locationId: academy.targetLocationId,
    athleteId: academy.targetAthleteId,
    classTemplateId: academy.classTemplateId,
    status: "active",
    startsOn: academy.startsOn,
    source: "owner",
    idempotencyKey: "ci-attendance-enrollment-" + randomUUID(),
    actor: academy.actor,
  });
  const sessionId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.sessions (
      id, organization_id, location_id, class_template_id, status, starts_at, ends_at
    )
    values (
      ${sessionId}::uuid,
      ${academy.organizationId}::uuid,
      ${academy.targetLocationId}::uuid,
      ${academy.classTemplateId}::uuid,
      'scheduled',
      now() + interval '2 days',
      now() + interval '2 days 1 hour'
    )
  `);

  return {
    ...academy,
    enrollmentId: enrollment.id,
    sessionId,
  };
}

async function seedAttendanceCoach(
  fixture: Awaited<ReturnType<typeof seedAttendanceFixture>>,
  assigned: boolean
) {
  const userId = randomUUID();
  const personId = randomUUID();
  const memberId = randomUUID();
  const staffProfileId = randomUUID();
  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${"ci-coach-" + userId + "@example.invalid"})
  `);
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values (
      ${personId}::uuid,
      ${fixture.organizationId}::uuid,
      'Synthetic',
      ${assigned ? "Assigned coach" : "Unassigned coach"}
    )
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    )
    values (
      ${memberId}::uuid,
      ${fixture.organizationId}::uuid,
      ${userId}::uuid,
      'coach',
      'active',
      'all'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.staff_profiles (id, organization_id, person_id, member_id, is_active)
    values (
      ${staffProfileId}::uuid,
      ${fixture.organizationId}::uuid,
      ${personId}::uuid,
      ${memberId}::uuid,
      true
    )
  `);
  if (assigned) {
    await db.execute(sql`
      insert into zaltyko.session_staff (organization_id, session_id, staff_profile_id)
      values (
        ${fixture.organizationId}::uuid,
        ${fixture.sessionId}::uuid,
        ${staffProfileId}::uuid
      )
    `);
  }
  return { userId, memberId, staffProfileId };
}

async function seedFamilyAssociationFixture() {
  const academy = await seedEnrollmentEligibilityAcademy();
  await Promise.all([
    createEnrollment({
      organizationId: academy.organizationId,
      locationId: academy.targetLocationId,
      athleteId: academy.targetAthleteId,
      classTemplateId: academy.classTemplateId,
      status: "active",
      startsOn: academy.startsOn,
      source: "owner",
      idempotencyKey: "ci-family-enrollment-a-" + randomUUID(),
      actor: academy.actor,
    }),
    createEnrollment({
      organizationId: academy.organizationId,
      locationId: academy.otherSiteLocationId,
      athleteId: academy.otherSiteOnlyAthleteId,
      classTemplateId: academy.otherSiteClassTemplateId,
      status: "active",
      startsOn: academy.startsOn,
      source: "owner",
      idempotencyKey: "ci-family-enrollment-b-" + randomUUID(),
      actor: academy.actor,
    }),
  ]);
  return academy;
}

describe("Free capacity guards on disposable PostgreSQL", () => {
  it("serializes last-slot writes, replays winners once, and leaves no partial rows on denials", async () => {
    assertDisposableTarget();
    const fixture = await seedFreeAcademy();
    const organizationId = fixture.organizationId;
    assertFreeUsage(await usage(organizationId), [29, 2, 9]);

    const beforeRaces = await snapshot(organizationId);
    const athleteCommands = [0, 1].map((index) => ({
      organizationId,
      groupId: fixture.groupIds[0]!,
      givenName: "Concurrent " + index,
      familyName: "Synthetic athlete",
      idempotencyKey: "ci-athlete-" + randomUUID(),
      actor: fixture.actor,
    }));
    const athleteWinner = await oneCapacityWinner(
      athleteCommands.map((command) => () => createAthleteForGroup(command))
    );
    const afterAthleteRace = await snapshot(organizationId);
    expect(afterAthleteRace).not.toEqual(beforeRaces);
    assertFreeUsage(await usage(organizationId), [30, 2, 9]);
    await expect(
      createAthleteForGroup(athleteCommands[athleteWinner.index]!)
    ).resolves.toMatchObject({ id: athleteWinner.value.id });
    expect(await snapshot(organizationId)).toEqual(afterAthleteRace);

    const groupCommands = [0, 1].map((index) => ({
      organizationId,
      locationId: fixture.locationId,
      programId: null,
      name: "Concurrent group " + index,
      capacity: 30,
      idempotencyKey: "ci-group-" + randomUUID(),
      actor: fixture.actor,
    }));
    const beforeGroupRace = await snapshot(organizationId);
    const groupWinner = await oneCapacityWinner(
      groupCommands.map((command) => () => createOperationalGroup(command))
    );
    const afterGroupRace = await snapshot(organizationId);
    expect(afterGroupRace).not.toEqual(beforeGroupRace);
    assertFreeUsage(await usage(organizationId), [30, 3, 9]);
    await expect(
      createOperationalGroup(groupCommands[groupWinner.index]!)
    ).resolves.toMatchObject({ id: groupWinner.value.id });
    expect(await snapshot(organizationId)).toEqual(afterGroupRace);

    const { date, weekday } = futureLocalDateAndWeekday();
    const classCommands = [0, 1].map((index) => ({
      organizationId,
      locationId: fixture.locationId,
      programId: null,
      name: "Concurrent class " + index,
      capacity: 30,
      effectiveFrom: date,
      effectiveTo: date,
      schedule: [{
        isoWeekday: weekday,
        startsAtLocal: "08:00",
        endsAtLocal: "09:00",
      }],
      idempotencyKey: "ci-class-" + randomUUID(),
      actor: fixture.actor,
    }));
    const beforeClassRace = await snapshot(organizationId);
    const classWinner = await oneCapacityWinner(
      classCommands.map((command) => () => createScheduledClass(command))
    );
    const afterClassRace = await snapshot(organizationId);
    expect(afterClassRace).not.toEqual(beforeClassRace);
    assertFreeUsage(await usage(organizationId), [30, 3, 10]);
    expect(classWinner.value.sessionCount).toBe(1);
    await expect(
      createScheduledClass(classCommands[classWinner.index]!)
    ).resolves.toMatchObject({
      classTemplate: { id: classWinner.value.classTemplate.id },
      sessionCount: 1,
    });
    expect(await snapshot(organizationId)).toEqual(afterClassRace);

    const fullSnapshot = await snapshot(organizationId);
    const rejectedAthlete = {
      organizationId,
      groupId: fixture.groupIds[0]!,
      givenName: "Blocked",
      familyName: "Athlete thirty one",
      idempotencyKey: "ci-block-athlete-" + randomUUID(),
      actor: fixture.actor,
    };
    await expect(createAthleteForGroup(rejectedAthlete)).rejects.toMatchObject({
      code: "CAPACITY_FULL",
      status: 409,
    });
    expect(await snapshot(organizationId)).toEqual(fullSnapshot);

    const rejectedGroup = {
      organizationId,
      locationId: fixture.locationId,
      programId: null,
      name: "Blocked group four",
      capacity: 30,
      idempotencyKey: "ci-block-group-" + randomUUID(),
      actor: fixture.actor,
    };
    await expect(createOperationalGroup(rejectedGroup)).rejects.toMatchObject({
      code: "CAPACITY_FULL",
      status: 409,
    });
    expect(await snapshot(organizationId)).toEqual(fullSnapshot);

    const rejectedClass = {
      organizationId,
      locationId: fixture.locationId,
      programId: null,
      name: "Blocked class eleven",
      capacity: 30,
      effectiveFrom: date,
      effectiveTo: date,
      schedule: [{
        isoWeekday: weekday,
        startsAtLocal: "10:00",
        endsAtLocal: "11:00",
      }],
      idempotencyKey: "ci-block-class-" + randomUUID(),
      actor: fixture.actor,
    };
    await expect(createScheduledClass(rejectedClass)).rejects.toMatchObject({
      code: "CAPACITY_FULL",
      status: 409,
    });
    expect(await snapshot(organizationId)).toEqual(fullSnapshot);

    const excessPersonId = randomUUID();
    const excessAthleteId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values (
        ${excessPersonId}::uuid,
        ${organizationId}::uuid,
        'Synthetic excess',
        'Athlete'
      )
    `);
    await db.execute(sql`
      insert into zaltyko.athletes (id, organization_id, person_id)
      values (
        ${excessAthleteId}::uuid,
        ${organizationId}::uuid,
        ${excessPersonId}::uuid
      )
    `);
    const excessSnapshot = await snapshot(organizationId);
    assertFreeUsage(await usage(organizationId), [31, 3, 10], true);

    for (const [label, attempt] of [
      ["athlete", () => createAthleteForGroup({
        ...rejectedAthlete,
        givenName: "Blocked over-capacity",
        idempotencyKey: "ci-over-cap-athlete-" + randomUUID(),
      })],
      ["group", () => createOperationalGroup({
        ...rejectedGroup,
        name: "Blocked over-capacity group",
        idempotencyKey: "ci-over-cap-group-" + randomUUID(),
      })],
      ["class", () => createScheduledClass({
        ...rejectedClass,
        name: "Blocked over-capacity class",
        idempotencyKey: "ci-over-cap-class-" + randomUUID(),
      })],
    ] as const) {
      await expect(attempt(), label).rejects.toMatchObject({
        code: "PLAN_OVER_CAPACITY",
        status: 409,
      });
      expect(await snapshot(organizationId)).toEqual(excessSnapshot);
    }
  }, 45_000);

  it("updates an authorized athlete profile once, audits without names, and replays without writes", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    const key = `ci-athlete-profile-${randomUUID()}`;
    const command = {
      organizationId: fixture.organizationId,
      groupId: fixture.targetGroupId,
      athleteId: fixture.targetAthleteId,
      givenName: "Alicia Synthetic",
      familyName: "Gimenez QA",
      preferredName: "Ali QA",
      expectedProfileVersion: await profileVersion(
        fixture.organizationId,
        fixture.targetAthleteId
      ),
      idempotencyKey: key,
      actor: fixture.actor,
    };
    const before = await snapshot(fixture.organizationId);

    const updated = await updateAthleteProfileForGroup(command);

    expect(updated).toMatchObject({
      athleteId: fixture.targetAthleteId,
      givenName: command.givenName,
      familyName: command.familyName,
      preferredName: command.preferredName,
    });
    const after = await snapshot(fixture.organizationId);
    const changedTables = new Set(["audit_log", "outbox_events", "people"]);
    const beforeByTable = new Map(before.map((row) => [String(row.table_name), row]));
    const afterByTable = new Map(after.map((row) => [String(row.table_name), row]));
    for (const row of before) {
      const table = String(row.table_name);
      const next = afterByTable.get(table);
      expect(next).toBeDefined();
      const expectedCountDelta = table === "audit_log" || table === "outbox_events" ? 1 : 0;
      expect(Number(next?.count) - Number(row.count), table).toBe(expectedCountDelta);
      if (changedTables.has(table)) {
        expect(next?.content_hash, table).not.toBe(row.content_hash);
      } else {
        expect(next?.content_hash, table).toBe(row.content_hash);
      }
    }

    const records = await db.execute(sql`
      select 'outbox'::text as kind, payload::text as content
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
        and idempotency_key = ${key}
      union all
      select 'audit', to_jsonb(a)::text
      from zaltyko.audit_log a
      where organization_id = ${fixture.organizationId}::uuid
        and idempotency_key = ${key}
    `);
    expect(records.rows).toHaveLength(2);
    for (const record of records.rows) {
      expect(String(record.content)).not.toContain(command.givenName);
      expect(String(record.content)).not.toContain(command.familyName);
      expect(String(record.content)).not.toContain(command.preferredName);
    }

    await expect(updateAthleteProfileForGroup(command)).resolves.toEqual(updated);
    expect(await snapshot(fixture.organizationId)).toEqual(after);
    const unchangedCount = await db.execute(sql`
      select count(*)::int as count
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
        and event_name = 'athlete.profile_updated'
        and idempotency_key = ${key}
    `);
    expect(Number(unchangedCount.rows[0]?.count)).toBe(1);
    expect(beforeByTable.size).toBe(afterByTable.size);
  });

  it("serializes concurrent profile edits from the same version and commits only one", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    const expectedProfileVersion = await profileVersion(
      fixture.organizationId,
      fixture.targetAthleteId
    );
    const commands = ["First Synthetic", "Second Synthetic"].map((givenName) => ({
      organizationId: fixture.organizationId,
      groupId: fixture.targetGroupId,
      athleteId: fixture.targetAthleteId,
      givenName,
      familyName: "Concurrent QA",
      preferredName: null,
      expectedProfileVersion,
      idempotencyKey: `ci-athlete-concurrent-${randomUUID()}`,
      actor: fixture.actor,
    }));
    const before = await snapshot(fixture.organizationId);

    const outcomes = await Promise.allSettled(
      commands.map((command) => updateAthleteProfileForGroup(command))
    );

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { code: "VERSION_CONFLICT", status: 409 },
    });
    const after = await snapshot(fixture.organizationId);
    const beforeByTable = new Map(before.map((row) => [String(row.table_name), row]));
    const afterByTable = new Map(after.map((row) => [String(row.table_name), row]));
    for (const row of before) {
      const table = String(row.table_name);
      const next = afterByTable.get(table);
      const expectedCountDelta = table === "audit_log" || table === "outbox_events" ? 1 : 0;
      expect(Number(next?.count) - Number(row.count), table).toBe(expectedCountDelta);
      if (["audit_log", "outbox_events", "people"].includes(table)) {
        expect(next?.content_hash, table).not.toBe(row.content_hash);
      } else {
        expect(next?.content_hash, table).toBe(row.content_hash);
      }
    }
    const events = await db.execute(sql`
      select count(*)::int as count
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
        and event_name = 'athlete.profile_updated'
        and idempotency_key in (${commands[0]!.idempotencyKey}, ${commands[1]!.idempotencyKey})
    `);
    expect(Number(events.rows[0]?.count)).toBe(1);
  });

  it("rejects stale profile versions without changing any tenant record", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    const before = await snapshot(fixture.organizationId);

    await expect(updateAthleteProfileForGroup({
      organizationId: fixture.organizationId,
      groupId: fixture.targetGroupId,
      athleteId: fixture.targetAthleteId,
      givenName: "Stale Synthetic",
      familyName: "Profile QA",
      preferredName: null,
      expectedProfileVersion: "2000-01-01T00:00:00.000000Z",
      idempotencyKey: `ci-athlete-stale-${randomUUID()}`,
      actor: fixture.actor,
    })).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });

    expect(await snapshot(fixture.organizationId)).toEqual(before);
  });

  it("rejects profile edits outside the actor's assigned location without partial writes", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    await db.execute(sql`
      update zaltyko.organization_members
      set location_scope_mode = 'selected'
      where organization_id = ${fixture.organizationId}::uuid
        and id = ${fixture.actor.memberId}::uuid
    `);
    await db.execute(sql`
      insert into zaltyko.member_location_scopes (
        organization_id, member_id, location_id
      ) values (
        ${fixture.organizationId}::uuid,
        ${fixture.actor.memberId}::uuid,
        ${fixture.otherSiteLocationId}::uuid
      )
    `);
    const before = await snapshot(fixture.organizationId);

    await expect(updateAthleteProfileForGroup({
      organizationId: fixture.organizationId,
      groupId: fixture.targetGroupId,
      athleteId: fixture.targetAthleteId,
      givenName: "Denied Synthetic",
      familyName: "Other Site",
      preferredName: null,
      expectedProfileVersion: await profileVersion(
        fixture.organizationId,
        fixture.targetAthleteId
      ),
      idempotencyKey: `ci-athlete-other-site-${randomUUID()}`,
      actor: fixture.actor,
    })).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });

    expect(await snapshot(fixture.organizationId)).toEqual(before);
  });

  it("blocks profile edits for over-limit Free academies without partial writes", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    const extras = Array.from({ length: 29 }, () => ({
      personId: randomUUID(),
      athleteId: randomUUID(),
    }));
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values ${sql.join(extras.map((row) => sql`(
        ${row.personId}::uuid,
        ${fixture.organizationId}::uuid,
        'Synthetic excess',
        'Athlete'
      )`), sql`, `)}
    `);
    await db.execute(sql`
      insert into zaltyko.athletes (id, organization_id, person_id)
      values ${sql.join(extras.map((row) => sql`(
        ${row.athleteId}::uuid,
        ${fixture.organizationId}::uuid,
        ${row.personId}::uuid
      )`), sql`, `)}
    `);
    assertFreeUsage(await usage(fixture.organizationId), [31, 2, 2], true);
    const before = await snapshot(fixture.organizationId);

    await expect(updateAthleteProfileForGroup({
      organizationId: fixture.organizationId,
      groupId: fixture.targetGroupId,
      athleteId: fixture.targetAthleteId,
      givenName: "Blocked Synthetic",
      familyName: "Free Read Only",
      preferredName: null,
      expectedProfileVersion: await profileVersion(
        fixture.organizationId,
        fixture.targetAthleteId
      ),
      idempotencyKey: `ci-athlete-over-limit-${randomUUID()}`,
      actor: fixture.actor,
    })).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY", status: 409 });

    expect(await snapshot(fixture.organizationId)).toEqual(before);
  });

  it("creates an enrollment only when the athlete has an open relationship at that site", async () => {
    assertDisposableTarget();
    const fixture = await seedEnrollmentEligibilityAcademy();
    const validCommand = {
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      athleteId: fixture.targetAthleteId,
      classTemplateId: fixture.classTemplateId,
      status: "active" as const,
      startsOn: fixture.startsOn,
      source: "owner" as const,
      idempotencyKey: "ci-enrollment-valid-" + randomUUID(),
      actor: fixture.actor,
    };

    const beforeValidEnrollment = await snapshot(fixture.organizationId);
    const enrollment = await createEnrollment(validCommand);
    expect(enrollment).toMatchObject({
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      athleteId: fixture.targetAthleteId,
      classTemplateId: fixture.classTemplateId,
      status: "active",
    });
    const afterValidEnrollment = await snapshot(fixture.organizationId);
    expect(afterValidEnrollment).not.toEqual(beforeValidEnrollment);
    expect(await createEnrollment(validCommand)).toMatchObject({
      id: enrollment.id,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(afterValidEnrollment);

    const beforeRejectedEnrollment = await snapshot(fixture.organizationId);
    await expect(createEnrollment({
      ...validCommand,
      athleteId: fixture.otherSiteOnlyAthleteId,
      idempotencyKey: "ci-enrollment-wrong-site-" + randomUUID(),
    })).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeRejectedEnrollment);
  }, 45_000);

  it("records attendance once under concurrent replay and rolls back partial writes", async () => {
    assertDisposableTarget();
    const fixture = await seedAttendanceFixture();
    const idempotencyKey = "ci-attendance-replay-" + randomUUID();
    const command = {
      organizationId: fixture.organizationId,
      expectedLocationId: fixture.targetLocationId,
      sessionId: fixture.sessionId,
      enrollmentId: fixture.enrollmentId,
      status: "present" as const,
      idempotencyKey,
      actor: fixture.actor,
    };

    const beforeRecording = await snapshot(fixture.organizationId);
    const concurrentResults = await Promise.all([
      recordAttendance(command),
      recordAttendance(command),
    ]);
    expect(concurrentResults[0]?.id).toBe(concurrentResults[1]?.id);
    expect(concurrentResults[0]).toMatchObject({
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      sessionId: fixture.sessionId,
      enrollmentId: fixture.enrollmentId,
      athleteId: fixture.targetAthleteId,
      status: "present",
    });

    const afterRecording = await snapshot(fixture.organizationId);
    expect(afterRecording).not.toEqual(beforeRecording);
    expect(await recordAttendance(command)).toMatchObject({
      id: concurrentResults[0]!.id,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(afterRecording);

    const persisted = await db.execute(sql`
      select
        (select count(*)::int from zaltyko.attendance_records
          where organization_id = ${fixture.organizationId}::uuid
            and session_id = ${fixture.sessionId}::uuid
            and enrollment_id = ${fixture.enrollmentId}::uuid) as attendance_count,
        (select count(*)::int from zaltyko.outbox_events
          where organization_id = ${fixture.organizationId}::uuid
            and event_name = 'attendance.recorded'
            and idempotency_key = ${idempotencyKey}) as outbox_count,
        (select count(*)::int from zaltyko.audit_log
          where organization_id = ${fixture.organizationId}::uuid
            and idempotency_key = ${idempotencyKey}) as audit_count
    `);
    expect(persisted.rows[0]).toEqual({
      attendance_count: 1,
      outbox_count: 1,
      audit_count: 1,
    });

    const periodResult = await db.execute(sql`
      select
        to_char(
          (session.starts_at at time zone organization.default_timezone)::date,
          'YYYY-MM-DD'
        ) as organization_date,
        to_char(
          (session.starts_at at time zone location.timezone)::date,
          'YYYY-MM-DD'
        ) as location_date
      from zaltyko.sessions session
      join zaltyko.organizations organization
        on organization.id = session.organization_id
      join zaltyko.locations location
        on location.organization_id = session.organization_id
       and location.id = session.location_id
      where session.organization_id = ${fixture.organizationId}::uuid
        and session.id = ${fixture.sessionId}::uuid
    `);
    const organizationDate = String(
      periodResult.rows[0]?.organization_date ?? ""
    );
    const locationDate = String(periodResult.rows[0]?.location_date ?? "");
    expect(organizationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(locationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const organizationPeriod = [organizationDate, locationDate].sort();

    const beforeOrganizationSummary = await snapshot(fixture.organizationId);
    const organizationSummary = await getOwnerOperationalSummary({
      userId: fixture.actor.userId,
      organizationId: fixture.organizationId,
      from: organizationPeriod[0]!,
      to: organizationPeriod.at(-1)!,
    });
    expect(organizationSummary).toMatchObject({
      scope: { kind: "organization", organizationId: fixture.organizationId },
      metrics: {
        activeAthletes: 2,
        activeGroups: 2,
        attendanceRecords: 1,
        paymentsReceived: { state: "available", count: 0, grossByCurrency: [] },
      },
    });
    expect(await snapshot(fixture.organizationId)).toEqual(
      beforeOrganizationSummary
    );

    const beforeLocationSummary = await snapshot(fixture.organizationId);
    const locationSummary = await getOwnerOperationalSummary({
      userId: fixture.actor.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      from: locationDate,
      to: locationDate,
    });
    expect(locationSummary).toMatchObject({
      scope: {
        kind: "location",
        organizationId: fixture.organizationId,
        locationId: fixture.targetLocationId,
        locationIds: [fixture.targetLocationId],
      },
      metrics: {
        activeAthletes: 1,
        activeGroups: 1,
        attendanceRecords: 1,
      },
    });
    expect(await snapshot(fixture.organizationId)).toEqual(
      beforeLocationSummary
    );

    const managerUserId = randomUUID();
    const managerMemberId = randomUUID();
    await db.execute(sql`
      insert into auth.users (id, email)
      values (
        ${managerUserId}::uuid,
        ${"ci-summary-manager-" + managerUserId + "@example.invalid"}
      )
    `);
    await db.execute(sql`
      insert into zaltyko.organization_members (
        id, organization_id, user_id, role, status, location_scope_mode
      )
      values (
        ${managerMemberId}::uuid,
        ${fixture.organizationId}::uuid,
        ${managerUserId}::uuid,
        'manager',
        'active',
        'selected'
      )
    `);
    await db.execute(sql`
      insert into zaltyko.member_location_scopes (
        organization_id, member_id, location_id
      ) values (
        ${fixture.organizationId}::uuid,
        ${managerMemberId}::uuid,
        ${fixture.targetLocationId}::uuid
      )
    `);

    const beforeManagerSummary = await snapshot(fixture.organizationId);
    const managerSummary = await getOwnerOperationalSummary({
      userId: managerUserId,
      organizationId: fixture.organizationId,
      from: locationDate,
      to: locationDate,
    });
    expect(managerSummary).toMatchObject({
      scope: {
        kind: "location",
        organizationId: fixture.organizationId,
        locationId: fixture.targetLocationId,
        locationIds: [fixture.targetLocationId],
      },
      metrics: {
        activeAthletes: 1,
        activeGroups: 1,
        attendanceRecords: 1,
        paymentsReceived: {
          state: "unavailable",
          reason: "financial_access_required",
        },
      },
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeManagerSummary);

    const assignedCoach = await seedAttendanceCoach(fixture, true);
    const unassignedCoach = await seedAttendanceCoach(fixture, false);
    const beforeRosterRead = await snapshot(fixture.organizationId);
    await expect(getOwnerSessionAttendance({
      userId: fixture.actor.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      sessionId: fixture.sessionId,
    })).resolves.toEqual([
      {
        enrollmentId: fixture.enrollmentId,
        athleteName: "Enrollment athlete 1 Synthetic",
        attendanceStatus: "present",
      },
    ]);
    expect(await snapshot(fixture.organizationId)).toEqual(beforeRosterRead);

    const beforeCoachRead = await snapshot(fixture.organizationId);
    await expect(getOwnerSessionAttendance({
      userId: assignedCoach.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      sessionId: fixture.sessionId,
    })).resolves.toEqual([
      {
        enrollmentId: fixture.enrollmentId,
        athleteName: "Enrollment athlete 1 Synthetic",
        attendanceStatus: "present",
      },
    ]);
    expect(await snapshot(fixture.organizationId)).toEqual(beforeCoachRead);

    const beforeDeniedCoachRead = await snapshot(fixture.organizationId);
    await expect(getOwnerSessionAttendance({
      userId: unassignedCoach.userId,
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      sessionId: fixture.sessionId,
    })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeDeniedCoachRead);

    const rollbackKey = "ci-attendance-rollback-" + randomUUID();
    await db.execute(sql`
      insert into zaltyko.audit_log (
        organization_id, location_id, actor_user_id, action, target_type, idempotency_key
      )
      values (
        ${fixture.organizationId}::uuid,
        ${fixture.targetLocationId}::uuid,
        ${fixture.actor.userId}::uuid,
        'ci.conflict.seed',
        'attendance',
        ${rollbackKey}
      )
    `);
    const beforeRollback = await snapshot(fixture.organizationId);
    let rollbackError: unknown;
    try {
      await recordAttendance({ ...command, idempotencyKey: rollbackKey });
    } catch (error) {
      rollbackError = error;
    }
    expect(rollbackError).toBeInstanceOf(Error);
    expect((rollbackError as Error & { cause?: unknown }).cause).toMatchObject({
      code: "23505",
      constraint: "audit_log_idempotency_uq",
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeRollback);
  }, 45_000);

  it("associates families atomically, replays once, and rejects a different site without partial rows", async () => {
    assertDisposableTarget();
    const fixture = await seedFamilyAssociationFixture();
    const firstKey = "ci-family-association-" + randomUUID();
    const command = {
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      athleteIds: [fixture.targetAthleteId],
      effectiveFrom: fixture.startsOn,
      payer: {
        givenName: "Synthetic",
        familyName: "Guardian A",
        relationship: "parent" as const,
      },
      idempotencyKey: firstKey,
      actor: fixture.actor,
    };

    const beforeAssociation = await snapshot(fixture.organizationId);
    const concurrentResults = await Promise.all([
      associateOwnerFamily(command),
      associateOwnerFamily(command),
    ]);
    expect(concurrentResults[0]?.family.id).toBe(concurrentResults[1]?.family.id);
    expect(concurrentResults[0]?.familyPayerId).toBe(concurrentResults[1]?.familyPayerId);
    expect(concurrentResults[0]?.guardianId).toBe(concurrentResults[1]?.guardianId);
    expect(concurrentResults.map((result) => result.replayed).sort()).toEqual([false, true]);

    const afterAssociation = await snapshot(fixture.organizationId);
    expect(afterAssociation).not.toEqual(beforeAssociation);
    await expect(associateOwnerFamily(command)).resolves.toMatchObject({
      family: { id: concurrentResults[0]!.family.id },
      familyPayerId: concurrentResults[0]!.familyPayerId,
      guardianId: concurrentResults[0]!.guardianId,
      replayed: true,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(afterAssociation);

    const associationRows = await db.execute(sql`
      select
        (select count(*)::int from zaltyko.families
          where organization_id = ${fixture.organizationId}::uuid) as family_count,
        (select count(*)::int from zaltyko.family_members
          where organization_id = ${fixture.organizationId}::uuid
            and athlete_id = ${fixture.targetAthleteId}::uuid) as member_count,
        (select count(*)::int from zaltyko.family_guardians
          where organization_id = ${fixture.organizationId}::uuid) as family_guardian_count,
        (select count(*)::int from zaltyko.guardians
          where organization_id = ${fixture.organizationId}::uuid) as guardian_count,
        (select count(*)::int from zaltyko.family_payers
          where organization_id = ${fixture.organizationId}::uuid) as payer_count,
        (select count(*)::int from zaltyko.outbox_events
          where organization_id = ${fixture.organizationId}::uuid
            and event_name = 'family.owner_associated'
            and idempotency_key = ${firstKey}) as outbox_count,
        (select count(*)::int from zaltyko.audit_log
          where organization_id = ${fixture.organizationId}::uuid
            and idempotency_key = ${firstKey}) as audit_count
    `);
    expect(associationRows.rows[0]).toEqual({
      family_count: 1,
      member_count: 1,
      family_guardian_count: 1,
      guardian_count: 1,
      payer_count: 1,
      outbox_count: 1,
      audit_count: 1,
    });

    const beforeWrongSite = await snapshot(fixture.organizationId);
    await expect(associateOwnerFamily({
      ...command,
      athleteIds: [fixture.otherSiteOnlyAthleteId],
      idempotencyKey: "ci-family-wrong-site-" + randomUUID(),
    })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeWrongSite);

    const rollbackKey = "ci-family-rollback-" + randomUUID();
    await db.execute(sql`
      insert into zaltyko.audit_log (
        organization_id, location_id, actor_user_id, action, target_type, idempotency_key
      )
      values (
        ${fixture.organizationId}::uuid,
        ${fixture.otherSiteLocationId}::uuid,
        ${fixture.actor.userId}::uuid,
        'ci.conflict.seed',
        'family',
        ${rollbackKey}
      )
    `);
    const beforeRollback = await snapshot(fixture.organizationId);
    let rollbackError: unknown;
    try {
      await associateOwnerFamily({
        ...command,
        locationId: fixture.otherSiteLocationId,
        athleteIds: [fixture.otherSiteOnlyAthleteId],
        payer: {
          givenName: "Synthetic",
          familyName: "Guardian B",
          relationship: "parent",
        },
        idempotencyKey: rollbackKey,
      });
    } catch (error) {
      rollbackError = error;
    }
    expect(rollbackError).toBeInstanceOf(Error);
    expect((rollbackError as Error & { cause?: unknown }).cause).toMatchObject({
      code: "23505",
      constraint: "audit_log_idempotency_uq",
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeRollback);
  }, 45_000);

  it("updates a family payer atomically, replays once, and rejects stale or out-of-site writes", async () => {
    assertDisposableTarget();
    const fixture = await seedFamilyAssociationFixture();
    const association = await associateOwnerFamily({
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      athleteIds: [fixture.targetAthleteId],
      effectiveFrom: fixture.startsOn,
      payer: {
        givenName: "Synthetic",
        familyName: "Guardian",
        relationship: "parent",
      },
      idempotencyKey: "ci-family-payer-seed-" + randomUUID(),
      actor: fixture.actor,
    });
    const familyOptions = await getOwnerFamilyOptions({
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      actor: fixture.actor,
    });
    const payer = familyOptions.families
      .find((family) => family.familyId === association.family.id)
      ?.payers.find((item) => item.familyPayerId === association.familyPayerId);
    expect(payer).toBeDefined();

    const idempotencyKey = "ci-family-payer-update-" + randomUUID();
    const command = {
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      familyPayerId: association.familyPayerId,
      expectedProfileVersion: payer!.profileVersion,
      givenName: "  Updated  ",
      familyName: "  Guardian Name  ",
      idempotencyKey,
      actor: fixture.actor,
    };
    const beforeUpdate = await snapshot(fixture.organizationId);
    const updated = await updateOwnerFamilyPayerProfile(command);
    expect(updated).toMatchObject({
      familyPayerId: association.familyPayerId,
      givenName: "Updated",
      familyName: "Guardian Name",
      replayed: false,
    });
    const afterUpdate = await snapshot(fixture.organizationId);
    expect(afterUpdate).not.toEqual(beforeUpdate);
    const beforeByTable = new Map(
      beforeUpdate.map((row) => [String(row.table_name), row])
    );
    const afterByTable = new Map(
      afterUpdate.map((row) => [String(row.table_name), row])
    );
    for (const table of snapshotTables) {
      const beforeRow = beforeByTable.get(table);
      const afterRow = afterByTable.get(table);
      expect(beforeRow, `${table} before`).toBeDefined();
      expect(afterRow, `${table} after`).toBeDefined();
      const expectedCountDelta =
        table === "audit_log" || table === "outbox_events" ? 1 : 0;
      expect(
        Number(afterRow?.count) - Number(beforeRow?.count),
        `${table} row count`
      ).toBe(expectedCountDelta);
      if (table === "people") {
        expect(afterRow?.content_hash, `${table} content`).not.toBe(
          beforeRow?.content_hash
        );
      } else if (expectedCountDelta === 0) {
        expect(afterRow?.content_hash, `${table} content`).toBe(
          beforeRow?.content_hash
        );
      } else {
        expect(afterRow?.content_hash, `${table} content`).not.toBe(
          beforeRow?.content_hash
        );
      }
    }

    const records = await db.execute(sql`
      select
        (select count(*)::int from zaltyko.outbox_events
          where organization_id = ${fixture.organizationId}::uuid
            and event_name = 'family.payer_profile_updated'
            and idempotency_key = ${idempotencyKey}) as outbox_count,
        (select count(*)::int from zaltyko.audit_log
          where organization_id = ${fixture.organizationId}::uuid
            and action = 'family.payer_profile_updated'
            and idempotency_key = ${idempotencyKey}) as audit_count,
        (select count(*)::int from zaltyko.outbox_events
          where organization_id = ${fixture.organizationId}::uuid
            and event_name = 'family.payer_profile_updated'
            and idempotency_key = ${idempotencyKey}
            and (payload ? 'givenName' or payload ? 'familyName')) as outbox_pii_count,
        (select count(*)::int from zaltyko.audit_log
          where organization_id = ${fixture.organizationId}::uuid
            and action = 'family.payer_profile_updated'
            and idempotency_key = ${idempotencyKey}
            and (coalesce(before::text, '') || coalesce(after::text, ''))
              like '%Updated%Guardian Name%') as audit_pii_count
    `);
    expect(records.rows[0]).toEqual({
      outbox_count: 1,
      audit_count: 1,
      outbox_pii_count: 0,
      audit_pii_count: 0,
    });

    await expect(updateOwnerFamilyPayerProfile(command)).resolves.toMatchObject({
      familyPayerId: association.familyPayerId,
      givenName: "Updated",
      familyName: "Guardian Name",
      replayed: true,
    });
    const afterReplay = await snapshot(fixture.organizationId);
    expect(afterReplay).toEqual(afterUpdate);

    const beforeWrongSite = await snapshot(fixture.organizationId);
    await expect(
      updateOwnerFamilyPayerProfile({
        ...command,
        locationId: fixture.otherSiteLocationId,
        idempotencyKey: "ci-family-payer-site-" + randomUUID(),
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeWrongSite);

    const beforeStaleVersion = await snapshot(fixture.organizationId);
    await expect(
      updateOwnerFamilyPayerProfile({
        ...command,
        givenName: "Stale write",
        expectedProfileVersion: payer!.profileVersion,
        idempotencyKey: "ci-family-payer-stale-" + randomUUID(),
      })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeStaleVersion);

    const overCapacityRows = Array.from({ length: 29 }, () => ({
      personId: randomUUID(),
      athleteId: randomUUID(),
    }));
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values ${sql.join(
        overCapacityRows.map((row) => sql`(
          ${row.personId}::uuid,
          ${fixture.organizationId}::uuid,
          'Synthetic over-capacity',
          'Athlete'
        )`),
        sql`, `
      )}
    `);
    await db.execute(sql`
      insert into zaltyko.athletes (id, organization_id, person_id)
      values ${sql.join(
        overCapacityRows.map((row) => sql`(
          ${row.athleteId}::uuid,
          ${fixture.organizationId}::uuid,
          ${row.personId}::uuid
        )`),
        sql`, `
      )}
    `);
    assertFreeUsage(await usage(fixture.organizationId), [31, 2, 2], true);
    const beforeReadOnlyWrite = await snapshot(fixture.organizationId);
    await expect(
      updateOwnerFamilyPayerProfile({
        ...command,
        givenName: "Blocked edit",
        expectedProfileVersion: updated.profileVersion,
        idempotencyKey: "ci-family-payer-readonly-" + randomUUID(),
      })
    ).rejects.toMatchObject({ code: "PLAN_OVER_CAPACITY", status: 409 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeReadOnlyWrite);
  }, 45_000);

  it("archives and restores a family without deleting linked operational or billing history", async () => {
    assertDisposableTarget();
    const fixture = await seedFamilyAssociationFixture();
    const association = await associateOwnerFamily({
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      athleteIds: [fixture.targetAthleteId],
      effectiveFrom: fixture.startsOn,
      payer: {
        givenName: "Synthetic",
        familyName: "Archive guardian",
        relationship: "parent",
      },
      idempotencyKey: "ci-family-archive-seed-" + randomUUID(),
      actor: fixture.actor,
    });
    const versionResult = await db.execute(sql`
      select to_char(
        updated_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) as family_version
      from zaltyko.families
      where organization_id = ${fixture.organizationId}::uuid
        and id = ${association.family.id}::uuid
    `);
    const activeVersion = String(versionResult.rows[0]?.family_version);
    const beforeArchive = await snapshot(fixture.organizationId);
    const archiveKey = "ci-family-archive-" + randomUUID();
    const archiveCommand = {
      userId: fixture.actor.userId,
      organizationId: fixture.organizationId,
      familyId: association.family.id,
      action: "archive" as const,
      expectedFamilyVersion: activeVersion,
      idempotencyKey: archiveKey,
    };

    const archived = await updateOwnerFamilyLifecycle(archiveCommand);
    expect(archived).toMatchObject({
      familyId: association.family.id,
      isActive: false,
      replayed: false,
    });
    const afterArchive = await snapshot(fixture.organizationId);
    const beforeArchiveByTable = new Map(
      beforeArchive.map((row) => [String(row.table_name), row])
    );
    const afterArchiveByTable = new Map(
      afterArchive.map((row) => [String(row.table_name), row])
    );
    for (const table of snapshotTables) {
      const beforeRow = beforeArchiveByTable.get(table);
      const afterRow = afterArchiveByTable.get(table);
      expect(beforeRow, `${table} before archive`).toBeDefined();
      expect(afterRow, `${table} after archive`).toBeDefined();
      const expectedCountDelta =
        table === "audit_log" || table === "outbox_events" ? 1 : 0;
      expect(
        Number(afterRow?.count) - Number(beforeRow?.count),
        `${table} row count`
      ).toBe(expectedCountDelta);
      if (table === "families") {
        expect(afterRow?.content_hash).not.toBe(beforeRow?.content_hash);
      } else if (expectedCountDelta === 0) {
        expect(afterRow?.content_hash, `${table} retained data`).toBe(
          beforeRow?.content_hash
        );
      }
    }

    const archivedFamily = await db.execute(sql`
      select is_active from zaltyko.families
      where organization_id = ${fixture.organizationId}::uuid
        and id = ${association.family.id}::uuid
    `);
    expect(archivedFamily.rows).toEqual([{ is_active: false }]);
    const hiddenFromOperationalOptions = await getOwnerFamilyOptions({
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      actor: fixture.actor,
    });
    expect(
      hiddenFromOperationalOptions.families.some(
        (family) => family.familyId === association.family.id
      )
    ).toBe(false);
    const archivedHistory = await getOwnerFamilyOptions({
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      actor: fixture.actor,
      includeArchived: true,
    });
    expect(archivedHistory.families).toContainEqual(
      expect.objectContaining({
        familyId: association.family.id,
        isActive: false,
      })
    );
    await expect(updateOwnerFamilyLifecycle(archiveCommand)).resolves.toMatchObject({
      ...archived,
      replayed: true,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(afterArchive);

    const collisionKey = "ci-family-archive-collision-" + randomUUID();
    await db.execute(sql`
      insert into zaltyko.audit_log (
        organization_id, location_id, actor_user_id, action, target_type,
        idempotency_key
      )
      values (
        ${fixture.organizationId}::uuid,
        ${fixture.targetLocationId}::uuid,
        ${fixture.actor.userId}::uuid,
        'ci.family.archive.collision',
        'family',
        ${collisionKey}
      )
    `);
    const beforeCollision = await snapshot(fixture.organizationId);
    await expect(
      updateOwnerFamilyLifecycle({
        ...archiveCommand,
        action: "restore",
        expectedFamilyVersion: archived.familyVersion,
        idempotencyKey: collisionKey,
      })
    ).rejects.toBeDefined();
    expect(await snapshot(fixture.organizationId)).toEqual(beforeCollision);

    const restoreKey = "ci-family-restore-" + randomUUID();
    const restored = await updateOwnerFamilyLifecycle({
      ...archiveCommand,
      action: "restore",
      expectedFamilyVersion: archived.familyVersion,
      idempotencyKey: restoreKey,
    });
    expect(restored).toMatchObject({
      familyId: association.family.id,
      isActive: true,
      replayed: false,
    });
    const activeAgain = await getOwnerFamilyOptions({
      organizationId: fixture.organizationId,
      locationId: fixture.targetLocationId,
      actor: fixture.actor,
    });
    expect(activeAgain.families).toContainEqual(
      expect.objectContaining({
        familyId: association.family.id,
        isActive: true,
      })
    );

    await expect(
      updateOwnerFamilyLifecycle({
        ...archiveCommand,
        expectedFamilyVersion: activeVersion,
        idempotencyKey: "ci-family-archive-stale-" + randomUUID(),
      })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    await expect(
      updateOwnerFamilyLifecycle({
        ...archiveCommand,
        organizationId: randomUUID(),
        idempotencyKey: "ci-family-archive-cross-org-" + randomUUID(),
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  }, 45_000);

  it("bootstraps an Owner academy once from the seeded identity catalog", async () => {
    assertDisposableTarget();
    const userId = randomUUID();
    await db.execute(sql`
      insert into auth.users (id, email)
      values (${userId}::uuid, ${"ci-bootstrap-" + userId + "@example.invalid"})
    `);

    const command = {
      userId,
      organizationName: "CI Owner bootstrap " + userId,
      legalName: "CI Owner Academy",
      countryCode: "ES",
      locationName: "Sede principal",
      idempotencyKey: "ci-owner-bootstrap-" + randomUUID(),
      primaryDiscipline: "artistic",
      additionalDisciplines: ["rhythmic"],
      complementaryActivities: ["dance"],
    } satisfies BootstrapOrganizationCommand;

    const [created, concurrentReplay] = await Promise.all([
      bootstrapOrganization(command),
      bootstrapOrganization(command),
    ]);
    expect(concurrentReplay).toEqual(created);

    const academy = await db.execute(sql`
      select name, legal_name, country_code, default_currency, default_timezone, status
      from zaltyko.organizations
      where id = ${created.organizationId}::uuid
    `);
    expect(academy.rows).toEqual([{
      name: command.organizationName,
      legal_name: command.legalName,
      country_code: "ES",
      default_currency: "EUR",
      default_timezone: "Europe/Madrid",
      status: "trial",
    }]);

    const profileRows = await db.execute(sql`
      select profile.discipline_key, sport.role, profile.status,
        profile.configuration::text as configuration
      from zaltyko.organization_sports sport
      join zaltyko.sport_profiles profile
        on profile.country_code = sport.country_code
       and profile.id = sport.sport_profile_id
      where sport.organization_id = ${created.organizationId}::uuid
      order by profile.discipline_key
    `);
    expect(profileRows.rows).toEqual([
      {
        discipline_key: "artistic",
        role: "primary",
        status: "identity_only",
        configuration: "{}",
      },
      {
        discipline_key: "rhythmic",
        role: "additional",
        status: "identity_only",
        configuration: "{}",
      },
    ]);

    const createdSnapshot = await snapshotBootstrap(created.organizationId, userId);
    expect(createdSnapshot.map((row) => [row.table_name, row.row_count])).toEqual([
      ["audit_log", 1],
      ["locations", 1],
      ["organization_bootstrap_commands", 1],
      ["organization_members", 1],
      ["organization_sports", 2],
      ["organizations", 1],
      ["outbox_events", 1],
      ["programs", 3],
    ]);

    await expect(bootstrapOrganization({
      ...command,
      organizationName: command.organizationName + " changed",
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(await snapshotBootstrap(created.organizationId, userId)).toEqual(createdSnapshot);

    await expect(bootstrapOrganization({
      ...command,
      idempotencyKey: "ci-owner-bootstrap-second-" + randomUUID(),
    })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION", status: 409 });
    expect(await snapshotBootstrap(created.organizationId, userId)).toEqual(createdSnapshot);
  }, 45_000);

  it("persists Owner signup consent once and fails closed for an existing identity", async () => {
    assertDisposableTarget();
    const policyVersion = "v7-2026-10-24";
    await db.execute(sql`
      insert into zaltyko.owner_signup_consent_policy (singleton, policy_version, rollout_at)
      values (true, ${policyVersion}, now() - interval '1 day')
    `);

    const freshUserId = randomUUID();
    await db.execute(sql`
      insert into auth.users (id, email)
      values (${freshUserId}::uuid, ${"ci-consent-" + freshUserId + "@example.invalid"})
    `);
    const freshUser = {
      id: freshUserId,
      created_at: new Date().toISOString(),
      user_metadata: {
        legal_consent_version: policyVersion,
        legal_consent_proof: "signup:register-form-v1",
      },
    } as User;

    const beforeGrant = await snapshotOwnerConsent(freshUserId);
    const concurrentResults = await Promise.all([
      recordOwnerSignupConsent(freshUser, { requestKey: "ci-owner-consent-request" }),
      recordOwnerSignupConsent(freshUser, { requestKey: "ci-owner-consent-request" }),
    ]);
    expect(concurrentResults.sort()).toEqual(["already_active", "recorded"]);
    const afterGrant = await snapshotOwnerConsent(freshUserId);
    expect(afterGrant).toEqual({ consent_count: 1, audit_count: 1 });
    expect(afterGrant).not.toEqual(beforeGrant);
    await expect(
      getOwnerContractualConsentRequirement(freshUser)
    ).resolves.toEqual({
      policyVersion,
      requiresAcceptance: false,
      reason: "already_current",
    });
    expect(await snapshotOwnerConsent(freshUserId)).toEqual(afterGrant);

    const existingUserId = randomUUID();
    await db.execute(sql`
      insert into auth.users (id, email)
      values (${existingUserId}::uuid, ${"ci-consent-existing-" + existingUserId + "@example.invalid"})
    `);
    const existingUser = {
      id: existingUserId,
      created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      user_metadata: {},
    } as User;
    const beforeRejectedGrant = await snapshotOwnerConsent(existingUserId);
    await expect(recordOwnerSignupConsent(existingUser, {
      requestKey: "ci-owner-consent-existing",
    })).rejects.toMatchObject({ code: "CONSENT_REQUIRED" });
    expect(await snapshotOwnerConsent(existingUserId)).toEqual(beforeRejectedGrant);

    await expect(recordOwnerSignupConsent(existingUser, {
      requestKey: "ci-owner-consent-explicit",
      contractualAcceptance: { accepted: true, policyVersion },
    })).resolves.toBe("recorded");
    expect(await snapshotOwnerConsent(existingUserId)).toEqual({
      consent_count: 1,
      audit_count: 1,
    });
  }, 45_000);
});
