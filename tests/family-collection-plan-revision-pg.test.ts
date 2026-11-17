/**
 * Cobro automático (Fase 3): «último cambio real del plan» sobre PostgreSQL
 * desechable de GitHub, con los triggers reales de revisión e historial
 * (guard_entitlement_revision, record_entitlement_revision).
 *
 * Una renovación de Stripe (otra factura y otro periodo con la misma
 * suscripción y el mismo plan) sube la revisión vigente pero no la del último
 * cambio real; un cambio de plan, de contrato o una bajada a Free sí.
 *
 * Cada test crea su propia academia con ids aleatorios. Las academias se
 * quedan, como en las demás suites: su historial de plan es append-only.
 */
import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { loadPlanChangeRevision } from "@/modules/billing/application/plan-state";
import { isPreferenceRevisionCurrent } from "@/modules/billing/domain/collection-eligibility";
import {
  grantOrganizationEntitlement,
  lockOrganizationForSaasMutation,
} from "@/modules/saas-billing/application/entitlement-service";

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
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    parsed.username !== "supabase_admin" ||
    !parsed.port ||
    !parsed.password ||
    parsed.pathname !== "/postgres" ||
    [process.env.DATABASE_URL, process.env.DATABASE_URL_POOL, process.env.DATABASE_URL_DIRECT].some(
      (value) => value !== connectionString
    )
  ) {
    throw new Error("The integration suite refuses an unexpected PostgreSQL identity");
  }
  for (const name of [
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_DB_PASSWORD",
    "SUPABASE_DB_URL",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_SERVICE_ROLE_KEY",
    "E2E_TARGET_SUPABASE_PROJECT_REF",
    "STRIPE_SAAS_TEST_SECRET_KEY",
    "STRIPE_SAAS_LIVE_SECRET_KEY",
    "VERCEL_TOKEN",
  ]) {
    if (process.env[name]) throw new Error("External credentials are forbidden");
  }
}

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 1);

function period(index: number) {
  return {
    from: new Date(START + index * 30 * DAY).toISOString(),
    until: new Date(START + (index + 1) * 30 * DAY).toISOString(),
  };
}

/** Academia nueva: el trigger de organizations siembra Free (revisión 1). */
async function seedOrganization(): Promise<{ organizationId: string; subscriptionId: string }> {
  const organizationId = randomUUID();
  const subscriptionId = randomUUID();
  const short = organizationId.replace(/-/g, "").slice(0, 12);
  const account = `acct_ci_plan_${short}`;
  const customer = `cus_ci_plan_${short}`;
  await db.execute(sql`
    insert into zaltyko.organizations (id, name, status)
    values (${organizationId}::uuid, ${`CI plan revision ${short}`}, 'active')
  `);
  await db.execute(sql`
    insert into zaltyko.organization_saas_customers (
      organization_id, environment, provider_account_reference, customer_reference,
      status, creation_idempotency_key, creation_request_hash
    ) values (
      ${organizationId}::uuid, 'test', ${account}, ${customer},
      'ready', ${`ci-plan-customer-${organizationId}`}, ${"a".repeat(64)}
    )
  `);
  const first = period(0);
  await db.execute(sql`
    insert into zaltyko.organization_saas_subscriptions (
      id, organization_id, environment, provider_account_reference,
      customer_reference, subscription_reference, price_reference, plan_code,
      provider_status, billing_interval, current_period_started_at,
      current_period_ends_at, last_provider_event_reference, last_synced_at,
      updated_at
    ) values (
      ${subscriptionId}::uuid, ${organizationId}::uuid, 'test', ${account},
      ${customer}, ${`sub_ci_plan_${short}`}, 'price_ci_starter_month', 'starter',
      'active', 'month', ${first.from}::timestamptz,
      ${first.until}::timestamptz, 'evt_ci_plan_seed', clock_timestamp(),
      clock_timestamp()
    )
  `);
  return { organizationId, subscriptionId };
}

/** Concede un periodo pagado de Stripe (cada factura es una referencia nueva). */
async function grantStripe(
  organizationId: string,
  subscriptionId: string,
  input: { planCode: "starter" | "growth"; invoice: string; periodIndex: number }
) {
  const { from, until } = period(input.periodIndex);
  await db.execute(sql`
    update zaltyko.organization_entitlements
       set plan_code = ${input.planCode}::zaltyko.saas_plan_code,
           source = 'stripe_subscription',
           source_reference = ${`stripe-invoice:${input.invoice}`},
           subscription_id = ${subscriptionId}::uuid,
           trial_id = null,
           effective_from = ${from}::timestamptz,
           effective_until = ${until}::timestamptz
     where organization_id = ${organizationId}::uuid
  `);
}

async function grantContract(organizationId: string, reference: string, periodIndex: number) {
  const { from, until } = period(periodIndex);
  await db.execute(sql`
    update zaltyko.organization_entitlements
       set plan_code = 'growth',
           source = 'contract',
           source_reference = ${`founder:${reference}`},
           subscription_id = null,
           trial_id = null,
           effective_from = ${from}::timestamptz,
           effective_until = ${until}::timestamptz
     where organization_id = ${organizationId}::uuid
  `);
}

async function dropToFree(organizationId: string, periodIndex: number) {
  const { from } = period(periodIndex);
  await db.execute(sql`
    update zaltyko.organization_entitlements
       set plan_code = 'free',
           source = 'bootstrap',
           source_reference = ${`organization-created:${organizationId}`},
           subscription_id = null,
           trial_id = null,
           effective_from = ${from}::timestamptz,
           effective_until = null
     where organization_id = ${organizationId}::uuid
  `);
}

async function currentRevision(organizationId: string): Promise<number> {
  const result = await db.execute(sql`
    select revision from zaltyko.organization_entitlements
     where organization_id = ${organizationId}::uuid
  `);
  return Number((result.rows[0] as { revision: unknown }).revision);
}

describeDisposablePg("loadPlanChangeRevision", () => {
  beforeAll(() => {
    assertDisposableTarget();
  });

  it("una academia recién creada: el último cambio real es la revisión 1", async () => {
    const { organizationId } = await seedOrganization();
    expect(await currentRevision(organizationId)).toBe(1);
    expect(await loadPlanChangeRevision(db, organizationId)).toBe(1);
  });

  it("sin derecho de plan devuelve null", async () => {
    expect(await loadPlanChangeRevision(db, randomUUID())).toBeNull();
  });

  it("las renovaciones de Stripe no mueven el último cambio real y la preferencia sigue valiendo", async () => {
    const { organizationId, subscriptionId } = await seedOrganization();
    await grantStripe(organizationId, subscriptionId, { planCode: "starter", invoice: "in_ci_1", periodIndex: 0 });
    const savedUnder = await currentRevision(organizationId);
    expect(savedUnder).toBe(2);
    await grantStripe(organizationId, subscriptionId, { planCode: "starter", invoice: "in_ci_2", periodIndex: 1 });
    // La tercera renovación entra por el mismo camino que invoice.paid
    // (webhook-service → grantOrganizationEntitlement), con el bloqueo de la academia.
    const third = period(2);
    await db.transaction(async (tx) => {
      await lockOrganizationForSaasMutation(tx, organizationId);
      await grantOrganizationEntitlement(tx, {
        organizationId,
        planCode: "starter",
        source: "stripe_subscription",
        sourceReference: "stripe-invoice:in_ci_3",
        subscriptionId,
        trialId: null,
        effectiveFrom: new Date(third.from),
        effectiveUntil: new Date(third.until),
      });
    });

    const current = await currentRevision(organizationId);
    expect(current).toBe(4);
    const change = await loadPlanChangeRevision(db, organizationId);
    expect(change).toBe(2);
    expect(
      isPreferenceRevisionCurrent({ preferenceRevision: savedUnder, currentRevision: current, planChangeRevision: change })
    ).toBe(true);
  });

  it("un cambio de plan en la misma suscripción invalida la preferencia guardada antes", async () => {
    const { organizationId, subscriptionId } = await seedOrganization();
    await grantStripe(organizationId, subscriptionId, { planCode: "starter", invoice: "in_ci_1", periodIndex: 0 });
    await grantStripe(organizationId, subscriptionId, { planCode: "starter", invoice: "in_ci_2", periodIndex: 1 });
    const savedUnder = await currentRevision(organizationId);
    await grantStripe(organizationId, subscriptionId, { planCode: "growth", invoice: "in_ci_3", periodIndex: 2 });
    await grantStripe(organizationId, subscriptionId, { planCode: "growth", invoice: "in_ci_4", periodIndex: 3 });

    const current = await currentRevision(organizationId);
    expect(current).toBe(5);
    const change = await loadPlanChangeRevision(db, organizationId);
    expect(change).toBe(4);
    expect(
      isPreferenceRevisionCurrent({ preferenceRevision: savedUnder, currentRevision: current, planChangeRevision: change })
    ).toBe(false);
  });

  it("una bajada a Free y vuelta al mismo plan y suscripción es un cambio real", async () => {
    const { organizationId, subscriptionId } = await seedOrganization();
    await grantStripe(organizationId, subscriptionId, { planCode: "starter", invoice: "in_ci_1", periodIndex: 0 });
    await dropToFree(organizationId, 1);
    await grantStripe(organizationId, subscriptionId, { planCode: "starter", invoice: "in_ci_2", periodIndex: 2 });

    expect(await currentRevision(organizationId)).toBe(4);
    expect(await loadPlanChangeRevision(db, organizationId)).toBe(4);
  });

  it("otro contrato (otra referencia) es un cambio real; Stripe → contrato también", async () => {
    const { organizationId, subscriptionId } = await seedOrganization();
    await grantStripe(organizationId, subscriptionId, { planCode: "growth", invoice: "in_ci_1", periodIndex: 0 });
    await grantContract(organizationId, "ci-contrato-a", 1);
    expect(await loadPlanChangeRevision(db, organizationId)).toBe(3);
    await grantContract(organizationId, "ci-contrato-b", 2);
    expect(await currentRevision(organizationId)).toBe(4);
    expect(await loadPlanChangeRevision(db, organizationId)).toBe(4);
  });
});
