import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createCapacityNotifications } from "@/lib/alerts/capacity-alerts";
import { createPaymentNotifications } from "@/lib/alerts/payment-alerts";
import { createAttendanceNotifications } from "@/lib/alerts/attendance/createAttendanceNotifications";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  // Verificar que la solicitud viene de Vercel Cron
  const authHeader = headers().get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    // Obtener todas las academias activas
    const allAcademies = await db
      .select({
        id: academies.id,
        tenantId: academies.tenantId,
      })
      .from(academies);

    const results = {
      capacityAlerts: 0,
      paymentAlerts: 0,
      attendanceAlerts: 0,
    };

    // Procesar alertas para cada academia
    for (const academy of allAcademies) {
      try {
        // Obtener IDs de usuarios administradores y coaches
        // TODO: Obtener IDs reales de la base de datos
        const adminUserIds: string[] = [];
        const coachUserIds: string[] = [];

        // Alertas de capacidad
        try {
          await createCapacityNotifications(academy.id, academy.tenantId, adminUserIds);
          results.capacityAlerts++;
        } catch (error) {
          logger.error(`Error creating capacity alerts for academy ${academy.id}`, error, { academyId: academy.id });
        }

        // Alertas de pagos
        try {
          await createPaymentNotifications(academy.id, academy.tenantId, adminUserIds);
          results.paymentAlerts++;
        } catch (error) {
          logger.error(`Error creating payment alerts for academy ${academy.id}`, error, { academyId: academy.id });
        }

        // Alertas de asistencia
        try {
          await createAttendanceNotifications(
            academy.id,
            academy.tenantId,
            adminUserIds,
            coachUserIds
          );
          results.attendanceAlerts++;
        } catch (error) {
          logger.error(`Error creating attendance alerts for academy ${academy.id}`, error, { academyId: academy.id });
        }
      } catch (error) {
        logger.error(`Error processing alerts for academy ${academy.id}`, error, { academyId: academy.id });
        // Continuar con la siguiente academia
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Daily alerts processed successfully",
      academiesProcessed: allAcademies.length,
      results,
    });
  } catch (error: any) {
    logger.error("Error in daily alerts cron", error);
    return NextResponse.json(
      { error: "CRON_FAILED", message: error.message },
      { status: 500 }
    );
  }
}

