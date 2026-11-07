import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
  assignOwnerAthleteToFirstGroup,
  createOwnerAthleteIntake,
  getOwnerAthleteIntake,
} from "@/modules/athletes/application/owner-athlete-intake";

const disposablePgEnabled =
  process.env.ZALTYKO_PG_INTEGRATION === "1" &&
  process.env.GITHUB_ACTIONS === "true" &&
  process.env.RUNNER_OS === "Linux" &&
  process.env.NODE_ENV === "test";
const describeDisposablePg = describe.skipIf(!disposablePgEnabled);

const snapshotTables = [
  "athletes",
  "attendance_records",
  "audit_log",
  "enrollments",
  "families",
  "family_guardians",
  "family_members",
  "family_payers",
  "group_membership_history",
  "group_memberships",
  "groups",
  "guardians",
  "locations",
  "member_location_scopes",
  "organization_entitlement_changes",
  "organization_entitlements",
  "organization_members",
  "organization_saas_subscriptions",
  "organization_saas_trials",
  "outbox_events",
  "people",
  "trials",
  "waitlist_entries",
] as const;

type Fixture = {
  organizationId: string;
  userId: string;
  memberId: string;
  locationId: string;
  groupId: string;
  actor: { userId: string; memberId: string };
  localDate: string;
};

function assertDisposableTarget() {
  if (!disposablePgEnabled) {
    throw new Error("This suite is restricted to opt-in disposable GitHub Linux PostgreSQL");
  }
  const connectionString = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  let parsed: URL;
  try {
    parsed = new URL(connectionString ?? "");
  } catch {
    throw new Error("The disposable PostgreSQL target is invalid");
  }
  const configuredUrls = [
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_POOL,
    process.env.DATABASE_URL_DIRECT,
  ];
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
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

async function snapshot(organizationId: string) {
  const rows = sql.join(
    snapshotTables.map(
      (table) => sql`
        select ${table}::text as table_name,
               count(*)::int as count,
               md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) as content_hash
        from ${sql.identifier("zaltyko")}.${sql.identifier(table)} as row_data
        where row_data.organization_id = ${organizationId}::uuid
      `
    ),
    sql` union all `
  );
  const result = await db.execute(
    sql`select * from (${rows}) as snapshots order by table_name`
  );
  return result.rows.map((row) => ({
    table: String(row.table_name),
    count: Number(row.count),
    contentHash: String(row.content_hash),
  }));
}

async function seedFixture(options: {
  athleteCount?: number;
  groupCapacity?: number | null;
  occupiedGroup?: boolean;
  role?: "owner" | "admin" | "manager";
  locationScopeMode?: "all" | "selected";
} = {}): Promise<Fixture> {
  assertDisposableTarget();
  const organizationId = randomUUID();
  const userId = randomUUID();
  const memberId = randomUUID();
  const locationId = randomUUID();
  const groupId = randomUUID();
  const athleteCount = options.athleteCount ?? 0;
  const seededAthletes = Array.from({ length: athleteCount }, () => ({
    personId: randomUUID(),
    athleteId: randomUUID(),
  }));

  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${`ci-athlete-intake-${userId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name, status)
    values (${organizationId}::uuid, ${`CI athlete intake ${organizationId}`}, 'active')
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name, timezone, is_active)
    values (${locationId}::uuid, ${organizationId}::uuid,
      ${`ci-intake-${organizationId.slice(0, 8)}`}, 'CI intake site', 'Europe/Madrid', true)
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values (
      ${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid,
      ${options.role ?? "owner"}, 'active', ${options.locationScopeMode ?? "all"}
    )
  `);
  await db.execute(sql`
    insert into zaltyko.groups (id, organization_id, location_id, name, capacity, status)
    values (
      ${groupId}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
      'CI intake group', ${options.groupCapacity ?? 10}, 'active'
    )
  `);

  if (seededAthletes.length > 0) {
    const people = sql.join(
      seededAthletes.map(
        (_athlete, index) => sql`(
          ${seededAthletes[index]!.personId}::uuid,
          ${organizationId}::uuid,
          ${`Synthetic ${index + 1}`},
          'Intake fixture'
        )`
      ),
      sql`, `
    );
    await db.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values ${people}
    `);
    const athletes = sql.join(
      seededAthletes.map(
        (athlete) => sql`(
          ${athlete.athleteId}::uuid,
          ${organizationId}::uuid,
          ${athlete.personId}::uuid
        )`
      ),
      sql`, `
    );
    await db.execute(sql`
      insert into zaltyko.athletes (id, organization_id, person_id)
      values ${athletes}
    `);
  }

  if (options.occupiedGroup) {
    const athlete = seededAthletes[0];
    if (!athlete) throw new Error("Occupied group fixture needs one athlete");
    const membershipId = randomUUID();
    const [date] = (await db.execute(sql`
      select (current_timestamp at time zone 'Europe/Madrid')::date::text as local_date
    `)).rows as Array<{ local_date: string }>;
    await db.execute(sql`
      insert into zaltyko.group_memberships (
        id, organization_id, group_id, athlete_id, status, starts_on
      ) values (
        ${membershipId}::uuid, ${organizationId}::uuid, ${groupId}::uuid,
        ${athlete.athleteId}::uuid, 'active', ${date!.local_date}::date
      )
    `);
    await db.execute(sql`
      insert into zaltyko.group_membership_history (
        organization_id, membership_id, from_status, to_status,
        changed_by_member_id, idempotency_key, effective_on
      ) values (
        ${organizationId}::uuid, ${membershipId}::uuid, null, 'active',
        ${memberId}::uuid, ${`seed-${membershipId}`}, ${date!.local_date}::date
      )
    `);
  }

  const [localDate] = (await db.execute(sql`
    select (current_timestamp at time zone 'Europe/Madrid')::date::text as local_date
  `)).rows as Array<{ local_date: string }>;
  return {
    organizationId,
    userId,
    memberId,
    locationId,
    groupId,
    actor: { userId, memberId },
    localDate: localDate!.local_date,
  };
}

function intakeCommand(fixture: Fixture, overrides: Record<string, unknown> = {}) {
  return {
    organizationId: fixture.organizationId,
    userId: fixture.userId,
    actor: fixture.actor,
    givenName: "QA Gimnasta",
    familyName: "Sintética",
    family: {
      kind: "new",
      relationship: "parent",
      startsOn: fixture.localDate,
    },
    idempotencyKey: `ci-intake-create-${randomUUID()}`,
    ...overrides,
  };
}

function shiftCivilDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return shifted.toISOString().slice(0, 10);
}

describeDisposablePg("intake organizativo en PostgreSQL desechable", () => {
  it("crea sin sede, aparece en la bandeja, se asigna una vez y permite replay tras asignación", async () => {
    const fixture = await seedFixture();
    const command = intakeCommand(fixture);

    const created = await createOwnerAthleteIntake(command);
    expect(created).toMatchObject({ incompleteFamily: true, replayed: false });
    const initialList = await getOwnerAthleteIntake({
      organizationId: fixture.organizationId,
      userId: fixture.userId,
      actor: fixture.actor,
    });
    expect(initialList.items).toHaveLength(1);
    expect(initialList.items[0]).toMatchObject({
      athleteId: created.athleteId,
      givenName: "QA Gimnasta",
      incompleteFamily: true,
      familySummaries: [
        expect.objectContaining({
          relationship: "parent",
          startsOn: fixture.localDate,
          incompleteFamily: true,
        }),
      ],
    });
    expect(initialList.eligibleGroups).toEqual([
      expect.objectContaining({ groupId: fixture.groupId, locationId: fixture.locationId }),
    ]);

    const assignmentCommand = {
      organizationId: fixture.organizationId,
      userId: fixture.userId,
      actor: fixture.actor,
      athleteId: created.athleteId,
      groupId: fixture.groupId,
      startsOn: fixture.localDate,
      idempotencyKey: `ci-intake-assign-${randomUUID()}`,
    };
    const assigned = await assignOwnerAthleteToFirstGroup(assignmentCommand);
    expect(assigned.replayed).toBe(false);
    await expect(assignOwnerAthleteToFirstGroup(assignmentCommand)).resolves.toMatchObject({
      membershipId: assigned.membershipId,
      replayed: true,
    });
    await expect(createOwnerAthleteIntake(command)).resolves.toMatchObject({
      athleteId: created.athleteId,
      familyId: created.familyId,
      replayed: true,
    });

    const finalList = await getOwnerAthleteIntake({
      organizationId: fixture.organizationId,
      userId: fixture.userId,
      actor: fixture.actor,
    });
    expect(finalList.items).toEqual([]);
    const counts = (await db.execute(sql`
      select
        (select count(*)::int from zaltyko.people where organization_id = ${fixture.organizationId}::uuid) as people,
        (select count(*)::int from zaltyko.athletes where organization_id = ${fixture.organizationId}::uuid) as athletes,
        (select count(*)::int from zaltyko.families where organization_id = ${fixture.organizationId}::uuid) as families,
        (select count(*)::int from zaltyko.family_members where organization_id = ${fixture.organizationId}::uuid) as family_members,
        (select count(*)::int from zaltyko.group_memberships where organization_id = ${fixture.organizationId}::uuid) as memberships,
        (select count(*)::int from zaltyko.group_membership_history where organization_id = ${fixture.organizationId}::uuid) as history,
        (select count(*)::int from zaltyko.outbox_events where organization_id = ${fixture.organizationId}::uuid) as outbox,
        (select count(*)::int from zaltyko.audit_log where organization_id = ${fixture.organizationId}::uuid) as audits
    `)).rows[0];
    expect(counts).toMatchObject({
      people: 1,
      athletes: 1,
      families: 1,
      family_members: 1,
      memberships: 1,
      history: 1,
      outbox: 2,
      audits: 2,
    });
    const familyConfigured = (await db.execute(sql`
      select count(*)::int as count
      from zaltyko.family_guardians as family_guardian
      where family_guardian.organization_id = ${fixture.organizationId}::uuid
    `)).rows[0];
    expect(familyConfigured.count).toBe(0);
  });

  it("reutiliza solo una familia activa de la misma academia y no duplica familias", async () => {
    const fixture = await seedFixture();
    const other = await seedFixture();
    const [foreignFamily] = (await db.execute(sql`
      insert into zaltyko.families (organization_id)
      values (${other.organizationId}::uuid)
      returning id::text as id
    `)).rows as Array<{ id: string }>;
    const targetBeforeForeignAttempt = await snapshot(fixture.organizationId);
    const otherBeforeForeignAttempt = await snapshot(other.organizationId);
    await expect(
      createOwnerAthleteIntake(
        intakeCommand(fixture, {
          family: {
            kind: "existing",
            familyId: foreignFamily!.id,
            relationship: "other",
            startsOn: fixture.localDate,
          },
        })
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await snapshot(fixture.organizationId)).toEqual(targetBeforeForeignAttempt);
    expect(await snapshot(other.organizationId)).toEqual(otherBeforeForeignAttempt);

    const [localFamily] = (await db.execute(sql`
      insert into zaltyko.families (organization_id)
      values (${fixture.organizationId}::uuid)
      returning id::text as id
    `)).rows as Array<{ id: string }>;
    const created = await createOwnerAthleteIntake(
      intakeCommand(fixture, {
        family: {
          kind: "existing",
          familyId: localFamily!.id,
          relationship: "other",
          startsOn: fixture.localDate,
        },
      })
    );
    expect(created).toMatchObject({ familyId: localFamily!.id, incompleteFamily: true });
    const counts = (await db.execute(sql`
      select
        (select count(*)::int from zaltyko.families where organization_id = ${fixture.organizationId}::uuid) as families,
        (select count(*)::int from zaltyko.family_members where organization_id = ${fixture.organizationId}::uuid) as family_members,
        (select count(*)::int from zaltyko.people where organization_id = ${fixture.organizationId}::uuid) as people,
        (select count(*)::int from zaltyko.athletes where organization_id = ${fixture.organizationId}::uuid) as athletes
    `)).rows[0];
    expect(counts).toMatchObject({ families: 1, family_members: 1, people: 1, athletes: 1 });
  });

  it("serializa alta concurrente con la misma clave y asignación concurrente con claves distintas", async () => {
    const fixture = await seedFixture();
    const command = intakeCommand(fixture);
    const [first, second] = await Promise.all([
      createOwnerAthleteIntake(command),
      createOwnerAthleteIntake(command),
    ]);
    expect(first.athleteId).toBe(second.athleteId);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    const createCounts = (await db.execute(sql`
      select
        (select count(*)::int from zaltyko.people where organization_id = ${fixture.organizationId}::uuid) as people,
        (select count(*)::int from zaltyko.athletes where organization_id = ${fixture.organizationId}::uuid) as athletes,
        (select count(*)::int from zaltyko.families where organization_id = ${fixture.organizationId}::uuid) as families,
        (select count(*)::int from zaltyko.family_members where organization_id = ${fixture.organizationId}::uuid) as family_members
    `)).rows[0];
    expect(createCounts).toMatchObject({ people: 1, athletes: 1, families: 1, family_members: 1 });

    const assign = (idempotencyKey: string) =>
      assignOwnerAthleteToFirstGroup({
        organizationId: fixture.organizationId,
        userId: fixture.userId,
        actor: fixture.actor,
        athleteId: first.athleteId,
        groupId: fixture.groupId,
        startsOn: fixture.localDate,
        idempotencyKey,
      });
    const outcomes = await Promise.allSettled([
      assign(`ci-intake-assign-${randomUUID()}`),
      assign(`ci-intake-assign-${randomUUID()}`),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const assignmentCounts = (await db.execute(sql`
      select
        (select count(*)::int from zaltyko.group_memberships where organization_id = ${fixture.organizationId}::uuid and athlete_id = ${first.athleteId}::uuid) as memberships,
        (select count(*)::int from zaltyko.group_membership_history where organization_id = ${fixture.organizationId}::uuid) as history,
        (select count(*)::int from zaltyko.outbox_events where organization_id = ${fixture.organizationId}::uuid and event_name = 'group.membership_added') as assignment_events,
        (select count(*)::int from zaltyko.audit_log where organization_id = ${fixture.organizationId}::uuid and action = 'group.membership_added') as assignment_audits
    `)).rows[0];
    expect(assignmentCounts).toMatchObject({ memberships: 1, history: 1, assignment_events: 1, assignment_audits: 1 });
  });

  it("rechaza el atleta 31 de Free sin registros parciales", async () => {
    const fixture = await seedFixture({ athleteCount: 30 });
    const before = await snapshot(fixture.organizationId);
    await expect(createOwnerAthleteIntake(intakeCommand(fixture))).rejects.toMatchObject({
      code: "CAPACITY_FULL",
      status: 409,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(before);
  });

  it("rechaza una primera asignación sin plaza libre y revierte cualquier escritura", async () => {
    const fixture = await seedFixture({ athleteCount: 1, groupCapacity: 1, occupiedGroup: true });
    const athlete = await createOwnerAthleteIntake(intakeCommand(fixture));
    const before = await snapshot(fixture.organizationId);
    await expect(
      assignOwnerAthleteToFirstGroup({
        organizationId: fixture.organizationId,
        userId: fixture.userId,
        actor: fixture.actor,
        athleteId: athlete.athleteId,
        groupId: fixture.groupId,
        startsOn: fixture.localDate,
        idempotencyKey: `ci-intake-full-group-${randomUUID()}`,
      })
    ).rejects.toMatchObject({ code: "GROUP_CAPACITY_FULL", status: 409 });
    expect(await snapshot(fixture.organizationId)).toEqual(before);
  });

  it("rechaza inicio pasado o futuro sin insertar pertenencias ni historial", async () => {
    const fixture = await seedFixture();
    const athlete = await createOwnerAthleteIntake(intakeCommand(fixture));
    for (const startsOn of [
      shiftCivilDate(fixture.localDate, -1),
      shiftCivilDate(fixture.localDate, 1),
    ]) {
      const before = await snapshot(fixture.organizationId);
      await expect(
        assignOwnerAthleteToFirstGroup({
          organizationId: fixture.organizationId,
          userId: fixture.userId,
          actor: fixture.actor,
          athleteId: athlete.athleteId,
          groupId: fixture.groupId,
          startsOn,
          idempotencyKey: `ci-intake-invalid-date-${randomUUID()}`,
        })
      ).rejects.toMatchObject({ code: "INVALID_DATE_RANGE", status: 409 });
      expect(await snapshot(fixture.organizationId)).toEqual(before);
    }
  });

  it("rechaza manager y scope parcial antes de leer o escribir fichas", async () => {
    const manager = await seedFixture({ role: "manager", locationScopeMode: "all" });
    const managerBefore = await snapshot(manager.organizationId);
    await expect(
      getOwnerAthleteIntake({
        organizationId: manager.organizationId,
        userId: manager.userId,
        actor: manager.actor,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(createOwnerAthleteIntake(intakeCommand(manager))).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(await snapshot(manager.organizationId)).toEqual(managerBefore);

    const partial = await seedFixture({ role: "owner", locationScopeMode: "selected" });
    const partialBefore = await snapshot(partial.organizationId);
    await expect(
      getOwnerAthleteIntake({
        organizationId: partial.organizationId,
        userId: partial.userId,
        actor: partial.actor,
      })
    ).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    expect(await snapshot(partial.organizationId)).toEqual(partialBefore);
  });
});
