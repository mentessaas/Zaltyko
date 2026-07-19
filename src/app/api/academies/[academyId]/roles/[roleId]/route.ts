import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { academyRoles, permissionEnum, roleMembers } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withTenant } from "@/lib/authz";
import { deleteAcademyRole, updateAcademyRole } from "@/lib/authz/permissions-service";
import { getBillingAcademyAccess } from "@/lib/billing/access";

const PermissionSchema = z.enum(permissionEnum.enumValues);
const UpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    permissions: z.array(PermissionSchema).max(permissionEnum.enumValues.length).optional(),
    inheritsFrom: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No hay cambios");

function ids(context: Record<string, unknown>) {
  const params = (context as { params?: { academyId?: string; roleId?: string } }).params;
  return { academyId: params?.academyId ?? null, roleId: params?.roleId ?? null };
}

async function authorize(
  academyId: string,
  roleId: string,
  context: { userId: string; profile: { id: string; role: string } }
) {
  const access = await getBillingAcademyAccess({
    academyId,
    userId: context.userId,
    profileId: context.profile.id,
    profileRole: context.profile.role,
  });
  if (!access) return null;
  const [role] = await db
    .select()
    .from(academyRoles)
    .where(and(eq(academyRoles.id, roleId), eq(academyRoles.academyId, academyId)))
    .limit(1);
  return role ?? null;
}

async function createsInheritanceCycle(roleId: string, parentId: string | null) {
  const visited = new Set<string>();
  let current = parentId;
  while (current) {
    if (current === roleId || visited.has(current)) return true;
    visited.add(current);
    const [parent] = await db
      .select({ inheritsFrom: academyRoles.inheritsFrom })
      .from(academyRoles)
      .where(eq(academyRoles.id, current))
      .limit(1);
    current = parent?.inheritsFrom ?? null;
  }
  return false;
}

export const PATCH = withTenant(async (request, context) => {
  const { academyId, roleId } = ids(context);
  if (!academyId || !roleId) return apiError("VALIDATION_ERROR", "Rol no válido", 400);
  const role = await authorize(academyId, roleId, context);
  if (!role) return apiError("FORBIDDEN", "No puedes modificar este rol", 403);

  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION_ERROR", "Cambios no válidos", 400, parsed.error.flatten());
  if (parsed.data.inheritsFrom) {
    const [parent] = await db
      .select({ id: academyRoles.id })
      .from(academyRoles)
      .where(
        and(
          eq(academyRoles.id, parsed.data.inheritsFrom),
          eq(academyRoles.academyId, academyId)
        )
      )
      .limit(1);
    if (!parent) {
      return apiError("PARENT_ROLE_NOT_FOUND", "El rol heredado no existe en esta academia", 400);
    }
  }
  if (parsed.data.name) {
    const siblingRoles = await db
      .select({ id: academyRoles.id, name: academyRoles.name })
      .from(academyRoles)
      .where(eq(academyRoles.academyId, academyId));
    if (
      siblingRoles.some(
        (candidate) =>
          candidate.id !== roleId && candidate.name.toLowerCase() === parsed.data.name!.toLowerCase()
      )
    ) {
      return apiError("ROLE_NAME_EXISTS", "Ya existe un rol con ese nombre", 409);
    }
  }
  if (await createsInheritanceCycle(roleId, parsed.data.inheritsFrom ?? null)) {
    return apiError("ROLE_INHERITANCE_CYCLE", "Un rol no puede heredarse a sí mismo", 409);
  }
  if (role.isDefault && (parsed.data.name || parsed.data.isActive === false)) {
    return apiError("DEFAULT_ROLE_PROTECTED", "Los roles base no se pueden renombrar ni desactivar", 409);
  }

  return apiSuccess(await updateAcademyRole(roleId, parsed.data));
});

export const DELETE = withTenant(async (_request, context) => {
  const { academyId, roleId } = ids(context);
  if (!academyId || !roleId) return apiError("VALIDATION_ERROR", "Rol no válido", 400);
  const role = await authorize(academyId, roleId, context);
  if (!role) return apiError("FORBIDDEN", "No puedes eliminar este rol", 403);
  if (role.isDefault) return apiError("DEFAULT_ROLE_PROTECTED", "Los roles base no se pueden eliminar", 409);

  const [assigned] = await db
    .select({ id: roleMembers.id })
    .from(roleMembers)
    .where(eq(roleMembers.roleId, roleId))
    .limit(1);
  if (assigned) return apiError("ROLE_IN_USE", "Quita los miembros antes de eliminar el rol", 409);

  await deleteAcademyRole(roleId);
  return apiSuccess({ deleted: true });
});
