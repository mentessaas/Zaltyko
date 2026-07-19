import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { resolveUserEntry } from "@/lib/auth/resolve-user-entry";

/**
 * Canonical onboarding entrypoint.
 * Public signup only continues through owner setup. Invited users follow
 * their invitation flow or are redirected to their current home.
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
