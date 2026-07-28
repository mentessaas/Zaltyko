export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createBearerSupabaseClient, getBearerToken } from "@/lib/supabase/bearer-client";
import { getCurrentProfile } from "@/lib/authz/profile-service";
import { logger } from "@/lib/logger";

/**
 * GET /api/me (bearer / móvil)
 *
 * Perfil Zaltyko del usuario autenticado: rol, academia activa y datos
 * básicos. Es el primer request que hace la app móvil tras el login para
 * resolver qué tabs mostrar (ver mobile/lib/auth/role-router.ts).
 */
export async function GET(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createBearerSupabaseClient(token);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const profile = await getCurrentProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: "PROFILE_NOT_FOUND" }, { status: 404 });
    }

    let academyName: string | null = null;
    if (profile.activeAcademyId) {
      const [academy] = await db
        .select({ name: academies.name })
        .from(academies)
        .where(eq(academies.id, profile.activeAcademyId))
        .limit(1);
      academyName = academy?.name ?? null;
    }

    return NextResponse.json({
      data: {
        id: profile.id,
        email: user.email ?? "",
        fullName: profile.name,
        role: profile.role,
        academyId: profile.activeAcademyId,
        academyName,
      },
    });
  } catch (error) {
    logger.error("Error fetching /api/me:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
