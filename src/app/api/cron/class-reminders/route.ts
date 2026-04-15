import { headers } from "next/headers";
import { sendClassReminders } from "@/lib/alerts/class-reminders";
import { db } from "@/db";
import { academies, profiles } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(request: Request) {
  // Verificar que la solicitud viene de Vercel Cron
  const authHeader = (await headers()).get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiError("UNAUTHORIZED", "No autorizado", 401);
  }

  try {
    // Obtener todas las academias activas
    const allAcademies = await db
      .select({
        id: academies.id,
        tenantId: academies.tenantId,
      })
      .from(academies);

    // Enviar recordatorios para cada academia
    for (const academy of allAcademies) {
      try {
        // Obtener IDs de usuarios administradores y owners
        const adminProfiles = await db
          .select({ userId: profiles.userId })
          .from(profiles)
          .where(
            eq(profiles.tenantId, academy.tenantId) &&
            inArray(profiles.role, ["owner", "admin", "super_admin"])
          );

        const adminUserIds = adminProfiles.map(p => p.userId);

        await sendClassReminders(academy.id, academy.tenantId, 24);
      } catch (error) {
        logger.error(`Error sending reminders for academy ${academy.id}`, error, { academyId: academy.id });
        // Continuar con la siguiente academia
      }
    }

    return apiSuccess({
      ok: true,
      message: "Class reminders sent successfully",
      academiesProcessed: allAcademies.length,
    });
  } catch (error: any) {
    logger.error("Error in class reminders cron", error);
    return apiError("CRON_FAILED", error.message, 500);
  }
}
