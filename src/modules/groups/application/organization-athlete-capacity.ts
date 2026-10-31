import { sql } from "drizzle-orm";

import type { TransactionClient } from "@/lib/db-transactions";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export type OrganizationAthleteLimitResolver = (
  tx: TransactionClient,
  organizationId: string
) => Promise<number | null>;

/**
 * Call after authorization and idempotent replay, before group locks or writes.
 * The caller must retain this transaction through the athlete INSERT. SaaS
 * changes use the same organization row lock, including trial expiration.
 * null is an explicitly resolved unlimited entitlement, never missing config.
 */
export async function assertOrganizationAthleteCapacity(
  tx: TransactionClient,
  organizationId: string,
  resolveLimit: OrganizationAthleteLimitResolver
): Promise<void> {
  const organizationRows = await tx.execute(sql`
    select id from zaltyko.organizations
    where id = ${organizationId}::uuid for update
  `);
  if (organizationRows.rows.length !== 1) {
    throw new OperationalError("NOT_FOUND", "Academia no encontrada", 404);
  }

  const limit = await resolveLimit(tx, organizationId);
  if (limit === null) return;
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "No se ha podido comprobar el límite del plan",
      503
    );
  }

  const rows = await tx.execute(sql`
    select count(*)::text as count from zaltyko.athletes
    where organization_id = ${organizationId}::uuid and is_active = true
  `);
  const rawCount = rows.rows[0]?.count;
  const count = Number(rawCount);
  if (
    rows.rows.length !== 1 ||
    typeof rawCount !== "string" ||
    !/^\d+$/.test(rawCount) ||
    !Number.isSafeInteger(count) ||
    count < 0
  ) {
    throw new OperationalError(
      "FEATURE_NOT_AVAILABLE",
      "No se ha podido comprobar el uso del plan",
      503
    );
  }
  if (count >= limit) {
    throw new OperationalError(
      "CAPACITY_FULL",
      "Has alcanzado el límite de gimnastas de tu plan. Revisa tu suscripción antes de crear otra ficha.",
      409,
      { resource: "organization_athletes", current: count, limit }
    );
  }
}
