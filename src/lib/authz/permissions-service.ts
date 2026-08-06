import { eq, and, desc } from "drizzle-orm";

import { db } from "@/db";
import { academies, academyRoles, memberships, roleMembers, profiles, permissionEnum } from "@/db/schema";
import type { Permission } from "@/db/schema/permissions";
import { getBaselinePermissions } from "./permission-policy";

/**
 * Tipos para el sistema de permisos
 */
export type UserPermissions = {
  permissions: Permission[];
  roleId: string | null;
  roleName: string | null;
  isOwner: boolean;
  source: "owner" | "custom" | "baseline" | "denied";
  denialReason?:
    | "no_membership"
    | "expired_assignment"
    | "missing_role"
    | "inactive_role";
};

export type RoleWithPermissions = {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  inheritsFrom: string | null;
  isDefault: boolean;
  isActive: boolean;
};

/**
 * Obtiene los permisos efectivos de un usuario en una academia
 * Combina permisos del rol, herencia, y permisos personalizados
 */
export async function getUserPermissions(
  userId: string,
  academyId: string
): Promise<UserPermissions> {
  const [profile] = await db
    .select({ id: profiles.id, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  const [academy] = await db
    .select({ ownerId: academies.ownerId })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  const [baselineMembership] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.academyId, academyId)
      )
    )
    .limit(1);

  // Ownership is academy-scoped. A global profile role never grants it.
  const ownsThisAcademy = Boolean(
    profile && academy &&
      (academy.ownerId === profile.id || baselineMembership?.role === "owner")
  );
  if (ownsThisAcademy) {
    return {
      permissions: getAllPermissions(),
      roleId: null,
      roleName: null,
      isOwner: true,
      source: "owner",
    };
  }

  // Read assignments regardless of expiry. An expired assignment must deny;
  // silently falling back to a broader baseline would make revocation unsafe.
  const [member] = await db
    .select()
    .from(roleMembers)
    .where(
      and(
        eq(roleMembers.userId, userId),
        eq(roleMembers.academyId, academyId)
      )
    )
    .limit(1);

  if (!member) {
    if (!profile || !baselineMembership) {
      return {
        permissions: [],
        roleId: null,
        roleName: null,
        isOwner: false,
        source: "denied",
        denialReason: "no_membership",
      };
    }
    return {
      permissions: getBaselinePermissions({
        membershipRole: baselineMembership.role,
        profileRole: profile.role,
        allPermissions: getAllPermissions(),
      }),
      roleId: null,
      roleName: null,
      isOwner: false,
      source: "baseline",
    };
  }

  if (member.expiresAt && member.expiresAt <= new Date()) {
    return {
      permissions: [],
      roleId: member.roleId,
      roleName: null,
      isOwner: false,
      source: "denied",
      denialReason: "expired_assignment",
    };
  }

  // Obtener el rol
  const role = await db
    .select()
    .from(academyRoles)
    .where(
      and(
        eq(academyRoles.id, member.roleId),
        eq(academyRoles.academyId, academyId)
      )
    )
    .limit(1);

  if (!role.length) {
    return {
      permissions: member.customPermissions as Permission[] || [],
      roleId: null,
      roleName: null,
      isOwner: false,
      source: "denied",
      denialReason: "missing_role",
    };
  }

  const roleData = role[0];

  if (!roleData.isActive) {
    return {
      permissions: [],
      roleId: roleData.id,
      roleName: roleData.name,
      isOwner: false,
      source: "denied",
      denialReason: "inactive_role",
    };
  }

  // Calcular permisos heredados
  const inheritedPermissions = await calculateInheritedPermissions(
    roleData.inheritsFrom,
    academyId
  );

  // Combinar: permisos del rol + heredados + personalizados
  const rolePermissions = (roleData.permissions || []) as Permission[];
  const customPermissions = (member.customPermissions || []) as Permission[];

  const allPermissions = [
    ...new Set([...inheritedPermissions, ...rolePermissions, ...customPermissions]),
  ];

  return {
    permissions: allPermissions,
    roleId: roleData.id,
    roleName: roleData.name,
    isOwner: false,
    source: "custom",
  };
}

/**
 * Calcula permisos heredados de un rol
 */
async function calculateInheritedPermissions(
  inheritsFromId: string | null,
  academyId: string,
  visited = new Set<string>()
): Promise<Permission[]> {
  if (!inheritsFromId) return [];
  if (visited.has(inheritsFromId)) return [];
  visited.add(inheritsFromId);

  const parentRole = await db
    .select()
    .from(academyRoles)
    .where(
      and(
        eq(academyRoles.id, inheritsFromId),
        eq(academyRoles.academyId, academyId),
        eq(academyRoles.isActive, true)
      )
    )
    .limit(1);

  if (!parentRole.length) return [];

  const parent = parentRole[0];
  const parentPermissions = (parent.permissions || []) as Permission[];

  // Recursivamente obtener permisos del abuelo
  const grandPermissions = await calculateInheritedPermissions(
    parent.inheritsFrom,
    academyId,
    visited
  );

  return [...new Set([...parentPermissions, ...grandPermissions])];
}

/**
 * Obtiene todos los permisos del sistema
 */
export function getAllPermissions(): Permission[] {
  return permissionEnum.enumValues;
}

/**
 * Verifica si un usuario tiene un permiso específico
 */
export async function hasPermission(
  userId: string,
  academyId: string,
  permission: Permission
): Promise<boolean> {
  const userPerms = await getUserPermissions(userId, academyId);

  // El owner siempre tiene todos los permisos
  if (userPerms.isOwner) return true;

  return userPerms.permissions.includes(permission);
}

/**
 * Verifica si el usuario tiene alguno de los permisos especificados
 */
export async function hasAnyPermission(
  userId: string,
  academyId: string,
  permissions: Permission[]
): Promise<boolean> {
  for (const perm of permissions) {
    if (await hasPermission(userId, academyId, perm)) {
      return true;
    }
  }
  return false;
}

/**
 * Verifica si el usuario tiene todos los permisos especificados
 */
export async function hasAllPermissions(
  userId: string,
  academyId: string,
  permissions: Permission[]
): Promise<boolean> {
  for (const perm of permissions) {
    if (!(await hasPermission(userId, academyId, perm))) {
      return false;
    }
  }
  return true;
}

/**
 * Obtiene los roles de una academia
 */
export async function getAcademyRoles(academyId: string): Promise<RoleWithPermissions[]> {
  const roles = await db
    .select()
    .from(academyRoles)
    .where(eq(academyRoles.academyId, academyId))
    .orderBy(desc(academyRoles.isDefault));

  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    permissions: (r.permissions || []) as Permission[],
    inheritsFrom: r.inheritsFrom,
    isDefault: r.isDefault,
    isActive: r.isActive,
  }));
}

/**
 * Crea un rol personalizado en una academia
 */
export async function createAcademyRole(
  academyId: string,
  name: string,
  description: string | null,
  permissions: Permission[],
  inheritsFrom: string | null = null,
  isDefault = false,
  createdBy: string
) {
  const [role] = await db
    .insert(academyRoles)
    .values({
      academyId,
      name,
      description,
      type: "custom",
      permissions,
      inheritsFrom: inheritsFrom ?? undefined,
      isDefault,
      isActive: true,
      createdBy,
    })
    .returning();

  return role;
}

/**
 * Actualiza un rol
 */
export async function updateAcademyRole(
  roleId: string,
  updates: {
    name?: string;
    description?: string | null;
    permissions?: Permission[];
    inheritsFrom?: string | null;
    isDefault?: boolean;
    isActive?: boolean;
  }
) {
  const [role] = await db
    .update(academyRoles)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(academyRoles.id, roleId))
    .returning();

  return role;
}

/**
 * Asigna un rol a un usuario
 */
export async function assignRoleToUser(
  userId: string,
  roleId: string,
  academyId: string,
  memberRole: "owner" | "coach" | "viewer",
  assignedBy: string,
  customPermissions?: Permission[]
) {
  // Eliminar membresías existentes del usuario en esa academia
  await db
    .delete(roleMembers)
    .where(
      and(
        eq(roleMembers.userId, userId),
        eq(roleMembers.academyId, academyId)
      )
    );

  // Crear nueva membresía
  const [member] = await db
    .insert(roleMembers)
    .values({
      roleId,
      userId,
      academyId,
      memberRole,
      customPermissions,
      assignedBy,
    })
    .returning();

  return member;
}

/**
 * Obtiene los miembros de un rol
 */
export async function getRoleMembers(roleId: string) {
  return db
    .select({
      id: roleMembers.id,
      userId: roleMembers.userId,
      memberRole: roleMembers.memberRole,
      assignedAt: roleMembers.assignedAt,
      expiresAt: roleMembers.expiresAt,
      userName: profiles.name,
    })
    .from(roleMembers)
    .leftJoin(profiles, eq(roleMembers.userId, profiles.userId))
    .where(eq(roleMembers.roleId, roleId));
}

export async function removeRoleFromUser(userId: string, roleId: string, academyId: string) {
  return db
    .delete(roleMembers)
    .where(
      and(
        eq(roleMembers.userId, userId),
        eq(roleMembers.roleId, roleId),
        eq(roleMembers.academyId, academyId)
      )
    );
}

/**
 * Elimina un rol (soft delete)
 */
export async function deleteAcademyRole(roleId: string) {
  return db
    .update(academyRoles)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(academyRoles.id, roleId));
}

/**
 * Crea roles por defecto para una nueva academia
 */
export async function createDefaultRoles(
  academyId: string,
  createdBy: string
) {
  const defaultRoles = [
    {
      name: "Administrador",
      description: "Acceso completo a todas las funcionalidades",
      permissions: [
        "athletes:read", "athletes:create", "athletes:update", "athletes:delete",
        "classes:read", "classes:create", "classes:update", "classes:delete", "classes:schedule",
        "billing:read", "billing:create", "billing:update", "billing:payments", "billing:invoices", "billing:reports",
        "coaches:read", "coaches:create", "coaches:update", "coaches:delete",
        "reports:read", "reports:create", "reports:export",
        "settings:read", "settings:write", "settings:branding", "settings:users",
        "events:read", "events:create", "events:update", "events:delete",
        "communications:read", "communications:send", "communications:templates",
      ] as Permission[],
      isDefault: true,
    },
    {
      name: "Entrenador",
      description: "Acceso a atletas y clases",
      permissions: [
        "athletes:read", "athletes:update",
        "classes:read", "classes:schedule",
        "reports:read",
        "events:read",
      ] as Permission[],
      isDefault: true,
    },
    {
      name: "Asistente",
      description: "Acceso limitado",
      permissions: [
        "athletes:read",
        "classes:read",
        "reports:read",
        "events:read",
      ] as Permission[],
      isDefault: true,
    },
    {
      name: "Invitado",
      description: "Solo lectura",
      permissions: [
        "athletes:read",
        "classes:read",
        "events:read",
      ] as Permission[],
      isDefault: true,
    },
  ];

  const created = [];
  for (const role of defaultRoles) {
    const createdRole = await createAcademyRole(
      academyId,
      role.name,
      role.description,
      role.permissions,
      null,
      role.isDefault,
      createdBy
    );
    created.push(createdRole);
  }

  return created;
}
