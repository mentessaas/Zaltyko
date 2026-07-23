import { eq, and, or } from "drizzle-orm";
import { db } from "@/db";
import {
  academies,
  athletes,
  classes,
  classCoachAssignments,
  classEnrollments,
  coaches,
  groups,
  memberships,
  profiles,
} from "@/db/schema";
import { ProfileRow } from "./authz";

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

type ScopedProfile = Pick<ProfileRow, "id" | "userId" | "role" | "tenantId">;

async function canManageAcademyScope(
  profile: ScopedProfile,
  academyId: string
): Promise<boolean> {
  if (profile.role === "super_admin") return true;

  const [academy] = await db
    .select({ ownerId: academies.ownerId })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);
  if (academy?.ownerId === profile.id) return true;

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.academyId, academyId),
        eq(memberships.userId, profile.userId),
        eq(memberships.role, "owner")
      )
    )
    .limit(1);

  return membership?.role === "owner";
}

function coachIdentityConditions(profile: ScopedProfile) {
  return or(
    eq(coaches.profileId, profile.id),
    eq(coaches.userId, profile.userId)
  );
}

export async function verifyCoachClassScope({
  tenantId,
  academyId,
  classId,
  profile,
}: {
  tenantId: string;
  academyId: string;
  classId: string;
  profile: ScopedProfile;
}): Promise<PermissionCheck> {
  if (await canManageAcademyScope(profile, academyId)) {
    return { allowed: true };
  }

  if (profile.role !== "coach") {
    return {
      allowed: false,
      reason: "INSUFFICIENT_PERMISSIONS",
    };
  }

  const [assignment] = await db
    .select({ id: classCoachAssignments.id })
    .from(classCoachAssignments)
    .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
    .where(
      and(
        eq(classCoachAssignments.tenantId, tenantId),
        eq(classCoachAssignments.classId, classId),
        eq(coaches.tenantId, tenantId),
        eq(coaches.academyId, academyId),
        coachIdentityConditions(profile)
      )
    )
    .limit(1);

  return assignment
    ? { allowed: true }
    : { allowed: false, reason: "COACH_NOT_ASSIGNED_TO_CLASS" };
}

export async function verifyCoachAthleteScope({
  tenantId,
  academyId,
  athleteId,
  athleteGroupId,
  profile,
}: {
  tenantId: string;
  academyId: string;
  athleteId: string;
  athleteGroupId?: string | null;
  profile: ScopedProfile;
}): Promise<PermissionCheck> {
  if (await canManageAcademyScope(profile, academyId)) {
    return { allowed: true };
  }

  if (profile.role !== "coach") {
    return {
      allowed: false,
      reason: "INSUFFICIENT_PERMISSIONS",
    };
  }

  if (athleteGroupId) {
    const [groupAssignment] = await db
      .select({ id: coaches.id })
      .from(coaches)
      .innerJoin(groups, eq(groups.coachId, coaches.id))
      .where(
        and(
          eq(coaches.tenantId, tenantId),
          eq(coaches.academyId, academyId),
          eq(groups.tenantId, tenantId),
          eq(groups.academyId, academyId),
          eq(groups.id, athleteGroupId),
          coachIdentityConditions(profile)
        )
      )
      .limit(1);

    if (groupAssignment) {
      return { allowed: true };
    }

    const [groupClassAssignment] = await db
      .select({ id: classCoachAssignments.id })
      .from(classCoachAssignments)
      .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
      .innerJoin(classes, eq(classCoachAssignments.classId, classes.id))
      .where(
        and(
          eq(classCoachAssignments.tenantId, tenantId),
          eq(coaches.tenantId, tenantId),
          eq(coaches.academyId, academyId),
          eq(classes.tenantId, tenantId),
          eq(classes.academyId, academyId),
          eq(classes.groupId, athleteGroupId),
          coachIdentityConditions(profile)
        )
      )
      .limit(1);

    if (groupClassAssignment) {
      return { allowed: true };
    }
  }

  const [enrollmentAssignment] = await db
    .select({ id: classCoachAssignments.id })
    .from(classCoachAssignments)
    .innerJoin(coaches, eq(classCoachAssignments.coachId, coaches.id))
    .innerJoin(classEnrollments, eq(classCoachAssignments.classId, classEnrollments.classId))
    .where(
      and(
        eq(classCoachAssignments.tenantId, tenantId),
        eq(coaches.tenantId, tenantId),
        eq(coaches.academyId, academyId),
        eq(classEnrollments.tenantId, tenantId),
        eq(classEnrollments.academyId, academyId),
        eq(classEnrollments.athleteId, athleteId),
        coachIdentityConditions(profile)
      )
    )
    .limit(1);

  return enrollmentAssignment
    ? { allowed: true }
    : { allowed: false, reason: "COACH_NOT_ASSIGNED_TO_ATHLETE" };
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
  tenantId: string,
  callerRole?: string | null
): Promise<PermissionCheck> {
  // El super_admin puede operar cualquier academia (cross-tenant): solo verificamos
  // que la academia exista, sin restringir por tenant.
  if (callerRole === "super_admin") {
    const [academy] = await db
      .select({ id: academies.id })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);
    return academy ? { allowed: true } : { allowed: false, reason: "ACADEMY_NOT_FOUND" };
  }

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

export async function verifyAcademyAccessForProfile({
  academyId,
  tenantId,
  profile,
}: {
  academyId: string;
  tenantId: string;
  profile: Pick<ProfileRow, "id" | "userId" | "role" | "tenantId">;
}): Promise<PermissionCheck> {
  if (profile.role === "super_admin") {
    const [academy] = await db
      .select({ id: academies.id })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (!academy) {
      return {
        allowed: false,
        reason: "ACADEMY_NOT_FOUND_OR_ACCESS_DENIED",
      };
    }

    return { allowed: true };
  }

  const [academy] = await db
    .select({
      id: academies.id,
      tenantId: academies.tenantId,
      ownerId: academies.ownerId,
    })
    .from(academies)
    .where(and(eq(academies.id, academyId), eq(academies.tenantId, tenantId)))
    .limit(1);

  if (!academy) {
    return {
      allowed: false,
      reason: "ACADEMY_NOT_FOUND_OR_ACCESS_DENIED",
    };
  }

  if (profile.tenantId !== tenantId) {
    return {
      allowed: false,
      reason: "TENANT_MISMATCH",
    };
  }

  if (academy.ownerId === profile.id) {
    return { allowed: true };
  }

  const [membership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.academyId, academyId), eq(memberships.userId, profile.userId)))
    .limit(1);

  if (!membership || membership.role === "viewer") {
    return {
      allowed: false,
      reason: "ACADEMY_MEMBERSHIP_REQUIRED",
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
  // Solo el super-admin verificado tiene alcance global. `admin` es un valor de
  // perfil, no una concesión cross-tenant ni cross-academy.
  if (profile.role === "super_admin") {
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
