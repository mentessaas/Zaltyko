import { sql } from "drizzle-orm";

import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export type EffectiveSaasPlanCode = "free" | "starter" | "growth" | "network";
export type EffectiveEntitlementSource =
  "bootstrap" | "stripe_subscription" | "contract" | "trial" | "trial_expired";

export interface EffectiveOrganizationEntitlement {
  planCode: EffectiveSaasPlanCode;
  limits: {
    athleteLimit: number | null;
    groupLimit: number | null;
    classLimit: number | null;
    academyLimit: number | null;
  };
  source: EffectiveEntitlementSource;
  revision: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
}

const PLAN_LIMITS: Record<
  EffectiveSaasPlanCode,
  EffectiveOrganizationEntitlement["limits"]
> = {
  free: { athleteLimit: 30, groupLimit: 3, classLimit: 10, academyLimit: 1 },
  starter: { athleteLimit: 75, groupLimit: 5, classLimit: 20, academyLimit: 1 },
  growth: {
    athleteLimit: 200,
    groupLimit: 10,
    classLimit: 40,
    academyLimit: 1,
  },
  network: {
    athleteLimit: null,
    groupLimit: null,
    classLimit: null,
    academyLimit: null,
  },
};

/**
 * Serializes any SaaS entitlement/capacity mutation with trial and checkout
 * operations. Call this before counting or creating a limited resource.
 */
export async function lockOrganizationForSaasMutation(
  tx: TransactionClient,
  organizationId: string
): Promise<void> {
  const result = await tx.execute(sql`
    select id
    from zaltyko.organizations
    where id = ${organizationId}::uuid
    for update
  `);
  if (result.rows.length === 0) {
    throw new OperationalError("NOT_FOUND", "Organización no encontrada", 404);
  }
}

/**
 * Reads the server-owned effective plan within the caller's transaction.
 * Limits are evaluated against the clock supplied by the caller, which keeps
 * capacity checks and trial boundaries consistent inside one operation.
 */
export async function resolveEffectiveOrganizationEntitlement(
  tx: TransactionClient,
  organizationId: string,
  at: Date = new Date()
): Promise<EffectiveOrganizationEntitlement> {
  if (!Number.isFinite(at.getTime())) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "La fecha de evaluación del plan no es válida",
      503
    );
  }

  const result = await tx.execute(sql`
    select
      e.plan_code,
      e.source,
      e.revision,
      e.effective_from,
      e.effective_until,
      e.subscription_id,
      e.trial_id,
      t.id as joined_trial_id,
      t.status as trial_status,
      t.ends_at as trial_ends_at,
      s.id as joined_subscription_id,
      s.plan_code as subscription_plan_code,
      s.provider_status as subscription_provider_status,
      s.current_period_ends_at as subscription_period_ends_at
    from zaltyko.organizations o
    left join zaltyko.organization_entitlements e
      on e.organization_id = o.id
    left join zaltyko.organization_saas_trials t
      on t.organization_id = e.organization_id
      and t.id = e.trial_id
    left join zaltyko.organization_saas_subscriptions s
      on s.organization_id = e.organization_id
      and s.id = e.subscription_id
    where o.id = ${organizationId}::uuid
    limit 1
  `);

  const row = result.rows[0] as
    | {
        plan_code: string | null;
        source: string | null;
        revision: number | string | null;
        effective_from: Date | string | null;
        effective_until: Date | string | null;
        subscription_id: string | null;
        trial_id: string | null;
        joined_trial_id: string | null;
        trial_status: string | null;
        trial_ends_at: Date | string | null;
        joined_subscription_id: string | null;
        subscription_plan_code: string | null;
        subscription_provider_status: string | null;
        subscription_period_ends_at: Date | string | null;
      }
    | undefined;
  if (!row) {
    throw new OperationalError("NOT_FOUND", "Organización no encontrada", 404);
  }

  if (
    !row.plan_code ||
    !row.source ||
    row.revision === null ||
    !row.effective_from ||
    !isPlanCode(row.plan_code) ||
    !isEntitlementSource(row.source)
  ) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "La organización no tiene un entitlement SaaS válido",
      503
    );
  }

  const effectiveFrom = new Date(row.effective_from);
  const revision = Number(row.revision);
  const effectiveUntil = row.effective_until
    ? new Date(row.effective_until)
    : null;
  const trialEndsAt = row.trial_ends_at ? new Date(row.trial_ends_at) : null;
  const subscriptionPeriodEndsAt = row.subscription_period_ends_at
    ? new Date(row.subscription_period_ends_at)
    : null;
  const dateValues = [
    effectiveFrom,
    effectiveUntil,
    trialEndsAt,
    subscriptionPeriodEndsAt,
  ].filter((value): value is Date => value !== null);
  if (dateValues.some((value) => !Number.isFinite(value.getTime()))) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "El entitlement SaaS contiene una fecha no válida",
      503
    );
  }
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "La revisión del entitlement SaaS no es válida",
      503
    );
  }

  const source = row.source;
  const planCode = row.plan_code;
  const trialReferenceValid =
    row.trial_id !== null &&
    row.trial_id === row.joined_trial_id &&
    trialEndsAt !== null;
  const activeTrialWindowValid =
    trialReferenceValid &&
    trialEndsAt !== null &&
    effectiveUntil !== null &&
    trialEndsAt.getTime() === effectiveUntil.getTime();
  const subscriptionReferenceValid =
    row.subscription_id !== null &&
    row.subscription_id === row.joined_subscription_id &&
    row.subscription_plan_code === planCode &&
    subscriptionPeriodEndsAt !== null &&
    effectiveUntil !== null &&
    subscriptionPeriodEndsAt.getTime() === effectiveUntil.getTime() &&
    [
      "incomplete",
      "incomplete_expired",
      "trialing",
      "active",
      "past_due",
      "canceled",
      "unpaid",
      "paused",
    ].includes(row.subscription_provider_status ?? "");

  const sourceShapeValid =
    (source === "bootstrap" &&
      planCode === "free" &&
      !row.trial_id &&
      !row.subscription_id) ||
    (source === "contract" && !row.trial_id && !row.subscription_id) ||
    (source === "stripe_subscription" &&
      planCode !== "free" &&
      !row.trial_id &&
      subscriptionReferenceValid) ||
    (source === "trial" &&
      planCode === "starter" &&
      !row.subscription_id &&
      activeTrialWindowValid &&
      ["active", "expired"].includes(row.trial_status ?? "")) ||
    (source === "trial_expired" &&
      planCode === "free" &&
      !row.subscription_id &&
      trialReferenceValid &&
      row.trial_status === "expired");
  if (!sourceShapeValid) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "Las referencias del entitlement SaaS no concuerdan con su fuente",
      503
    );
  }

  const trialExpired =
    source === "trial_expired" ||
    (source === "trial" &&
      (row.trial_status !== "active" ||
        effectiveUntil === null ||
        effectiveUntil.getTime() <= at.getTime()));
  const subscriptionHasNoPaidAccess =
    source === "stripe_subscription" &&
    ["incomplete", "incomplete_expired", "trialing"].includes(
      row.subscription_provider_status ?? ""
    );
  const effectiveWindowExpired =
    effectiveUntil !== null && effectiveUntil.getTime() <= at.getTime();
  const startsInFuture = effectiveFrom.getTime() > at.getTime();
  const becomesFree =
    trialExpired ||
    subscriptionHasNoPaidAccess ||
    effectiveWindowExpired ||
    startsInFuture;
  const effectivePlan = becomesFree ? "free" : planCode;
  const effectiveSource: EffectiveEntitlementSource = trialExpired
    ? "trial_expired"
    : becomesFree
      ? "bootstrap"
      : source;

  return {
    planCode: effectivePlan,
    limits: { ...PLAN_LIMITS[effectivePlan] },
    source: effectiveSource,
    revision,
    effectiveFrom: becomesFree ? at : effectiveFrom,
    effectiveUntil: becomesFree ? null : effectiveUntil,
  };
}

function isPlanCode(value: string | null): value is EffectiveSaasPlanCode {
  return (
    value === "free" ||
    value === "starter" ||
    value === "growth" ||
    value === "network"
  );
}

function isEntitlementSource(
  value: string | null
): value is EffectiveEntitlementSource {
  return (
    value === "bootstrap" ||
    value === "stripe_subscription" ||
    value === "contract" ||
    value === "trial" ||
    value === "trial_expired"
  );
}
