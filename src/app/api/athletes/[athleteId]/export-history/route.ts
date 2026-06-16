export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { generateAttendancePDF } from "@/lib/reports/pdf-generator";
import { db } from "@/db";
import { athletes, academies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const athleteId = (context.params as { athleteId?: string } | undefined)?.athleteId;

  if (!athleteId) {
    return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
  }

  try {
    // Obtener nombre de la academia desde el atleta
    const [athlete] = await db
      .select({
        academyId: athletes.academyId,
      })
      .from(athletes)
      .where(eq(athletes.id, athleteId))
      .limit(1);

    let academyName = "Academia";
    if (athlete?.academyId) {
      const [academy] = await db
        .select({ name: academies.name })
        .from(academies)
        .where(eq(academies.id, athlete.academyId))
        .limit(1);
      if (academy?.name) {
        academyName = academy.name;
      }
    }

    // Obtener historial completo
    const historyResponse = await fetch(
      `${request.url.split("/export-history")[0]}/history`,
      {
        headers: {
          cookie: request.headers.get("cookie") || "",
        },
      }
    );

    if (!historyResponse.ok) {
      throw new Error("Error al obtener historial");
    }

    const historyData = await historyResponse.json();

    // Generar PDF
    const pdfBuffer = await generateAttendancePDF({
      title: `Historial de Evaluaciones`,
      academyName: academyName,
      stats: {
        totalSessions: historyData.items?.length || 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        attendanceRate: 0,
      },
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="historial-${athleteId}.pdf"`,
      },
    });
  } catch (error: any) {
    logger.error("Error exporting history:", error);
    return apiError("EXPORT_FAILED", error.message || "Export failed", 500);
  }
});

