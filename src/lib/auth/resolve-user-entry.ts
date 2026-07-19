import type { User } from "@supabase/supabase-js";

import {
  ensureGlobalProfile,
  isOpenRegistrationRole,
} from "@/lib/auth/ensure-global-profile";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";

/**
 * Resuelve la entrada tras autenticar sin adelantarse a una invitación.
 * Los owners sin perfil conservan el wizard de creación de academia; los
 * demás roles de registro abierto reciben su perfil global tras confirmar email.
 */
export async function resolveUserEntry(user: User) {
  const currentHome = await resolveUserHome({ userId: user.id, email: user.email });
  if (currentHome.destination !== "owner_setup") return currentHome;

  const initialRole = user.user_metadata?.initial_role;
  if (!isOpenRegistrationRole(initialRole) || initialRole === "owner") {
    return currentHome;
  }

  await ensureGlobalProfile(user);
  return resolveUserHome({ userId: user.id, email: user.email });
}
