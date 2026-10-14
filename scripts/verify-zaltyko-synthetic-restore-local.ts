import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";

const sourceUrl = requireLocalDatabaseUrl(
  process.env.RESTORE_SOURCE_DATABASE_URL,
  "zaltyko_restore_source"
);
const targetUrl = requireLocalDatabaseUrl(
  process.env.RESTORE_TARGET_DATABASE_URL,
  "zaltyko_restore_target"
);

const ids = {
  organization: "10000000-0000-4000-8000-000000000010",
  ownerUser: "10000000-0000-4000-8000-000000000001",
  otherUser: "20000000-0000-4000-8000-000000000001",
};

const restoreInvoiceIdempotencyKey = "synthetic-restore-november-invoice-001";
const restorePaymentIdempotencyKey = "synthetic-restore-november-payment-001";

function requireLocalDatabaseUrl(
  value: string | undefined,
  expectedDatabase: string
): string {
  assert.ok(value, "Restore verifier requires explicit local database URLs");
  const url = new URL(value);
  assert.equal(url.protocol, "postgresql:");
  assert.equal(
    url.hostname,
    "127.0.0.1",
    "Only loopback PostgreSQL is allowed"
  );
  assert.equal(url.username, "postgres");
  assert.equal(url.password, "");
  assert.equal(url.pathname, `/${expectedDatabase}`);
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  return url.toString();
}

async function readCatalog(pool: Pool) {
  const extensions = await pool.query<{ name: string; version: string }>(`
    select extname as name, extversion as version
    from pg_extension
    where extname in ('btree_gist', 'pgcrypto')
    order by extname
  `);
  const columns = await pool.query(`
    -- pg_dump omits dropped columns, compacting physical attnum gaps.
    -- Preserve visible column order without treating those gaps as data loss.
    select table_schema, table_name, column_name,
           row_number() over (
             partition by table_schema, table_name order by ordinal_position
           )::int as visible_position,
           data_type, is_nullable, coalesce(column_default, '') as column_default
    from information_schema.columns
    where table_schema = 'zaltyko' or (table_schema = 'auth' and table_name = 'users')
    order by table_schema, table_name, ordinal_position
  `);
  const constraints = await pool.query(`
    select n.nspname as schema_name, c.relname as table_name,
           con.conname as constraint_name, con.contype as constraint_type,
           con.convalidated as validated, pg_get_constraintdef(con.oid, true) as definition
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'zaltyko'
    order by n.nspname, c.relname, con.conname
  `);
  const rowSecurity = await pool.query(`
    select c.relname as table_name, c.relrowsecurity as rls_enabled,
           c.relforcerowsecurity as rls_forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'zaltyko' and c.relkind in ('r', 'p')
    order by c.relname
  `);
  const policies = await pool.query(`
    select schemaname, tablename, policyname, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'zaltyko'
    order by tablename, policyname
  `);
  const triggers = await pool.query(`
    select c.relname as table_name, t.tgname as trigger_name,
           t.tgenabled as enabled, pg_get_triggerdef(t.oid, true) as definition
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'zaltyko' and not t.tgisinternal
    order by c.relname, t.tgname
  `);
  const grants = await pool.query(`
    select table_name, grantee, privilege_type, is_grantable
    from information_schema.role_table_grants
    where table_schema = 'zaltyko'
      and grantee in ('anon', 'authenticated', 'service_role')
    order by table_name, grantee, privilege_type
  `);

  return {
    extensions: extensions.rows,
    columns: columns.rows,
    constraints: constraints.rows,
    rowSecurity: rowSecurity.rows,
    policies: policies.rows,
    triggers: triggers.rows,
    grants: grants.rows,
  };
}

async function readMonthlyLedger(pool: Pool) {
  const invoices = await pool.query(
    `
    select distinct i.id, i.status, i.currency,
           i.total_amount_cents::text as total_amount_cents,
           i.voided_at::text as voided_at, i.idempotency_key
    from zaltyko.invoices i
    join zaltyko.invoice_lines l
      on l.organization_id = i.organization_id and l.invoice_id = i.id
    where i.organization_id = $1
      and l.line_type = 'monthly_fee'
      and l.service_period_start = date '2026-11-01'
      and l.service_period_end = date '2026-11-30'
      and i.idempotency_key = $2
    order by i.id
  `,
    [ids.organization, restoreInvoiceIdempotencyKey]
  );
  const invoiceIds = invoices.rows.map((row: { id: string }) => row.id);
  assert.equal(
    invoiceIds.length,
    1,
    "Expected the service-seeded November invoice"
  );

  const octoberVoidGuard = await pool.query(
    `
    select distinct i.id, i.status, i.voided_at::text as voided_at,
           i.idempotency_key
    from zaltyko.invoices i
    join zaltyko.invoice_lines l
      on l.organization_id = i.organization_id and l.invoice_id = i.id
    where i.organization_id = $1
      and i.status = 'void'
      and l.line_type = 'monthly_fee'
      and l.service_period_start = date '2026-10-01'
      and l.service_period_end = date '2026-10-31'
      and i.idempotency_key = any($2::text[])
    order by i.id
  `,
    [
      ids.organization,
      ["monthly-invoice-issue-001", "monthly-invoice-issue-concurrent-002"],
    ]
  );
  assert.equal(octoberVoidGuard.rows.length, 1);
  assert.equal(octoberVoidGuard.rows[0].status, "void");
  assert.ok(octoberVoidGuard.rows[0].voided_at);

  const lines = await pool.query(
    `
    select id, athlete_id, enrollment_id, price_plan_id,
           amount_cents::text as amount_cents, currency,
           service_period_start, service_period_end
    from zaltyko.invoice_lines
    where organization_id = $1 and invoice_id = $2
    order by id
  `,
    [ids.organization, invoiceIds[0]]
  );
  const lineIds = lines.rows.map((row: { id: string }) => row.id);
  const snapshots = await pool.query(
    `
    select invoice_line_id, athlete_id, enrollment_id, class_template_id,
           price_assignment_id, class_name_snapshot
    from zaltyko.invoice_line_enrollments
    where organization_id = $1 and invoice_line_id = any($2::uuid[])
    order by invoice_line_id, enrollment_id
  `,
    [ids.organization, lineIds]
  );
  const charges = await pool.query(
    `
    select id, invoice_line_id, status, collection_mode,
           amount_cents::text as amount_cents, currency
    from zaltyko.charges
    where organization_id = $1 and invoice_id = $2
    order by id
  `,
    [ids.organization, invoiceIds[0]]
  );
  const payments = await pool.query(
    `
    select id, source, status, amount_cents::text as amount_cents,
           currency, processor, provider_payment_id, manual_method, idempotency_key
    from zaltyko.payments
    where organization_id = $1 and idempotency_key = $2
    order by id
  `,
    [ids.organization, restorePaymentIdempotencyKey]
  );
  const paymentIds = payments.rows.map((row: { id: string }) => row.id);
  const allocations = await pool.query(
    `
    select payment_id, charge_id, amount_cents::text as amount_cents, currency
    from zaltyko.payment_allocations
    where organization_id = $1 and payment_id = any($2::uuid[])
    order by payment_id, charge_id
  `,
    [ids.organization, paymentIds]
  );
  const consent = await pool.query(
    `
    select state, policy_version, source, consent_proof
    from zaltyko.owner_signup_consents
    where user_id = $1
  `,
    [ids.ownerUser]
  );
  const consentAudit = await pool.query(
    `
    select event, policy_version, source, consent_proof
    from zaltyko.owner_signup_consent_audits
    where user_id = $1
    order by recorded_at, id
  `,
    [ids.ownerUser]
  );

  assert(lines.rows.length > 0);
  assert(lines.rows.every((line) => line.enrollment_id === null));
  assert(snapshots.rows.length >= lines.rows.length);
  assert.equal(
    new Set(snapshots.rows.map((snapshot) => snapshot.invoice_line_id)).size,
    lines.rows.length,
    "Every monthly invoice line must retain at least one enrollment snapshot"
  );
  assert.equal(charges.rows.length, lines.rows.length);
  assert.equal(payments.rows.length, 1);
  assert.equal(payments.rows[0].source, "manual");
  assert.equal(payments.rows[0].status, "succeeded");
  assert.equal(payments.rows[0].processor, null);
  assert.equal(payments.rows[0].provider_payment_id, null);
  assert.equal(allocations.rows.length, 1);
  assert.equal(allocations.rows[0].amount_cents, "1");
  assert(charges.rows.some((charge) => charge.status === "partially_paid"));
  assert(
    charges.rows.every((charge) =>
      ["due", "partially_paid"].includes(charge.status)
    )
  );
  assert.equal(invoices.rows[0].idempotency_key, restoreInvoiceIdempotencyKey);
  assert.equal(invoices.rows[0].voided_at, null);
  assert.equal(consent.rows.length, 1);
  assert.equal(consentAudit.rows.length, 1);

  const invoiceTotal = Number(invoices.rows[0].total_amount_cents);
  const lineTotal = lines.rows.reduce(
    (total, line) => total + Number(line.amount_cents),
    0
  );
  const chargeTotal = charges.rows.reduce(
    (total, charge) => total + Number(charge.amount_cents),
    0
  );
  const paymentTotal = Number(payments.rows[0].amount_cents);
  const allocationTotal = allocations.rows.reduce(
    (total, allocation) => total + Number(allocation.amount_cents),
    0
  );
  assert(invoiceTotal > paymentTotal);
  assert.equal(lineTotal, invoiceTotal);
  assert.equal(chargeTotal, invoiceTotal);
  assert.equal(paymentTotal, allocationTotal);
  assert.equal(paymentTotal, 1);
  assert.equal(invoices.rows[0].status, "partially_paid");

  return {
    invoices: invoices.rows,
    octoberVoidGuard: octoberVoidGuard.rows,
    lines: lines.rows,
    snapshots: snapshots.rows,
    charges: charges.rows,
    payments: payments.rows,
    allocations: allocations.rows,
    consent: consent.rows,
    consentAudit: consentAudit.rows,
    reconciliation: {
      invoiceTotal,
      lineTotal,
      chargeTotal,
      paymentTotal,
      allocationTotal,
    },
  };
}

async function verifyRls(pool: Pool): Promise<void> {
  const catalog = await pool.query<{
    table_name: string;
    rls_enabled: boolean;
    rls_forced: boolean;
  }>(
    `
    select c.relname as table_name, c.relrowsecurity as rls_enabled,
           c.relforcerowsecurity as rls_forced
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'zaltyko'
      and c.relname = any($1::text[])
    order by c.relname
  `,
    [
      [
        "invoice_line_enrollments",
        "price_plan_class_template_coverage",
        "owner_signup_consents",
        "owner_signup_consent_audits",
      ],
    ]
  );
  assert.equal(catalog.rows.length, 4);
  assert(catalog.rows.every((row) => row.rls_enabled && row.rls_forced));

  const privileges = await pool.query<{
    anon_read: boolean;
    authenticated_snapshot_read: boolean;
    service_snapshot_read: boolean;
    service_snapshot_insert: boolean;
  }>(`
    select has_table_privilege('anon', 'zaltyko.invoice_line_enrollments', 'select') as anon_read,
           has_table_privilege('authenticated', 'zaltyko.invoice_line_enrollments', 'select') as authenticated_snapshot_read,
           has_table_privilege('service_role', 'zaltyko.invoice_line_enrollments', 'select') as service_snapshot_read,
           has_table_privilege('service_role', 'zaltyko.invoice_line_enrollments', 'insert') as service_snapshot_insert
  `);
  assert.deepEqual(privileges.rows[0], {
    anon_read: false,
    authenticated_snapshot_read: false,
    service_snapshot_read: true,
    service_snapshot_insert: true,
  });

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
      ids.ownerUser,
    ]);
    const ownConsent = await client.query(
      "select count(*)::int as count from zaltyko.owner_signup_consents"
    );
    assert.equal(ownConsent.rows[0].count, 1);
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
      ids.otherUser,
    ]);
    const crossUserConsent = await client.query(
      "select count(*)::int as count from zaltyko.owner_signup_consents"
    );
    assert.equal(crossUserConsent.rows[0].count, 0);
    await client.query("rollback");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function expectImmutableFailure(
  client: PoolClient,
  label: string,
  sql: string
): Promise<void> {
  await client.query("begin");
  let failure: unknown;
  try {
    await client.query(sql);
  } catch (error) {
    failure = error;
  }
  await client.query("rollback");
  assert(failure instanceof Error, `${label} unexpectedly succeeded`);
  assert.match(
    failure.message,
    /immutable|append.only/i,
    `${label} failed for another reason`
  );
}

async function verifyImmutability(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await expectImmutableFailure(
      client,
      "invoice snapshot update",
      `update zaltyko.invoice_line_enrollments
       set class_name_snapshot = 'restore-mutation-probe'
       where organization_id = '${ids.organization}'`
    );
    await expectImmutableFailure(
      client,
      "invoice snapshot truncate",
      "truncate table zaltyko.invoice_line_enrollments"
    );
    await expectImmutableFailure(
      client,
      "consent audit update",
      `update zaltyko.owner_signup_consent_audits
       set event = 're_grant'
       where user_id = '${ids.ownerUser}'`
    );
    await expectImmutableFailure(
      client,
      "consent audit truncate",
      "truncate table zaltyko.owner_signup_consent_audits"
    );
  } finally {
    client.release();
  }
}

const sourcePool = new Pool({ connectionString: sourceUrl, max: 2 });
const targetPool = new Pool({ connectionString: targetUrl, max: 2 });

async function main(): Promise<void> {
  try {
    const [sourceCatalog, targetCatalog] = await Promise.all([
      readCatalog(sourcePool),
      readCatalog(targetPool),
    ]);
    assert.deepEqual(
      targetCatalog,
      sourceCatalog,
      "Restored PostgreSQL catalog differs"
    );

    const [sourceLedger, targetLedger] = await Promise.all([
      readMonthlyLedger(sourcePool),
      readMonthlyLedger(targetPool),
    ]);
    assert.deepEqual(
      targetLedger,
      sourceLedger,
      "Restored financial ledger differs"
    );

    await Promise.all([
      verifyRls(sourcePool),
      verifyRls(targetPool),
      verifyImmutability(sourcePool),
      verifyImmutability(targetPool),
    ]);

    const catalogSha256 = createHash("sha256")
      .update(JSON.stringify(sourceCatalog))
      .digest("hex");
    console.log(
      JSON.stringify({
        status: "PASS",
        databases: 2,
        catalogTables: sourceCatalog.rowSecurity.length,
        catalogConstraints: sourceCatalog.constraints.length,
        catalogPolicies: sourceCatalog.policies.length,
        catalogTriggers: sourceCatalog.triggers.length,
        catalogSha256,
        monthlyLedger: {
          invoices: sourceLedger.invoices.length,
          octoberVoidGuardFixtures: sourceLedger.octoberVoidGuard.length,
          lines: sourceLedger.lines.length,
          enrollmentSnapshots: sourceLedger.snapshots.length,
          charges: sourceLedger.charges.length,
          manualPayments: sourceLedger.payments.length,
          consentAudits: sourceLedger.consentAudit.length,
          reconciled: true,
        },
        octoberGuardFixture: {
          status: sourceLedger.octoberVoidGuard[0].status,
          restoreFidelityOnly: true,
          validVoidLifecycleClaimed: false,
        },
        rls: "forced and cross-user consent read denied",
        immutabilityChecks: 8,
        databaseScope: "loopback-only",
      })
    );
  } finally {
    await Promise.all([sourcePool.end(), targetPool.end()]);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
