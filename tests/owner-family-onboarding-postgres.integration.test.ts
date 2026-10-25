import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
  associateOwnerFamily,
  getOwnerFamilyOptions,
} from "@/modules/families/application/owner-family-association";

const snapshotTables = [
  "audit_log",
  "athletes",
  "enrollments",
  "families",
  "family_guardians",
  "family_members",
  "family_payers",
  "group_memberships",
  "group_membership_history",
  "groups",
  "guardians",
  "member_location_scopes",
  "organization_members",
  "outbox_events",
  "people",
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
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    parsed.username !== "supabase_admin" ||
    parsed.port === "" ||
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
    throw new Error(
      `The integration runner contains forbidden external credential variables: ${activeForbidden.join(", ")}`
    );
  }
}

async function snapshot(organizationId: string) {
  const queries = sql.join(
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
    sql`select * from (${queries}) rows order by table_name`
  );
  return Object.fromEntries(
    result.rows.map((row) => [
      String(row.table_name),
      {
        count: Number(row.count),
        contentHash: String(row.content_hash),
      },
    ])
  ) as Record<
    (typeof snapshotTables)[number],
    { count: number; contentHash: string }
  >;
}

async function seedGroupOnlyFixture() {
  const organizationId = randomUUID();
  const ownerUserId = randomUUID();
  const ownerMemberId = randomUUID();
  const locationIds = [randomUUID(), randomUUID()];
  const athleteRows = [0, 1, 2].map(() => ({
    personId: randomUUID(),
    athleteId: randomUUID(),
  }));
  const groupIds = Array.from({ length: 4 }, () => randomUUID());

  await db.execute(sql`
    insert into auth.users (id, email)
    values (
      ${ownerUserId}::uuid,
      ${`ci-family-owner-${ownerUserId}@example.invalid`}
    )
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name)
    values (${organizationId}::uuid, ${`CI family onboarding ${organizationId}`})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name, timezone)
    values
      (${locationIds[0]}::uuid, ${organizationId}::uuid, ${`ci-a-${organizationId.slice(0, 8)}`}, 'CI family site A', 'Europe/Madrid'),
      (${locationIds[1]}::uuid, ${organizationId}::uuid, ${`ci-b-${organizationId.slice(0, 8)}`}, 'CI family site B', 'Europe/Madrid')
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values (
      ${ownerMemberId}::uuid, ${organizationId}::uuid, ${ownerUserId}::uuid,
      'owner', 'active', 'all'
    )
  `);

  const peopleValues = sql.join(
    athleteRows.map((athlete, index) => sql`(
      ${athlete.personId}::uuid,
      ${organizationId}::uuid,
      ${`CI Family Athlete ${index + 1}`},
      'Synthetic'
    )`),
    sql`, `
  );
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values ${peopleValues}
  `);
  const athleteValues = sql.join(
    athleteRows.map((athlete) => sql`(
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
    ) values
      (${groupIds[0]}::uuid, ${organizationId}::uuid, ${locationIds[0]}::uuid, 'CI family group A1', 20, 'active'),
      (${groupIds[1]}::uuid, ${organizationId}::uuid, ${locationIds[0]}::uuid, 'CI family group A2', 20, 'active'),
      (${groupIds[2]}::uuid, ${organizationId}::uuid, ${locationIds[1]}::uuid, 'CI family group B1', 20, 'active'),
      (${groupIds[3]}::uuid, ${organizationId}::uuid, ${locationIds[1]}::uuid, 'CI family group B2', 20, 'active')
  `);
  await db.execute(sql`
    insert into zaltyko.group_memberships (
      organization_id, group_id, athlete_id, status, starts_on
    ) values
      (${organizationId}::uuid, ${groupIds[0]}::uuid, ${athleteRows[0]!.athleteId}::uuid, 'active', current_date),
      (${organizationId}::uuid, ${groupIds[1]}::uuid, ${athleteRows[0]!.athleteId}::uuid, 'active', current_date),
      (${organizationId}::uuid, ${groupIds[2]}::uuid, ${athleteRows[1]!.athleteId}::uuid, 'active', current_date),
      (${organizationId}::uuid, ${groupIds[3]}::uuid, ${athleteRows[2]!.athleteId}::uuid, 'active', current_date)
  `);
  const [dateRow] = (await db.execute(sql`
    select current_date::text as date
  `)).rows as Array<{ date: string }>;

  return {
    organizationId,
    ownerUserId,
    ownerMemberId,
    locationA: locationIds[0]!,
    locationB: locationIds[1]!,
    athleteA: athleteRows[0]!.athleteId,
    athleteB: athleteRows[1]!.athleteId,
    athleteC: athleteRows[2]!.athleteId,
    effectiveFrom: dateRow!.date,
    ownerActor: { userId: ownerUserId, memberId: ownerMemberId },
  };
}

async function seedPartialLocationManager(
  organizationId: string,
  locationId: string
) {
  const userId = randomUUID();
  const memberId = randomUUID();
  await db.execute(sql`
    insert into auth.users (id, email)
    values (
      ${userId}::uuid,
      ${`ci-family-manager-${userId}@example.invalid`}
    )
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values (
      ${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid,
      'manager', 'active', 'selected'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.member_location_scopes (
      organization_id, member_id, location_id
    ) values (
      ${organizationId}::uuid, ${memberId}::uuid, ${locationId}::uuid
    )
  `);
  return { userId, memberId };
}

async function seedSecondaryFamilyPayer(
  organizationId: string,
  familyId: string
) {
  const personId = randomUUID();
  const guardianId = randomUUID();
  const familyPayerId = randomUUID();
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values (
      ${personId}::uuid, ${organizationId}::uuid, 'Synthetic Secondary', 'Guardian'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.guardians (id, organization_id, person_id)
    values (${guardianId}::uuid, ${organizationId}::uuid, ${personId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.family_guardians (
      organization_id, family_id, guardian_id, relationship,
      can_view_athletes, can_manage_enrollments
    ) values (
      ${organizationId}::uuid, ${familyId}::uuid, ${guardianId}::uuid,
      'parent', true, false
    )
  `);
  await db.execute(sql`
    insert into zaltyko.family_payers (
      id, organization_id, family_id, guardian_id, is_primary, starts_on
    ) values (
      ${familyPayerId}::uuid, ${organizationId}::uuid,
      ${familyId}::uuid, ${guardianId}::uuid, false, current_date
    )
  `);
  return { familyPayerId, guardianId };
}

function createFamilyCommand(
  fixture: Awaited<ReturnType<typeof seedGroupOnlyFixture>>,
  idempotencyKey: string
) {
  return {
    organizationId: fixture.organizationId,
    locationId: fixture.locationA,
    athleteIds: [fixture.athleteA],
    effectiveFrom: fixture.effectiveFrom,
    payer: {
      givenName: "Synthetic",
      familyName: "Guardian",
      relationship: "parent" as const,
    },
    idempotencyKey,
    actor: fixture.ownerActor,
  };
}

function addExistingFamilyMemberCommand(
  fixture: Awaited<ReturnType<typeof seedGroupOnlyFixture>>,
  input: {
    familyId: string;
    familyPayerId: string;
    athleteId: string;
    locationId: string;
    idempotencyKey: string;
    actor: { userId: string; memberId: string };
  }
) {
  return {
    organizationId: fixture.organizationId,
    locationId: input.locationId,
    familyId: input.familyId,
    athleteIds: [input.athleteId],
    effectiveFrom: fixture.effectiveFrom,
    payer: { familyPayerId: input.familyPayerId },
    idempotencyKey: input.idempotencyKey,
    actor: input.actor,
  };
}

describe("family onboarding against disposable PostgreSQL", () => {
  it("associates an active group-only athlete once under concurrent retry and lists it once", async () => {
    assertDisposableTarget();
    const fixture = await seedGroupOnlyFixture();
    const before = await snapshot(fixture.organizationId);
    const command = createFamilyCommand(
      fixture,
      `ci-family-onboarding-${randomUUID()}`
    );

    const results = await Promise.all([
      associateOwnerFamily(command),
      associateOwnerFamily(command),
    ]);

    expect(results.map((result) => result.replayed).sort()).toEqual([
      false,
      true,
    ]);
    expect(results[0]?.family.id).toBe(results[1]?.family.id);
    expect(results[0]?.familyPayerId).toBe(results[1]?.familyPayerId);
    const familyId = results[0]!.family.id;
    const after = await snapshot(fixture.organizationId);
    const deltas = Object.fromEntries(
      snapshotTables.map((table) => [
        table,
        after[table].count - before[table].count,
      ])
    );
    expect(deltas).toMatchObject({
      audit_log: 1,
      families: 1,
      family_guardians: 1,
      family_members: 1,
      family_payers: 1,
      outbox_events: 1,
      guardians: 1,
      people: 1,
    });
    expect(deltas.enrollments).toBe(0);
    await expect(
      associateOwnerFamily({
        ...command,
        payer: { ...command.payer, confirmPrimaryPayerChange: false },
      })
    ).resolves.toMatchObject({ replayed: true });

    const options = await getOwnerFamilyOptions({
      organizationId: fixture.organizationId,
      locationId: fixture.locationA,
      actor: fixture.ownerActor,
    });
    const listedFamily = options.families.find((item) => item.familyId === familyId);
    expect(listedFamily?.athletes.map((athlete) => athlete.athleteId)).toEqual([
      fixture.athleteA,
    ]);
  }, 45_000);

  it("preserves a successful replay but rejects a new overlapping family without partial writes", async () => {
    assertDisposableTarget();
    const fixture = await seedGroupOnlyFixture();
    const originalCommand = createFamilyCommand(
      fixture,
      `ci-family-overlap-original-${randomUUID()}`
    );
    const original = await associateOwnerFamily(originalCommand);

    // Simulate overlapping legacy data created before the guard existed. A
    // replay resolves its receipt before applying rules to new commands.
    const legacyFamilyId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.families (id, organization_id)
      values (${legacyFamilyId}::uuid, ${fixture.organizationId}::uuid)
    `);
    await db.execute(sql`
      insert into zaltyko.family_members (
        organization_id, family_id, athlete_id, relationship, starts_on
      ) values (
        ${fixture.organizationId}::uuid, ${legacyFamilyId}::uuid,
        ${fixture.athleteA}::uuid, 'other', ${fixture.effectiveFrom}::date
      )
    `);

    const beforeReplay = await snapshot(fixture.organizationId);
    await expect(associateOwnerFamily(originalCommand)).resolves.toMatchObject({
      family: { id: original.family.id },
      replayed: true,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeReplay);

    const beforeDeniedCreation = await snapshot(fixture.organizationId);
    await expect(
      associateOwnerFamily(
        createFamilyCommand(
          fixture,
          `ci-family-overlap-new-${randomUUID()}`
        )
      )
    ).rejects.toMatchObject({
      code: "FAMILY_MEMBERSHIP_DATE_CONFLICT",
      status: 409,
      message: "La gimnasta ya tiene una asociación familiar que se solapa con la fecha efectiva.",
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeDeniedCreation);
  }, 45_000);

  it("serializes distinct family commands for one athlete and leaves only the winning transaction", async () => {
    assertDisposableTarget();
    const fixture = await seedGroupOnlyFixture();
    const before = await snapshot(fixture.organizationId);
    const commands = [
      {
        ...createFamilyCommand(fixture, `ci-family-overlap-race-a-${randomUUID()}`),
        athleteIds: [fixture.athleteB],
        payer: {
          givenName: "Synthetic Race A",
          familyName: "Guardian",
          relationship: "parent" as const,
        },
      },
      {
        ...createFamilyCommand(fixture, `ci-family-overlap-race-b-${randomUUID()}`),
        athleteIds: [fixture.athleteB],
        payer: {
          givenName: "Synthetic Race B",
          familyName: "Guardian",
          relationship: "parent" as const,
        },
      },
    ];

    const results = await Promise.allSettled(
      commands.map((command) => associateOwnerFamily(command))
    );
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : undefined).toMatchObject({
      code: "FAMILY_MEMBERSHIP_DATE_CONFLICT",
      status: 409,
    });

    const after = await snapshot(fixture.organizationId);
    const deltas = Object.fromEntries(
      snapshotTables.map((table) => [
        table,
        after[table].count - before[table].count,
      ])
    );
    expect(deltas).toMatchObject({
      audit_log: 1,
      families: 1,
      family_guardians: 1,
      family_members: 1,
      family_payers: 1,
      guardians: 1,
      outbox_events: 1,
      people: 1,
    });
    for (const table of [
      "enrollments",
      "group_memberships",
      "group_membership_history",
      "member_location_scopes",
      "organization_members",
    ] as const) {
      expect(deltas[table]).toBe(0);
    }
    const membershipCount = await db.execute(sql`
      select count(*)::int as count
      from zaltyko.family_members
      where organization_id = ${fixture.organizationId}::uuid
        and athlete_id = ${fixture.athleteB}::uuid
        and (ends_on is null or ends_on >= ${fixture.effectiveFrom}::date)
    `);
    expect(membershipCount.rows[0]?.count).toBe(1);
  }, 45_000);

  it("allows same-family reuse and a new family after the previous relationship ended", async () => {
    assertDisposableTarget();
    const fixture = await seedGroupOnlyFixture();
    const firstCommand = {
      ...createFamilyCommand(fixture, `ci-family-succession-first-${randomUUID()}`),
      athleteIds: [fixture.athleteC],
    };
    const first = await associateOwnerFamily(firstCommand);

    const beforeSameFamilyReuse = await snapshot(fixture.organizationId);
    await expect(
      associateOwnerFamily({
        ...firstCommand,
        familyId: first.family.id,
        idempotencyKey: `ci-family-succession-reuse-${randomUUID()}`,
        payer: { familyPayerId: first.familyPayerId },
      })
    ).resolves.toMatchObject({
      family: { id: first.family.id },
      replayed: false,
    });
    const afterSameFamilyReuse = await snapshot(fixture.organizationId);
    expect(afterSameFamilyReuse.family_members).toEqual(
      beforeSameFamilyReuse.family_members
    );

    const nextDate = new Date(`${fixture.effectiveFrom}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const successorStart = nextDate.toISOString().slice(0, 10);
    await db.execute(sql`
      update zaltyko.family_members
      set ends_on = ${fixture.effectiveFrom}::date, updated_at = now()
      where organization_id = ${fixture.organizationId}::uuid
        and family_id = ${first.family.id}::uuid
        and athlete_id = ${fixture.athleteC}::uuid
    `);

    const successor = await associateOwnerFamily({
      ...createFamilyCommand(
        fixture,
        `ci-family-succession-second-${randomUUID()}`
      ),
      athleteIds: [fixture.athleteC],
      effectiveFrom: successorStart,
    });
    expect(successor.family.id).not.toBe(first.family.id);

    const relationships = await db.execute(sql`
      select family_id::text as family_id,
        starts_on::text as starts_on, ends_on::text as ends_on
      from zaltyko.family_members
      where organization_id = ${fixture.organizationId}::uuid
        and athlete_id = ${fixture.athleteC}::uuid
      order by starts_on, family_id
    `);
    expect(relationships.rows).toHaveLength(2);
    expect(relationships.rows).toEqual(
      expect.arrayContaining([
        {
          family_id: first.family.id,
          starts_on: fixture.effectiveFrom,
          ends_on: fixture.effectiveFrom,
        },
        {
          family_id: successor.family.id,
          starts_on: successorStart,
          ends_on: null,
        },
      ])
    );
  }, 45_000);

  it("recovers a lost partial-scope creation response, then blocks replay after the family reaches another site", async () => {
    assertDisposableTarget();
    const fixture = await seedGroupOnlyFixture();
    const manager = await seedPartialLocationManager(
      fixture.organizationId,
      fixture.locationA
    );
    const command = {
      ...createFamilyCommand(fixture, `ci-family-partial-replay-${randomUUID()}`),
      actor: manager,
    };

    const created = await associateOwnerFamily(command);
    expect(created.replayed).toBe(false);
    const afterCreate = await snapshot(fixture.organizationId);
    const replayed = await associateOwnerFamily(command);
    expect(replayed).toMatchObject({
      family: { id: created.family.id },
      familyPayerId: created.familyPayerId,
      guardianId: created.guardianId,
      replayed: true,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(afterCreate);

    await associateOwnerFamily(
      addExistingFamilyMemberCommand(fixture, {
        familyId: created.family.id,
        familyPayerId: created.familyPayerId,
        athleteId: fixture.athleteB,
        locationId: fixture.locationB,
        idempotencyKey: `ci-family-partial-other-site-${randomUUID()}`,
        actor: fixture.ownerActor,
      })
    );
    const beforeDeniedReplay = await snapshot(fixture.organizationId);

    await expect(associateOwnerFamily(command)).rejects.toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeDeniedReplay);
  }, 45_000);

  it("denies partial-scope changes to a family associated with another site without writes", async () => {
    assertDisposableTarget();
    const fixture = await seedGroupOnlyFixture();
    const created = await associateOwnerFamily(
      createFamilyCommand(fixture, `ci-family-create-${randomUUID()}`)
    );
    await associateOwnerFamily(
      addExistingFamilyMemberCommand(fixture, {
        familyId: created.family.id,
        familyPayerId: created.familyPayerId,
        athleteId: fixture.athleteB,
        locationId: fixture.locationB,
        idempotencyKey: `ci-family-add-second-site-${randomUUID()}`,
        actor: fixture.ownerActor,
      })
    );
    const manager = await seedPartialLocationManager(
      fixture.organizationId,
      fixture.locationB
    );
    const beforeDeniedMutation = await snapshot(fixture.organizationId);

    await expect(
      associateOwnerFamily(
        addExistingFamilyMemberCommand(fixture, {
          familyId: created.family.id,
          familyPayerId: created.familyPayerId,
          athleteId: fixture.athleteC,
          locationId: fixture.locationB,
          idempotencyKey: `ci-family-cross-scope-${randomUUID()}`,
          actor: manager,
        })
      )
    ).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });

    expect(await snapshot(fixture.organizationId)).toEqual(beforeDeniedMutation);
  }, 45_000);

  it("requires explicit confirmation to promote a secondary payer and replays only the confirmed fingerprint", async () => {
    assertDisposableTarget();
    const fixture = await seedGroupOnlyFixture();
    const created = await associateOwnerFamily(
      createFamilyCommand(fixture, `ci-family-primary-create-${randomUUID()}`)
    );
    const secondary = await seedSecondaryFamilyPayer(
      fixture.organizationId,
      created.family.id
    );
    const idempotencyKey = `ci-family-primary-switch-${randomUUID()}`;
    const unconfirmedCommand = addExistingFamilyMemberCommand(fixture, {
      familyId: created.family.id,
      familyPayerId: secondary.familyPayerId,
      athleteId: fixture.athleteA,
      locationId: fixture.locationA,
      idempotencyKey,
      actor: fixture.ownerActor,
    });
    const beforeRejectedChange = await snapshot(fixture.organizationId);

    await expect(associateOwnerFamily(unconfirmedCommand)).rejects.toMatchObject({
      code: "PRIMARY_PAYER_CONFIRMATION_REQUIRED",
      status: 422,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeRejectedChange);

    const confirmedCommand = {
      ...unconfirmedCommand,
      payer: {
        familyPayerId: secondary.familyPayerId,
        confirmPrimaryPayerChange: true,
      },
    };
    await expect(associateOwnerFamily(confirmedCommand)).resolves.toMatchObject({
      family: { id: created.family.id },
      familyPayerId: secondary.familyPayerId,
      replayed: false,
    });

    const primaryPayers = await db.execute(sql`
      select guardian_id::text as guardian_id
      from zaltyko.family_payers
      where organization_id = ${fixture.organizationId}::uuid
        and family_id = ${created.family.id}::uuid
        and is_primary = true
        and ends_on is null
    `);
    expect(primaryPayers.rows).toEqual([
      { guardian_id: secondary.guardianId },
    ]);
    await expect(associateOwnerFamily(confirmedCommand)).resolves.toMatchObject({
      replayed: true,
      familyPayerId: secondary.familyPayerId,
    });
    const beforeUnconfirmedReplay = await snapshot(fixture.organizationId);
    await expect(
      associateOwnerFamily({
        ...unconfirmedCommand,
        payer: { familyPayerId: secondary.familyPayerId },
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeUnconfirmedReplay);
  }, 45_000);

  it("requires confirmation before replacing an existing family's primary with a new payer", async () => {
    assertDisposableTarget();
    const fixture = await seedGroupOnlyFixture();
    const created = await associateOwnerFamily(
      createFamilyCommand(fixture, `ci-family-new-payer-create-${randomUUID()}`)
    );
    const idempotencyKey = `ci-family-new-payer-switch-${randomUUID()}`;
    const unconfirmedCommand = {
      organizationId: fixture.organizationId,
      locationId: fixture.locationA,
      familyId: created.family.id,
      athleteIds: [fixture.athleteA],
      effectiveFrom: fixture.effectiveFrom,
      payer: {
        givenName: "Synthetic Replacement",
        familyName: "Guardian",
        relationship: "parent" as const,
      },
      idempotencyKey,
      actor: fixture.ownerActor,
    };
    const beforeRejectedChange = await snapshot(fixture.organizationId);

    await expect(associateOwnerFamily(unconfirmedCommand)).rejects.toMatchObject({
      code: "PRIMARY_PAYER_CONFIRMATION_REQUIRED",
      status: 422,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeRejectedChange);

    const confirmed = await associateOwnerFamily({
      ...unconfirmedCommand,
      payer: {
        ...unconfirmedCommand.payer,
        confirmPrimaryPayerChange: true,
      },
    });
    expect(confirmed).toMatchObject({
      family: { id: created.family.id },
      replayed: false,
    });
    const primaryCount = await db.execute(sql`
      select count(*)::int as count
      from zaltyko.family_payers
      where organization_id = ${fixture.organizationId}::uuid
        and family_id = ${created.family.id}::uuid
        and is_primary = true
        and ends_on is null
    `);
    expect(primaryCount.rows[0]?.count).toBe(1);
    await expect(associateOwnerFamily({
      ...unconfirmedCommand,
      payer: {
        ...unconfirmedCommand.payer,
        confirmPrimaryPayerChange: true,
      },
    })).resolves.toMatchObject({ replayed: true });
  }, 45_000);

  it("rolls back a group-only family member, payer update, outbox, and audit on receipt conflict", async () => {
    assertDisposableTarget();
    const fixture = await seedGroupOnlyFixture();
    const created = await associateOwnerFamily(
      createFamilyCommand(fixture, `ci-family-create-${randomUUID()}`)
    );
    const idempotencyKey = `ci-family-rollback-${randomUUID()}`;
    await db.execute(sql`
      insert into zaltyko.audit_log (
        organization_id, location_id, actor_user_id, action, target_type,
        target_id, idempotency_key
      ) values (
        ${fixture.organizationId}::uuid,
        ${fixture.locationB}::uuid,
        ${fixture.ownerUserId}::uuid,
        'qa.family_receipt_conflict',
        'family',
        ${created.family.id}::uuid,
        ${idempotencyKey}
      )
    `);
    const before = await snapshot(fixture.organizationId);

    await expect(
      associateOwnerFamily(
        addExistingFamilyMemberCommand(fixture, {
          familyId: created.family.id,
          familyPayerId: created.familyPayerId,
          athleteId: fixture.athleteB,
          locationId: fixture.locationB,
          idempotencyKey,
          actor: fixture.ownerActor,
        })
      )
    ).rejects.toBeDefined();

    expect(await snapshot(fixture.organizationId)).toEqual(before);
    const partialWrites = await db.execute(sql`
      select
        (select count(*)::int from zaltyko.family_members
          where organization_id = ${fixture.organizationId}::uuid
            and family_id = ${created.family.id}::uuid
            and athlete_id = ${fixture.athleteB}::uuid) as family_member,
        (select count(*)::int from zaltyko.outbox_events
          where organization_id = ${fixture.organizationId}::uuid
            and event_name = 'family.owner_associated'
            and idempotency_key = ${idempotencyKey}) as outbox_count,
        (select count(*)::int from zaltyko.audit_log
          where organization_id = ${fixture.organizationId}::uuid
            and idempotency_key = ${idempotencyKey}) as audit_count
    `);
    expect(partialWrites.rows[0]).toEqual({
      family_member: 0,
      outbox_count: 0,
      audit_count: 1,
    });
  }, 45_000);
});
