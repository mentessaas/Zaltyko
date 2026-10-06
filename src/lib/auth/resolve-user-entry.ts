import type { User } from "@supabase/supabase-js";

import {
  ensureGlobalProfile,
  isOpenRegistrationRole,
} from "@/lib/auth/ensure-global-profile";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";
import { getRegistrationContinuationPath } from "@/lib/auth/registration-paths";

/**
 * Resuelve la entrada tras autenticar sin adelantarse a una invitación.
 * Los owners sin perfil conservan el wizard de creación de academia; los
 * demás roles de registro abierto reciben su perfil global tras confirmar email.
 */
export async function resolveUserEntry(
  user: User,
  initialRoleOverride?: unknown
) {
  const requestedInitialRole = isOpenRegistrationRole(initialRoleOverride)
    ? initialRoleOverride
    : isOpenRegistrationRole(user.user_metadata?.initial_role)
      ? user.user_metadata.initial_role
      : null;
  if (requestedInitialRole === null || requestedInitialRole === "owner") {
    // Carga diferida: altas de coach/familia siguen su resolver propio sin
    // acoplar sus bundles al esquema owner canónico.
    const { findCanonicalOwnerEntry } =
      await import("@/modules/organizations/application/resolve-canonical-owner-entry");
    const canonicalMembership = await findCanonicalOwnerEntry(user.id);
    if (canonicalMembership) {
      return {
        destination: "academy_workspace" as const,
        redirectUrl: `/owner?organizationId=${canonicalMembership.organizationId}`,
        reason: "canonical-owner-membership",
        profileRole:
          canonicalMembership.role === "owner"
            ? ("owner" as const)
            : ("admin" as const),
        membershipRole: null,
        activeAcademyId: null,
      };
    }
  }
  if (requestedInitialRole === "owner") {
    return {
      destination: "owner_setup" as const,
      redirectUrl: "/owner/setup",
      reason: "canonical-owner-setup",
      profileRole: null,
      membershipRole: null,
      activeAcademyId: null,
    };
  }

  const currentHome = await resolveUserHome({
    userId: user.id,
    email: user.email,
  });
  if (currentHome.destination !== "owner_setup") return currentHome;

  if (
    user.user_metadata?.directory_account === true &&
    currentHome.reason === "missing-profile"
  )
    return {
      ...currentHome,
      destination: "global_dashboard" as const,
      redirectUrl: "/directorio/mis-fichas",
      reason: "directory-account",
    };
  const initialRole = requestedInitialRole;
  if (!isOpenRegistrationRole(initialRole)) {
    return currentHome;
  }

  await ensureGlobalProfile(user, initialRole);
  const resolvedHome = await resolveUserHome({
    userId: user.id,
    email: user.email,
  });

  // La creación del perfil global no equivale a haber completado la
  // activación del rol. Llevar a coach/padre/atleta a su onboarding evita que
  // un alta legítima termine por error en el wizard de propietarios.
  if (!resolvedHome.activeAcademyId) {
    return {
      ...resolvedHome,
      redirectUrl: getRegistrationContinuationPath(initialRole),
      reason: `${initialRole}-registration-setup`,
    };
  }

  return resolvedHome;
}
