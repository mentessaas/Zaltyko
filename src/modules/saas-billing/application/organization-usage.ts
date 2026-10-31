import { sql } from "drizzle-orm";
import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { lockOrganizationForSaasMutation, resolveEffectiveOrganizationEntitlement } from "./entitlement-service";

export type LimitedResource = "athletes" | "groups" | "classes";
export const resourceLabels = { athletes: "gimnastas", groups: "grupos", classes: "clases" };

function count(value: unknown): number {
  if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new OperationalError("FEATURE_NOT_AVAILABLE", "No se ha podido comprobar el uso del plan", 503);
  }
  return Number(value);
}

/** Counts canonical active records, never memberships, sessions, or only one site. */
export async function getOrganizationUsage(tx: TransactionClient, organizationId: string) {
  const entitlement = await resolveEffectiveOrganizationEntitlement(tx, organizationId);
  const result = await tx.execute(sql`
    select
      (select count(*)::text from zaltyko.athletes where organization_id = ${organizationId}::uuid and is_active) as athletes,
      (select count(*)::text from zaltyko.groups where organization_id = ${organizationId}::uuid and status = 'active') as groups,
      (select count(*)::text from zaltyko.class_templates where organization_id = ${organizationId}::uuid and status = 'active') as classes
  `);
  const row = result.rows[0];
  if (result.rows.length !== 1 || !row) throw new OperationalError("FEATURE_NOT_AVAILABLE", "Uso del plan no disponible", 503);
  const limits = { athletes: entitlement.limits.athleteLimit, groups: entitlement.limits.groupLimit, classes: entitlement.limits.classLimit };
  const resources = (Object.keys(limits) as LimitedResource[]).map(resource => {
    const limit = limits[resource];
    if (limit !== null && (!Number.isSafeInteger(limit) || limit < 0)) throw new OperationalError("FEATURE_NOT_AVAILABLE", "Límite no válido", 503);
    const current = count(row[resource]);
    return { resource, current, limit, excess: limit === null ? 0 : Math.max(0, current - limit) };
  });
  return { planCode: entitlement.planCode, readOnly: resources.some(resource => resource.excess > 0), resources };
}

/** Authorization must precede this check. Keep the lock through the last write. */
export async function assertOrganizationOperationalWritable(tx: TransactionClient, organizationId: string) {
  await lockOrganizationForSaasMutation(tx, organizationId);
  const usage = await getOrganizationUsage(tx, organizationId);
  if (usage.readOnly) throw new OperationalError("PLAN_OVER_CAPACITY", "La academia está en solo lectura porque supera los límites del plan. Archiva el excedente o contrata un plan suficiente desde Plan. Los datos se conservan.", 409, usage);
}

export async function assertOrganizationResourceCapacity(tx: TransactionClient, organizationId: string, resource: LimitedResource) {
  await lockOrganizationForSaasMutation(tx, organizationId);
  const usage = await getOrganizationUsage(tx, organizationId);
  const item = usage.resources.find(item => item.resource === resource)!;
  if (item.limit !== null && item.current >= item.limit) throw new OperationalError("CAPACITY_FULL", `Has alcanzado el límite de ${resourceLabels[resource]} de tu plan.`, 409, { resource, current: item.current, limit: item.limit });
}
