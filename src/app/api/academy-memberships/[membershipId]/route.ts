import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { academies, memberships, notifications, profiles } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { verifyAcademyAccess } from "@/lib/permissions";
import { hasPermission } from "@/lib/authz/permissions-service";

export const DELETE = withTenant(async (_request, context) => {
  const params = context.params as { membershipId?: string } | undefined;
  const membershipId = params?.membershipId;

  if (!membershipId) {
    return apiError("MEMBERSHIP_ID_REQUIRED", "membershipId es requerido", 400);
  }

  const [membership] = await db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      academyId: memberships.academyId,
      role: memberships.role,
      profileId: profiles.id,
      profileTenantId: profiles.tenantId,
      activeAcademyId: profiles.activeAcademyId,
      academyName: academies.name,
    })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.userId, memberships.userId))
    .innerJoin(academies, eq(academies.id, memberships.academyId))
    .where(eq(memberships.id, membershipId))
    .limit(1);

  if (!membership) {
    return apiError("MEMBERSHIP_NOT_FOUND", "Vinculo no encontrado", 404);
  }

  if (
    context.profile.role !== "super_admin" &&
    !(await hasPermission(
      context.userId,
      membership.academyId,
      "settings:users"
    ))
  ) {
    return apiError("FORBIDDEN", "No tienes permisos para desvincular usuarios", 403);
  }

  if (membership.userId === context.profile.userId) {
    return apiError("CANNOT_UNLINK_SELF", "No puedes desvincular tu propia cuenta", 400);
  }

  if (context.profile.role !== "super_admin") {
    const access = await verifyAcademyAccess(membership.academyId, context.tenantId);
    if (!access.allowed) {
      return apiError("FORBIDDEN", access.reason ?? "Prohibido", 403);
    }
  }

  if (membership.role === "owner") {
    const otherOwners = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.academyId, membership.academyId),
          eq(memberships.role, "owner"),
          ne(memberships.id, membership.id)
        )
      )
      .limit(1);

    if (otherOwners.length === 0) {
      return apiError(
        "LAST_OWNER_REQUIRED",
        "La academia debe conservar al menos un owner vinculado",
        400
      );
    }
  }

  await db.delete(memberships).where(eq(memberships.id, membership.id));

  if (membership.activeAcademyId === membership.academyId) {
    const [nextMembership] = await db
      .select({ academyId: memberships.academyId })
      .from(memberships)
      .where(eq(memberships.userId, membership.userId))
      .limit(1);

    await db
      .update(profiles)
      .set({
        activeAcademyId: nextMembership?.academyId ?? null,
      })
      .where(eq(profiles.id, membership.profileId));
  }

  await db.insert(notifications).values({
    tenantId: membership.profileTenantId,
    userId: membership.profileId,
    type: "academy_unlinked",
    title: "Vinculo eliminado",
    message: `Tu cuenta fue desvinculada de ${membership.academyName ?? "una academia"}.`,
    data: {
      academyId: membership.academyId,
      membershipId: membership.id,
    },
  });

  return apiSuccess({
    success: true,
    profileId: membership.profileId,
    academyId: membership.academyId,
  });
});
