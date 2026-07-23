import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { athletes, classes } from "@/db/schema";
import type { Permission } from "@/db/schema/permissions";
import type { TenantContext } from "@/lib/authz";
import { hasPermission } from "@/lib/authz/permissions-service";
import {
  verifyCoachAthleteScope,
  verifyCoachClassScope,
  type PermissionCheck,
} from "@/lib/permissions";

type AuthzContext = Pick<TenantContext, "tenantId" | "userId" | "profile">;

export type ScopedResource<T> = PermissionCheck & { resource?: T };

export async function authorizeAcademyCapability({
  context,
  resourceTenantId,
  academyId,
  permission,
}: {
  context: AuthzContext;
  resourceTenantId: string;
  academyId: string;
  permission: Permission;
}): Promise<PermissionCheck> {
  if (context.profile.role === "super_admin") return { allowed: true };
  if (!context.tenantId || resourceTenantId !== context.tenantId) {
    return { allowed: false, reason: "RESOURCE_NOT_FOUND_OR_ACCESS_DENIED" };
  }

  return (await hasPermission(context.userId, academyId, permission))
    ? { allowed: true }
    : { allowed: false, reason: "PERMISSION_DENIED" };
}

export async function authorizeClassResource({
  context,
  classId,
}: {
  context: AuthzContext;
  classId: string;
}): Promise<ScopedResource<{ id: string; tenantId: string; academyId: string }>> {
  const tenantCondition =
    context.profile.role === "super_admin"
      ? eq(classes.id, classId)
      : and(eq(classes.id, classId), eq(classes.tenantId, context.tenantId));
  const [classRow] = await db
    .select({ id: classes.id, tenantId: classes.tenantId, academyId: classes.academyId })
    .from(classes)
    .where(tenantCondition)
    .limit(1);

  if (!classRow) {
    return { allowed: false, reason: "CLASS_NOT_FOUND" };
  }
  const scope = await verifyCoachClassScope({
    tenantId: classRow.tenantId,
    academyId: classRow.academyId,
    classId: classRow.id,
    profile: context.profile,
  });
  return scope.allowed ? { allowed: true, resource: classRow } : scope;
}

export async function authorizeAthleteResource({
  context,
  athleteId,
}: {
  context: AuthzContext;
  athleteId: string;
}): Promise<ScopedResource<{
  id: string;
  tenantId: string;
  academyId: string;
  groupId: string | null;
}>> {
  const tenantCondition =
    context.profile.role === "super_admin"
      ? eq(athletes.id, athleteId)
      : and(eq(athletes.id, athleteId), eq(athletes.tenantId, context.tenantId));
  const [athlete] = await db
    .select({
      id: athletes.id,
      tenantId: athletes.tenantId,
      academyId: athletes.academyId,
      groupId: athletes.groupId,
    })
    .from(athletes)
    .where(tenantCondition)
    .limit(1);

  if (!athlete) {
    return { allowed: false, reason: "ATHLETE_NOT_FOUND" };
  }
  const scope = await verifyCoachAthleteScope({
    tenantId: athlete.tenantId,
    academyId: athlete.academyId,
    athleteId: athlete.id,
    athleteGroupId: athlete.groupId,
    profile: context.profile,
  });
  return scope.allowed ? { allowed: true, resource: athlete } : scope;
}
