import assert from "node:assert/strict";

import { Pool } from "pg";

import { db } from "@/db";
import {
  getMonthlyInvoiceOptions,
  issueMonthlyInvoice,
} from "@/modules/billing/application/monthly-invoice-service";
import { recordManualPaymentForCharge } from "@/modules/billing/application/ledger-service";

const LOCAL_ONLY = "ZALTYKO_MONTHLY_BILLING_PAGING_LOCAL";
const PORT_ENV = "ZALTYKO_MONTHLY_BILLING_PAGING_PORT";
const STATEMENT_TIMEOUT_MS = 8_000;
const LOCK_TIMEOUT_MS = 4_000;
const OBSERVATION_DEADLINE_MS = 3_000;
const ACTIVITY_QUERY_TIMEOUT_MS = 500;
const ACTIVITY_CONNECT_TIMEOUT_MS = 1_000;
const APPLICATION_NAME = "zaltyko_monthly_financial";

const home = {
  organizationId: "10000000-0000-0000-0000-000000000001",
  locationId: "10000000-0000-0000-0000-000000000011",
  otherLocationId: "10000000-0000-4000-8000-000000000001",
  familyId: "10000000-0000-0000-0000-000000000601",
  ownerUserId: "10000000-0000-0000-0000-000000000101",
  ownerMemberId: "10000000-0000-0000-0000-000000000201",
  limitedOwnerUserId: "43000000-0000-4000-8000-000000000001",
  limitedOwnerMemberId: "43000000-0000-4000-8000-000000000002",
  coachUserId: "43000000-0000-4000-8000-000000000003",
  coachMemberId: "43000000-0000-4000-8000-000000000004",
  athleteId: "10000000-0000-0000-0000-000000000401",
  classTemplateId: "10000000-0000-0000-0000-000000000801",
  pricePlanId: "44000000-0000-4000-8000-000000000001",
  enrollmentId: "44000000-0000-4000-8000-000000000002",
  assignmentId: "44000000-0000-4000-8000-000000000003",
  coverageId: "44000000-0000-4000-8000-000000000004",
} as const;

const foreign = {
  organizationId: "20000000-0000-0000-0000-000000000001",
  locationId: "20000000-0000-0000-0000-000000000011",
  familyId: "20000000-0000-0000-0000-000000000601",
  ownerUserId: "20000000-0000-0000-0000-000000000101",
  ownerMemberId: "20000000-0000-0000-0000-000000000201",
  athleteId: "20000000-0000-0000-0000-000000000401",
  classTemplateId: "20000000-0000-0000-0000-000000000801",
  pricePlanId: "45000000-0000-4000-8000-000000000001",
  enrollmentId: "45000000-0000-4000-8000-000000000002",
  assignmentId: "45000000-0000-4000-8000-000000000003",
  coverageId: "45000000-0000-4000-8000-000000000004",
} as const;

type AcademyFixture = typeof home | typeof foreign;
type Actor = { userId: string; memberId: string };

function assertLoopbackUrl(name: string): string {
  const value = process.env[name];
  assert(value, `${name} is required`);
  const parsed = new URL(value);
  assert.equal(parsed.protocol, "postgresql:");
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.pathname, "/postgres");
  assert.equal(parsed.password, "");
  assert.equal(parsed.port, process.env[PORT_ENV]);
  assert.equal(
    parsed.searchParams.get("statement_timeout"),
    String(STATEMENT_TIMEOUT_MS)
  );
  assert.equal(
    parsed.searchParams.get("lock_timeout"),
    String(LOCK_TIMEOUT_MS)
  );
  assert.equal(parsed.searchParams.get("application_name"), APPLICATION_NAME);
  return value;
}

async function seedAcademy(pool: Pool, ids: AcademyFixture): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "insert into zaltyko.price_plans (id, organization_id, name, cadence, amount_cents, currency, is_active) values ($1::uuid, $2::uuid, 'Synthetic monthly financial', 'monthly', 3500, 'EUR', true)",
      [ids.pricePlanId, ids.organizationId]
    );
    await client.query(
      "insert into zaltyko.enrollments (id, organization_id, location_id, athlete_id, class_template_id, price_plan_id, status, starts_on, source) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid, 'active', current_date - 30, 'owner')",
      [
        ids.enrollmentId,
        ids.organizationId,
        ids.locationId,
        ids.athleteId,
        ids.classTemplateId,
        ids.pricePlanId,
      ]
    );
    await client.query(
      "insert into zaltyko.enrollment_price_assignments (id, organization_id, location_id, enrollment_id, price_plan_id, unit_amount_cents, currency, starts_on) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 3500, 'EUR', current_date - 30)",
      [
        ids.assignmentId,
        ids.organizationId,
        ids.locationId,
        ids.enrollmentId,
        ids.pricePlanId,
      ]
    );
    await client.query(
      "insert into zaltyko.price_plan_class_template_coverage (id, organization_id, location_id, price_plan_id, class_template_id, starts_on) values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, current_date - 30)",
      [
        ids.coverageId,
        ids.organizationId,
        ids.locationId,
        ids.pricePlanId,
        ids.classTemplateId,
      ]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seedHomeAuthorizationActors(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "insert into zaltyko.locations (id, organization_id, code, name, timezone) values ($1::uuid, $2::uuid, 'billing-other', 'Billing other', 'UTC')",
      [home.otherLocationId, home.organizationId]
    );
    await client.query(
      "insert into auth.users (id) values ($1::uuid), ($2::uuid)",
      [home.limitedOwnerUserId, home.coachUserId]
    );
    await client.query(
      "insert into zaltyko.organization_members (id, organization_id, user_id, role, status, location_scope_mode) values ($1::uuid, $2::uuid, $3::uuid, 'owner', 'active', 'selected'), ($4::uuid, $2::uuid, $5::uuid, 'coach', 'active', 'all')",
      [
        home.limitedOwnerMemberId,
        home.organizationId,
        home.limitedOwnerUserId,
        home.coachMemberId,
        home.coachUserId,
      ]
    );
    await client.query(
      "insert into zaltyko.member_location_scopes (organization_id, member_id, location_id) values ($1::uuid, $2::uuid, $3::uuid)",
      [home.organizationId, home.limitedOwnerMemberId, home.otherLocationId]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function readFinancialCounts(pool: Pool, organizationId: string) {
  const result = await pool.query<{
    invoices: string;
    invoice_lines: string;
    charges: string;
    payments: string;
    allocations: string;
    outbox: string;
    audit: string;
  }>(
    `
      select
        (select count(*) from zaltyko.invoices where organization_id = $1::uuid)::text as invoices,
        (select count(*) from zaltyko.invoice_lines where organization_id = $1::uuid)::text as invoice_lines,
        (select count(*) from zaltyko.charges where organization_id = $1::uuid)::text as charges,
        (select count(*) from zaltyko.payments where organization_id = $1::uuid)::text as payments,
        (select count(*) from zaltyko.payment_allocations where organization_id = $1::uuid)::text as allocations,
        (select count(*) from zaltyko.outbox_events where organization_id = $1::uuid)::text as outbox,
        (select count(*) from zaltyko.audit_log where organization_id = $1::uuid)::text as audit
    `,
    [organizationId]
  );
  const row = result.rows[0];
  assert(row);
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Number(value)])
  );
}

async function invoiceCommand(
  organizationId: string,
  locationId: string,
  actor: Actor,
  servicePeriod: string,
  idempotencyKey: string
) {
  const options = await getMonthlyInvoiceOptions({
    organizationId,
    locationId,
    servicePeriod,
    actor,
  });
  const eligible = options.families.filter(
    (family) =>
      family.canIssue && family.lines.length > 0 && family.payers.length > 0
  );
  assert.equal(eligible.length, 1);
  const family = eligible[0];
  assert(family);
  const payer = family.payers[0];
  assert(payer);
  assert(family.quoteHash);
  const [year, month] = servicePeriod.split("-").map(Number);
  const dueDate = new Date(Date.UTC(year!, month!, 0))
    .toISOString()
    .slice(0, 10);
  return {
    organizationId,
    locationId,
    familyId: family.familyId,
    familyPayerId: payer.familyPayerId,
    servicePeriod,
    dueDate,
    quoteHash: family.quoteHash,
    idempotencyKey,
    actor,
  };
}

function nextServicePeriod(): string {
  const nextMonth = new Date();
  nextMonth.setUTCDate(1);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  return nextMonth.toISOString().slice(0, 7);
}

async function waitForBlockedRequests(
  activityPool: Pool,
  blockerPid: number,
  applicationName: string,
  deadline: number
): Promise<void> {
  while (Date.now() < deadline) {
    const result = await activityPool.query<{ pid: number }>(
      `
        select activity.pid
        from pg_stat_activity as activity
        where activity.datname = current_database()
          and activity.application_name = $1
          and activity.wait_event_type = 'Lock'
          and $2::integer = any(pg_blocking_pids(activity.pid))
          and activity.query ilike '%pg_advisory_xact_lock%'
        limit 2
      `,
      [applicationName, blockerPid]
    );
    if (result.rows.length === 2) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `Did not observe two ${applicationName} calls behind the barrier`
  );
}

async function withConcurrentCommandBarrier<T>(
  pool: Pool,
  activityPool: Pool,
  organizationId: string,
  commandKey: string,
  applicationName: string,
  invokeTwice: () => [Promise<T>, Promise<T>]
): Promise<[T, T]> {
  const barrier = await pool.connect();
  let barrierOpen = false;
  let requests: [Promise<T>, Promise<T>] | undefined;
  try {
    await barrier.query("begin");
    barrierOpen = true;
    await barrier.query(
      `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`${organizationId}:command:${commandKey}`]
    );
    const deadline = Date.now() + OBSERVATION_DEADLINE_MS;
    requests = invokeTwice();
    void requests[0].catch(() => undefined);
    void requests[1].catch(() => undefined);
    await waitForBlockedRequests(
      activityPool,
      (await barrier.query<{ pid: number }>("select pg_backend_pid() as pid"))
        .rows[0]!.pid,
      applicationName,
      deadline
    );
    await barrier.query("commit");
    barrierOpen = false;
    return await Promise.all(requests);
  } finally {
    if (barrierOpen) await barrier.query("rollback").catch(() => undefined);
    if (requests)
      await Promise.all(
        requests.map((request) => request.catch(() => undefined))
      );
    barrier.release();
  }
}

async function expectOperationalError(
  operation: Promise<unknown>,
  code: string,
  status = 403
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code);
    assert.equal((error as { status?: number }).status, status);
    return true;
  });
}

async function main(): Promise<void> {
  assert.equal(process.env[LOCAL_ONLY], "1", "Local harness flag is required");
  const databaseUrl = assertLoopbackUrl("DATABASE_URL");
  assertLoopbackUrl("DATABASE_URL_POOL");
  assertLoopbackUrl("DATABASE_URL_DIRECT");
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 4,
    connectionTimeoutMillis: 10_000,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    lock_timeout: LOCK_TIMEOUT_MS,
  });
  const activityUrl = new URL(databaseUrl);
  activityUrl.searchParams.set(
    "statement_timeout",
    String(ACTIVITY_QUERY_TIMEOUT_MS)
  );
  activityUrl.searchParams.set(
    "lock_timeout",
    String(ACTIVITY_QUERY_TIMEOUT_MS)
  );
  const activityPool = new Pool({
    connectionString: activityUrl.toString(),
    max: 1,
    connectionTimeoutMillis: ACTIVITY_CONNECT_TIMEOUT_MS,
    statement_timeout: ACTIVITY_QUERY_TIMEOUT_MS,
    lock_timeout: ACTIVITY_QUERY_TIMEOUT_MS,
  });

  try {
    await seedAcademy(pool, home);
    await seedAcademy(pool, foreign);
    await seedHomeAuthorizationActors(pool);

    const owner: Actor = {
      userId: home.ownerUserId,
      memberId: home.ownerMemberId,
    };
    const limitedOwner: Actor = {
      userId: home.limitedOwnerUserId,
      memberId: home.limitedOwnerMemberId,
    };
    const coach: Actor = {
      userId: home.coachUserId,
      memberId: home.coachMemberId,
    };
    const foreignOwner: Actor = {
      userId: foreign.ownerUserId,
      memberId: foreign.ownerMemberId,
    };
    const homeCommand = await invoiceCommand(
      home.organizationId,
      home.locationId,
      owner,
      nextServicePeriod(),
      "synthetic-financial-invoice-home-001"
    );
    const foreignCommand = await invoiceCommand(
      foreign.organizationId,
      foreign.locationId,
      foreignOwner,
      nextServicePeriod(),
      "synthetic-financial-invoice-foreign-001"
    );

    const homeInvoiceBefore = await readFinancialCounts(
      pool,
      home.organizationId
    );
    const homeInvoices = await withConcurrentCommandBarrier(
      pool,
      activityPool,
      home.organizationId,
      `monthly-period:${home.locationId}:${homeCommand.servicePeriod}`,
      APPLICATION_NAME,
      () => [issueMonthlyInvoice(homeCommand), issueMonthlyInvoice(homeCommand)]
    );
    assert.equal(
      new Set(homeInvoices.map((result) => result.invoice.id)).size,
      1
    );
    assert.deepEqual(homeInvoices.map((result) => result.replayed).sort(), [
      false,
      true,
    ]);
    const homeInvoiceAfter = await readFinancialCounts(
      pool,
      home.organizationId
    );
    assert.equal(homeInvoiceAfter.invoices - homeInvoiceBefore.invoices, 1);
    assert.equal(
      homeInvoiceAfter.invoice_lines - homeInvoiceBefore.invoice_lines,
      1
    );
    assert.equal(homeInvoiceAfter.charges - homeInvoiceBefore.charges, 1);

    const divergentInvoiceCounts = await readFinancialCounts(
      pool,
      home.organizationId
    );
    const divergentDueDate = new Date(
      `${homeCommand.dueDate}T00:00:00.000Z`
    );
    divergentDueDate.setUTCDate(divergentDueDate.getUTCDate() - 1);
    await expectOperationalError(
      issueMonthlyInvoice({
        ...homeCommand,
        dueDate: divergentDueDate.toISOString().slice(0, 10),
      }),
      "IDEMPOTENCY_CONFLICT",
      409
    );
    assert.deepEqual(
      await readFinancialCounts(pool, home.organizationId),
      divergentInvoiceCounts
    );

    const homePostInvoiceCounts = await readFinancialCounts(
      pool,
      home.organizationId
    );
    const foreignBeforeInvoiceDenial = await readFinancialCounts(
      pool,
      foreign.organizationId
    );
    await expectOperationalError(
      issueMonthlyInvoice({ ...foreignCommand, actor: owner }),
      "FORBIDDEN"
    );
    assert.deepEqual(
      await readFinancialCounts(pool, foreign.organizationId),
      foreignBeforeInvoiceDenial
    );
    await expectOperationalError(
      issueMonthlyInvoice({ ...homeCommand, actor: limitedOwner }),
      "LOCATION_SCOPE_DENIED"
    );
    assert.deepEqual(
      await readFinancialCounts(pool, home.organizationId),
      homePostInvoiceCounts
    );
    await expectOperationalError(
      issueMonthlyInvoice({ ...homeCommand, actor: coach }),
      "FORBIDDEN"
    );
    assert.deepEqual(
      await readFinancialCounts(pool, home.organizationId),
      homePostInvoiceCounts
    );

    const foreignInvoice = await issueMonthlyInvoice(foreignCommand);
    const homeChargeId = homeInvoices[0]!.charges[0]!.id;
    const foreignChargeId = foreignInvoice.charges[0]!.id;
    const paymentCommand = {
      organizationId: home.organizationId,
      chargeId: homeChargeId,
      amountCents: 100,
      method: "bank_transfer" as const,
      receivedAt: new Date().toISOString(),
      idempotencyKey: "synthetic-financial-payment-home-001",
      actor: owner,
    };

    const paymentBefore = await readFinancialCounts(pool, home.organizationId);
    const paymentResults = await withConcurrentCommandBarrier(
      pool,
      activityPool,
      home.organizationId,
      paymentCommand.idempotencyKey,
      APPLICATION_NAME,
      () => [
        recordManualPaymentForCharge(paymentCommand),
        recordManualPaymentForCharge(paymentCommand),
      ]
    );
    assert.equal(
      new Set(paymentResults.map((result) => result.payment.id)).size,
      1
    );
    assert.equal(
      new Set(paymentResults.map((result) => result.allocation.id)).size,
      1
    );
    const paymentAfter = await readFinancialCounts(pool, home.organizationId);
    assert.equal(paymentAfter.payments - paymentBefore.payments, 1);
    assert.equal(paymentAfter.allocations - paymentBefore.allocations, 1);

    const divergentPaymentCounts = await readFinancialCounts(
      pool,
      home.organizationId
    );
    await expectOperationalError(
      recordManualPaymentForCharge({ ...paymentCommand, amountCents: 101 }),
      "IDEMPOTENCY_CONFLICT",
      409
    );
    assert.deepEqual(
      await readFinancialCounts(pool, home.organizationId),
      divergentPaymentCounts
    );

    const beforePaymentDenials = await readFinancialCounts(
      pool,
      home.organizationId
    );
    const beforeForeignPaymentDenial = await readFinancialCounts(
      pool,
      foreign.organizationId
    );
    await expectOperationalError(
      recordManualPaymentForCharge({
        ...paymentCommand,
        organizationId: foreign.organizationId,
        chargeId: foreignChargeId,
        idempotencyKey: "synthetic-financial-payment-foreign-001",
      }),
      "FORBIDDEN"
    );
    assert.deepEqual(
      await readFinancialCounts(pool, foreign.organizationId),
      beforeForeignPaymentDenial
    );
    await expectOperationalError(
      recordManualPaymentForCharge({ ...paymentCommand, actor: limitedOwner }),
      "LOCATION_SCOPE_DENIED"
    );
    assert.deepEqual(
      await readFinancialCounts(pool, home.organizationId),
      beforePaymentDenials
    );
    await expectOperationalError(
      recordManualPaymentForCharge({ ...paymentCommand, actor: coach }),
      "FORBIDDEN"
    );
    assert.deepEqual(
      await readFinancialCounts(pool, home.organizationId),
      beforePaymentDenials
    );

    console.log(
      JSON.stringify({
        status: "PASS",
        scope: "service-level PostgreSQL only; no HTTP route invoked",
        invoiceConcurrentSameKey: { invoiceRows: 1, replayed: [false, true] },
        invoiceChangedPayload:
          "IDEMPOTENCY_CONFLICT with unchanged financial counts",
        paymentConcurrentSameKey: { paymentRows: 1, allocationRows: 1 },
        paymentChangedPayload:
          "IDEMPOTENCY_CONFLICT with unchanged financial counts",
        deniedServiceCommands: [
          "foreign organization",
          "out-of-scope location",
          "coach role",
        ],
        denialWrites: 0,
      })
    );
  } finally {
    await Promise.all([pool.end(), activityPool.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
