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

/**
 * Cobro automático (Fase 3): revisión del último cambio REAL del plan de la
 * academia, derivada del historial append-only
 * zaltyko.organization_entitlement_changes (una fila por revisión, escrita por
 * el trigger record_entitlement_revision).
 *
 * Identidad del plan de cada revisión: código de plan, tipo de origen,
 * suscripción y prueba; y, fuera de Stripe, la referencia de origen (en un
 * contrato o plan fundador la referencia ES el contrato). Una renovación de
 * Stripe solo cambia la referencia (`stripe-invoice:…`) y el periodo con la
 * misma suscripción y el mismo plan: no es un cambio real.
 *
 * Devuelve la primera revisión de la racha final con la identidad vigente:
 * una preferencia guardada en esa revisión o después sigue valiendo. Si el
 * historial no tiene todas las revisiones de la racha (o falta la vigente),
 * devuelve la revisión vigente: se exige la exacta, como antes. `null` si la
 * academia no tiene derecho de plan.
 */
export async function loadPlanChangeRevision(
  executor: Pick<typeof db, "execute">,
  organizationId: string
): Promise<number | null> {
  const result = await executor.execute(sql`
    select
      e.revision as "currentRevision",
      run.start_revision as "runStart",
      (
        select count(*)
          from zaltyko.organization_entitlement_changes h
         where h.organization_id = e.organization_id
           and h.revision between run.start_revision and e.revision
           and row(h.plan_code, h.source, h.subscription_id, h.trial_id,
                   case when h.source = 'stripe_subscription' then null else h.source_reference end)
               is not distinct from
               row(e.plan_code, e.source, e.subscription_id, e.trial_id,
                   case when e.source = 'stripe_subscription' then null else e.source_reference end)
      ) as "runRows"
    from zaltyko.organization_entitlements e
    cross join lateral (
      select coalesce(
               max(h.revision) + 1,
               (select min(f.revision)
                  from zaltyko.organization_entitlement_changes f
                 where f.organization_id = e.organization_id
                   and f.revision <= e.revision)
             ) as start_revision
        from zaltyko.organization_entitlement_changes h
       where h.organization_id = e.organization_id
         and h.revision <= e.revision
         and row(h.plan_code, h.source, h.subscription_id, h.trial_id,
                 case when h.source = 'stripe_subscription' then null else h.source_reference end)
             is distinct from
             row(e.plan_code, e.source, e.subscription_id, e.trial_id,
                 case when e.source = 'stripe_subscription' then null else e.source_reference end)
    ) run
    where e.organization_id = ${organizationId}::uuid
    limit 1
  `);
  const row = result.rows[0] as
    | { currentRevision?: unknown; runStart?: unknown; runRows?: unknown }
    | undefined;
  if (!row) return null;
  const current = Number(row.currentRevision);
  if (!Number.isInteger(current) || current < 1) return null;
  const start = row.runStart === null || row.runStart === undefined ? NaN : Number(row.runStart);
  const rows = Number(row.runRows);
  // La racha debe estar completa: una fila con la identidad vigente por cada
  // revisión desde su inicio hasta la vigente. Si no, se exige la vigente.
  if (!Number.isInteger(start) || start < 1 || start > current || rows !== current - start + 1) {
    return current;
  }
  return start;
}
