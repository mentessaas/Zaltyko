import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { sendClassReminders } from "@/lib/alerts/class-reminders";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { eq } from "drizzle-orm";

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

    // Enviar recordatorios para cada academia
    for (const academy of allAcademies) {
      try {
        // Obtener IDs de usuarios administradores (simplificado)
        // En producción, deberías obtener los IDs reales de los administradores
        const adminUserIds: string[] = []; // TODO: Obtener IDs reales

        await sendClassReminders(academy.id, academy.tenantId, 24);
      } catch (error) {
        console.error(`Error sending reminders for academy ${academy.id}:`, error);
        // Continuar con la siguiente academia
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Class reminders sent successfully",
      academiesProcessed: allAcademies.length,
    });
  } catch (error: any) {
    console.error("Error in class reminders cron:", error);
    return NextResponse.json(
      { error: "CRON_FAILED", message: error.message },
      { status: 500 }
    );
  }
}

