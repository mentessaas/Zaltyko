import type { ProfileRole } from "@/lib/product/roles";

/**
 * Continuación del alta abierta después de crear el perfil global.
 *
 * El owner configura una academia; los demás roles completan su perfil o
 * llegan a su espacio de trabajo sin pasar por el wizard de propietarios.
 */
export function getRegistrationContinuationPath(role: ProfileRole): string {
  switch (role) {
    case "owner":
      return "/onboarding/owner";
    case "coach":
      return "/onboarding/coach";
    case "parent":
      return "/onboarding/parent";
    case "athlete":
      return "/onboarding/athlete";
    case "provider":
      return "/dashboard/marketplace/mis-productos";
    default:
      return "/dashboard";
  }
}
