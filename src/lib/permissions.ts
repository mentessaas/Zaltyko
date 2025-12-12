import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { academies, athletes, classes, groups, profiles } from "@/db/schema";
import { ProfileRow } from "./authz";

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Verifica que un atleta pertenezca a una academia del tenant
 */
export async function verifyAthleteAccess(
  athleteId: string,
  tenantId: string,
  academyId?: string
): Promise<PermissionCheck> {
  const conditions = [
    eq(athletes.id, athleteId),
    eq(athletes.tenantId, tenantId),
  ];

  if (academyId) {
    conditions.push(eq(athletes.academyId, academyId));
  }

  const [athlete] = await db
    .select({ id: athletes.id })
    .from(athletes)
    .where(and(...conditions))
    .limit(1);

  if (!athlete) {
    return {
      allowed: false,
      reason: "ATHLETE_NOT_FOUND_OR_ACCESS_DENIED",
    };
  }

  return { allowed: true };
}

/**
 * Verifica que una clase pertenezca a una academia del tenant
 */
export async function verifyClassAccess(
  classId: string,
  tenantId: string,
  academyId?: string
): Promise<PermissionCheck> {
  const conditions = [eq(classes.id, classId), eq(classes.tenantId, tenantId)];

  if (academyId) {
    conditions.push(eq(classes.academyId, academyId));
  }

  const [classRow] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(and(...conditions))
    .limit(1);

  if (!classRow) {
    return {
      allowed: false,
      reason: "CLASS_NOT_FOUND_OR_ACCESS_DENIED",
    };
  }

  return { allowed: true };
}

/**
 * Verifica que un grupo pertenezca a una academia del tenant
 */
export async function verifyGroupAccess(
  groupId: string,
  tenantId: string,
  academyId?: string
): Promise<PermissionCheck> {
  const conditions = [eq(groups.id, groupId), eq(groups.tenantId, tenantId)];

  if (academyId) {
    conditions.push(eq(groups.academyId, academyId));
  }

  const [group] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(...conditions))
    .limit(1);

  if (!group) {
    return {
      allowed: false,
      reason: "GROUP_NOT_FOUND_OR_ACCESS_DENIED",
    };
  }

  return { allowed: true };
}

/**
 * Verifica que una academia pertenezca al tenant
 */
export async function verifyAcademyAccess(
  academyId: string,
  tenantId: string
): Promise<PermissionCheck> {
  const [academy] = await db
    .select({ id: academies.id })
    .from(academies)
    .where(and(eq(academies.id, academyId), eq(academies.tenantId, tenantId)))
    .limit(1);

  if (!academy) {
    return {
      allowed: false,
      reason: "ACADEMY_NOT_FOUND_OR_ACCESS_DENIED",
    };
  }

  return { allowed: true };
}

/**
 * Verifica que el usuario tenga permisos para realizar una acción según su rol
 */
export function verifyRolePermission(
  profile: ProfileRow,
  requiredRoles: Array<ProfileRow["role"]>
): PermissionCheck {
  if (!requiredRoles.includes(profile.role)) {
    return {
      allowed: false,
      reason: "INSUFFICIENT_PERMISSIONS",
    };
  }

  return { allowed: true };
}

/**
 * Verifica que el usuario pueda acceder a un recurso según su rol y tenant
 */
export async function verifyResourceAccess(
  profile: ProfileRow,
  tenantId: string,
  resourceType: "academy" | "athlete" | "class" | "group",
  resourceId: string,
  academyId?: string
): Promise<PermissionCheck> {
  // Super admin y admin tienen acceso completo
  if (profile.role === "super_admin" || profile.role === "admin") {
    return { allowed: true };
  }

  // Verificar que el tenant coincida
  if (profile.tenantId !== tenantId) {
    return {
      allowed: false,
      reason: "TENANT_MISMATCH",
    };
  }

  // Verificar acceso al recurso específico
  switch (resourceType) {
    case "academy":
      return await verifyAcademyAccess(resourceId, tenantId);
    case "athlete":
      return await verifyAthleteAccess(resourceId, tenantId, academyId);
    case "class":
      return await verifyClassAccess(resourceId, tenantId, academyId);
    case "group":
      return await verifyGroupAccess(resourceId, tenantId, academyId);
    default:
      return {
        allowed: false,
        reason: "UNKNOWN_RESOURCE_TYPE",
      };
  }
}

