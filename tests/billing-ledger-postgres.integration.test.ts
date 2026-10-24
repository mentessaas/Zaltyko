import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { recordManualPaymentForCharge } from "@/modules/billing/application/ledger-service";
import { getOwnerOperationalSummary } from "@/modules/owner-dashboard/application/operational-summary";

const trackedTables = [
  "audit_log",
  "charges",
  "invoices",
  "outbox_events",
  "payment_allocations",
  "payments",
] as const;
const expectedSuccessfulPaymentDeltas: Record<
  (typeof trackedTables)[number],
  number
> = {
  audit_log: 2,
  charges: 0,
  invoices: 0,
  outbox_events: 2,
  payment_allocations: 1,
  payments: 1,
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

  let parsed: URL;
  try {
    parsed = new URL(process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL ?? "");
  } catch {
    throw new Error("The disposable PostgreSQL target is invalid");
  }
  const connectionString = process.env.ZALTYKO_PG_INTEGRATION_DATABASE_URL;
  const configuredUrls = [
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_POOL,
    process.env.DATABASE_URL_DIRECT,
  ];
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
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
    throw new Error(
      `The integration runner contains forbidden external credential variables: ${activeForbidden.join(", ")}`
    );
  }
}

async function snapshot(organizationId: string) {
  const queries = sql.join(
    trackedTables.map((table) => sql`
      select ${table}::text as table_name,
        count(*)::int as count,
        md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]')) as content_hash
      from ${sql.identifier("zaltyko")}.${sql.identifier(table)} r
      where r.organization_id = ${organizationId}::uuid
    `),
    sql` union all `
  );
  const result = await db.execute(sql`select * from (${queries}) rows order by table_name`);
  return Object.fromEntries(
    result.rows.map((row) => [
      String(row.table_name),
      {
        count: Number(row.count),
        contentHash: String(row.content_hash),
      },
    ])
  ) as Record<(typeof trackedTables)[number], { count: number; contentHash: string }>;
}

async function seedManualLedgerFixture() {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const memberId = randomUUID();
  const locationId = randomUUID();
  const familyId = randomUUID();
  const chargeIds = [randomUUID(), randomUUID()];
  const invoiceIds = chargeIds.map(() => randomUUID());
  const invoiceLineIds = chargeIds.map(() => randomUUID());

  await db.execute(sql`
    insert into auth.users (id, email)
    values (${userId}::uuid, ${`ci-${userId}@example.invalid`})
  `);
  await db.execute(sql`
    insert into zaltyko.organizations (id, name)
    values (${organizationId}::uuid, ${`CI manual ledger ${organizationId}`})
  `);
  await db.execute(sql`
    insert into zaltyko.locations (id, organization_id, code, name)
    values (${locationId}::uuid, ${organizationId}::uuid, 'ci-ledger', 'CI ledger site')
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
    insert into zaltyko.families (id, organization_id)
    values (${familyId}::uuid, ${organizationId}::uuid)
  `);

  const dueAt = new Date(Date.now() + 86_400_000);
  const periodStart = "2026-10-01";
  const periodEnd = "2026-10-31";
  for (let index = 0; index < chargeIds.length; index += 1) {
    const invoiceId = invoiceIds[index]!;
    const invoiceLineId = invoiceLineIds[index]!;
    const chargeId = chargeIds[index]!;
    await db.execute(sql`
      insert into zaltyko.invoices (
        id, organization_id, location_id, family_id, reference, status,
        currency, total_amount_cents, issued_at, due_at, idempotency_key
      ) values (
        ${invoiceId}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
        ${familyId}::uuid, ${`CI-${organizationId}-${index}`}, 'issued',
        'EUR', 1000, now(), ${dueAt.toISOString()}::timestamptz,
        ${`ci-invoice-${organizationId}-${index}`}
      )
    `);
    await db.execute(sql`
      insert into zaltyko.invoice_lines (
        id, organization_id, invoice_id, location_id, line_type, quantity,
        unit_amount_cents, amount_cents, currency, service_period_start,
        service_period_end
      ) values (
        ${invoiceLineId}::uuid, ${organizationId}::uuid, ${invoiceId}::uuid,
        ${locationId}::uuid, 'ci_manual_fee', 1, 1000, 1000, 'EUR',
        ${periodStart}::date, ${periodEnd}::date
      )
    `);
    await db.execute(sql`
      insert into zaltyko.charges (
        id, organization_id, location_id, invoice_id, invoice_line_id,
        family_id, status, amount_cents, currency, due_at,
        service_period_start, service_period_end, idempotency_key
      ) values (
        ${chargeId}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
        ${invoiceId}::uuid, ${invoiceLineId}::uuid, ${familyId}::uuid,
        'due', 1000, 'EUR', ${dueAt.toISOString()}::timestamptz,
        ${periodStart}::date, ${periodEnd}::date,
        ${`ci-charge-${organizationId}-${index}`}
      )
    `);
  }

  return {
    organizationId,
    userId,
    memberId,
    chargeIds,
    actor: { userId, memberId },
  };
}

function paymentCommand(input: {
  organizationId: string;
  chargeId: string;
  actor: { userId: string; memberId: string };
  amountCents: number;
  idempotencyKey: string;
  receivedAt?: string;
}) {
  return {
    organizationId: input.organizationId,
    chargeId: input.chargeId,
    amountCents: input.amountCents,
    method: "bank_transfer" as const,
    reference: "CI synthetic receipt",
    receivedAt: input.receivedAt ?? new Date().toISOString(),
    idempotencyKey: input.idempotencyKey,
    actor: input.actor,
  };
}

describe("manual billing ledger on disposable PostgreSQL", () => {
  it("records one payment and reflects it in the owner summary for concurrent replays", async () => {
    assertDisposableTarget();
    const fixture = await seedManualLedgerFixture();
    const before = await snapshot(fixture.organizationId);
    const receivedAt = new Date().toISOString();
    const command = paymentCommand({
      organizationId: fixture.organizationId,
      chargeId: fixture.chargeIds[0]!,
      actor: fixture.actor,
      amountCents: 300,
      idempotencyKey: `ci-payment-${randomUUID()}`,
      receivedAt,
    });

    const [first, replay] = await Promise.all([
      recordManualPaymentForCharge(command),
      recordManualPaymentForCharge(command),
    ]);

    expect(replay.payment.id).toBe(first.payment.id);
    expect(replay.allocation.id).toBe(first.allocation.id);
    const after = await snapshot(fixture.organizationId);
    for (const table of trackedTables) {
      const beforeRow = before[table];
      const afterRow = after[table];
      const expectedDelta = expectedSuccessfulPaymentDeltas[table];
      expect(afterRow.count - beforeRow.count, table).toBe(expectedDelta);
    }
    expect(after.charges.contentHash).not.toBe(before.charges.contentHash);
    expect(after.invoices.contentHash).not.toBe(before.invoices.contentHash);
    const outbox = await db.execute(sql`
      select event_name, count(*)::int as count
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
      group by event_name
      order by event_name
    `);
    expect(outbox.rows).toEqual([
      { event_name: "payment.allocated", count: 1 },
      { event_name: "payment.manual_recorded", count: 1 },
    ]);
    const audit = await db.execute(sql`
      select action, count(*)::int as count
      from zaltyko.audit_log
      where organization_id = ${fixture.organizationId}::uuid
      group by action
      order by action
    `);
    expect(audit.rows).toEqual([
      { action: "payment.allocated", count: 1 },
      { action: "payment.manual_recorded", count: 1 },
    ]);
    const persisted = await db.execute(sql`
      select c.status as charge_status, c.version as charge_version,
        i.status as invoice_status, i.version as invoice_version
      from zaltyko.charges c
      join zaltyko.invoices i
        on i.organization_id = c.organization_id and i.id = c.invoice_id
      where c.organization_id = ${fixture.organizationId}::uuid
        and c.id = ${fixture.chargeIds[0]}::uuid
    `);
    expect(persisted.rows[0]).toMatchObject({
      charge_status: "partially_paid",
      charge_version: 2,
      invoice_status: "partially_paid",
      invoice_version: 2,
    });

    const organization = await db.execute(sql`
      select default_timezone from zaltyko.organizations
      where id = ${fixture.organizationId}::uuid
    `);
    const timezone = String(organization.rows[0]?.default_timezone ?? "");
    expect(timezone).not.toBe("");
    const paymentDay = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone })
      .format(new Date(receivedAt));
    const beforeDashboardRead = await snapshot(fixture.organizationId);
    const summary = await getOwnerOperationalSummary({
      userId: fixture.userId,
      organizationId: fixture.organizationId,
      from: paymentDay,
      to: paymentDay,
    });
    expect(summary.metrics.paymentsReceived).toMatchObject({
      state: "available",
      count: 1,
      grossByCurrency: [{ currency: "EUR", amountCents: 300 }],
    });
    expect(await snapshot(fixture.organizationId)).toEqual(beforeDashboardRead);
  });

  it("rolls back the losing over-allocation after its payment insert", async () => {
    assertDisposableTarget();
    const fixture = await seedManualLedgerFixture();
    const before = await snapshot(fixture.organizationId);
    const commands = ["a", "b"].map((suffix) =>
      paymentCommand({
        organizationId: fixture.organizationId,
        chargeId: fixture.chargeIds[1]!,
        actor: fixture.actor,
        amountCents: 700,
        idempotencyKey: `ci-overallocate-${suffix}-${randomUUID()}`,
      })
    );

    const results = await Promise.allSettled(
      commands.map((command) => recordManualPaymentForCharge(command))
    );
    const winners = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");
    expect(winners).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      status: "rejected",
      reason: { code: "CHARGE_ALREADY_SETTLED", status: 409 },
    });

    const after = await snapshot(fixture.organizationId);
    for (const table of trackedTables) {
      const beforeRow = before[table];
      const afterRow = after[table];
      const expectedDelta = expectedSuccessfulPaymentDeltas[table];
      expect(afterRow.count - beforeRow.count, table).toBe(expectedDelta);
    }
    expect(after.charges.contentHash).not.toBe(before.charges.contentHash);
    expect(after.invoices.contentHash).not.toBe(before.invoices.contentHash);
    const outbox = await db.execute(sql`
      select event_name, count(*)::int as count
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
      group by event_name
      order by event_name
    `);
    expect(outbox.rows).toEqual([
      { event_name: "payment.allocated", count: 1 },
      { event_name: "payment.manual_recorded", count: 1 },
    ]);
    const audit = await db.execute(sql`
      select action, count(*)::int as count
      from zaltyko.audit_log
      where organization_id = ${fixture.organizationId}::uuid
      group by action
      order by action
    `);
    expect(audit.rows).toEqual([
      { action: "payment.allocated", count: 1 },
      { action: "payment.manual_recorded", count: 1 },
    ]);
    const persisted = await db.execute(sql`
      select c.status as charge_status, c.version as charge_version,
        i.status as invoice_status, i.version as invoice_version,
        (select count(*)::int from zaltyko.payments p
          where p.organization_id = c.organization_id
            and p.idempotency_key like 'ci-overallocate-%') as payment_count,
        (select count(*)::int from zaltyko.payment_allocations pa
          where pa.organization_id = c.organization_id
            and pa.charge_id = c.id) as allocation_count
      from zaltyko.charges c
      join zaltyko.invoices i
        on i.organization_id = c.organization_id and i.id = c.invoice_id
      where c.organization_id = ${fixture.organizationId}::uuid
        and c.id = ${fixture.chargeIds[1]}::uuid
    `);
    expect(persisted.rows[0]).toMatchObject({
      charge_status: "partially_paid",
      charge_version: 2,
      invoice_status: "partially_paid",
      invoice_version: 2,
      payment_count: 1,
      allocation_count: 1,
    });
  });
});
