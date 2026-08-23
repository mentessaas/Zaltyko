// Contrato canónico de roles en mobile (ZAL-768).
//
// Antes de este módulo el tipo `ZaltykoRole` vivía inline en
// SessionProvider.tsx y NO incluía `provider`, aunque el backend sí lo
// tiene como rol de primera clase (`src/db/schema/enums.ts`,
// `src/lib/product/roles.ts`). Consecuencia real: un perfil con
// `role: "provider"` llegaba desde /api/me, pasaba sin validación de
// runtime (`apiGet<ZaltykoProfile>` solo castea en tiempo de tipos) y
// caía en el fallback `TABS_BY_ROLE[role] ?? TABS_BY_ROLE.parent` del
// role-router — es decir, un proveedor veía el portal de familia
// ("Mis hijos"). Este módulo cierra ese agujero:
//
//   1. `provider` es un ZaltykoRole declarado.
//   2. El rol que llega de /api/me se estrecha en runtime; un rol
//      desconocido cae a `viewer` (solo lectura), nunca a `parent`.
//   3. Las capacidades espejan `ROLE_CAPABILITIES` del backend, así
//      que mobile no puede inventar permisos que el servidor no da.
//
// Fuera de alcance deliberadamente (lo retoma ZAL-427 con Producto/UX):
// pantallas de proveedor. Aquí solo existe el contrato. Mobile NO
// presenta Marketplace ni ninguna superficie de trabajo de proveedor.

export const ZALTYKO_ROLES = [
  'super_admin',
  'owner',
  'admin',
  'coach',
  'parent',
  'athlete',
  'viewer',
  'provider',
] as const;

export type ZaltykoRole = (typeof ZALTYKO_ROLES)[number];

/**
 * Rol al que cae un valor que el backend manda pero mobile no conoce
 * todavía. `viewer` es el rol de menor privilegio de la lista: solo
 * lectura, sin portal de familia y sin superficie admin. Nunca usar
 * `parent` aquí — expondría el portal de familia a un rol ajeno.
 */
export const UNKNOWN_ROLE_FALLBACK: ZaltykoRole = 'viewer';

export function isZaltykoRole(value: unknown): value is ZaltykoRole {
  return typeof value === 'string' && (ZALTYKO_ROLES as readonly string[]).includes(value);
}

// ===== Capacidades =====

// Espejo de `ProductShell` en src/lib/product/roles.ts.
export type ProductShell = 'super-admin' | 'global' | 'academy' | 'limited';

export interface RoleCapabilities {
  shell: ProductShell;
  canAccessAcademyWorkspace: boolean;
  canManageAcademies: boolean;
  canManageTeam: boolean;
  canSeeBilling: boolean;
  /**
   * Específico de mobile: ¿este rol tiene una superficie de trabajo
   * propia en la app? `false` significa que la app solo le sirve
   * avisos y perfil, y que su trabajo real vive en la web. Es lo que
   * impide que role-router le monte tabs de academia o de familia.
   */
  hasMobileWorkSurface: boolean;
}

export const ROLE_CAPABILITIES: Record<ZaltykoRole, RoleCapabilities> = {
  super_admin: {
    shell: 'super-admin',
    canAccessAcademyWorkspace: true,
    canManageAcademies: true,
    canManageTeam: true,
    canSeeBilling: true,
    hasMobileWorkSurface: true,
  },
  owner: {
    shell: 'academy',
    canAccessAcademyWorkspace: true,
    canManageAcademies: true,
    canManageTeam: true,
    canSeeBilling: true,
    hasMobileWorkSurface: true,
  },
  admin: {
    shell: 'academy',
    canAccessAcademyWorkspace: true,
    canManageAcademies: true,
    canManageTeam: true,
    canSeeBilling: false,
    hasMobileWorkSurface: true,
  },
  coach: {
    shell: 'academy',
    canAccessAcademyWorkspace: true,
    canManageAcademies: false,
    canManageTeam: false,
    canSeeBilling: false,
    hasMobileWorkSurface: true,
  },
  parent: {
    shell: 'limited',
    canAccessAcademyWorkspace: false,
    canManageAcademies: false,
    canManageTeam: false,
    canSeeBilling: false,
    hasMobileWorkSurface: true,
  },
  athlete: {
    shell: 'limited',
    canAccessAcademyWorkspace: false,
    canManageAcademies: false,
    canManageTeam: false,
    canSeeBilling: false,
    hasMobileWorkSurface: true,
  },
  // `viewer` no es un ProfileRole del backend (es un MembershipRole),
  // pero /api/me lo puede devolver como rol efectivo. Mobile lo trata
  // como portal limitado de solo lectura.
  viewer: {
    shell: 'limited',
    canAccessAcademyWorkspace: false,
    canManageAcademies: false,
    canManageTeam: false,
    canSeeBilling: false,
    hasMobileWorkSurface: true,
  },
  // Espejo exacto de ROLE_CAPABILITIES.provider en el backend
  // (shell "global", sin workspace de academia, sin billing) más la
  // decisión de producto de que mobile no es su superficie de trabajo.
  provider: {
    shell: 'global',
    canAccessAcademyWorkspace: false,
    canManageAcademies: false,
    canManageTeam: false,
    canSeeBilling: false,
    hasMobileWorkSurface: false,
  },
};

export function capabilitiesForRole(role: ZaltykoRole | undefined): RoleCapabilities {
  if (!role) return ROLE_CAPABILITIES[UNKNOWN_ROLE_FALLBACK];
  return ROLE_CAPABILITIES[role] ?? ROLE_CAPABILITIES[UNKNOWN_ROLE_FALLBACK];
}

// ===== Perfil de /api/me =====

export interface ZaltykoProfile {
  id: string;
  email: string;
  fullName: string | null;
  role: ZaltykoRole;
  academyId: string | null;
  academyName: string | null;
}

/**
 * Lo que /api/me realmente puede devolver: `role` es un string del
 * enum de Postgres, no un ZaltykoRole garantizado. Tipar el fetch como
 * `ZaltykoProfile` directamente era la mentira que dejaba entrar
 * `provider` sin que nadie lo mirara.
 */
export interface RawMeProfile {
  id: string;
  email: string;
  fullName?: string | null;
  role?: string | null;
  academyId?: string | null;
  academyName?: string | null;
}

export function normalizeRole(value: unknown): ZaltykoRole {
  return isZaltykoRole(value) ? value : UNKNOWN_ROLE_FALLBACK;
}

export function normalizeMeProfile(raw: RawMeProfile): ZaltykoProfile {
  return {
    id: raw.id,
    email: raw.email,
    fullName: raw.fullName ?? null,
    role: normalizeRole(raw.role),
    academyId: raw.academyId ?? null,
    academyName: raw.academyName ?? null,
  };
}
