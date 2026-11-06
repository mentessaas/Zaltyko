import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getManualPaymentOptions } from "@/modules/billing/application/manual-payments";
import { archiveOwnerAthlete } from "@/modules/athletes/application/owner-athlete-archive";

const disposablePgEnabled = process.env.ZALTYKO_PG_INTEGRATION === "1";
const describeDisposablePg = describe.skipIf(!disposablePgEnabled);

const snapshotTables = [
  "athletes",
  "attendance_records",
  "audit_log",
  "charges",
  "class_templates",
  "enrollment_status_history",
  "enrollments",
  "families",
  "family_guardians",
  "family_members",
  "group_membership_history",
  "group_memberships",
  "guardians",
  "invoice_lines",
  "invoices",
  "locations",
  "member_location_scopes",
  "organization_members",
  "organization_entitlement_changes",
  "organization_entitlements",
  "organization_saas_subscriptions",
  "organization_saas_trials",
  "outbox_events",
  "payment_allocations",
  "payments",
  "people",
  "price_plans",
  "sessions",
  "groups",
] as const;

const preservedTables = [
  "attendance_records",
  "charges",
  "families",
  "family_guardians",
  "family_members",
  "guardians",
  "invoice_lines",
  "invoices",
  "payment_allocations",
  "payments",
  "people",
  "sessions",
] as const;

type Fixture = {
  organizationId: string;
  ownerUserId: string;
  ownerMemberId: string;
  locationId: string;
  inactiveLocationId: string;
  athleteId: string;
  athletePersonId: string;
  familyId: string;
  groupIds: [string, string, string];
  membershipIds: [string, string, string];
  classTemplateIds: [string, string, string];
  enrollmentIds: [string, string, string];
  sessionId: string;
  invoiceId: string;
  invoiceLineId: string;
  pricePlanId: string;
  chargeId: string;
  paymentId: string;
  paymentAllocationId: string;
  actor: { userId: string; memberId: string };
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

async function snapshot(organizationId: string) {
  const queries = sql.join(
    snapshotTables.map((table) => sql`
      select ${table}::text as table_name,
        count(*)::int as count,
        md5(coalesce(jsonb_agg(to_jsonb(row_data) order by to_jsonb(row_data)::text)::text, '[]')) as content_hash
      from ${sql.identifier("zaltyko")}.${sql.identifier(table)} as row_data
      where row_data.organization_id = ${organizationId}::uuid
    `),
    sql` union all `
  );
  const result = await db.execute(
    sql`select * from (${queries}) snapshots order by table_name`
  );
  return Object.fromEntries(
    result.rows.map((row) => [
      String(row.table_name),
      { count: Number(row.count), contentHash: String(row.content_hash) },
    ])
  ) as Record<
    (typeof snapshotTables)[number],
    { count: number; contentHash: string }
  >;
}

function pickTables<
  T extends Record<string, { count: number; contentHash: string }>,
  K extends readonly (keyof T)[],
>(value: T, tableNames: K) {
  return Object.fromEntries(tableNames.map((table) => [table, value[table]]));
}

async function seedFixture(): Promise<Fixture> {
  const organizationId = randomUUID();
  const ownerUserId = randomUUID();
  const ownerMemberId = randomUUID();
  const locationId = randomUUID();
  const inactiveLocationId = randomUUID();
  const athleteId = randomUUID();
  const athletePersonId = randomUUID();
  const guardianUserId = randomUUID();
  const guardianPersonId = randomUUID();
  const guardianId = randomUUID();
  const familyId = randomUUID();
  const groupIds = [randomUUID(), randomUUID(), randomUUID()] as [
    string,
    string,
    string,
  ];
  const membershipIds = [randomUUID(), randomUUID(), randomUUID()] as [
    string,
    string,
    string,
  ];
  const classTemplateIds = [randomUUID(), randomUUID(), randomUUID()] as [
    string,
    string,
    string,
  ];
  const enrollmentIds = [randomUUID(), randomUUID(), randomUUID()] as [
    string,
    string,
    string,
  ];
  const sessionId = randomUUID();
  const invoiceId = randomUUID();
  const invoiceLineId = randomUUID();
  const pricePlanId = randomUUID();
  const chargeId = randomUUID();
  const paymentId = randomUUID();
  const paymentAllocationId = randomUUID();

  await db.execute(sql`
    insert into auth.users (id, email)
    values
      (${ownerUserId}::uuid, ${`ci-athlete-archive-owner-${ownerUserId}@example.invalid`}),
      (${guardianUserId}::uuid, ${`ci-athlete-archive-family-${guardianUserId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name)
    values (${organizationId}::uuid, ${`CI athlete archive ${organizationId}`})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name, timezone, is_active)
    values
      (${locationId}::uuid, ${organizationId}::uuid, 'archive-main', 'CI archive main', 'Europe/Madrid', true),
      (${inactiveLocationId}::uuid, ${organizationId}::uuid, 'archive-offline', 'CI archive inactive', 'Europe/Madrid', false)
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values (
      ${ownerMemberId}::uuid, ${organizationId}::uuid, ${ownerUserId}::uuid,
      'owner', 'active', 'all'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    values
      (${athletePersonId}::uuid, ${organizationId}::uuid, 'CI Athlete', 'Archive Fixture'),
      (${guardianPersonId}::uuid, ${organizationId}::uuid, 'CI Guardian', 'Archive Fixture')
  `);
  await db.execute(sql`
    insert into zaltyko.athletes (id, organization_id, person_id, is_active)
    values (${athleteId}::uuid, ${organizationId}::uuid, ${athletePersonId}::uuid, true)
  `);
  await db.execute(sql`
    insert into zaltyko.families (id, organization_id, is_active)
    values (${familyId}::uuid, ${organizationId}::uuid, true)
  `);
  await db.execute(sql`
    insert into zaltyko.guardians (id, organization_id, person_id, auth_user_id, is_active)
    values (${guardianId}::uuid, ${organizationId}::uuid, ${guardianPersonId}::uuid, ${guardianUserId}::uuid, true)
  `);
  await db.execute(sql`
    insert into zaltyko.family_members (
      organization_id, family_id, athlete_id, relationship, starts_on
    ) values (
      ${organizationId}::uuid, ${familyId}::uuid, ${athleteId}::uuid,
      'parent', current_date
    )
  `);
  await db.execute(sql`
    insert into zaltyko.family_guardians (
      organization_id, family_id, guardian_id, relationship,
      can_view_athletes, can_manage_enrollments, is_active
    ) values (
      ${organizationId}::uuid, ${familyId}::uuid, ${guardianId}::uuid,
      'parent', true, true, true
    )
  `);
  await db.execute(sql`
    insert into zaltyko.groups (id, organization_id, location_id, name, capacity, status)
    values ${sql.join(
      groupIds.map(
        (id, index) => sql`(
          ${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
          ${`CI archive group ${index + 1}`}, 10, 'active'
        )`
      ),
      sql`, `
    )}
  `);
  await db.execute(sql`
    insert into zaltyko.group_memberships (
      id, organization_id, group_id, athlete_id, status, starts_on, ends_on
    ) values
      (${membershipIds[0]}::uuid, ${organizationId}::uuid, ${groupIds[0]}::uuid,
       ${athleteId}::uuid, 'active', (current_timestamp at time zone 'Europe/Madrid')::date - 10, null),
      (${membershipIds[1]}::uuid, ${organizationId}::uuid, ${groupIds[1]}::uuid,
       ${athleteId}::uuid, 'pending', (current_timestamp at time zone 'Europe/Madrid')::date + 14, null),
      (${membershipIds[2]}::uuid, ${organizationId}::uuid, ${groupIds[2]}::uuid,
       ${athleteId}::uuid, 'active', (current_timestamp at time zone 'Europe/Madrid')::date - 10,
       (current_timestamp at time zone 'Europe/Madrid')::date - 1)
  `);
  await db.execute(sql`
    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    ) values ${sql.join(
      classTemplateIds.map(
        (id, index) => sql`(
          ${id}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
          ${`CI archive class ${index + 1}`}, 10, 'active', current_date
        )`
      ),
      sql`, `
    )}
  `);
  await db.execute(sql`
    insert into zaltyko.enrollments (
      id, organization_id, location_id, athlete_id, class_template_id,
      status, starts_on, ends_on, source
    ) values
      (${enrollmentIds[0]}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
       ${athleteId}::uuid, ${classTemplateIds[0]}::uuid, 'active',
       (current_timestamp at time zone 'Europe/Madrid')::date - 10, null, 'owner'),
      (${enrollmentIds[1]}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
       ${athleteId}::uuid, ${classTemplateIds[1]}::uuid, 'pending',
       (current_timestamp at time zone 'Europe/Madrid')::date + 14, null, 'owner'),
      (${enrollmentIds[2]}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
       ${athleteId}::uuid, ${classTemplateIds[2]}::uuid, 'active',
       (current_timestamp at time zone 'Europe/Madrid')::date - 10,
       (current_timestamp at time zone 'Europe/Madrid')::date - 1, 'owner')
  `);
  await db.execute(sql`
    insert into zaltyko.sessions (
      id, organization_id, location_id, class_template_id, status, starts_at, ends_at
    ) values (
      ${sessionId}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
      ${classTemplateIds[0]}::uuid, 'completed', current_timestamp - interval '2 days',
      current_timestamp - interval '2 days' + interval '1 hour'
    )
  `);
  await db.execute(sql`
    insert into zaltyko.attendance_records (
      organization_id, location_id, session_id, enrollment_id, athlete_id,
      status, recorded_by_member_id
    ) values (
      ${organizationId}::uuid, ${locationId}::uuid, ${sessionId}::uuid,
      ${enrollmentIds[0]}::uuid, ${athleteId}::uuid, 'present', ${ownerMemberId}::uuid
    )
  `);

  await db.execute(sql`
    insert into zaltyko.price_plans (
      id, organization_id, name, cadence, amount_cents, currency, is_active
    ) values (
      ${pricePlanId}::uuid, ${organizationId}::uuid,
      'CI archive monthly fee', 'monthly', 1000, 'EUR', true
    )
  `);
  await db.execute(sql`
    insert into zaltyko.invoices (
      id, organization_id, location_id, family_id, reference, status, currency,
      total_amount_cents, issued_at, due_at, idempotency_key
    ) values (
      ${invoiceId}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
      ${familyId}::uuid, ${`CI-ARCHIVE-${organizationId}`}, 'partially_paid', 'EUR',
      1000, current_timestamp, current_timestamp + interval '10 days',
      ${`ci-athlete-archive-invoice-${invoiceId}`}
    )
  `);
  await db.execute(sql`
    insert into zaltyko.invoice_lines (
      id, organization_id, invoice_id, location_id, athlete_id, price_plan_id,
      line_type, quantity, unit_amount_cents, amount_cents, currency,
      service_period_start, service_period_end
    ) values (
      ${invoiceLineId}::uuid, ${organizationId}::uuid, ${invoiceId}::uuid,
      ${locationId}::uuid, ${athleteId}::uuid, ${pricePlanId}::uuid,
      'monthly_fee', 1, 1000, 1000, 'EUR',
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date
    )
  `);
  await db.execute(sql`
    insert into zaltyko.charges (
      id, organization_id, location_id, invoice_id, invoice_line_id, family_id,
      status, amount_cents, currency, due_at, service_period_start,
      service_period_end, idempotency_key
    ) values (
      ${chargeId}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
      ${invoiceId}::uuid, ${invoiceLineId}::uuid, ${familyId}::uuid,
      'partially_paid', 1000, 'EUR', current_timestamp + interval '10 days',
      date_trunc('month', current_date)::date,
      (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
      ${`ci-athlete-archive-charge-${chargeId}`}
    )
  `);
  await db.execute(sql`
    insert into zaltyko.payments (
      id, organization_id, location_id, family_id, source, status,
      amount_cents, currency, manual_method, recorded_by_user_id,
      received_at, idempotency_key
    ) values (
      ${paymentId}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
      ${familyId}::uuid, 'manual', 'succeeded', 100, 'EUR', 'cash',
      ${ownerUserId}::uuid, current_timestamp - interval '1 day',
      ${`ci-athlete-archive-payment-${paymentId}`}
    )
  `);
  await db.execute(sql`
    insert into zaltyko.payment_allocations (
      id, organization_id, payment_id, charge_id, amount_cents, currency,
      allocated_at, idempotency_key
    ) values (
      ${paymentAllocationId}::uuid, ${organizationId}::uuid,
      ${paymentId}::uuid, ${chargeId}::uuid, 100, 'EUR',
      current_timestamp - interval '1 day',
      ${`ci-athlete-archive-allocation-${paymentAllocationId}`}
    )
  `);

  return {
    organizationId,
    ownerUserId,
    ownerMemberId,
    locationId,
    inactiveLocationId,
    athleteId,
    athletePersonId,
    familyId,
    groupIds,
    membershipIds,
    classTemplateIds,
    enrollmentIds,
    sessionId,
    invoiceId,
    invoiceLineId,
    pricePlanId,
    chargeId,
    paymentId,
    paymentAllocationId,
    actor: { userId: ownerUserId, memberId: ownerMemberId },
  };
}

function archiveCommand(
  fixture: Fixture,
  overrides: Partial<{
    organizationId: string;
    locationId: string;
    athleteId: string;
    userId: string;
    actor: { userId: string; memberId: string };
    idempotencyKey: string;
  }> = {}
) {
  return {
    userId: fixture.ownerUserId,
    organizationId: fixture.organizationId,
    locationId: fixture.locationId,
    athleteId: fixture.athleteId,
    actor: fixture.actor,
    idempotencyKey: `ci-athlete-archive-${randomUUID()}`,
    ...overrides,
  };
}

async function insertScopedMember(
  fixture: Fixture,
  role: "admin" | "manager",
  locationScopeMode: "all" | "selected"
) {
  const userId = randomUUID();
  const memberId = randomUUID();
  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${`ci-athlete-archive-${role}-${userId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into zaltyko.organization_members (
      id, organization_id, user_id, role, status, location_scope_mode
    ) values (
      ${memberId}::uuid, ${fixture.organizationId}::uuid, ${userId}::uuid,
      ${role}, 'active', ${locationScopeMode}
    )
  `);
  if (locationScopeMode === "selected") {
    await db.execute(sql`
      insert into zaltyko.member_location_scopes (organization_id, member_id, location_id)
      values (${fixture.organizationId}::uuid, ${memberId}::uuid, ${fixture.locationId}::uuid)
    `);
  }
  return { userId, memberId };
}

async function assertUnderFreeLimit(organizationId: string) {
  const result = await db.execute(sql`
    select count(*) filter (where is_active)::int as active_athletes
    from zaltyko.athletes where organization_id = ${organizationId}::uuid
  `);
  expect(Number(result.rows[0]?.active_athletes)).toBeLessThanOrEqual(30);
  const groups = await db.execute(sql`
    select count(*)::int as active_groups
    from zaltyko.groups where organization_id = ${organizationId}::uuid and status = 'active'
  `);
  const classes = await db.execute(sql`
    select count(*)::int as active_classes
    from zaltyko.class_templates where organization_id = ${organizationId}::uuid and status = 'active'
  `);
  expect(Number(groups.rows[0]?.active_groups)).toBeLessThanOrEqual(3);
  expect(Number(classes.rows[0]?.active_classes)).toBeLessThanOrEqual(10);
}

describeDisposablePg("Owner athlete archive against disposable PostgreSQL", () => {
  it("archives below Free limits, closes dated affiliations, and retains family billing and attendance", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();
    await assertUnderFreeLimit(fixture.organizationId);
    const before = await snapshot(fixture.organizationId);

    const archiveKey = `ci-athlete-archive-first-${randomUUID()}`;
    const archived = await archiveOwnerAthlete(
      archiveCommand(fixture, { idempotencyKey: archiveKey })
    );
    expect(archived).toMatchObject({
      athleteId: fixture.athleteId,
      isActive: false,
      replayed: false,
    });

    const afterArchive = await snapshot(fixture.organizationId);
    expect(
      pickTables(afterArchive, preservedTables)
    ).toEqual(pickTables(before, preservedTables));
    expect(afterArchive.athletes.count).toBe(before.athletes.count);
    expect(afterArchive.group_memberships.count).toBe(before.group_memberships.count);
    expect(afterArchive.enrollments.count).toBe(before.enrollments.count);
    expect(
      afterArchive.group_membership_history.count -
        before.group_membership_history.count
    ).toBe(3);
    expect(
      afterArchive.enrollment_status_history.count -
        before.enrollment_status_history.count
    ).toBe(3);
    expect(afterArchive.audit_log.count - before.audit_log.count).toBe(1);
    expect(afterArchive.outbox_events.count - before.outbox_events.count).toBe(1);
    expect(afterArchive.organization_entitlements).toEqual(before.organization_entitlements);
    expect(afterArchive.organization_entitlement_changes).toEqual(
      before.organization_entitlement_changes
    );

    const athlete = await db.execute(sql`
      select is_active, person_id from zaltyko.athletes
      where organization_id = ${fixture.organizationId}::uuid
        and id = ${fixture.athleteId}::uuid
    `);
    expect(athlete.rows[0]).toEqual({
      is_active: false,
      person_id: fixture.athletePersonId,
    });

    const membershipFacts = await db.execute(sql`
      select
        (audit.created_at at time zone location.timezone)::date::text as local_today,
        ((audit.created_at at time zone location.timezone)::date - 1)::text as local_yesterday,
        membership.id::text as relationship_id,
        membership.status::text as relationship_status,
        membership.starts_on::text as starts_on,
        membership.ends_on::text as ends_on,
        history.from_status::text as from_status,
        history.to_status::text as to_status,
        history.reason_code,
        history.changed_by_member_id::text as changed_by_member_id,
        history.effective_on::text as effective_on
      from zaltyko.group_memberships membership
      join zaltyko.groups academy_group
        on academy_group.organization_id = membership.organization_id
       and academy_group.id = membership.group_id
      join zaltyko.locations location
        on location.organization_id = academy_group.organization_id
       and location.id = academy_group.location_id
      join zaltyko.group_membership_history history
        on history.organization_id = membership.organization_id
       and history.membership_id = membership.id
      join zaltyko.audit_log audit
        on audit.organization_id = membership.organization_id
       and audit.idempotency_key = ${archiveKey}
      where membership.organization_id = ${fixture.organizationId}::uuid
        and membership.athlete_id = ${fixture.athleteId}::uuid
      order by membership.id
    `);
    expect(membershipFacts.rows).toHaveLength(3);
    for (const row of membershipFacts.rows) {
      expect(row.relationship_status).toBe("ended");
      expect(row.from_status).toMatch(/^(active|pending)$/u);
      expect(row.to_status).toBe("ended");
      expect(row.reason_code).toBe("academy_request");
      expect(row.changed_by_member_id).toBe(fixture.ownerMemberId);
      expect(row.effective_on).toBe(row.ends_on);
      expect(String(row.ends_on) >= String(row.starts_on)).toBe(true);
    }
    const activeMembership = membershipFacts.rows.find(
      (row) => row.relationship_id === fixture.membershipIds[0]
    );
    const futureMembership = membershipFacts.rows.find(
      (row) => row.relationship_id === fixture.membershipIds[1]
    );
    const previouslyEndedMembership = membershipFacts.rows.find(
      (row) => row.relationship_id === fixture.membershipIds[2]
    );
    expect(activeMembership?.ends_on).toBe(activeMembership?.local_today);
    expect(futureMembership?.ends_on).toBe(futureMembership?.starts_on);
    expect(previouslyEndedMembership?.ends_on).toBe(
      previouslyEndedMembership?.local_yesterday
    );

    const enrollmentFacts = await db.execute(sql`
      select
        (audit.created_at at time zone location.timezone)::date::text as local_today,
        ((audit.created_at at time zone location.timezone)::date - 1)::text as local_yesterday,
        enrollment.id::text as relationship_id,
        enrollment.status::text as relationship_status,
        enrollment.starts_on::text as starts_on,
        enrollment.ends_on::text as ends_on,
        history.from_status::text as from_status,
        history.to_status::text as to_status,
        history.reason_code,
        history.changed_by_member_id::text as changed_by_member_id,
        history.effective_on::text as effective_on
      from zaltyko.enrollments enrollment
      join zaltyko.locations location
        on location.organization_id = enrollment.organization_id
       and location.id = enrollment.location_id
      join zaltyko.enrollment_status_history history
        on history.organization_id = enrollment.organization_id
       and history.enrollment_id = enrollment.id
      join zaltyko.audit_log audit
        on audit.organization_id = enrollment.organization_id
       and audit.idempotency_key = ${archiveKey}
      where enrollment.organization_id = ${fixture.organizationId}::uuid
        and enrollment.athlete_id = ${fixture.athleteId}::uuid
      order by enrollment.id
    `);
    expect(enrollmentFacts.rows).toHaveLength(3);
    for (const row of enrollmentFacts.rows) {
      expect(row.relationship_status).toBe("cancelled");
      expect(row.from_status).toMatch(/^(active|pending)$/u);
      expect(row.to_status).toBe("cancelled");
      expect(row.reason_code).toBe("academy_request");
      expect(row.changed_by_member_id).toBe(fixture.ownerMemberId);
      expect(row.effective_on).toBe(row.ends_on);
      expect(String(row.ends_on) >= String(row.starts_on)).toBe(true);
    }
    const activeEnrollment = enrollmentFacts.rows.find(
      (row) => row.relationship_id === fixture.enrollmentIds[0]
    );
    const futureEnrollment = enrollmentFacts.rows.find(
      (row) => row.relationship_id === fixture.enrollmentIds[1]
    );
    const previouslyEndedEnrollment = enrollmentFacts.rows.find(
      (row) => row.relationship_id === fixture.enrollmentIds[2]
    );
    expect(activeEnrollment?.ends_on).toBe(activeEnrollment?.local_today);
    expect(futureEnrollment?.ends_on).toBe(futureEnrollment?.starts_on);
    expect(previouslyEndedEnrollment?.ends_on).toBe(
      previouslyEndedEnrollment?.local_yesterday
    );

    const openCharges = await getManualPaymentOptions({
      userId: fixture.ownerUserId,
      organizationId: fixture.organizationId,
      locationId: fixture.locationId,
    });
    expect(openCharges.charges).toContainEqual(
      expect.objectContaining({
        chargeId: fixture.chargeId,
        familyId: fixture.familyId,
        totalCents: 1000,
        allocatedCents: 100,
        outstandingCents: 900,
      })
    );
    expect(await snapshot(fixture.organizationId)).toEqual(afterArchive);

    const replay = await archiveOwnerAthlete(
      archiveCommand(fixture, { idempotencyKey: archiveKey })
    );
    expect(replay).toEqual({
      athleteId: fixture.athleteId,
      isActive: false,
      replayed: true,
    });
    expect(await snapshot(fixture.organizationId)).toEqual(afterArchive);

    const noOpKey = `ci-athlete-archive-noop-${randomUUID()}`;
    const beforeNoOp = await snapshot(fixture.organizationId);
    await expect(
      archiveOwnerAthlete(archiveCommand(fixture, { idempotencyKey: noOpKey }))
    ).resolves.toEqual({
      athleteId: fixture.athleteId,
      isActive: false,
      replayed: false,
    });
    const afterNoOp = await snapshot(fixture.organizationId);
    expect(afterNoOp.group_membership_history).toEqual(
      beforeNoOp.group_membership_history
    );
    expect(afterNoOp.enrollment_status_history).toEqual(
      beforeNoOp.enrollment_status_history
    );
    expect(afterNoOp.athletes).toEqual(beforeNoOp.athletes);
    expect(afterNoOp.audit_log.count).toBe(beforeNoOp.audit_log.count + 1);
    expect(afterNoOp.outbox_events.count).toBe(beforeNoOp.outbox_events.count + 1);
    const noOpReceipt = await db.execute(sql`
      select aggregate_id::text as aggregate_id, aggregate_type, payload
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
        and event_name = 'saas.resource_archived'
        and idempotency_key = ${noOpKey}
    `);
    expect(noOpReceipt.rows).toHaveLength(1);
    expect(noOpReceipt.rows[0]).toMatchObject({
      aggregate_id: fixture.athleteId,
      aggregate_type: "athletes",
      payload: {
        resource: "athletes",
        resourceId: fixture.athleteId,
        athleteId: fixture.athleteId,
        isActive: false,
        changed: false,
      },
    });
    await expect(
      archiveOwnerAthlete(archiveCommand(fixture, { idempotencyKey: noOpKey }))
    ).resolves.toMatchObject({ replayed: true, isActive: false });
    expect(await snapshot(fixture.organizationId)).toEqual(afterNoOp);
  }, 45_000);

  it("serializes two distinct keys for one athlete and closes each relationship once", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();
    const before = await snapshot(fixture.organizationId);
    const keys = [
      `ci-athlete-archive-race-a-${randomUUID()}`,
      `ci-athlete-archive-race-b-${randomUUID()}`,
    ];
    const results = await Promise.all(
      keys.map((idempotencyKey) =>
        archiveOwnerAthlete(archiveCommand(fixture, { idempotencyKey }))
      )
    );
    expect(results).toEqual(
      expect.arrayContaining([
        { athleteId: fixture.athleteId, isActive: false, replayed: false },
        { athleteId: fixture.athleteId, isActive: false, replayed: false },
      ])
    );

    const histories = await db.execute(sql`
      select
        (select count(*)::int from zaltyko.group_membership_history
          where organization_id = ${fixture.organizationId}::uuid
            and membership_id in (${sql.join(fixture.membershipIds.map((id) => sql`${id}::uuid`), sql`, `)})) as memberships,
        (select count(*)::int from zaltyko.enrollment_status_history
          where organization_id = ${fixture.organizationId}::uuid
            and enrollment_id in (${sql.join(fixture.enrollmentIds.map((id) => sql`${id}::uuid`), sql`, `)})) as enrollments
    `);
    expect(histories.rows[0]).toEqual({ memberships: 3, enrollments: 3 });
    const receipts = await db.execute(sql`
      select count(*)::int as count,
        count(*) filter (where (payload->>'changed')::boolean)::int as changed_count
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
        and event_name = 'saas.resource_archived'
        and idempotency_key in (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
    `);
    expect(receipts.rows[0]).toEqual({ count: 2, changed_count: 1 });
    const auditCount = await db.execute(sql`
      select count(*)::int as count from zaltyko.audit_log
      where organization_id = ${fixture.organizationId}::uuid
        and idempotency_key in (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
    `);
    expect(auditCount.rows[0]?.count).toBe(2);
    const after = await snapshot(fixture.organizationId);
    expect(after.group_membership_history.count - before.group_membership_history.count).toBe(3);
    expect(after.enrollment_status_history.count - before.enrollment_status_history.count).toBe(3);
  }, 45_000);

  it("rejects foreign tenants, managers, partial admins, and inactive locations without partial writes", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();
    const foreign = await seedFixture();
    const manager = await insertScopedMember(fixture, "manager", "all");
    const partialAdmin = await insertScopedMember(fixture, "admin", "selected");

    const beforeFixture = await snapshot(fixture.organizationId);
    const beforeForeign = await snapshot(foreign.organizationId);
    await expect(
      archiveOwnerAthlete(
        archiveCommand(fixture, {
          athleteId: foreign.athleteId,
          idempotencyKey: `ci-athlete-archive-foreign-resource-${randomUUID()}`,
        })
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeFixture);
    expect(await snapshot(foreign.organizationId)).toEqual(beforeForeign);

    await expect(
      archiveOwnerAthlete(
        archiveCommand(foreign, {
          userId: fixture.ownerUserId,
          actor: fixture.actor,
          idempotencyKey: `ci-athlete-archive-foreign-org-${randomUUID()}`,
        })
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeFixture);
    expect(await snapshot(foreign.organizationId)).toEqual(beforeForeign);

    await expect(
      archiveOwnerAthlete(
        archiveCommand(fixture, {
          userId: manager.userId,
          actor: manager,
          idempotencyKey: `ci-athlete-archive-manager-${randomUUID()}`,
        })
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeFixture);

    await expect(
      archiveOwnerAthlete(
        archiveCommand(fixture, {
          userId: partialAdmin.userId,
          actor: partialAdmin,
          idempotencyKey: `ci-athlete-archive-partial-admin-${randomUUID()}`,
        })
      )
    ).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeFixture);

    await expect(
      archiveOwnerAthlete(
        archiveCommand(fixture, {
          locationId: fixture.inactiveLocationId,
          idempotencyKey: `ci-athlete-archive-inactive-site-${randomUUID()}`,
        })
      )
    ).rejects.toMatchObject({ code: "LOCATION_SCOPE_DENIED", status: 403 });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeFixture);
    expect(await snapshot(foreign.organizationId)).toEqual(beforeForeign);
  }, 45_000);

  it("rolls back all rows when a relationship-history receipt collides", async () => {
    assertDisposableTarget();
    const fixture = await seedFixture();
    const idempotencyKey = `ci-athlete-archive-history-conflict-${randomUUID()}`;
    await db.execute(sql`
      insert into zaltyko.group_membership_history (
        organization_id, membership_id, from_status, to_status, reason_code,
        changed_by_member_id, idempotency_key, effective_on
      ) values (
        ${fixture.organizationId}::uuid, ${fixture.membershipIds[0]}::uuid,
        'active', 'ended', 'academy_request', ${fixture.ownerMemberId}::uuid,
        md5(${idempotencyKey} || ${fixture.membershipIds[0]}), current_date
      )
    `);
    const before = await snapshot(fixture.organizationId);

    await expect(
      archiveOwnerAthlete(archiveCommand(fixture, { idempotencyKey }))
    ).rejects.toBeDefined();

    expect(await snapshot(fixture.organizationId)).toEqual(before);
    const state = await db.execute(sql`
      select athlete.is_active,
        membership.status::text as membership_status,
        enrollment.status::text as enrollment_status
      from zaltyko.athletes athlete
      join zaltyko.group_memberships membership
        on membership.organization_id = athlete.organization_id
       and membership.athlete_id = athlete.id
      join zaltyko.enrollments enrollment
        on enrollment.organization_id = athlete.organization_id
       and enrollment.athlete_id = athlete.id
       and enrollment.id = ${fixture.enrollmentIds[0]}::uuid
      where athlete.organization_id = ${fixture.organizationId}::uuid
        and athlete.id = ${fixture.athleteId}::uuid
        and membership.id = ${fixture.membershipIds[0]}::uuid
    `);
    expect(state.rows[0]).toEqual({
      is_active: true,
      membership_status: "active",
      enrollment_status: "active",
    });
  }, 45_000);
});
