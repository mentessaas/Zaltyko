import { apiError, apiSuccess } from "@/lib/api-response";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { groupAthletes, groups } from "@/db/schema";
import { TenantContext, withTenant } from "@/lib/authz";
import { authorizeAcademyCapability } from "@/lib/authz/resource-scope";

type RouteContext = TenantContext<{ params?: { groupId?: string } }>;

export const GET = withTenant(async (request, context: RouteContext) => {
  const params = context.params as { groupId?: string };
  const groupId = params?.groupId;
  if (!groupId) {
    return apiError("GROUP_ID_REQUIRED", "Group ID is required", 400);
  }

  // Verificar que el grupo existe y el usuario tiene acceso
  const [group] = await db
    .select({ tenantId: groups.tenantId, academyId: groups.academyId })
    .from(groups)
    .where(and(eq(groups.id, groupId), isNull(groups.deletedAt)))
    .limit(1);

  if (!group) {
    return apiError("GROUP_NOT_FOUND", "Group not found", 404);
  }

  const scope = await authorizeAcademyCapability({
    context,
    resourceTenantId: group.tenantId,
    academyId: group.academyId,
    permission: "classes:read",
  });

  if (!scope.allowed) {
    return apiError(scope.reason ?? "FORBIDDEN", "Access denied", 403);
  }

  const athleteRows = await db
    .select({ athleteId: groupAthletes.athleteId })
    .from(groupAthletes)
    .where(
      and(
        eq(groupAthletes.groupId, groupId),
        eq(groupAthletes.tenantId, group.tenantId)
      )
    )
    .limit(5000);

  const athleteIds = athleteRows.map((row) => row.athleteId);

  return apiSuccess({ athleteIds });
});
