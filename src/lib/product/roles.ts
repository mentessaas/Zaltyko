export type ProfileRole =
  | "super_admin"
  | "admin"
  | "owner"
  | "coach"
  | "athlete"
  | "parent"
  | "provider";

export type MembershipRole = "owner" | "coach" | "viewer";

export type ProductShell = "super-admin" | "global" | "academy" | "limited";
export type AcademyAccessLevel = "platform-admin" | "academy-admin" | "coach" | "limited" | "none";

export interface RoleCapabilities {
  shell: ProductShell;
  canAccessAcademyWorkspace: boolean;
  canManageAcademies: boolean;
  canManageTeam: boolean;
  canSeeBilling: boolean;
}

export const ROLE_LABELS: Record<ProfileRole, string> = {
  super_admin: "Super administrador",
  admin: "Administrador",
  owner: "Propietario",
  coach: "Entrenador",
  athlete: "Atleta",
  parent: "Tutor",
  provider: "Proveedor",
};

export const ROLE_CAPABILITIES: Record<ProfileRole, RoleCapabilities> = {
  super_admin: {
    shell: "super-admin",
    canAccessAcademyWorkspace: true,
    canManageAcademies: true,
    canManageTeam: true,
    canSeeBilling: true,
  },
  admin: {
    shell: "academy",
    canAccessAcademyWorkspace: true,
    canManageAcademies: true,
    canManageTeam: true,
    canSeeBilling: false,
  },
  owner: {
    shell: "academy",
    canAccessAcademyWorkspace: true,
    canManageAcademies: true,
    canManageTeam: true,
    canSeeBilling: true,
  },
  coach: {
    shell: "academy",
    canAccessAcademyWorkspace: true,
    canManageAcademies: false,
    canManageTeam: false,
    canSeeBilling: false,
  },
  athlete: {
    shell: "limited",
    canAccessAcademyWorkspace: false,
    canManageAcademies: false,
    canManageTeam: false,
    canSeeBilling: false,
  },
  parent: {
    shell: "limited",
    canAccessAcademyWorkspace: false,
    canManageAcademies: false,
    canManageTeam: false,
    canSeeBilling: false,
  },
  provider: {
    shell: "global",
    canAccessAcademyWorkspace: false,
    canManageAcademies: false,
    canManageTeam: false,
    canSeeBilling: false,
  },
};

export function isProfileRole(value: string | null | undefined): value is ProfileRole {
  return Boolean(value && value in ROLE_CAPABILITIES);
}

export function getRoleLabel(role?: string | null): string {
  if (!role) {
    return "Sin rol";
  }

  if (isProfileRole(role)) {
    return ROLE_LABELS[role];
  }

  return role.replace(/_/g, " ");
}

export function getRoleCapabilities(role?: string | null): RoleCapabilities | null {
  if (!isProfileRole(role)) {
    return null;
  }

  return ROLE_CAPABILITIES[role];
}

export function canAccessAcademyWorkspace(
  profileRole?: string | null,
  membershipRole?: string | null,
  isAcademyOwner = false
): boolean {
  const accessLevel = getAcademyAccessLevel(profileRole, membershipRole, isAcademyOwner);
  return accessLevel === "platform-admin" || accessLevel === "academy-admin" || accessLevel === "coach";
}

export function getAcademyAccessLevel(
  profileRole?: string | null,
  membershipRole?: string | null,
  isAcademyOwner = false
): AcademyAccessLevel {
  if (profileRole === "super_admin") return "platform-admin";
  if (isAcademyOwner || membershipRole === "owner") return "academy-admin";
  if (membershipRole === "coach") return "coach";
  if (
    membershipRole === "viewer" &&
    (profileRole === "athlete" || profileRole === "parent")
  ) {
    return "limited";
  }
  return "none";
}

export function getEffectiveAcademyNavigationRole(
  profileRole: ProfileRole,
  membershipRole?: MembershipRole | null,
  isAcademyOwner = false
): ProfileRole | null {
  const accessLevel = getAcademyAccessLevel(profileRole, membershipRole, isAcademyOwner);

  if (accessLevel === "platform-admin") return "super_admin";
  if (accessLevel === "academy-admin") return profileRole === "admin" ? "admin" : "owner";
  if (accessLevel === "coach") return "coach";
  if (accessLevel === "limited") return profileRole;
  return null;
}

export function isLimitedAcademyWorkspacePath(pathname: string | null | undefined, academyId: string): boolean {
  if (!pathname) {
    return false;
  }

  const basePath = `/app/${academyId}`;
  const allowedPaths = [
    `${basePath}/my-dashboard`,
    `${basePath}/messages`,
    `${basePath}/notifications`,
  ];

  return allowedPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function getDefaultDashboardPath(role?: string | null): string {
  if (role === "super_admin") {
    return "/super-admin";
  }

  if (role === "provider") {
    return "/dashboard/marketplace/mis-productos";
  }

  if (role === "athlete" || role === "parent" || role === "coach") {
    return "/dashboard/profile";
  }

  return "/dashboard/academies";
}

export function getPreferredHomePath(args: {
  profileRole?: string | null;
  membershipRole?: string | null;
  academyId?: string | null;
}): string {
  const { profileRole, membershipRole, academyId } = args;

  if (profileRole === "super_admin") {
    return "/super-admin";
  }

  if (academyId && canAccessAcademyWorkspace(profileRole, membershipRole)) {
    return `/app/${academyId}/dashboard`;
  }

  if (academyId && (profileRole === "athlete" || profileRole === "parent")) {
    return `/app/${academyId}/my-dashboard`;
  }

  return getDefaultDashboardPath(profileRole);
}
