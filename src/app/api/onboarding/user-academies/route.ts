import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, academies, memberships } from "@/db/schema";
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

    const ownedAcademies = await db
      .select({
        id: academies.id,
        name: academies.name,
        academyType: academies.academyType,
        role: profiles.role,
      })
      .from(academies)
      .innerJoin(profiles, eq(academies.ownerId, profiles.id))
      .where(eq(academies.ownerId, profile.id))
      .limit(1000);

    // Un entrenador, padre o atleta normalmente llega por invitación y no es
    // propietario. Consultar memberships es la fuente correcta para mostrar
    // las academias a las que realmente tiene acceso.
    const memberAcademies = await db
      .select({
        id: academies.id,
        name: academies.name,
        academyType: academies.academyType,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(academies, eq(academies.id, memberships.academyId))
      .where(eq(memberships.userId, user.id))
      .limit(1000);

    const userAcademies = Array.from(
      new Map([...ownedAcademies, ...memberAcademies].map((academy) => [academy.id, academy])).values()
    );

    return apiSuccess({
      academies: userAcademies,
      hasAcademies: userAcademies.length > 0,
      count: userAcademies.length,
    });
  } catch (error: unknown) {
    logger.error("Error fetching user academies", error);
    return apiError("SERVER_ERROR", "Error al obtener academias", 500);
  }
}
