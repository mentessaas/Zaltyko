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

    // Check if profile already exists with tenant/academy
    const [existingProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    // If profile exists and has tenant_id, just return it
    if (existingProfile?.tenantId && existingProfile?.activeAcademyId) {
      return NextResponse.json({
        ok: true,
        profileId: existingProfile.id,
        userId,
        name: existingProfile.name,
        tenantId: existingProfile.tenantId,
        activeAcademyId: existingProfile.activeAcademyId,
        role: existingProfile.role,
      });
    }

    // Generate IDs first
    const tenantId = existingProfile?.tenantId ?? crypto.randomUUID();
    const activeAcademyId = existingProfile?.activeAcademyId ?? crypto.randomUUID();

    // If we need to create academy but don't have profile ID yet, create profile first
    let profileId = existingProfile?.id;
    
    if (!profileId) {
      // Create profile first (without tenant/academy)
      const [newProfile] = await db
        .insert(profiles)
        .values({
          userId,
          name,
          role: "owner",
        })
        .returning();
      
      profileId = newProfile.id;
    }

    // Create academy if it doesn't exist
    if (!existingProfile?.activeAcademyId) {
      await db.insert(academies).values({
        id: activeAcademyId,
        tenantId,
        name: "Mi Academia",
        academyType: "general",
        ownerId: profileId,
      });

      // Add owner membership
      await db.insert(memberships).values({
        userId,
        academyId: activeAcademyId,
        role: "owner",
      }).onConflictDoNothing();
    }

    // Update profile with tenant and academy
    const [profile] = await db
      .update(profiles)
      .set({
        tenantId,
        activeAcademyId,
      })
      .where(eq(profiles.id, profileId))
      .returning();

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
    return handleApiError(error, { endpoint: "/api/onboarding/profile", method: "POST" });
  }
}


