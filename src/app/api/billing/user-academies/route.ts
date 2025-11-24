import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, memberships, academies } from "@/db/schema";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
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
    return NextResponse.json({ academyId: null });
  }

  // Si tiene una academia activa, usarla
  if (profile.activeAcademyId) {
    return NextResponse.json({ academyId: profile.activeAcademyId });
  }

  // Si no, obtener la primera academia del usuario
  const [firstMembership] = await db
    .select({
      academyId: memberships.academyId,
    })
    .from(memberships)
    .where(eq(memberships.userId, user.id))
    .limit(1);

  return NextResponse.json({ 
    academyId: firstMembership?.academyId ?? null 
  });
}

