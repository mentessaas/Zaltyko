import { sql } from "drizzle-orm";

import { db } from "@/db";
import {
  type EntitlementPlanCode,
  type EntitlementSnapshot,
  type EntitlementSource,
  type SaasSubscriptionProjection,
} from "@/modules/billing/domain/plan-eligibility";

/**
 * Estado del plan de una academia (derecho vigente y su suscripción SaaS),
 * leído en el servidor. Lo comparten la preferencia de cobro por familia y
 * la disponibilidad de «Conectar Stripe». Solo lee; nunca escribe.
 */
export interface OrganizationPlanState {
  entitlement: EntitlementSnapshot | null;
  subscription: SaasSubscriptionProjection | null;
}

export async function loadOrganizationPlanState(
  executor: Pick<typeof db, "execute">,
  organizationId: string
): Promise<OrganizationPlanState> {
  const result = await executor.execute(sql`
    select
      e.organization_id::text as "entitlementOrganizationId",
      e.plan_code::text as "planCode",
      e.revision as "revision",
      e.source::text as "source",
      e.source_reference as "sourceReference",
      e.subscription_id::text as "entitlementSubscriptionId",
      e.effective_from as "effectiveFrom",
      e.effective_until as "effectiveUntil",
      s.id::text as "subscriptionId",
      s.organization_id::text as "subscriptionOrganizationId",
      s.provider::text as "provider",
      s.environment::text as "environment",
      s.provider_account_reference as "providerAccountReference",
      s.subscription_reference as "subscriptionReference",
      s.plan_code::text as "subscriptionPlanCode",
      s.provider_status as "providerStatus",
      s.current_period_started_at as "currentPeriodStartedAt",
      s.current_period_ends_at as "currentPeriodEndsAt"
    from zaltyko.organization_entitlements e
    left join zaltyko.organization_saas_subscriptions s
      on s.organization_id = e.organization_id and s.id = e.subscription_id
    where e.organization_id = ${organizationId}::uuid
    limit 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return { entitlement: null, subscription: null };

  const entitlement: EntitlementSnapshot = {
    organizationId: String(row.entitlementOrganizationId),
    planCode: String(row.planCode) as EntitlementPlanCode,
    revision: Number(row.revision),
    source: String(row.source) as EntitlementSource,
    sourceReference: String(row.sourceReference),
    subscriptionId:
      typeof row.entitlementSubscriptionId === "string"
        ? row.entitlementSubscriptionId
        : null,
    effectiveFrom: row.effectiveFrom as Date | string,
    effectiveUntil:
      row.effectiveUntil instanceof Date ||
      typeof row.effectiveUntil === "string"
        ? row.effectiveUntil
        : null,
  };

  const subscription =
    typeof row.subscriptionId === "string"
      ? ({
          id: row.subscriptionId,
          organizationId: String(row.subscriptionOrganizationId),
          provider: String(row.provider) as "stripe",
          environment: String(row.environment) as "test" | "live",
          providerAccountReference: String(row.providerAccountReference),
          subscriptionReference: String(row.subscriptionReference),
          planCode: String(
            row.subscriptionPlanCode
          ) as Exclude<EntitlementPlanCode, "free">,
          providerStatus: String(row.providerStatus) as SaasSubscriptionProjection["providerStatus"],
          currentPeriodStartedAt: row.currentPeriodStartedAt as Date | string,
          currentPeriodEndsAt: row.currentPeriodEndsAt as Date | string,
        } satisfies SaasSubscriptionProjection)
      : null;
  return { entitlement, subscription };
}
