import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { getManualPaymentOptions } from "@/modules/billing/application/manual-payments";
import { recordManualPaymentForCharge } from "@/modules/billing/application/ledger-service";
import {
  getMonthlyInvoiceOptions,
  issueMonthlyInvoice,
} from "@/modules/billing/application/monthly-invoice-service";
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

const monthlyInvoiceTrackedTables = [
  "audit_log",
  "charges",
  "invoice_line_enrollments",
  "invoice_lines",
  "invoices",
  "outbox_events",
  "payment_allocations",
  "payments",
] as const;

type MonthlyInvoiceTrackedTable =
  (typeof monthlyInvoiceTrackedTables)[number];

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

function uuidArraySql(values: readonly string[]) {
  if (values.length === 0) return sql`ARRAY[]::uuid[]`;

  return sql`ARRAY[${sql.join(
    values.map((id) => sql`${id}::uuid`),
    sql`, `
  )}]::uuid[]`;
}

async function seedManualPaymentPaginationFixture() {
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const memberId = randomUUID();
  const locationId = randomUUID();
  const otherLocationId = randomUUID();
  const otherOrganizationLocationId = randomUUID();
  const familyId = randomUUID();
  const otherOrganizationFamilyId = randomUUID();
  const invoiceId = randomUUID();
  const otherLocationInvoiceId = randomUUID();
  const otherOrganizationInvoiceId = randomUUID();
  const otherLocationLineId = randomUUID();
  const otherOrganizationLineId = randomUUID();
  const otherLocationChargeId = randomUUID();
  const otherOrganizationChargeId = randomUUID();
  const chargeIds = Array.from({ length: 251 }, () => randomUUID());
  const lineIds = Array.from({ length: chargeIds.length }, () => randomUUID());
  const chargeIdsArray = uuidArraySql(chargeIds);
  const lineIdsArray = uuidArraySql(lineIds);
  const dueAt = "2026-10-31 22:00:00.123456+00";
  const servicePeriodStart = "2026-10-01";
  const servicePeriodEnd = "2026-10-31";

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into auth.users (id, email)
      values (${userId}::uuid, ${`ci-pagination-${userId}@example.invalid`})
    `);
    await tx.execute(sql`
      insert into zaltyko.organizations (id, name)
      values
        (${organizationId}::uuid, ${`CI pagination ${organizationId}`}),
        (${otherOrganizationId}::uuid, ${`CI pagination other ${otherOrganizationId}`})
    `);
    await tx.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name)
      values
        (${locationId}::uuid, ${organizationId}::uuid, 'ci-page-main', 'CI pagination main'),
        (${otherLocationId}::uuid, ${organizationId}::uuid, 'ci-page-other', 'CI pagination other site'),
        (${otherOrganizationLocationId}::uuid, ${otherOrganizationId}::uuid, 'ci-page-foreign', 'CI pagination other academy')
    `);
    await tx.execute(sql`
      insert into zaltyko.organization_members (
        id, organization_id, user_id, role, status, location_scope_mode
      ) values (
        ${memberId}::uuid, ${organizationId}::uuid, ${userId}::uuid,
        'owner', 'active', 'all'
      )
    `);
    await tx.execute(sql`
      insert into zaltyko.families (id, organization_id)
      values
        (${familyId}::uuid, ${organizationId}::uuid),
        (${otherOrganizationFamilyId}::uuid, ${otherOrganizationId}::uuid)
    `);
    await tx.execute(sql`
      insert into zaltyko.invoices (
        id, organization_id, location_id, family_id, reference, status,
        currency, total_amount_cents, issued_at, due_at, idempotency_key
      ) values
        (
          ${invoiceId}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
          ${familyId}::uuid, ${`CI-PAGE-${organizationId}`}, 'issued',
          'EUR', ${chargeIds.length * 100}, now(), ${dueAt}::timestamptz,
          ${`ci-page-invoice-${organizationId}`}
        ),
        (
          ${otherLocationInvoiceId}::uuid, ${organizationId}::uuid,
          ${otherLocationId}::uuid, ${familyId}::uuid,
          ${`CI-PAGE-OTHER-${organizationId}`}, 'issued', 'EUR', 100,
          now(), ${dueAt}::timestamptz, ${`ci-page-other-invoice-${organizationId}`}
        ),
        (
          ${otherOrganizationInvoiceId}::uuid, ${otherOrganizationId}::uuid,
          ${otherOrganizationLocationId}::uuid, ${otherOrganizationFamilyId}::uuid,
          ${`CI-PAGE-FOREIGN-${otherOrganizationId}`}, 'issued', 'EUR', 100,
          now(), ${dueAt}::timestamptz, ${`ci-page-foreign-invoice-${otherOrganizationId}`}
        )
    `);
    await tx.execute(sql`
      insert into zaltyko.invoice_lines (
        id, organization_id, invoice_id, location_id, line_type, quantity,
        unit_amount_cents, amount_cents, currency, service_period_start,
        service_period_end
      )
      select line_id, ${organizationId}::uuid, ${invoiceId}::uuid,
        ${locationId}::uuid, 'ci_manual_fee', 1, 100, 100, 'EUR',
        ${servicePeriodStart}::date, ${servicePeriodEnd}::date
      from unnest(${lineIdsArray}) as line_rows(line_id)
    `);
    await tx.execute(sql`
      insert into zaltyko.invoice_lines (
        id, organization_id, invoice_id, location_id, line_type, quantity,
        unit_amount_cents, amount_cents, currency, service_period_start,
        service_period_end
      ) values
        (
          ${otherLocationLineId}::uuid, ${organizationId}::uuid,
          ${otherLocationInvoiceId}::uuid, ${otherLocationId}::uuid,
          'ci_manual_fee', 1, 100, 100, 'EUR',
          ${servicePeriodStart}::date, ${servicePeriodEnd}::date
        ),
        (
          ${otherOrganizationLineId}::uuid, ${otherOrganizationId}::uuid,
          ${otherOrganizationInvoiceId}::uuid, ${otherOrganizationLocationId}::uuid,
          'ci_manual_fee', 1, 100, 100, 'EUR',
          ${servicePeriodStart}::date, ${servicePeriodEnd}::date
        )
    `);
    await tx.execute(sql`
      insert into zaltyko.charges (
        id, organization_id, location_id, invoice_id, invoice_line_id,
        family_id, status, amount_cents, currency, due_at,
        service_period_start, service_period_end, idempotency_key
      )
      select seeded.charge_id, ${organizationId}::uuid, ${locationId}::uuid,
        ${invoiceId}::uuid, seeded.line_id, ${familyId}::uuid,
        'due', 100, 'EUR',
        case when seeded.item_index = ${chargeIds.length}
          then ${dueAt}::timestamptz + interval '1 microsecond'
          else ${dueAt}::timestamptz
        end,
        ${servicePeriodStart}::date, ${servicePeriodEnd}::date,
        ${`ci-page-charge-${organizationId}-`} || seeded.item_index::text
      from unnest(${chargeIdsArray}, ${lineIdsArray})
        with ordinality as seeded(charge_id, line_id, item_index)
    `);
    await tx.execute(sql`
      insert into zaltyko.charges (
        id, organization_id, location_id, invoice_id, invoice_line_id,
        family_id, status, amount_cents, currency, due_at,
        service_period_start, service_period_end, idempotency_key
      ) values
        (
          ${otherLocationChargeId}::uuid, ${organizationId}::uuid,
          ${otherLocationId}::uuid, ${otherLocationInvoiceId}::uuid,
          ${otherLocationLineId}::uuid, ${familyId}::uuid,
          'due', 100, 'EUR', ${dueAt}::timestamptz,
          ${servicePeriodStart}::date, ${servicePeriodEnd}::date,
          ${`ci-page-other-charge-${organizationId}`}
        ),
        (
          ${otherOrganizationChargeId}::uuid, ${otherOrganizationId}::uuid,
          ${otherOrganizationLocationId}::uuid, ${otherOrganizationInvoiceId}::uuid,
          ${otherOrganizationLineId}::uuid, ${otherOrganizationFamilyId}::uuid,
          'due', 100, 'EUR', ${dueAt}::timestamptz,
          ${servicePeriodStart}::date, ${servicePeriodEnd}::date,
          ${`ci-page-foreign-charge-${otherOrganizationId}`}
        )
    `);
  });

  return {
    organizationId,
    otherOrganizationId,
    userId,
    locationId,
    otherLocationId,
    otherOrganizationLocationId,
    chargeIds,
    otherLocationChargeId,
    otherOrganizationChargeId,
  };
}

async function snapshotMonthlyInvoiceLedger(organizationId: string) {
  const queries = sql.join(
    monthlyInvoiceTrackedTables.map(
      (table) => sql`
        select ${table}::text as table_name,
          count(*)::int as count,
          md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text, '[]')) as content_hash
        from ${sql.identifier("zaltyko")}.${sql.identifier(table)} r
        where r.organization_id = ${organizationId}::uuid
      `
    ),
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
    MonthlyInvoiceTrackedTable,
    { count: number; contentHash: string }
  >;
}

async function seedMonthlyInvoiceFixture() {
  const organizationId = randomUUID();
  const locationId = randomUUID();
  const ownerUserId = randomUUID();
  const ownerMemberId = randomUUID();
  const familyId = randomUUID();
  const athletePersonId = randomUUID();
  const athleteId = randomUUID();
  const guardianPersonId = randomUUID();
  const guardianId = randomUUID();
  const familyGuardianId = randomUUID();
  const familyMemberId = randomUUID();
  const familyPayerId = randomUUID();
  const pricePlanId = randomUUID();
  const classTemplateId = randomUUID();
  const enrollmentId = randomUUID();
  const priceAssignmentId = randomUUID();
  const coverageId = randomUUID();
  const servicePeriod = new Date().toISOString().slice(0, 7);
  const [year, month] = servicePeriod.split("-").map(Number);
  const periodStart = `${servicePeriod}-01`;
  const periodEnd = new Date(Date.UTC(year!, month!, 0))
    .toISOString()
    .slice(0, 10);
  const actor = { userId: ownerUserId, memberId: ownerMemberId };

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into auth.users (id, email)
      values (${ownerUserId}::uuid, ${`ci-monthly-${ownerUserId}@example.invalid`})
    `);
    await tx.execute(sql`
      insert into zaltyko.organizations (id, name)
      values (${organizationId}::uuid, ${`CI monthly invoice ${organizationId}`})
    `);
    await tx.execute(sql`
      insert into zaltyko.locations (id, organization_id, code, name, timezone)
      values (
        ${locationId}::uuid,
        ${organizationId}::uuid,
        ${`ci-${organizationId.slice(0, 8)}`},
        'CI monthly invoice location',
        'Europe/Madrid'
      )
    `);
    await tx.execute(sql`
      insert into zaltyko.organization_members (
        id, organization_id, user_id, role, status, location_scope_mode
      ) values (
        ${ownerMemberId}::uuid,
        ${organizationId}::uuid,
        ${ownerUserId}::uuid,
        'owner', 'active', 'all'
      )
    `);
    await tx.execute(sql`
      insert into zaltyko.families (id, organization_id, is_active)
      values (${familyId}::uuid, ${organizationId}::uuid, true)
    `);
    await tx.execute(sql`
      insert into zaltyko.people (id, organization_id, given_name, family_name)
      values
        (${athletePersonId}::uuid, ${organizationId}::uuid, 'CI', 'Athlete'),
        (${guardianPersonId}::uuid, ${organizationId}::uuid, 'CI', 'Guardian')
    `);
    await tx.execute(sql`
      insert into zaltyko.athletes (id, organization_id, person_id)
      values (${athleteId}::uuid, ${organizationId}::uuid, ${athletePersonId}::uuid)
    `);
    await tx.execute(sql`
      insert into zaltyko.guardians (id, organization_id, person_id)
      values (${guardianId}::uuid, ${organizationId}::uuid, ${guardianPersonId}::uuid)
    `);
    await tx.execute(sql`
      insert into zaltyko.family_guardians (
        id, organization_id, family_id, guardian_id, relationship, is_active
      ) values (
        ${familyGuardianId}::uuid, ${organizationId}::uuid,
        ${familyId}::uuid, ${guardianId}::uuid, 'parent', true
      )
    `);
    await tx.execute(sql`
      insert into zaltyko.family_members (
        id, organization_id, family_id, athlete_id, relationship, starts_on
      ) values (
        ${familyMemberId}::uuid, ${organizationId}::uuid,
        ${familyId}::uuid, ${athleteId}::uuid, 'parent', ${periodStart}::date
      )
    `);
    await tx.execute(sql`
      insert into zaltyko.family_payers (
        id, organization_id, family_id, guardian_id, is_primary, starts_on
      ) values (
        ${familyPayerId}::uuid, ${organizationId}::uuid,
        ${familyId}::uuid, ${guardianId}::uuid, true, ${periodStart}::date
      )
    `);
    await tx.execute(sql`
      insert into zaltyko.price_plans (
        id, organization_id, name, cadence, amount_cents, currency, is_active
      ) values (
        ${pricePlanId}::uuid, ${organizationId}::uuid,
        'CI monthly tariff', 'monthly', 3500, 'EUR', true
      )
    `);
    await tx.execute(sql`
      insert into zaltyko.class_templates (
        id, organization_id, location_id, name, capacity, status, effective_from
      ) values (
        ${classTemplateId}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
        'CI monthly class', 20, 'active', ${periodStart}::date
      )
    `);
    await tx.execute(sql`
      insert into zaltyko.enrollments (
        id, organization_id, location_id, athlete_id, class_template_id,
        price_plan_id, status, starts_on, source
      ) values (
        ${enrollmentId}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
        ${athleteId}::uuid, ${classTemplateId}::uuid, ${pricePlanId}::uuid,
        'active', ${periodStart}::date, 'owner'
      )
    `);
    await tx.execute(sql`
      insert into zaltyko.enrollment_price_assignments (
        id, organization_id, location_id, enrollment_id, price_plan_id,
        unit_amount_cents, currency, starts_on
      ) values (
        ${priceAssignmentId}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
        ${enrollmentId}::uuid, ${pricePlanId}::uuid, 3500, 'EUR', ${periodStart}::date
      )
    `);
    await tx.execute(sql`
      insert into zaltyko.price_plan_class_template_coverage (
        id, organization_id, location_id, price_plan_id, class_template_id, starts_on
      ) values (
        ${coverageId}::uuid, ${organizationId}::uuid, ${locationId}::uuid,
        ${pricePlanId}::uuid, ${classTemplateId}::uuid, ${periodStart}::date
      )
    `);
  });

  return {
    organizationId,
    locationId,
    familyId,
    familyPayerId,
    actor,
    servicePeriod,
    dueDate: periodEnd,
  };
}

async function monthlyInvoiceCommand(
  fixture: Awaited<ReturnType<typeof seedMonthlyInvoiceFixture>>,
  idempotencyKey: string,
  quoteHash?: string
) {
  const options = await getMonthlyInvoiceOptions({
    organizationId: fixture.organizationId,
    locationId: fixture.locationId,
    servicePeriod: fixture.servicePeriod,
    actor: fixture.actor,
  });
  const family = options.families.find(
    (candidate) => candidate.familyId === fixture.familyId
  );
  if (!family?.canIssue || !family.quoteHash || family.payers.length === 0) {
    throw new Error("The disposable monthly invoice fixture is not issuable");
  }
  return {
    organizationId: fixture.organizationId,
    locationId: fixture.locationId,
    familyId: fixture.familyId,
    familyPayerId: fixture.familyPayerId,
    servicePeriod: fixture.servicePeriod,
    dueDate: fixture.dueDate,
    quoteHash: quoteHash ?? family.quoteHash,
    idempotencyKey,
    actor: fixture.actor,
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
  it("keyset-paginates more than 250 real charges without crossing academy or site scope", async () => {
    assertDisposableTarget();
    const fixture = await seedManualPaymentPaginationFixture();
    const seenChargeIds: string[] = [];
    const pageSizes: number[] = [];
    let cursor: string | undefined;
    let firstNextCursor: string | null = null;

    for (let pageNumber = 0; pageNumber < 8; pageNumber += 1) {
      const page = await getManualPaymentOptions({
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        locationId: fixture.locationId,
        ...(cursor ? { cursor } : {}),
      });
      expect(page.selectedLocationId).toBe(fixture.locationId);
      expect(
        page.charges.every((charge) => charge.locationId === fixture.locationId)
      ).toBe(true);
      pageSizes.push(page.charges.length);
      seenChargeIds.push(...page.charges.map((charge) => charge.chargeId));

      if (pageNumber === 0) firstNextCursor = page.nextCursor;
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    expect(pageSizes).toEqual([50, 50, 50, 50, 50, 1]);
    expect(seenChargeIds).toHaveLength(251);
    expect(new Set(seenChargeIds).size).toBe(251);
    expect(seenChargeIds).not.toContain(fixture.otherLocationChargeId);
    expect(seenChargeIds).not.toContain(fixture.otherOrganizationChargeId);

    const expected = await db.execute(sql`
      select c.id::text as charge_id
      from zaltyko.charges c
      inner join zaltyko.invoices i
        on i.organization_id = c.organization_id and i.id = c.invoice_id
      where c.organization_id = ${fixture.organizationId}::uuid
        and c.location_id = ${fixture.locationId}::uuid
        and c.status in ('due', 'partially_paid')
        and i.status not in ('draft', 'void')
        and c.id = any(${uuidArraySql(fixture.chargeIds)})
      order by c.due_at asc, i.reference asc, c.id asc
    `);
    expect(seenChargeIds).toEqual(
      expected.rows.map((row) => String(row.charge_id))
    );

    const firstCursorPayload = JSON.parse(
      Buffer.from(firstNextCursor ?? "", "base64url").toString("utf8")
    ) as {
      lastDueAt?: unknown;
      lastInvoiceReference?: unknown;
      lastChargeId?: unknown;
    };
    expect(firstCursorPayload.lastDueAt).toBe("2026-10-31T22:00:00.123456Z");
    expect(firstCursorPayload.lastInvoiceReference).toBe(
      `CI-PAGE-${fixture.organizationId}`
    );
    expect(firstCursorPayload.lastChargeId).toBe(seenChargeIds[49]);

    await expect(
      getManualPaymentOptions({
        userId: fixture.userId,
        organizationId: fixture.organizationId,
        locationId: fixture.otherLocationId,
        cursor: firstNextCursor ?? undefined,
      })
    ).rejects.toMatchObject({ code: "INVALID_RELATION", status: 400 });

    await expect(
      getManualPaymentOptions({
        userId: fixture.userId,
        organizationId: fixture.otherOrganizationId,
        locationId: fixture.otherOrganizationLocationId,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  }, 45_000);

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

describe("monthly manual invoice issuance on disposable PostgreSQL", () => {
  it("issues once and returns the same invoice for concurrent and subsequent same-key replays", async () => {
    assertDisposableTarget();
    const fixture = await seedMonthlyInvoiceFixture();
    const command = await monthlyInvoiceCommand(
      fixture,
      `ci-monthly-issue-${randomUUID()}`
    );
    const before = await snapshotMonthlyInvoiceLedger(fixture.organizationId);

    const [first, concurrentReplay] = await Promise.all([
      issueMonthlyInvoice(command),
      issueMonthlyInvoice(command),
    ]);
    expect(first.invoice.id).toBe(concurrentReplay.invoice.id);
    expect([first.replayed, concurrentReplay.replayed].sort()).toEqual([
      false,
      true,
    ]);
    expect(first.collectionMode).toBe("manual");
    expect(first.invoice).toMatchObject({
      status: "issued",
      currency: "EUR",
      totalAmountCents: 3500,
    });
    expect(first.lines).toHaveLength(1);
    expect(first.lines[0]).toMatchObject({
      athleteId: expect.any(String),
      amountCents: 3500,
      currency: "EUR",
      coveredEnrollments: [
        expect.objectContaining({ className: "CI monthly class" }),
      ],
    });
    expect(first.charges).toHaveLength(1);
    expect(first.charges[0]).toMatchObject({ status: "due" });

    const explicitReplay = await issueMonthlyInvoice(command);
    expect(explicitReplay.replayed).toBe(true);
    expect(explicitReplay.invoice.id).toBe(first.invoice.id);
    await expect(
      issueMonthlyInvoice({ ...command, dueDate: `${fixture.servicePeriod}-02` })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT", status: 409 });

    const after = await snapshotMonthlyInvoiceLedger(fixture.organizationId);
    const expectedDeltas: Record<MonthlyInvoiceTrackedTable, number> = {
      audit_log: 3,
      charges: 1,
      invoice_line_enrollments: 1,
      invoice_lines: 1,
      invoices: 1,
      outbox_events: 3,
      payment_allocations: 0,
      payments: 0,
    };
    for (const table of monthlyInvoiceTrackedTables) {
      expect(after[table].count - before[table].count, table).toBe(
        expectedDeltas[table]
      );
    }

    const outbox = await db.execute(sql`
      select event_name, count(*)::int as count
      from zaltyko.outbox_events
      where organization_id = ${fixture.organizationId}::uuid
      group by event_name
      order by event_name
    `);
    expect(outbox.rows).toEqual([
      { event_name: "charge.due", count: 1 },
      { event_name: "invoice.issued", count: 1 },
      { event_name: "invoice.monthly_issued", count: 1 },
    ]);
    const audit = await db.execute(sql`
      select action, count(*)::int as count
      from zaltyko.audit_log
      where organization_id = ${fixture.organizationId}::uuid
      group by action
      order by action
    `);
    expect(audit.rows).toEqual([
      { action: "charge.due", count: 1 },
      { action: "invoice.issued", count: 1 },
      { action: "invoice.monthly_issued", count: 1 },
    ]);
    const persisted = await db.execute(sql`
      select i.status as invoice_status, i.total_amount_cents,
        il.line_type, il.service_period_start::text as period_start,
        il.service_period_end::text as period_end,
        c.status as charge_status, c.collection_mode, c.amount_cents
      from zaltyko.invoices i
      join zaltyko.invoice_lines il
        on il.organization_id = i.organization_id and il.invoice_id = i.id
      join zaltyko.charges c
        on c.organization_id = i.organization_id and c.invoice_id = i.id
      where i.organization_id = ${fixture.organizationId}::uuid
        and i.id = ${first.invoice.id}::uuid
    `);
    expect(persisted.rows).toEqual([
      {
        invoice_status: "issued",
        total_amount_cents: "3500",
        line_type: "monthly_fee",
        period_start: `${fixture.servicePeriod}-01`,
        period_end: fixture.dueDate,
        charge_status: "due",
        collection_mode: "manual",
        amount_cents: "3500",
      },
    ]);
  }, 45_000);

  it("rejects a stale quote without creating any invoice ledger records", async () => {
    assertDisposableTarget();
    const fixture = await seedMonthlyInvoiceFixture();
    const quoted = await monthlyInvoiceCommand(
      fixture,
      `ci-monthly-stale-${randomUUID()}`
    );
    await db.execute(sql`
      update zaltyko.enrollment_price_assignments
      set unit_amount_cents = 4200
      where organization_id = ${fixture.organizationId}::uuid
        and enrollment_id = (
          select id from zaltyko.enrollments
          where organization_id = ${fixture.organizationId}::uuid
          limit 1
        )
    `);
    const refreshed = await monthlyInvoiceCommand(
      fixture,
      quoted.idempotencyKey
    );
    expect(refreshed.quoteHash).not.toBe(quoted.quoteHash);
    const before = await snapshotMonthlyInvoiceLedger(fixture.organizationId);

    await expect(issueMonthlyInvoice(quoted)).rejects.toMatchObject({
      code: "QUOTE_STALE",
      status: 409,
    });

    expect(await snapshotMonthlyInvoiceLedger(fixture.organizationId)).toEqual(
      before
    );
  }, 45_000);

  it("rolls back the invoice, lines, charge, outbox, and audit when a ledger write conflicts", async () => {
    assertDisposableTarget();
    const fixture = await seedMonthlyInvoiceFixture();
    const idempotencyKey = `ci-monthly-rollback-${randomUUID()}`;
    const command = await monthlyInvoiceCommand(fixture, idempotencyKey);
    await db.execute(sql`
      insert into zaltyko.audit_log (
        organization_id, location_id, actor_user_id, action, target_type,
        idempotency_key, metadata
      ) values (
        ${fixture.organizationId}::uuid, ${fixture.locationId}::uuid,
        ${fixture.actor.userId}::uuid, 'ci.rollback_probe', 'invoice',
        ${`${idempotencyKey}:charge:0`}, '{}'::jsonb
      )
    `);
    const before = await snapshotMonthlyInvoiceLedger(fixture.organizationId);

    await expect(issueMonthlyInvoice(command)).rejects.toMatchObject({
      cause: {
        code: "23505",
        constraint: "audit_log_idempotency_uq",
      },
    });

    expect(await snapshotMonthlyInvoiceLedger(fixture.organizationId)).toEqual(
      before
    );
    const partialWrites = await db.execute(sql`
      select
        (select count(*)::int from zaltyko.invoices
          where organization_id = ${fixture.organizationId}::uuid
            and idempotency_key = ${idempotencyKey}) as invoices,
        (select count(*)::int from zaltyko.charges
          where organization_id = ${fixture.organizationId}::uuid
            and idempotency_key like ${`${idempotencyKey}:charge:%`}) as charges,
        (select count(*)::int from zaltyko.outbox_events
          where organization_id = ${fixture.organizationId}::uuid
            and idempotency_key like ${`${idempotencyKey}:%`}) as outbox,
        (select count(*)::int from zaltyko.audit_log
          where organization_id = ${fixture.organizationId}::uuid
            and idempotency_key = ${idempotencyKey}) as invoice_audit
    `);
    expect(partialWrites.rows[0]).toEqual({
      invoices: 0,
      charges: 0,
      outbox: 0,
      invoice_audit: 0,
    });
  }, 45_000);
});
