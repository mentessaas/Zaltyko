import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academyRoles, memberships, permissionEnum } from "@/db/schema";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import {
  assignRoleToUser,
  getRoleMembers,
  getUserPermissions,
  removeRoleFromUser,
} from "@/lib/authz/permissions-service";
import { getBillingAcademyAccess } from "@/lib/billing/access";

export const dynamic = "force-dynamic";

/** @resource-scope academy — role and membership are matched to the path academy. */

const PermissionSchema = z.enum(permissionEnum.enumValues);
const AssignSchema = z.object({
  userId: z.string().uuid(),
  customPermissions: z.array(PermissionSchema).max(permissionEnum.enumValues.length).optional(),
  expiresAt: z.coerce.date().nullable().optional(),
}).refine((value) => !value.expiresAt || value.expiresAt > new Date(), {
  message: "La fecha de expiración debe ser futura",
  path: ["expiresAt"],
});
const RemoveSchema = z.object({ userId: z.string().uuid() });

function ids(context: Record<string, unknown>) {
  const params = (context as { params?: { academyId?: string; roleId?: string } }).params;
  return { academyId: params?.academyId ?? null, roleId: params?.roleId ?? null };
}

async function authorize(
  academyId: string,
  roleId: string,
  context: { userId: string; profile: { id: string; role: string; tenantId: string | null } }
) {
  const access = await getBillingAcademyAccess({
    academyId,
    userId: context.userId,
    profileId: context.profile.id,
    profileRole: context.profile.role,
    tenantId: context.profile.tenantId ?? undefined,
  });
  if (!access) return null;
  const [role] = await db
    .select()
    .from(academyRoles)
    .where(and(eq(academyRoles.id, roleId), eq(academyRoles.academyId, academyId)))
    .limit(1);
  return role ?? null;
}

export const GET = withTenant(async (_request, context) => {
  const { academyId, roleId } = ids(context);
  if (!academyId || !roleId) return apiError("VALIDATION_ERROR", "Rol no válido", 400);
  if (!(await authorize(academyId, roleId, context))) {
    return apiError("FORBIDDEN", "No puedes consultar este rol", 403);
  }
  return apiSuccess({ items: await getRoleMembers(roleId) });
});

export const POST = withTenant(async (request, context) => {
  const { academyId, roleId } = ids(context);
  if (!academyId || !roleId) return apiError("VALIDATION_ERROR", "Rol no válido", 400);
  if (!(await authorize(academyId, roleId, context))) {
    return apiError("FORBIDDEN", "No puedes modificar este rol", 403);
  }
  const parsed = AssignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Miembro no válido", 400, parsed.error.flatten());

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.academyId, academyId), eq(memberships.userId, parsed.data.userId)))
    .limit(1);
  if (!membership) {
    return apiError("MEMBERSHIP_REQUIRED", "La persona debe ser miembro de la academia", 409);
  }

  const effective = await getUserPermissions(context.userId, academyId);
  if (!effective.isOwner && (parsed.data.customPermissions ?? []).some(
    (permission) => !effective.permissions.includes(permission)
  )) {
    return apiError(
      "PERMISSION_ESCALATION",
      "No puedes conceder permisos que no tienes en esta academia",
      403
    );
  }

  const member = await assignRoleToUser(
    parsed.data.userId,
    roleId,
    academyId,
    membership.role,
    context.profile.id,
    parsed.data.customPermissions,
    parsed.data.expiresAt
  );
  return apiCreated(member);
});

export const DELETE = withTenant(async (request, context) => {
  const { academyId, roleId } = ids(context);
  if (!academyId || !roleId) return apiError("VALIDATION_ERROR", "Rol no válido", 400);
  if (!(await authorize(academyId, roleId, context))) {
    return apiError("FORBIDDEN", "No puedes modificar este rol", 403);
  }
  const parsed = RemoveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Miembro no válido", 400);
  await removeRoleFromUser(parsed.data.userId, roleId, academyId);
  return apiSuccess({ removed: true });
});
