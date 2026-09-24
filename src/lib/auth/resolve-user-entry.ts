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
export async function resolveUserEntry(user: User, initialRoleOverride?: unknown) {
  const currentHome = await resolveUserHome({ userId: user.id, email: user.email });
  if (currentHome.destination !== "owner_setup") return currentHome;

  const initialRole = isOpenRegistrationRole(initialRoleOverride)
    ? initialRoleOverride
    : user.user_metadata?.initial_role;
  if (!isOpenRegistrationRole(initialRole) || initialRole === "owner") {
    return currentHome;
  }

  await ensureGlobalProfile(user, initialRole);
  const resolvedHome = await resolveUserHome({ userId: user.id, email: user.email });

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
