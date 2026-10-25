import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
  getOwnerGuardianContacts,
  updateOwnerGuardianContact,
} from "@/modules/families/application/owner-guardian-contacts";

const snapshotTables = [
  "audit_log",
  "athletes",
  "enrollments",
  "families",
  "family_guardians",
  "family_members",
  "group_memberships",
  "groups",
  "guardian_contacts",
  "guardians",
  "locations",
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

async function seedGuardianFixture() {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const memberId = randomUUID();
  const locationId = randomUUID();
  const personId = randomUUID();
  const guardianPersonId = randomUUID();
  const athleteId = randomUUID();
  const groupId = randomUUID();
  const familyId = randomUUID();
  const guardianId = randomUUID();

  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${`ci-contact-owner-${userId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name)
    values (${organizationId}::uuid, ${`CI guardian contacts ${organizationId}`})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name, timezone)
    values (
      ${locationId}::uuid, ${organizationId}::uuid,
      ${`ci-contact-${organizationId.slice(0, 8)}`}, 'CI guardian contacts site', 'Europe/Madrid'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values (
      ${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid,
      'owner', 'active', 'all'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values
      (${personId}::uuid, ${organizationId}::uuid, 'Synthetic', 'Athlete'),
      (${guardianPersonId}::uuid, ${organizationId}::uuid, 'Synthetic', 'Guardian')
  `);
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id)
    values (${athleteId}::uuid, ${organizationId}::uuid, ${personId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.groups (
      id, organization_id, location_id, name, capacity, status
    ) values (
      ${groupId}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
      'CI guardian contacts group', 10, 'active'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.group_memberships (
      organization_id, group_id, athlete_id, status, starts_on
    ) values (
      ${organizationId}::uuid, ${groupId}::uuid, ${athleteId}::uuid,
      'active', (now() at time zone 'Europe/Madrid')::date
    )
  `);
  await db.execute(sql`
    insert into zaltyko.families (id, organization_id)
    values (${familyId}::uuid, ${organizationId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.guardians (id, organization_id, person_id)
    values (${guardianId}::uuid, ${organizationId}::uuid, ${guardianPersonId}::uuid)
  `);
  await db.execute(sql`
    insert into zaltyko.family_members (
      organization_id, family_id, athlete_id, relationship, starts_on
    ) values (
      ${organizationId}::uuid, ${familyId}::uuid, ${athleteId}::uuid,
      'other', (now() at time zone 'Europe/Madrid')::date
    )
  `);
  await db.execute(sql`
    insert into zaltyko.family_guardians (
      organization_id, family_id, guardian_id, relationship
    ) values (
      ${organizationId}::uuid, ${familyId}::uuid, ${guardianId}::uuid,
      'parent'
    )
  `);
  const [dateRow] = (await db.execute(sql`
    select current_date::text as date
  `)).rows as Array<{ date: string }>;

  return {
    organizationId,
    userId,
    memberId,
    locationId,
    familyId,
    guardianId,
    athleteId,
    effectiveDate: dateRow!.date,
    actor: { userId, memberId },
  };
}

async function seedPartialManager(fixture: Awaited<ReturnType<typeof seedGuardianFixture>>) {
  const userId = randomUUID();
  const memberId = randomUUID();
  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${`ci-contact-manager-${userId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values (
      ${memberId}::uuid, ${fixture.organizationId}::uuid, ${userId}::uuid,
      'manager', 'active', 'selected'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.member_location_scopes (
      organization_id, member_id, location_id
    ) values (
      ${fixture.organizationId}::uuid, ${memberId}::uuid,
      ${fixture.locationId}::uuid
    )
  `);
  return { userId, memberId };
}

function patch(
  fixture: Awaited<ReturnType<typeof seedGuardianFixture>>,
  input: {
    key: string;
    kind?: "email" | "phone";
    expectedContactId?: string | null;
    expectedValue?: string | null;
    expectedUpdatedAt?: string | null;
    value: string;
    actor?: { userId: string; memberId: string };
  }
) {
  return updateOwnerGuardianContact({
    organizationId: fixture.organizationId,
    locationId: fixture.locationId,
    guardianId: fixture.guardianId,
    actor: input.actor ?? fixture.actor,
    kind: input.kind ?? "email",
    expectedContactId: input.expectedContactId ?? null,
    expectedValue: input.expectedValue ?? null,
    expectedUpdatedAt: input.expectedUpdatedAt ?? null,
    value: input.value,
    idempotencyKey: input.key,
  });
}

describe("Owner guardian contacts against disposable PostgreSQL", () => {
  it("preserves exact microsecond versions, retries once, and retains old values without PII in audit", async () => {
    assertDisposableTarget();
    const fixture = await seedGuardianFixture();
    const initial = await getOwnerGuardianContacts({
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      guardianId: fixture.guardianId,
      actor: fixture.actor,
    });
    expect(initial.contacts.email).toBeNull();
    expect(initial.contacts.phone).toBeNull();

    const firstCommand = {
      key: `ci-contact-add-${randomUUID()}`,
      value: " Parent.QA@Example.Test ",
    };
    const first = await patch(fixture, firstCommand);
    expect(first.contacts.email).toMatchObject({
      value: "parent.qa@example.test",
      verifiedAt: null,
    });
    expect(first.contacts.email?.updatedAt).toMatch(/\.\d{6}Z$/u);
    const replay = await patch(fixture, firstCommand);
    expect(replay).toMatchObject({
      replayed: true,
      contacts: { email: { contactId: first.contacts.email?.contactId } },
    });
    const receiptRows = await db.execute(sql`
      select payload
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
        and idempotency_key = ${firstCommand.key}
        and event_name = 'guardian.primary_contact_updated'
    `);
    expect(receiptRows.rows).toHaveLength(1);
    expect(receiptRows.rows[0]?.payload).toMatchObject({
      guardianId: fixture.guardianId,
      contactId: first.contacts.email?.contactId,
      actorUserId: fixture.actor.userId,
      actorMemberId: fixture.actor.memberId,
      kind: "email",
      changed: true,
    });
    expect(receiptRows.rows[0]?.payload).toHaveProperty("commandFingerprint");
    expect(receiptRows.rows[0]?.payload).not.toHaveProperty("previousValueHash");
    expect(receiptRows.rows[0]?.payload).not.toHaveProperty("nextValueHash");

    const beforeStale = await snapshot(fixture.organizationId);
    await expect(
      patch(fixture, {
        key: `ci-contact-stale-${randomUUID()}`,
        expectedContactId: null,
        expectedValue: null,
        expectedUpdatedAt: null,
        value: "stale@example.test",
      })
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT", status: 409 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeStale);

    const beforeChange = await snapshot(fixture.organizationId);
    const next = await patch(fixture, {
      key: `ci-contact-change-${randomUUID()}`,
      expectedContactId: first.contacts.email!.contactId,
      expectedValue: first.contacts.email!.value,
      expectedUpdatedAt: first.contacts.email!.updatedAt,
      value: "next@example.test",
    });
    expect(next.contacts.email).toMatchObject({
      value: "next@example.test",
      verifiedAt: null,
    });
    const retained = await db.execute(sql`
      select value, is_primary, verified_at
      from zaltyko.guardian_contacts
      where organization_id = ${fixture.organizationId}::uuid
        and guardian_id = ${fixture.guardianId}::uuid
        and id = ${first.contacts.email!.contactId}::uuid
    `);
    expect(retained.rows[0]).toMatchObject({
      value: "parent.qa@example.test",
      is_primary: false,
    });
    const afterChange = await snapshot(fixture.organizationId);
    expect(afterChange.guardian_contacts.count - beforeChange.guardian_contacts.count).toBe(1);

    const privateValues = ["parent.qa@example.test", "next@example.test"];
    const records = await db.execute(sql`
      select payload::text as content from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
        and aggregate_id = ${fixture.guardianId}::uuid
        and event_name = 'guardian.primary_contact_updated'
      union all
      select coalesce(before::text, '') || coalesce(after::text, '') || metadata::text as content
      from zaltyko.audit_log
      where organization_id = ${fixture.organizationId}::uuid
        and target_id = ${fixture.guardianId}::uuid
        and action = 'guardian.primary_contact_updated'
    `);
    const serialized = records.rows.map((row) => String(row.content)).join(" ");
    for (const rawValue of privateValues) expect(serialized).not.toContain(rawValue);
    expect(serialized).not.toContain("previousValueHash");
    expect(serialized).not.toContain("nextValueHash");
    expect(serialized).not.toContain("valueHash");
  }, 45_000);

  it("promotes a prior secondary contact but clears its verification after the primary changes", async () => {
    assertDisposableTarget();
    const fixture = await seedGuardianFixture();
    const primaryId = randomUUID();
    const secondaryId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.guardian_contacts (
        id, organization_id, guardian_id, kind, value, normalized_value,
        is_primary, verified_at, updated_at
      ) values
        (${primaryId}::uuid, ${fixture.organizationId}::uuid,
          ${fixture.guardianId}::uuid, 'email', 'primary@example.test',
          'primary@example.test', true, now() - interval '1 day', now()),
        (${secondaryId}::uuid, ${fixture.organizationId}::uuid,
          ${fixture.guardianId}::uuid, 'email', 'secondary@example.test',
          'secondary@example.test', false, now() - interval '1 day', now())
    `);
    const before = await getOwnerGuardianContacts({
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      guardianId: fixture.guardianId,
      actor: fixture.actor,
    });
    const updated = await patch(fixture, {
      key: `ci-contact-promote-${randomUUID()}`,
      expectedContactId: before.contacts.email!.contactId,
      expectedValue: before.contacts.email!.value,
      expectedUpdatedAt: before.contacts.email!.updatedAt,
      value: "secondary@example.test",
    });
    expect(updated.contacts.email).toMatchObject({
      contactId: secondaryId,
      value: "secondary@example.test",
      verifiedAt: null,
    });
    const states = await db.execute(sql`
      select id, is_primary, verified_at
      from zaltyko.guardian_contacts
      where organization_id = ${fixture.organizationId}::uuid
        and guardian_id = ${fixture.guardianId}::uuid
      order by id
    `);
    expect(states.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: primaryId, is_primary: false }),
        expect.objectContaining({ id: secondaryId, is_primary: true, verified_at: null }),
      ])
    );
  }, 45_000);

  it("does not invalidate verification when the same normalized primary is submitted", async () => {
    assertDisposableTarget();
    const fixture = await seedGuardianFixture();
    const contactId = randomUUID();
    await db.execute(sql`
      insert into zaltyko.guardian_contacts (
        id, organization_id, guardian_id, kind, value, normalized_value,
        is_primary, verified_at, updated_at
      ) values (
        ${contactId}::uuid, ${fixture.organizationId}::uuid,
        ${fixture.guardianId}::uuid, 'email', 'parent@example.test',
        'parent@example.test', true, now() - interval '1 day', now()
      )
    `);
    const before = await getOwnerGuardianContacts({
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      guardianId: fixture.guardianId,
      actor: fixture.actor,
    });
    const unchanged = await patch(fixture, {
      key: `ci-contact-noop-${randomUUID()}`,
      expectedContactId: before.contacts.email!.contactId,
      expectedValue: before.contacts.email!.value,
      expectedUpdatedAt: before.contacts.email!.updatedAt,
      value: " PARENT@example.test ",
    });
    expect(unchanged.contacts.email).toEqual(before.contacts.email);
    expect(unchanged.replayed).toBe(false);
    const count = await db.execute(sql`
      select count(*)::int as count
      from zaltyko.guardian_contacts
      where organization_id = ${fixture.organizationId}::uuid
        and guardian_id = ${fixture.guardianId}::uuid
        and is_primary = true
    `);
    expect(Number(count.rows[0]?.count)).toBe(1);
  }, 45_000);

  it("denies a selected-location manager before returning or changing the shared contact", async () => {
    assertDisposableTarget();
    const fixture = await seedGuardianFixture();
    const manager = await seedPartialManager(fixture);
    const before = await snapshot(fixture.organizationId);
    const managerInput = {
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      guardianId: fixture.guardianId,
      actor: manager,
    };
    await expect(getOwnerGuardianContacts(managerInput)).rejects.toMatchObject({
      code: "LOCATION_SCOPE_DENIED",
      status: 403,
    });
    await expect(
      updateOwnerGuardianContact({
        ...managerInput,
        kind: "email",
        expectedContactId: null,
        expectedValue: null,
        expectedUpdatedAt: null,
        value: "manager@example.test",
        idempotencyKey: `ci-contact-manager-${randomUUID()}`,
      })
    ).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    expect(await snapshot(fixture.organizationId)).toEqual(before);
  }, 45_000);

  it("serializes concurrent updates with different keys and rejects the stale second snapshot", async () => {
    assertDisposableTarget();
    const fixture = await seedGuardianFixture();
    const initial = await updateOwnerGuardianContact({
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
      guardianId: fixture.guardianId,
      actor: fixture.actor,
      kind: "email",
      expectedContactId: null,
      expectedValue: null,
      expectedUpdatedAt: null,
      value: "original@example.test",
      idempotencyKey: `ci-contact-race-seed-${randomUUID()}`,
    });
    const snapshotBefore = await snapshot(fixture.organizationId);
    const sharedExpected = {
      expectedContactId: initial.contacts.email!.contactId,
      expectedValue: initial.contacts.email!.value,
      expectedUpdatedAt: initial.contacts.email!.updatedAt,
    };
    const results = await Promise.allSettled([
      patch(fixture, {
        ...sharedExpected,
        key: `ci-contact-race-a-${randomUUID()}`,
        value: "race-a@example.test",
      }),
      patch(fixture, {
        ...sharedExpected,
        key: `ci-contact-race-b-${randomUUID()}`,
        value: "race-b@example.test",
      }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : undefined).toMatchObject({
      code: "VERSION_CONFLICT",
      status: 409,
    });
    const after = await snapshot(fixture.organizationId);
    expect(after.guardian_contacts.count - snapshotBefore.guardian_contacts.count).toBe(1);
    expect(after.audit_log.count - snapshotBefore.audit_log.count).toBe(1);
    expect(after.outbox_events.count - snapshotBefore.outbox_events.count).toBe(1);
    const primaries = await db.execute(sql`
      select count(*)::int as count
      from zaltyko.guardian_contacts
      where organization_id = ${fixture.organizationId}::uuid
        and guardian_id = ${fixture.guardianId}::uuid
        and kind = 'email' and is_primary = true
    `);
    expect(Number(primaries.rows[0]?.count)).toBe(1);
  }, 45_000);
});
