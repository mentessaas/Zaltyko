import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, academies, subscriptions, plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUserSubscription } from "@/lib/limits";
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
      return apiSuccess({
        planCode: "free",
        academyLimit: 1,
        currentAcademyCount: 0,
        canCreateMore: true,
      });
    }

    // Obtener suscripción y plan
    const subscription = await getUserSubscription(user.id);

    // Contar academias del usuario
    const userAcademies = await db
      .select({ id: academies.id })
      .from(academies)
      .where(eq(academies.ownerId, profile.id));

    const academyCount = userAcademies.length;
    const academyLimit = subscription.academyLimit;
    const canCreateMore = academyLimit === null || academyCount < academyLimit;

    // Determinar plan de upgrade sugerido
    let upgradeTo: "pro" | "premium" | undefined = undefined;
    if (!canCreateMore) {
      if (subscription.planCode === "free") {
        upgradeTo = "pro";
      } else if (subscription.planCode === "pro") {
        upgradeTo = "premium";
      }
    }

    return apiSuccess({
      planCode: subscription.planCode,
      academyLimit,
      currentAcademyCount: academyCount,
      canCreateMore,
      upgradeTo,
    });
  } catch (error: any) {
    logger.error("Error fetching user plan", error);
    return apiError("SERVER_ERROR", error?.message ?? "Error al obtener información del plan", 500);
  }
}
