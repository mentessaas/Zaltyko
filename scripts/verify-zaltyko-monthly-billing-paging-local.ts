import assert from "node:assert/strict";

import { Pool } from "pg";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
  loadIssuedLines,
  loadMonthlyChargeState,
  loadMonthlyFamilyMemberships,
  loadMonthlyReplayState,
} from "@/modules/billing/application/monthly-invoice-service";
import { loadPricePlanCoverage } from "@/modules/billing/application/monthly-price-plan-service";

const LOCAL_ONLY = "ZALTYKO_MONTHLY_BILLING_PAGING_LOCAL";
const ORGANIZATION_ID = "10000000-0000-4000-8000-000000000010";
const LOCATION_ID = "10000000-0000-4000-8000-000000000020";
const FAMILY_ID = "10000000-0000-4000-8000-000000000030";
const TEMPLATE_ID = "10000000-0000-4000-8000-000000000100";
const PRICE_PLAN_ID = "10000000-0000-4000-8000-000000000105";
const INVOICE_ID = "10000000-0000-4000-8000-000000000200";
const ROW_COUNT = 205;

function assertLoopbackUrl(name: string): string {
  const value = process.env[name];
  assert(value, `${name} is required`);
  const parsed = new URL(value);
  assert.equal(parsed.protocol, "postgresql:");
  assert.equal(parsed.hostname, "127.0.0.1");
  assert.equal(parsed.pathname, "/postgres");
  assert.equal(parsed.password, "");
  assert.equal(parsed.port, process.env.ZALTYKO_MONTHLY_BILLING_PAGING_PORT);
  return value;
}

async function seed(pool: Pool): Promise<void> {
  await pool.query(`
    insert into zaltyko.organizations (id, name, status)
    values ('${ORGANIZATION_ID}', 'Synthetic paging academy', 'active');
    insert into zaltyko.locations (id, organization_id, code, name, timezone)
    values ('${LOCATION_ID}', '${ORGANIZATION_ID}', 'paging-test', 'Paging test', 'UTC');
    insert into zaltyko.families (id, organization_id, is_active)
    values ('${FAMILY_ID}', '${ORGANIZATION_ID}', true);
    insert into zaltyko.people (id, organization_id, given_name, family_name)
    select
      ('31000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', 'Synthetic', 'Gymnast ' || n
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.athletes (id, organization_id, person_id)
    select
      ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}',
      ('31000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.family_members (
      id, organization_id, family_id, athlete_id, relationship, starts_on
    )
    select
      ('33000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${FAMILY_ID}',
      ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'other', '2026-10-01'
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.price_plans (
      id, organization_id, name, cadence, amount_cents, currency, is_active
    ) values (
      '${PRICE_PLAN_ID}', '${ORGANIZATION_ID}', 'Synthetic monthly',
      'monthly', 1000, 'EUR', true
    );
    insert into zaltyko.class_templates (
      id, organization_id, location_id, name, capacity, status, effective_from
    ) values (
      '${TEMPLATE_ID}', '${ORGANIZATION_ID}', '${LOCATION_ID}',
      'Synthetic class', 500, 'active', '2026-09-01'
    );
    insert into zaltyko.enrollments (
      id, organization_id, location_id, athlete_id, class_template_id,
      price_plan_id, status, starts_on, source
    )
    select
      ('34000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${TEMPLATE_ID}', '${PRICE_PLAN_ID}', 'active', '2026-10-01', 'owner'
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.enrollment_price_assignments (
      id, organization_id, location_id, enrollment_id, price_plan_id,
      unit_amount_cents, currency, starts_on
    )
    select
      ('35000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      ('34000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${PRICE_PLAN_ID}', 1000, 'EUR', '2026-10-01'
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.price_plan_class_template_coverage (
      id, organization_id, location_id, price_plan_id, class_template_id,
      starts_on, ends_on
    )
    select
      ('36000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}', '${PRICE_PLAN_ID}', '${TEMPLATE_ID}',
      date '2000-01-01' + (n * 3), date '2000-01-01' + (n * 3)
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.invoices (
      id, organization_id, location_id, family_id, reference, status,
      currency, total_amount_cents, issued_at, due_at, idempotency_key
    ) values (
      '${INVOICE_ID}', '${ORGANIZATION_ID}', '${LOCATION_ID}', '${FAMILY_ID}',
      'SYNTHETIC-PAGING-2026-10', 'issued', 'EUR', ${ROW_COUNT * 1000},
      now(), '2026-10-31T12:00:00Z', 'synthetic-paging-invoice'
    );
    insert into zaltyko.invoice_lines (
      id, organization_id, invoice_id, location_id, athlete_id,
      price_plan_id, line_type, quantity, unit_amount_cents, amount_cents,
      currency, service_period_start, service_period_end
    )
    select
      ('37000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${INVOICE_ID}', '${LOCATION_ID}',
      ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${PRICE_PLAN_ID}', 'monthly_fee', 1, 1000, 1000, 'EUR',
      '2026-10-01', '2026-10-31'
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.invoice_line_enrollments (
      organization_id, location_id, athlete_id, invoice_line_id, price_plan_id,
      enrollment_id, class_template_id, price_assignment_id, class_name_snapshot
    )
    select
      '${ORGANIZATION_ID}', '${LOCATION_ID}',
      ('32000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      ('37000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${PRICE_PLAN_ID}',
      ('34000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${TEMPLATE_ID}',
      ('35000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'Synthetic gymnastics class'
    from generate_series(1, ${ROW_COUNT}) as n;
    insert into zaltyko.charges (
      id, organization_id, location_id, invoice_id, invoice_line_id, family_id,
      enrollment_id, collection_mode, status, amount_cents, currency, due_at,
      service_period_start, service_period_end, idempotency_key
    )
    select
      ('38000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${ORGANIZATION_ID}', '${LOCATION_ID}', '${INVOICE_ID}',
      ('37000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      '${FAMILY_ID}',
      ('34000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
      'manual', 'due', 1000, 'EUR', '2026-10-31T12:00:00Z',
      '2026-10-01', '2026-10-31', 'synthetic-paging-charge-' || n
    from generate_series(1, ${ROW_COUNT}) as n;
  `);
}

async function waitForReplayLock(pool: Pool): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ waiting: number }>(`
      select count(*)::int as waiting
      from pg_stat_activity
      where datname = current_database()
        and pid <> pg_backend_pid()
        and wait_event_type = 'Lock'
        and query ilike '%charges%'
        and query ilike '%for update%'
    `);
    if (result.rows[0]?.waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Replay reader did not wait on the held charge lock");
}

async function verifyConcurrentPaymentReplay(pool: Pool): Promise<void> {
  const payment = await pool.connect();
  let paymentOpen = false;
  let replayPromise:
    Promise<Awaited<ReturnType<typeof loadMonthlyReplayState>>> | undefined;
  try {
    await payment.query("begin");
    paymentOpen = true;
    await payment.query(
      `select id from zaltyko.charges
       where organization_id = $1 and invoice_id = $2
       order by id limit 1 for update`,
      [ORGANIZATION_ID, INVOICE_ID]
    );
    replayPromise = db.transaction((tx) =>
      loadMonthlyReplayState(tx, ORGANIZATION_ID, INVOICE_ID)
    );
    await waitForReplayLock(pool);
    await payment.query(
      `update zaltyko.charges set status = 'paid', updated_at = now()
       where id = $1`,
      ["38000000-0000-4000-8000-000000000001"]
    );
    await payment.query(
      `update zaltyko.invoices set status = 'partially_paid', version = version + 1,
       updated_at = now() where id = $1`,
      [INVOICE_ID]
    );
    await payment.query("commit");
    paymentOpen = false;

    const snapshot = await replayPromise;
    assert.equal(snapshot.invoice.status, "partially_paid");
    assert.equal(snapshot.chargeStatus, "mixed");
    assert.equal(snapshot.charges.length, ROW_COUNT);
    assert.equal(
      snapshot.charges.filter((charge) => charge.status === "paid").length,
      1
    );
  } finally {
    if (paymentOpen) await payment.query("rollback").catch(() => undefined);
    if (replayPromise) await replayPromise.catch(() => undefined);
    payment.release();
  }
}

async function verifyRollbackAndSnapshotCut(pool: Pool): Promise<void> {
  const originalCount = ROW_COUNT;
  let rollbackSeen = false;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        alter table zaltyko.invoice_line_enrollments disable trigger user
      `);
      await tx.execute(sql`
        delete from zaltyko.invoice_line_enrollments
        where organization_id = ${ORGANIZATION_ID}::uuid
          and invoice_line_id = ${"37000000-0000-4000-8000-000000000001"}::uuid
      `);
      const lines = await loadIssuedLines(tx, ORGANIZATION_ID, INVOICE_ID);
      assert.equal(lines.length, originalCount);
      assert.equal(
        lines.find(
          (line) => line.athleteId === "32000000-0000-4000-8000-000000000001"
        )?.coveredEnrollments.length,
        0,
        "El lector debe exponer el corte sintético inconsistente al validador"
      );
      throw new Error("rollback synthetic snapshot cut");
    });
  } catch (error) {
    rollbackSeen =
      error instanceof Error &&
      error.message === "rollback synthetic snapshot cut";
  }
  assert.equal(rollbackSeen, true, "La escritura sintética debe revertirse");
  const result = await pool.query<{ count: number }>(
    `
    select count(*)::int as count from zaltyko.invoice_line_enrollments
    where organization_id = $1
  `,
    [ORGANIZATION_ID]
  );
  assert.equal(result.rows[0]?.count, originalCount);
}

async function main(): Promise<void> {
  assert.equal(process.env[LOCAL_ONLY], "1", "Local harness flag is required");
  assertLoopbackUrl("DATABASE_URL");
  assertLoopbackUrl("DATABASE_URL_POOL");
  assertLoopbackUrl("DATABASE_URL_DIRECT");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  try {
    await seed(pool);
    const memberships = await db.transaction((tx) =>
      loadMonthlyFamilyMemberships(tx, ORGANIZATION_ID, FAMILY_ID, {
        start: "2026-10-01",
        end: "2026-10-31",
      })
    );
    assert.equal(memberships.length, ROW_COUNT);
    assert.equal(
      new Set(memberships.map((row) => row.athleteId)).size,
      ROW_COUNT
    );

    const coverage = await db.transaction((tx) =>
      loadPricePlanCoverage(tx, ORGANIZATION_ID, LOCATION_ID, PRICE_PLAN_ID)
    );
    assert.equal(coverage.length, ROW_COUNT);

    const lines = await db.transaction((tx) =>
      loadIssuedLines(tx, ORGANIZATION_ID, INVOICE_ID)
    );
    assert.equal(lines.length, ROW_COUNT);
    assert(lines.every((line) => line.coveredEnrollments.length === 1));
    assert.equal(
      lines.reduce((total, line) => total + line.coveredEnrollments.length, 0),
      ROW_COUNT
    );

    const charges = await db.transaction((tx) =>
      loadMonthlyChargeState(tx, ORGANIZATION_ID, INVOICE_ID)
    );
    assert.equal(charges.charges.length, ROW_COUNT);
    assert.equal(charges.chargeStatus, "due");

    await verifyConcurrentPaymentReplay(pool);
    await verifyRollbackAndSnapshotCut(pool);
    console.log(
      JSON.stringify({
        status: "PASS",
        rowsPerReader: ROW_COUNT,
        familyMemberships: memberships.length,
        pricePlanCoverage: coverage.length,
        invoiceLines: lines.length,
        invoiceLineSnapshots: ROW_COUNT,
        charges: charges.charges.length,
        replayAfterConcurrentPayment:
          "synthetic SQL payment transaction; partially_paid with mixed charge page state",
        inconsistentSnapshotCut: "surfaced and rolled back",
        rollback: "PASS",
      })
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
