import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error-handler";

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

    const [profile] = await db
      .insert(profiles)
      .values({
        userId,
        name,
        role: "owner",
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          name: name ?? profiles.name,
          role: "owner",
        },
      })
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


