import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { profiles, academies, memberships } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error-handler";

export const dynamic = 'force-dynamic';

async function resolveUserId(request: Request) {
  const headerUserId = request.headers.get("x-user-id");
  if (headerUserId) {
    return headerUserId;
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: Request) {
  try {
    const userId = await resolveUserId(request);

    if (!userId) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (!profile) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      profileId: profile.id,
      userId,
      name: profile.name,
      tenantId: profile.tenantId,
      activeAcademyId: profile.activeAcademyId,
      role: profile.role,
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/onboarding/profile", method: "GET" });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === "string" && body.name.trim().length > 0 ? body.name.trim() : null;

    const userId = await resolveUserId(request);

    if (!userId) {
      return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }

    // Generate IDs
    const tenantId = crypto.randomUUID();
    const academyId = crypto.randomUUID();

    try {
      // Try to insert - if profile exists, this will fail due to unique constraint
      const [newProfile] = await db
        .insert(profiles)
        .values({
          userId,
          name,
          role: "owner",
          tenantId,
          activeAcademyId: academyId,
        })
        .onConflictDoNothing()
        .returning();

      let profile = newProfile;

      // If profile already existed, update it
      if (!profile) {
        // Get existing profile
        const [existing] = await db
          .update(profiles)
          .set({
            tenantId,
            activeAcademyId: academyId,
          })
          .where(eq(profiles.userId, userId))
          .returning();

        profile = existing;
      }

      // Create academy
      await db.insert(academies).values({
        id: academyId,
        tenantId,
        name: "Mi Academia",
        academyType: "general",
        ownerId: profile.id,
      });

      // Add owner membership
      await db.insert(memberships).values({
        userId,
        academyId,
        role: "owner",
      }).onConflictDoNothing();

      return NextResponse.json({
        ok: true,
        profileId: profile.id,
        userId,
        name: profile.name,
        tenantId: profile.tenantId,
        activeAcademyId: profile.activeAcademyId,
        role: profile.role,
      });
    } catch (error) {
      console.error("Error in onboarding profile:", error);
      return handleApiError(error, { endpoint: "/api/onboarding/profile", method: "POST" });
    }
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/onboarding/profile", method: "POST" });
  }
}


