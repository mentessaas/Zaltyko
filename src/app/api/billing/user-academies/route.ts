import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, memberships } from "@/db/schema";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "User not authenticated", 401);
  }

  const [profile] = await db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      activeAcademyId: profiles.activeAcademyId,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    return apiSuccess({ academyId: null });
  }

  // Si tiene una academia activa, usarla
  if (profile.activeAcademyId) {
    return apiSuccess({ academyId: profile.activeAcademyId });
  }

  // Si no, obtener la primera academia del usuario
  const [firstMembership] = await db
    .select({
      academyId: memberships.academyId,
    })
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1);

  return apiSuccess({ academyId: firstMembership?.academyId ?? null });
}

