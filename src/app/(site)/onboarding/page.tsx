import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * Main onboarding page — detects user role and redirects to the appropriate
 * role-specific onboarding wizard.
 */
export default async function OnboardingPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Look up profile to get role
  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  const role = profile?.role;

  switch (role) {
    case "coach":
    case "admin":
    case "owner":
      redirect("/onboarding/coach");
    case "parent":
      redirect("/onboarding/parent");
    case "athlete":
      redirect("/onboarding/athlete");
    default:
      // No role yet — default to coach onboarding
      redirect("/onboarding/coach");
  }
}
