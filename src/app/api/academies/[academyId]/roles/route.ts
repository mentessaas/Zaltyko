import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academyRoles, permissionEnum } from "@/db/schema";
import { apiCreated, apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { getAcademyRoles, createAcademyRole } from "@/lib/authz/permissions-service";
import { getBillingAcademyAccess } from "@/lib/billing/access";

export const dynamic = "force-dynamic";

const PermissionSchema = z.enum(permissionEnum.enumValues);
const CreateRoleSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  permissions: z.array(PermissionSchema).max(permissionEnum.enumValues.length).default([]),
  inheritsFrom: z.string().uuid().nullable().optional(),
});

function academyIdFromContext(context: Record<string, unknown>) {
  return ((context as { params?: { academyId?: string } }).params)?.academyId ?? null;
}

async function canManageRoles(
  academyId: string,
  context: { userId: string; profile: { id: string; role: string } }
) {
  return getBillingAcademyAccess({
    academyId,
    userId: context.userId,
    profileId: context.profile.id,
    profileRole: context.profile.role,
  });
}

export const GET = withTenant(async (_request, context) => {
  const academyId = academyIdFromContext(context);
  if (!academyId) return apiError("VALIDATION_ERROR", "Academia no válida", 400);
  if (!(await canManageRoles(academyId, context))) {
    return apiError("FORBIDDEN", "Solo la persona propietaria puede gestionar roles", 403);
  }

  return apiSuccess({
    items: await getAcademyRoles(academyId),
    availablePermissions: permissionEnum.enumValues,
  });
});

export const POST = withTenant(async (request, context) => {
  const academyId = academyIdFromContext(context);
  if (!academyId) return apiError("VALIDATION_ERROR", "Academia no válida", 400);
  if (!(await canManageRoles(academyId, context))) {
    return apiError("FORBIDDEN", "Solo la persona propietaria puede gestionar roles", 403);
  }

  const parsed = CreateRoleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Datos de rol no válidos", 400, parsed.error.flatten());
  }

  if (parsed.data.inheritsFrom) {
    const [parent] = await db
      .select({ id: academyRoles.id })
      .from(academyRoles)
      .where(eq(academyRoles.id, parsed.data.inheritsFrom))
      .limit(1);
    if (!parent || !(await getAcademyRoles(academyId)).some((role) => role.id === parent.id)) {
      return apiError("PARENT_ROLE_NOT_FOUND", "El rol heredado no existe en esta academia", 400);
    }
  }

  const existingRoles = await getAcademyRoles(academyId);
  if (existingRoles.some((role) => role.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return apiError("ROLE_NAME_EXISTS", "Ya existe un rol con ese nombre", 409);
  }

  const role = await createAcademyRole(
    academyId,
    parsed.data.name,
    parsed.data.description ?? null,
    parsed.data.permissions,
    parsed.data.inheritsFrom ?? null,
    false,
    context.profile.id
  );
  return apiCreated(role);
});
