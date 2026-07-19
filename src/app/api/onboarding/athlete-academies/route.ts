import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { athletes, academies } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * GET /api/onboarding/athlete-academies
 * Returns the academies associated with the authenticated athlete user.
 * Uses the athletes table (userId -> academyId -> academies).
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHORIZED", "No autorizado", 401);
    }

    const userAthletes = await db
      .select({
        id: athletes.id,
        name: athletes.name,
        level: athletes.level,
        status: athletes.status,
        academyId: athletes.academyId,
      })
      .from(athletes)
      .where(eq(athletes.userId, user.id));

    if (userAthletes.length === 0) {
      return apiSuccess({ academies: [], hasAcademies: false });
    }

    // Get unique academy IDs
    const academyIds = [...new Set(userAthletes.map((a) => a.academyId))];

    const academyRecords = await db
      .select({
        id: academies.id,
        name: academies.name,
        academyType: academies.academyType,
      })
      .from(academies);

    const filtered = academyRecords.filter((a) => academyIds.includes(a.id));

    return apiSuccess({
      academies: filtered,
      hasAcademies: filtered.length > 0,
      count: filtered.length,
    });
  } catch (error) {
    logger.error("Error fetching athlete academies", error);
    return apiError("SERVER_ERROR", "Error al obtener academias del atleta", 500);
  }
}
