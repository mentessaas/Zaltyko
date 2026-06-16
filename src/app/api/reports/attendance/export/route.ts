import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { generateAttendancePDF } from "@/lib/reports/pdf-generator";
import {
  calculateAthleteAttendance,
  calculateGroupAttendance,
  calculateGeneralAttendance,
  type AttendanceReportFilters,
} from "@/lib/reports/attendance-calculator";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { logger } from "@/lib/logger";

// Forzar ruta dinámica
export const dynamic = 'force-dynamic';

const exportSchema = z.object({
  academyId: z.string().uuid(),
  format: z.enum(["pdf", "excel"]).default("pdf"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  athleteId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  reportType: z.enum(["athlete", "group", "general"]).default("general"),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    format: url.searchParams.get("format") || "pdf",
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
    athleteId: url.searchParams.get("athleteId"),
    groupId: url.searchParams.get("groupId"),
    classId: url.searchParams.get("classId"),
    reportType: url.searchParams.get("reportType") || "general",
  };

  const validated = exportSchema.parse({
    ...params,
    academyId: params.academyId || undefined,
  });

  if (!validated.academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "Academy ID is required", 400);
  }

  const filters: AttendanceReportFilters = {
    academyId: validated.academyId,
    tenantId: context.tenantId,
    startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    endDate: validated.endDate ? new Date(validated.endDate) : undefined,
    athleteId: validated.athleteId,
    groupId: validated.groupId,
    classId: validated.classId,
  };

  try {
    let reportData: any;
    let title = "Reporte de Asistencia";

    switch (validated.reportType) {
      case "athlete":
        if (!validated.athleteId) {
          return apiError("ATHLETE_ID_REQUIRED", "Athlete ID is required", 400);
        }
        reportData = await calculateAthleteAttendance(filters);
        title = `Reporte de Asistencia - ${reportData?.athleteName || "Atleta"}`;
        break;

      case "group":
        if (!validated.groupId) {
          return apiError("GROUP_ID_REQUIRED", "Group ID is required", 400);
        }
        reportData = await calculateGroupAttendance(filters);
        title = `Reporte de Asistencia - Grupo`;
        break;

      case "general":
      default:
        reportData = await calculateGeneralAttendance(filters);
        title = "Reporte General de Asistencia";
        break;
    }

    if (validated.format === "excel") {
      // Generar Excel
      const workbook = XLSX.utils.book_new();
      
      if (validated.reportType === "general") {
        const worksheet = XLSX.utils.json_to_sheet([
          { Métrica: "Total Sesiones", Valor: reportData.totalSessions },
          { Métrica: "Presentes", Valor: reportData.present },
          { Métrica: "Ausentes", Valor: reportData.absent },
          { Métrica: "Tarde", Valor: reportData.late },
          { Métrica: "Justificados", Valor: reportData.excused },
          { Métrica: "Tasa de Asistencia (%)", Valor: reportData.attendanceRate },
        ]);
        XLSX.utils.book_append_sheet(workbook, worksheet, "Asistencia");
      } else if (validated.reportType === "athlete" && reportData) {
        const statsSheet = XLSX.utils.json_to_sheet([
          { Métrica: "Total Sesiones", Valor: reportData.stats.totalSessions },
          { Métrica: "Presentes", Valor: reportData.stats.present },
          { Métrica: "Ausentes", Valor: reportData.stats.absent },
          { Métrica: "Tarde", Valor: reportData.stats.late },
          { Métrica: "Justificados", Valor: reportData.stats.excused },
          { Métrica: "Tasa de Asistencia (%)", Valor: reportData.stats.attendanceRate },
        ]);
        XLSX.utils.book_append_sheet(workbook, statsSheet, "Estadísticas");
        
        if (reportData.sessions && reportData.sessions.length > 0) {
          const sessionsSheet = XLSX.utils.json_to_sheet(reportData.sessions);
          XLSX.utils.book_append_sheet(workbook, sessionsSheet, "Sesiones");
        }
      }

      const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
      
      return new NextResponse(excelBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="reporte-asistencia.xlsx"`,
        },
      });
    } else {
      // Obtener nombre de la academia
      let academyName = "Academia";
      const [academy] = await db
        .select({ name: academies.name })
        .from(academies)
        .where(eq(academies.id, validated.academyId))
        .limit(1);
      if (academy?.name) {
        academyName = academy.name;
      }

      // Generar PDF
      const stats = validated.reportType === "athlete" && reportData ? reportData.stats : reportData;
      const pdfBuffer = await generateAttendancePDF({
        title,
        academyName: academyName,
        stats,
        details: validated.reportType === "athlete" && reportData ? reportData.sessions : undefined,
      });

      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="reporte-asistencia.pdf"`,
        },
      });
    }
  } catch (error: any) {
    logger.error("Error exporting report:", error);
    return apiError("EXPORT_FAILED", error.message, 500);
  }
});

