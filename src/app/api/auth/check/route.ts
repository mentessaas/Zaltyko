import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { apiSuccess } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return apiSuccess({ authenticated: false, academyId: null });
  }

  const [profile] = await db
    .select({
      activeAcademyId: profiles.activeAcademyId,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (profile?.activeAcademyId) {
    return apiSuccess({ authenticated: true, academyId: profile.activeAcademyId });
  }

  const [membership] = await db
    .select({
      academyId: memberships.academyId,
    })
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1);

  return apiSuccess({ authenticated: true, academyId: membership?.academyId ?? null });
}
