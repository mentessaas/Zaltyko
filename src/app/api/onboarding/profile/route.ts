import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { profiles, academies, memberships } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error-handler";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = 'force-dynamic';

async function resolveUserId(request: Request) {
  // SECURITY: Only use authenticated session, never trust custom headers
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Log warning if someone tries to use the old x-user-id header (potential attack)
  const headerUserId = request.headers.get("x-user-id");
  if (headerUserId && headerUserId !== user.id) {
    logger.warn("SECURITY: Attempted x-user-id header spoofing detected", {
      headerUserId,
      actualUserId: user.id,
    });
  }

  return user.id;
}

export async function GET(request: Request) {
  try {
    const userId = await resolveUserId(request);

    if (!userId) {
      return apiError("UNAUTHENTICATED", "No autenticado", 401);
    }

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (!profile) {
      return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
    }

    return apiSuccess({
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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("INVALID_JSON", "JSON inválido", 400);
    }

    if (!body || typeof body !== "object") {
      return apiError("INVALID_BODY", "Body inválido", 400);
    }

    const bodyObj = body as Record<string, unknown>;
    const name = typeof bodyObj.name === "string" && bodyObj.name.trim().length > 0
      ? bodyObj.name.trim()
      : null;

    const userId = await resolveUserId(request);

    if (!userId) {
      return apiError("UNAUTHENTICATED", "No autenticado", 401);
    }

    // Generate IDs
    const tenantId = crypto.randomUUID();
    const academyId = crypto.randomUUID();

    try {
      // Check if profile exists first
      const [existingProfile] = await db
        .select({
          id: profiles.id,
          tenantId: profiles.tenantId,
          activeAcademyId: profiles.activeAcademyId,
        })
        .from(profiles)
        .where(eq(profiles.userId, userId))
        .limit(1);

      let profileId: string;
      let actualTenantId: string;
      let actualAcademyId: string;

      if (existingProfile) {
        // Profile exists, update it
        profileId = existingProfile.id;
        actualTenantId = existingProfile.tenantId ?? tenantId;
        actualAcademyId = existingProfile.activeAcademyId ?? academyId;

        await db
          .update(profiles)
          .set({
            tenantId: actualTenantId,
            activeAcademyId: actualAcademyId,
          })
          .where(eq(profiles.id, profileId));
      } else {
        // Determine role from body or default to owner
        const profileRole = (bodyObj.role as string) || "owner";
        const validRoles = ["owner", "admin", "coach", "athlete", "parent"];
        const finalRole = validRoles.includes(profileRole) ? profileRole : "owner";

        // Create new profile
        const [newProfile] = await db
          .insert(profiles)
          .values({
            userId,
            name,
            role: finalRole as any,
            tenantId,
            activeAcademyId: academyId,
            canLogin: true,
          })
          .returning({ id: profiles.id });

        profileId = newProfile.id;
        actualTenantId = tenantId;
        actualAcademyId = academyId;
      }

      // Create academy if it doesn't exist
      const [existingAcademy] = await db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.id, actualAcademyId))
        .limit(1);

      if (!existingAcademy) {
        await db.insert(academies).values({
          id: actualAcademyId,
          tenantId: actualTenantId,
          name: "Mi Academia",
          academyType: "general",
          ownerId: profileId,
        });

        // Add owner membership
        await db.insert(memberships).values({
          userId,
          academyId: actualAcademyId,
          role: "owner",
        }).onConflictDoNothing();
      }

      // Get final profile
      const [finalProfile] = await db
        .select({
          id: profiles.id,
          name: profiles.name,
          role: profiles.role,
          tenantId: profiles.tenantId,
          activeAcademyId: profiles.activeAcademyId,
        })
        .from(profiles)
        .where(eq(profiles.id, profileId))
        .limit(1);

      return apiSuccess({
        profileId: finalProfile.id,
        userId,
        name: finalProfile.name,
        tenantId: finalProfile.tenantId,
        activeAcademyId: finalProfile.activeAcademyId,
        role: finalProfile.role,
      });
    } catch (error) {
      logger.error("Error in onboarding profile", error);
      return handleApiError(error, { endpoint: "/api/onboarding/profile", method: "POST" });
    }
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/onboarding/profile", method: "POST" });
  }
}
