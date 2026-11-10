/**
 * Disposable PostgreSQL tests for the monthly invoice service.
 *
 * They run the real quote and issuance against the real schema, triggers,
 * constraints, row locks and advisory locks. Opt-in: ZALTYKO_PG_INTEGRATION=1
 * on a GitHub Linux runner with a loopback, disposable database (same guard
 * as the other -pg suites). Every test seeds its own organization with random
 * ids, so the suite does not need a database of its own and does not depend
 * on rows left by other suites.
 *
 * Complements tests/billing-ledger-postgres.integration.test.ts, which covers
 * the one-athlete issuance, same-key concurrency, mixed currencies, Free
 * capacity, a stale quote, a class ending mid-month and ledger rollback.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  getMonthlyInvoiceOptions,
  issueMonthlyInvoice,
} from "@/modules/billing/application/monthly-invoice-service";

const describeDisposablePg = describe.skipIf(process.env.ZALTYKO_PG_INTEGRATION !== "1");

function assertDisposableTarget() {
  if (
    process.env.ZALTYKO_PG_INTEGRATION !== "1" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.RUNNER_OS !== "Linux" ||
    process.env.NODE_ENV !== "test"
  ) {
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

// ---------------------------------------------------------------------------
// Fixture: one family, athlete A in two classes and athlete B in one class,
// all on the same monthly plan (3500) with per-enrollment assigned prices.
// ---------------------------------------------------------------------------

type Fixture = Awaited<ReturnType<typeof seedFamily>>;

async function seedFamily() {
  const ids = {
    organizationId: randomUUID(),
    locationId: randomUUID(),
    userId: randomUUID(),
    memberId: randomUUID(),
    familyId: randomUUID(),
    guardianPersonId: randomUUID(),
    guardianId: randomUUID(),
    familyPayerId: randomUUID(),
    pricePlanId: randomUUID(),
    classOneId: randomUUID(),
    classTwoId: randomUUID(),
    athleteA: { personId: randomUUID(), athleteId: randomUUID() },
    athleteB: { personId: randomUUID(), athleteId: randomUUID() },
    enrollmentA1: randomUUID(),
    enrollmentA2: randomUUID(),
    enrollmentB1: randomUUID(),
    assignmentA1: randomUUID(),
    assignmentA2: randomUUID(),
    assignmentB1: randomUUID(),
  };
  const servicePeriod = new Date().toISOString().slice(0, 7);
  const [year, month] = servicePeriod.split("-").map(Number);
  const periodStart = `${servicePeriod}-01`;
  const periodEnd = new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);
  const { organizationId: org, locationId: loc } = ids;

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into auth.users (id, email)
      values (${ids.userId}::uuid, ${`ci-monthly-service-${ids.userId}@example.invalid`})
    `);
    await tx.execute(sql`
      insert into zaltyko.organizations (id, name)
      values (${org}::uuid, ${`CI monthly service ${org}`})
    `);
    await tx.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone)
      values (${loc}::uuid, ${org}::uuid, ${`ci-${org.slice(0, 8)}`},
        'CI monthly service site', 'Europe/Madrid')
    `);
    await tx.execute(sql`
      insert into zaltyko.organization_members (
        id, organization_id, user_id, role, status, location_scope_mode
      ) values (${ids.memberId}::uuid, ${org}::uuid, ${ids.userId}::uuid, 'owner', 'active', 'all')
    `);
    await tx.execute(sql`
      insert into zaltyko.families (id, organization_id, is_active)
      values (${ids.familyId}::uuid, ${org}::uuid, true)
    `);
    await tx.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values
        (${ids.athleteA.personId}::uuid, ${org}::uuid, 'Ana', 'CI'),
        (${ids.athleteB.personId}::uuid, ${org}::uuid, 'Bruno', 'CI'),
        (${ids.guardianPersonId}::uuid, ${org}::uuid, 'Laura', 'CI')
    `);
    await tx.execute(sql`
      insert into zaltyko.athletes (id, organization_id, person_id)
      values
        (${ids.athleteA.athleteId}::uuid, ${org}::uuid, ${ids.athleteA.personId}::uuid),
        (${ids.athleteB.athleteId}::uuid, ${org}::uuid, ${ids.athleteB.personId}::uuid)
    `);
    await tx.execute(sql`
      insert into zaltyko.guardians (id, organization_id, person_id)
      values (${ids.guardianId}::uuid, ${org}::uuid, ${ids.guardianPersonId}::uuid)
    `);
    await tx.execute(sql`
      insert into zaltyko.family_guardians (
        id, organization_id, family_id, guardian_id, relationship, is_active
      ) values (${randomUUID()}::uuid, ${org}::uuid, ${ids.familyId}::uuid,
        ${ids.guardianId}::uuid, 'parent', true)
    `);
    for (const athlete of [ids.athleteA, ids.athleteB]) {
      await tx.execute(sql`
        insert into zaltyko.family_members (
          id, organization_id, family_id, athlete_id, relationship, starts_on
        ) values (${randomUUID()}::uuid, ${org}::uuid, ${ids.familyId}::uuid,
          ${athlete.athleteId}::uuid, 'parent', ${periodStart}::date)
      `);
    }
    await tx.execute(sql`
      insert into zaltyko.family_payers (
        id, organization_id, family_id, guardian_id, is_primary, starts_on
      ) values (${ids.familyPayerId}::uuid, ${org}::uuid, ${ids.familyId}::uuid,
        ${ids.guardianId}::uuid, true, ${periodStart}::date)
    `);
    await tx.execute(sql`
      insert into zaltyko.price_plans (
        id, organization_id, name, cadence, amount_cents, currency, is_active
      ) values (${ids.pricePlanId}::uuid, ${org}::uuid, 'CI monthly tariff',
        'monthly', 3500, 'EUR', true)
    `);
    for (const [classId, name] of [
      [ids.classOneId, "CI class one"],
      [ids.classTwoId, "CI class two"],
    ] as const) {
      await tx.execute(sql`
        insert into zaltyko.class_templates (
          id, organization_id, location_id, name, capacity, status, effective_from
        ) values (${classId}::uuid, ${org}::uuid, ${loc}::uuid, ${name}, 20, 'active',
          ${periodStart}::date)
      `);
      await tx.execute(sql`
        insert into zaltyko.price_plan_class_template_coverage (
          id, organization_id, location_id, price_plan_id, class_template_id, starts_on
        ) values (${randomUUID()}::uuid, ${org}::uuid, ${loc}::uuid,
          ${ids.pricePlanId}::uuid, ${classId}::uuid, ${periodStart}::date)
      `);
    }
    for (const [enrollmentId, athleteId, classId, assignmentId, amount] of [
      [ids.enrollmentA1, ids.athleteA.athleteId, ids.classOneId, ids.assignmentA1, 3000],
      [ids.enrollmentA2, ids.athleteA.athleteId, ids.classTwoId, ids.assignmentA2, 3000],
      [ids.enrollmentB1, ids.athleteB.athleteId, ids.classOneId, ids.assignmentB1, 3200],
    ] as const) {
      await tx.execute(sql`
        insert into zaltyko.enrollments (
          id, organization_id, location_id, athlete_id, class_template_id,
          price_plan_id, status, starts_on, source
        ) values (${enrollmentId}::uuid, ${org}::uuid, ${loc}::uuid, ${athleteId}::uuid,
          ${classId}::uuid, ${ids.pricePlanId}::uuid, 'active', ${periodStart}::date, 'owner')
      `);
      await tx.execute(sql`
        insert into zaltyko.enrollment_price_assignments (
          id, organization_id, location_id, enrollment_id, price_plan_id,
          unit_amount_cents, currency, starts_on
        ) values (${assignmentId}::uuid, ${org}::uuid, ${loc}::uuid, ${enrollmentId}::uuid,
          ${ids.pricePlanId}::uuid, ${amount}, 'EUR', ${periodStart}::date)
      `);
    }
  });

  return {
    ...ids,
    actor: { userId: ids.userId, memberId: ids.memberId },
    servicePeriod,
    periodStart,
    periodEnd,
  };
}

async function quoteFor(fixture: Fixture) {
  const options = await getMonthlyInvoiceOptions({
    organizationId: fixture.organizationId,
    locationId: fixture.locationId,
    servicePeriod: fixture.servicePeriod,
    actor: fixture.actor,
  });
  const family = options.families.find((item) => item.familyId === fixture.familyId);
  if (!family) throw new Error("The seeded family is missing from the quote");
  return family;
}

function issueCommand(fixture: Fixture, quoteHash: string, idempotencyKey = `ci-monthly-${randomUUID()}`) {
  return {
    organizationId: fixture.organizationId,
    locationId: fixture.locationId,
    familyId: fixture.familyId,
    familyPayerId: fixture.familyPayerId,
    servicePeriod: fixture.servicePeriod,
    dueDate: fixture.periodEnd,
    quoteHash,
    idempotencyKey,
    actor: fixture.actor,
  };
}

// Plain code-unit order, independent of locale collation.
function byAthleteId(left: { athleteId: string }, right: { athleteId: string }) {
  if (left.athleteId === right.athleteId) return 0;
  return left.athleteId < right.athleteId ? -1 : 1;
}

async function ledgerRows(organizationId: string) {
  const result = await db.execute(sql`
    select
      (select count(*)::int from zaltyko.invoices where organization_id = ${organizationId}::uuid) as invoices,
      (select count(*)::int from zaltyko.invoice_lines where organization_id = ${organizationId}::uuid) as lines,
      (select count(*)::int from zaltyko.invoice_line_enrollments where organization_id = ${organizationId}::uuid) as covered,
      (select count(*)::int from zaltyko.charges where organization_id = ${organizationId}::uuid) as charges,
      (select count(*)::int from zaltyko.outbox_events
        where organization_id = ${organizationId}::uuid and event_name = 'invoice.monthly_issued') as markers
  `);
  return result.rows[0];
}

describeDisposablePg("monthly invoice service on disposable PostgreSQL", () => {
  beforeEach(() => {
    assertDisposableTarget();
  });

  it("issues one fee per athlete at the assigned price and covers every class", async () => {
    const fixture = await seedFamily();
    const family = await quoteFor(fixture);
    expect(family.canIssue).toBe(true);
    // One fee per athlete, at the assignment price (3000 / 3200), not the plan's 3500,
    // covering every class of that athlete. Both sides are sorted explicitly.
    expect(
      family.lines
        .map((line) => ({
          athleteId: line.athleteId,
          pricePlanId: line.pricePlanId,
          amountCents: line.amountCents,
          currency: line.currency,
          coveredEnrollmentIds: line.coveredEnrollments.map((covered) => covered.enrollmentId).sort(),
        }))
        .sort(byAthleteId)
    ).toEqual(
      [
        {
          athleteId: fixture.athleteA.athleteId,
          pricePlanId: fixture.pricePlanId,
          amountCents: 3000,
          currency: "EUR",
          coveredEnrollmentIds: [fixture.enrollmentA1, fixture.enrollmentA2].sort(),
        },
        {
          athleteId: fixture.athleteB.athleteId,
          pricePlanId: fixture.pricePlanId,
          amountCents: 3200,
          currency: "EUR",
          coveredEnrollmentIds: [fixture.enrollmentB1],
        },
      ].sort(byAthleteId)
    );
    expect(family.totalAmountCents).toBe(6200);

    const issued = await issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!));
    expect(issued.replayed).toBe(false);
    expect(issued.invoice).toMatchObject({ status: "issued", currency: "EUR", totalAmountCents: 6200 });
    expect(issued.charges).toHaveLength(2);
    expect(issued.chargeStatus).toBe("due");
    expect(await ledgerRows(fixture.organizationId)).toEqual({
      invoices: 1,
      lines: 2,
      covered: 3,
      charges: 2,
      markers: 1,
    });

    const persisted = await db.execute(sql`
      select coalesce(il.athlete_id::text, '') as athlete_id, il.amount_cents::int as amount_cents,
        c.amount_cents::int as charge_cents, c.collection_mode::text as collection_mode,
        il.service_period_start::text as period_start, il.service_period_end::text as period_end,
        (select count(*)::int from zaltyko.invoice_line_enrollments ile
          where ile.organization_id = il.organization_id and ile.invoice_line_id = il.id) as covered
      from zaltyko.invoice_lines il
      join zaltyko.charges c on c.organization_id = il.organization_id and c.invoice_line_id = il.id
      where il.organization_id = ${fixture.organizationId}::uuid
    `);
    const byAthleteColumn = (left: { athlete_id: unknown }, right: { athlete_id: unknown }) =>
      byAthleteId({ athleteId: String(left.athlete_id) }, { athleteId: String(right.athlete_id) });
    expect([...persisted.rows].sort(byAthleteColumn)).toEqual(
      [
        { athlete_id: fixture.athleteA.athleteId, cents: 3000, covered: 2 },
        { athlete_id: fixture.athleteB.athleteId, cents: 3200, covered: 1 },
      ]
        .sort(byAthleteColumn)
        .map(({ athlete_id, cents, covered }) => ({
          athlete_id,
          amount_cents: cents,
          charge_cents: cents,
          collection_mode: "manual",
          period_start: fixture.periodStart,
          period_end: fixture.periodEnd,
          covered,
        }))
    );
  }, 45_000);

  it("stores the due date as the end of that day in the site's time zone", async () => {
    const fixture = await seedFamily();
    const family = await quoteFor(fixture);
    const issued = await issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!));
    const row = await db.execute(sql`
      select i.due_at = ((${fixture.periodEnd}::date + time '23:59:59.999') at time zone 'Europe/Madrid') as invoice_due,
        bool_and(c.due_at = i.due_at) as charges_due
      from zaltyko.invoices i
      join zaltyko.charges c on c.organization_id = i.organization_id and c.invoice_id = i.id
      where i.organization_id = ${fixture.organizationId}::uuid and i.id = ${issued.invoice.id}::uuid
      group by i.due_at
    `);
    expect(row.rows).toEqual([{ invoice_due: true, charges_due: true }]);
  }, 45_000);

  it("issues one invoice when two different keys race for the same family and month", async () => {
    const fixture = await seedFamily();
    const family = await quoteFor(fixture);
    const results = await Promise.all([
      issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!, `ci-race-a-${randomUUID()}`)),
      issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!, `ci-race-b-${randomUUID()}`)),
    ]);
    // The loser waits on the family locks, finds the period invoice and replays it.
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0]!.invoice.id).toBe(results[1]!.invoice.id);
    expect(await ledgerRows(fixture.organizationId)).toMatchObject({ invoices: 1, markers: 1 });
  }, 45_000);

  it("refuses a quote whose price changed after the preview, without ledger writes", async () => {
    const fixture = await seedFamily();
    const family = await quoteFor(fixture);
    await db.execute(sql`
      update zaltyko.enrollment_price_assignments
      set unit_amount_cents = 3001
      where organization_id = ${fixture.organizationId}::uuid and id = ${fixture.assignmentA1}::uuid
    `);
    await expect(issueMonthlyInvoice(issueCommand(fixture, family.quoteHash!))).rejects.toMatchObject({
      code: "QUOTE_STALE",
      status: 409,
    });
    expect(await ledgerRows(fixture.organizationId)).toEqual({
      invoices: 0,
      lines: 0,
      covered: 0,
      charges: 0,
      markers: 0,
    });
  }, 45_000);

  it("replays the original invoice for the same key after prices change", async () => {
    const fixture = await seedFamily();
    const family = await quoteFor(fixture);
    const command = issueCommand(fixture, family.quoteHash!);
    const first = await issueMonthlyInvoice(command);
    await db.execute(sql`
      update zaltyko.enrollment_price_assignments
      set unit_amount_cents = 9999
      where organization_id = ${fixture.organizationId}::uuid and id = ${fixture.assignmentB1}::uuid
    `);
    const replay = await issueMonthlyInvoice(command);
    expect(replay.replayed).toBe(true);
    expect(replay.invoice.id).toBe(first.invoice.id);
    expect(replay.invoice.totalAmountCents).toBe(6200);
    expect(replay.lines.map((line) => line.amountCents).sort()).toEqual([3000, 3200]);

    // A new quote now reports the month as already invoiced.
    const requote = await quoteFor(fixture);
    expect(requote).toMatchObject({
      existingInvoiceId: first.invoice.id,
      canIssue: false,
    });
    expect(requote.blockingReasons).toContain("PERIOD_ALREADY_INVOICED");
  }, 45_000);
});
