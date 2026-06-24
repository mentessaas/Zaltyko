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
  membershipRole?: string | null
): boolean {
  if (profileRole === "super_admin") {
    return true;
  }

  if (!isProfileRole(profileRole)) {
    return membershipRole === "owner" || membershipRole === "coach";
  }

  if (!ROLE_CAPABILITIES[profileRole].canAccessAcademyWorkspace) {
    return false;
  }

  if (profileRole === "owner" || profileRole === "admin" || profileRole === "coach") {
    return membershipRole !== "viewer" || profileRole === "owner" || profileRole === "admin";
  }

  return false;
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

  const inferredMembershipRole =
    membershipRole ??
    (profileRole === "owner" || profileRole === "admin"
      ? "owner"
      : profileRole === "coach"
        ? "coach"
        : null);

  if (academyId && canAccessAcademyWorkspace(profileRole, inferredMembershipRole)) {
    return `/app/${academyId}/dashboard`;
  }

  if (academyId && (profileRole === "athlete" || profileRole === "parent")) {
    return `/app/${academyId}/my-dashboard`;
  }

  return getDefaultDashboardPath(profileRole);
}
