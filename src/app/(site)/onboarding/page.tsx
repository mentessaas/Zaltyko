import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { resolveUserEntry } from "@/lib/auth/resolve-user-entry";

/**
 * Canonical onboarding entrypoint.
 * La entrada genérica conserva el wizard de owner; las altas de coach,
 * parent y athlete llegan a sus rutas específicas desde el resolver de auth.
 * Los usuarios invitados siguen su flujo de invitación.
 */
export default async function OnboardingPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/register");
  }

  const home = await resolveUserEntry(user);

  redirect(home.destination === "owner_setup" ? "/onboarding/owner" : home.redirectUrl);
}
