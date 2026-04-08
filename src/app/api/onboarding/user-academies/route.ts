import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, academies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = 'force-dynamic';

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

    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    if (!profile) {
      return apiSuccess({ academies: [], hasAcademies: false });
    }

    const userAcademies = await db
      .select({
        id: academies.id,
        name: academies.name,
        academyType: academies.academyType,
      })
      .from(academies)
      .where(eq(academies.ownerId, profile.id));

    return apiSuccess({
      academies: userAcademies,
      hasAcademies: userAcademies.length > 0,
      count: userAcademies.length,
    });
  } catch (error: any) {
    logger.error("Error fetching user academies", error);
    return apiError("SERVER_ERROR", error?.message ?? "Error al obtener academias", 500);
  }
}
