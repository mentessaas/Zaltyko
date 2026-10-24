import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getOrganizationUsage } from "@/modules/saas-billing/application/organization-usage";
import { createOperationalGroup } from "@/modules/groups/application/group-management-service";
import { createAthleteForGroup } from "@/modules/groups/application/group-membership-service";
import { createScheduledClass } from "@/modules/scheduling/application/class-management-service";

const snapshotTables = [
  "athletes",
  "audit_log",
  "class_template_groups",
  "class_template_weekdays",
  "class_templates",
  "enrollments",
  "group_membership_history",
  "group_memberships",
  "groups",
  "outbox_events",
  "people",
  "session_staff",
  "sessions",
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
    "STRIPE_SECRET_KEY",
    "STRIPE_SAAS_TEST_SECRET_KEY",
    "STRIPE_SAAS_LIVE_SECRET_KEY",
    "VERCEL_TOKEN",
  ];
  const activeForbidden = forbidden.filter((name) => Boolean(process.env[name]));
  // tests/setup.ts always installs this exact non-secret placeholder so the
  // rest of the unit-test environment cannot accidentally reach Stripe.
  const externalStripeSecret = Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_SECRET_KEY !== "sk_test_mock"
  );
  if (externalStripeSecret) activeForbidden.push("STRIPE_SECRET_KEY");
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

async function usage(organizationId: string) {
  return db.transaction((tx) => getOrganizationUsage(tx, organizationId));
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
});
