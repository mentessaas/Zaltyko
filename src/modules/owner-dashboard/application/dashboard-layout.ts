import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { ownerDashboardLayouts } from "@/db/zaltyko-schema";
import {
  DEFAULT_OWNER_DASHBOARD_ORDER,
  OWNER_DASHBOARD_MODULES,
  ownerDashboardModuleOrderSchema,
  type OwnerDashboardModule,
} from "@/modules/owner-dashboard/domain/dashboard-layout";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export {
  DEFAULT_OWNER_DASHBOARD_ORDER,
  OWNER_DASHBOARD_MODULES,
  ownerDashboardModuleOrderSchema,
  type OwnerDashboardModule,
} from "@/modules/owner-dashboard/domain/dashboard-layout";

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type OwnerDashboardLayout = {
  organizationId: string;
  order: OwnerDashboardModule[];
  version: number;
};

function normalizeOrder(raw: string[]): OwnerDashboardModule[] {
  const known = raw.filter((item): item is OwnerDashboardModule =>
    OWNER_DASHBOARD_MODULES.includes(item as OwnerDashboardModule)
  );
  return [
    ...new Set(known),
    ...DEFAULT_OWNER_DASHBOARD_ORDER.filter((item) => !known.includes(item)),
  ];
}

export async function getOwnerDashboardLayout(input: {
  organizationId: string;
  userId: string;
}): Promise<OwnerDashboardLayout> {
  const parsed = inputSchema.parse(input);
  const scope = await resolveOwnerScope(parsed);
  const [stored] = await db
    .select({ order: ownerDashboardLayouts.moduleOrder, version: ownerDashboardLayouts.version })
    .from(ownerDashboardLayouts)
    .where(
      and(
        eq(ownerDashboardLayouts.organizationId, scope.organization.id),
        eq(ownerDashboardLayouts.userId, parsed.userId)
      )
    )
    .limit(1);

  return {
    organizationId: scope.organization.id,
    order: stored ? normalizeOrder(stored.order) : DEFAULT_OWNER_DASHBOARD_ORDER,
    version: stored?.version ?? 0,
  };
}

export async function saveOwnerDashboardLayout(input: {
  organizationId: string;
  userId: string;
  order: unknown;
  expectedVersion: number;
}): Promise<OwnerDashboardLayout> {
  const parsed = inputSchema
    .extend({
      order: ownerDashboardModuleOrderSchema,
      expectedVersion: z.number().int().min(0),
    })
    .parse(input);
  const scope = await resolveOwnerScope(parsed);

  return db.transaction(async (tx) => {
    const lockKey = `${scope.organization.id}:${parsed.userId}`;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

    const [stored] = await tx
      .select({ id: ownerDashboardLayouts.id, version: ownerDashboardLayouts.version })
      .from(ownerDashboardLayouts)
      .where(
        and(
          eq(ownerDashboardLayouts.organizationId, scope.organization.id),
          eq(ownerDashboardLayouts.userId, parsed.userId)
        )
      )
      .limit(1);
    const currentVersion = stored?.version ?? 0;
    if (currentVersion !== parsed.expectedVersion) {
      throw new OperationalError(
        "VERSION_CONFLICT",
        "El orden del panel cambió en otra sesión. Recarga la página antes de guardar.",
        409
      );
    }

    const nextVersion = currentVersion + 1;
    if (stored) {
      await tx
        .update(ownerDashboardLayouts)
        .set({
          moduleOrder: parsed.order,
          version: nextVersion,
          updatedAt: new Date(),
        })
        .where(eq(ownerDashboardLayouts.id, stored.id));
    } else {
      await tx.insert(ownerDashboardLayouts).values({
        organizationId: scope.organization.id,
        userId: parsed.userId,
        moduleOrder: parsed.order,
        version: nextVersion,
      });
    }

    return {
      organizationId: scope.organization.id,
      order: parsed.order,
      version: nextVersion,
    };
  });
}
