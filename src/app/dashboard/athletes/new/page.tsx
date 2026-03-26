import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { academies, memberships } from "@/db/schema";

export default async function NewAthletePage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  let currentProfile;
  try {
    currentProfile = await getCurrentProfile(user.id);
  } catch (error) {
    redirect("/onboarding");
  }

  if (!currentProfile) {
    redirect("/dashboard");
  }

  // Get user's academies
  const userAcademies = await db
    .select({
      id: academies.id,
      name: academies.name,
    })
    .from(memberships)
    .innerJoin(academies, eq(memberships.academyId, academies.id))
    .where(eq(memberships.userId, currentProfile.userId))
    .limit(1);

  if (userAcademies.length === 0) {
    redirect("/onboarding");
  }

  // Redirect to the first academy's athletes page where they can create
  redirect(`/app/${userAcademies[0].id}/athletes`);
}
