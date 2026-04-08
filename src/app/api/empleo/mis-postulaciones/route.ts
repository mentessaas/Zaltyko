import { eq, desc } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { empleoApplications, empleoListings, academies, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * GET /api/empleo/mis-postulaciones
 * Returns all job applications submitted by the authenticated user.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "No autorizado", 401);
    }

    // Get user's profile
    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    if (!profile) {
      return apiError("PROFILE_NOT_FOUND", "Perfil no encontrado", 404);
    }

    const applications = await db
      .select({
        id: empleoApplications.id,
        status: empleoApplications.status,
        message: empleoApplications.message,
        resumeUrl: empleoApplications.resumeUrl,
        createdAt: empleoApplications.createdAt,
        updatedAt: empleoApplications.updatedAt,
        listingId: empleoApplications.listingId,
        listingTitle: empleoListings.title,
        listingCategory: empleoListings.category,
        listingJobType: empleoListings.jobType,
        listingStatus: empleoListings.status,
        listingAcademyId: empleoListings.academyId,
        academyName: academies.name,
      })
      .from(empleoApplications)
      .leftJoin(empleoListings, eq(empleoApplications.listingId, empleoListings.id))
      .leftJoin(academies, eq(empleoListings.academyId, academies.id))
      .where(eq(empleoApplications.userId, profile.id))
      .orderBy(desc(empleoApplications.createdAt));

    return apiSuccess({ applications });
  } catch (error) {
    logger.error("Error fetching applications", error);
    return apiError("SERVER_ERROR", "Error del servidor", 500);
  }
}
