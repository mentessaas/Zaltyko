import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { withTenant } from "@/lib/authz";
import { apiError } from "@/lib/api-response";
import { calculateCoachReport } from "@/lib/reports/coach-report";
import { createReportWorkbook, generateReportTablePdf } from "@/lib/reports/report-export";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { logger } from "@/lib/logger";
import { reportDateSchema, validateReportPeriod } from "@/lib/reports/query-schemas";

export const dynamic = "force-dynamic";

const exportSchema = z.object({
  academyId: z.string().uuid(),
  format: z.enum(["pdf", "excel"]).default("pdf"),
  startDate: reportDateSchema,
  endDate: reportDateSchema,
  coachId: z.string().uuid().optional(),
  sportConfigId: z.string().uuid().optional(),
}).superRefine(validateReportPeriod);

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  const parsed = exportSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError("INVALID_QUERY", "Parámetros del reporte inválidos", 400);
  const input = parsed.data;

  try {
    const [academy] = await db
      .select({ name: academies.name })
      .from(academies)
      .where(and(eq(academies.id, input.academyId), eq(academies.tenantId, context.tenantId)))
      .limit(1);
    if (!academy) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);

    const stats = await calculateCoachReport({
      academyId: input.academyId,
      tenantId: context.tenantId,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      coachId: input.coachId,
      sportConfigId: input.sportConfigId,
    });
    const period = [input.startDate, input.endDate].filter(Boolean).join(" – ") || "Todo el periodo";
    const table = {
      headers: ["Entrenador", "Clases", "Atletas", "Asistencia", "Sesiones"],
      rows: stats.coachPerformance.map((item) => [item.coachName, item.classesCount, item.athletesCount, `${item.averageAttendance}%`, item.sessionsConducted]),
    };

    if (input.format === "excel") {
      const workbook = createReportWorkbook([
        { name: "Resumen", rows: [
          { Métrica: "Total de entrenadores", Valor: stats.totalCoaches },
          { Métrica: "Entrenadores activos", Valor: stats.activeCoaches },
          { Métrica: "Total de clases", Valor: stats.totalClasses },
          { Métrica: "Asistencia media (%)", Valor: stats.averageAttendance },
        ] },
        { name: "Rendimiento", rows: stats.coachPerformance.map((item) => ({
          Entrenador: item.coachName,
          Clases: item.classesCount,
          Atletas: item.athletesCount,
          Asistencia: `${item.averageAttendance}%`,
          Sesiones: item.sessionsConducted,
        })) },
      ]);
      return new NextResponse(new Uint8Array(workbook), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=\"reporte-entrenadores.xlsx\"",
        },
      });
    }

    const pdf = generateReportTablePdf({
      title: "Reporte de Entrenadores",
      academyName: academy.name,
      period,
      summary: [
        ["Total de entrenadores", stats.totalCoaches],
        ["Entrenadores activos", stats.activeCoaches],
        ["Total de clases", stats.totalClasses],
        ["Asistencia media", `${stats.averageAttendance}%`],
      ],
      table,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"reporte-entrenadores.pdf\"",
      },
    });
  } catch (error) {
    logger.error("Error exporting coach report:", error);
    return apiError("EXPORT_FAILED", "Error al exportar el reporte", 500);
  }
});
