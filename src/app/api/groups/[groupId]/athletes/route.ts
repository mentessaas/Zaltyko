import { apiError, apiSuccess } from "@/lib/api-response";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { groupAthletes, groups } from "@/db/schema";
import { TenantContext, withTenant } from "@/lib/authz";

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
    .where(eq(groups.id, groupId))
    .limit(1);

  if (!group) {
    return apiError("GROUP_NOT_FOUND", "Group not found", 404);
  }

  const role = context.profile.role;
  const hasAccess =
    role === "super_admin" ||
    role === "admin" ||
    role === "owner" ||
    group.tenantId === context.tenantId;

  if (!hasAccess) {
    return apiError("FORBIDDEN", "Access denied", 403);
  }

  const athleteRows = await db
    .select({ athleteId: groupAthletes.athleteId })
    .from(groupAthletes)
    .where(eq(groupAthletes.groupId, groupId));

  const athleteIds = athleteRows.map((row) => row.athleteId);

  return apiSuccess({ athleteIds });
});

