import { eq, and, isNull, desc } from "drizzle-orm";

import { db } from "@/db";
import { academyRoles, roleMembers, profiles, permissionEnum } from "@/db/schema";
import type { Permission } from "@/db/schema/permissions";

/**
 * Tipos para el sistema de permisos
 */
export type UserPermissions = {
  permissions: Permission[];
  roleId: string | null;
  roleName: string | null;
  isOwner: boolean;
};

export type RoleWithPermissions = {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  inheritsFrom: string | null;
  isDefault: string | null;
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
  // Obtener membresía del usuario en la academia
  const membership = await db
    .select()
    .from(roleMembers)
    .where(
      and(
        eq(roleMembers.userId, userId),
        eq(roleMembers.academyId, academyId),
        isNull(roleMembers.expiresAt)
      )
    )
    .limit(1);

  if (!membership.length) {
    // Si no tiene membresía, verificar si es owner de la academia
    const profile = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    const isOwner = profile[0]?.role === "owner";

    return {
      permissions: isOwner ? getAllPermissions() : [],
      roleId: null,
      roleName: null,
      isOwner,
    };
  }

  const member = membership[0];

  // Obtener el rol
  const role = await db
    .select()
    .from(academyRoles)
    .where(eq(academyRoles.id, member.roleId))
    .limit(1);

  if (!role.length) {
    return {
      permissions: member.customPermissions as Permission[] || [],
      roleId: null,
      roleName: null,
      isOwner: false,
    };
  }

  const roleData = role[0];

  // Calcular permisos heredados
  const inheritedPermissions = await calculateInheritedPermissions(
    roleData.inheritsFrom
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
    isOwner: member.memberRole === "owner",
  };
}

/**
 * Calcula permisos heredados de un rol
 */
async function calculateInheritedPermissions(
  inheritsFromId: string | null
): Promise<Permission[]> {
  if (!inheritsFromId) return [];

  const parentRole = await db
    .select()
    .from(academyRoles)
    .where(eq(academyRoles.id, inheritsFromId))
    .limit(1);

  if (!parentRole.length) return [];

  const parent = parentRole[0];
  const parentPermissions = (parent.permissions || []) as Permission[];

  // Recursivamente obtener permisos del abuelo
  const grandPermissions = await calculateInheritedPermissions(
    parent.inheritsFrom
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
    isActive: r.isActive === "true",
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
  isDefault: string | null = null,
  createdBy: string
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      isActive: "true",
      createdBy,
    } as any)
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
    isDefault?: string | null;
    isActive?: string;
  }
) {
  const [role] = await db
    .update(academyRoles)
    .set({
      ...updates,
      updatedAt: new Date(),
    } as Record<string, unknown>)
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
  memberRole: "owner" | "admin" | "coach" | "assistant" | "viewer" | "parent",
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

/**
 * Elimina un rol (soft delete)
 */
export async function deleteAcademyRole(roleId: string) {
  return db
    .update(academyRoles)
    .set({ isActive: "false", updatedAt: new Date() })
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
      isDefault: "admin",
    },
    {
      name: "Entrenador",
      description: "Acceso a atletas y clases",
      permissions: [
        "athletes:read", "athletes:update",
        "classes:read", "classes:schedule",
        "reports:read",
        "events:read", "events:register",
      ] as Permission[],
      isDefault: "coach",
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
      isDefault: "assistant",
    },
    {
      name: "Invitado",
      description: "Solo lectura",
      permissions: [
        "athletes:read",
        "classes:read",
        "events:read",
      ] as Permission[],
      isDefault: "invited",
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