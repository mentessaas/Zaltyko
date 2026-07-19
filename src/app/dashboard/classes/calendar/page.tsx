import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export default async function ClassesCalendarPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profile] = await db
    .select({
      activeAcademyId: profiles.activeAcademyId,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (profile?.activeAcademyId) {
    redirect(`/app/${profile.activeAcademyId}/classes`);
  }

  const [membership] = await db
    .select({
      academyId: memberships.academyId,
    })
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1);

  redirect(membership?.academyId ? `/app/${membership.academyId}/classes` : "/dashboard/academies");
}
