import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  academyId: z.string().uuid().nullable().optional(),
  profileId: z.string().uuid().optional(), // Para modo Super Admin "ver como usuario"
});

export async function PATCH(request: Request) {
  const body = BodySchema.parse(await request.json());

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const [currentProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!currentProfile) {
    return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
  }

  // Si se proporciona profileId y el usuario es Super Admin, actualizar el perfil objetivo
  const isSuperAdmin = currentProfile.role === "super_admin";
  const targetProfileId = body.profileId && isSuperAdmin ? body.profileId : currentProfile.id;

  const [targetProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, targetProfileId))
    .limit(1);

  if (!targetProfile) {
    return NextResponse.json({ error: "TARGET_PROFILE_NOT_FOUND" }, { status: 404 });
  }

  const academyId = body.academyId ?? null;

  if (academyId) {
    const [membership] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, targetProfile.userId), eq(memberships.academyId, academyId)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "ACADEMY_NOT_ALLOWED" }, { status: 403 });
    }
  }

  await db
    .update(profiles)
    .set({ activeAcademyId: academyId })
    .where(eq(profiles.id, targetProfileId));

  return NextResponse.json({ ok: true });
}


