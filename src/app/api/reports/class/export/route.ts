import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import { withTenant } from "@/lib/authz";
import { apiError } from "@/lib/api-response";
import { calculateClassReport } from "@/lib/reports/class-report";
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
  classId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  sportConfigId: z.string().uuid().optional(),
}).superRefine(validateReportPeriod);

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  const url = new URL(request.url);
  const parsed = exportSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return apiError("INVALID_QUERY", "Parámetros del reporte inválidos", 400);
  const input = parsed.data;

  try {
    const [academy] = await db
      .select({ name: academies.name })
      .from(academies)
      .where(and(eq(academies.id, input.academyId), eq(academies.tenantId, context.tenantId)))
      .limit(1);
    if (!academy) return apiError("ACADEMY_NOT_FOUND", "Academia no encontrada", 404);

    const stats = await calculateClassReport({
      academyId: input.academyId,
      tenantId: context.tenantId,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      classId: input.classId,
      groupId: input.groupId,
      sportConfigId: input.sportConfigId,
    });
    const period = [input.startDate, input.endDate].filter(Boolean).join(" – ") || "Todo el periodo";
    const table = {
      headers: ["Clase", "Inscritos", "Asistencia", "Sesiones promedio"],
      rows: stats.popularClasses.map((item) => [item.className, item.enrollments, `${item.attendanceRate}%`, item.averageAttendance]),
    };

    if (input.format === "excel") {
      const workbook = createReportWorkbook([
        { name: "Resumen", rows: [
          { Métrica: "Total de clases", Valor: stats.totalClasses },
          { Métrica: "Total de sesiones", Valor: stats.totalSessions },
          { Métrica: "Total de inscripciones", Valor: stats.totalEnrollments },
          { Métrica: "Asistencia media (%)", Valor: stats.averageAttendance },
        ] },
        { name: "Clases populares", rows: stats.popularClasses.map((item) => ({
          Clase: item.className,
          Inscritos: item.enrollments,
          Asistencia: `${item.attendanceRate}%`,
          "Promedio por sesión": item.averageAttendance,
        })) },
      ]);
      return new NextResponse(new Uint8Array(workbook), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=\"reporte-clases.xlsx\"",
        },
      });
    }

    const pdf = generateReportTablePdf({
      title: "Reporte de Clases",
      academyName: academy.name,
      period,
      summary: [
        ["Total de clases", stats.totalClasses],
        ["Total de sesiones", stats.totalSessions],
        ["Total de inscripciones", stats.totalEnrollments],
        ["Asistencia media", `${stats.averageAttendance}%`],
      ],
      table,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"reporte-clases.pdf\"",
      },
    });
  } catch (error) {
    logger.error("Error exporting class report:", error);
    return apiError("EXPORT_FAILED", "Error al exportar el reporte", 500);
  }
});
