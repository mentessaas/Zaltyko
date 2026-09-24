import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { analyzeAthleteProgress, type ProgressReportFilters } from "@/lib/reports/progress-analyzer";
import { generateProgressPDF } from "@/lib/reports/pdf-generator";
import { createReportWorkbook } from "@/lib/reports/report-export";
import { db } from "@/db";
import { academies } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { reportDateSchema, validateReportPeriod } from "@/lib/reports/query-schemas";

// Forzar ruta dinámica
export const dynamic = 'force-dynamic';

const exportSchema = z.object({
  academyId: z.string().uuid(),
  athleteId: z.string().uuid(),
  format: z.enum(["pdf", "excel"]).default("pdf"),
  startDate: reportDateSchema,
  endDate: reportDateSchema,
}).superRefine(validateReportPeriod);

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    athleteId: url.searchParams.get("athleteId"),
    format: url.searchParams.get("format") || "pdf",
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
  };

  const parsed = exportSchema.safeParse({
    ...params,
    academyId: params.academyId || undefined,
    athleteId: params.athleteId || undefined,
  });
  if (!parsed.success) {
    return apiError("INVALID_QUERY", "Parámetros del reporte inválidos", 400);
  }
  const validated = parsed.data;

  if (!validated.academyId || !validated.athleteId) {
    return apiError("ACADEMY_ID_AND_ATHLETE_ID_REQUIRED", "Academy ID and Athlete ID are required", 400);
  }

  const filters: ProgressReportFilters = {
    academyId: validated.academyId,
    tenantId: context.tenantId,
    athleteId: validated.athleteId,
    startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    endDate: validated.endDate ? new Date(validated.endDate) : undefined,
  };

  try {
    const report = await analyzeAthleteProgress(filters);

    if (!report) {
      return apiError("NO_ASSESSMENTS_FOUND", "No assessments found", 404);
    }

    // Obtener nombre de la academia
    let academyName = "Academia";
    const [academy] = await db
      .select({ name: academies.name })
      .from(academies)
      .where(and(eq(academies.id, validated.academyId), eq(academies.tenantId, context.tenantId)))
      .limit(1);
    if (academy?.name) {
      academyName = academy.name;
    }

    if (validated.format === "excel") {
      const workbook = createReportWorkbook([
        {
          name: "Resumen",
          rows: [
            { Métrica: "Atleta", Valor: report.athleteName },
            { Métrica: "Evaluaciones", Valor: report.totalAssessments },
            { Métrica: "Mejora general", Valor: report.overallImprovement },
          ],
        },
        {
          name: "Habilidades",
          rows: report.skills.map((skill) => ({
            Habilidad: skill.skillName,
            Inicial: skill.firstScore ?? "",
            Última: skill.lastScore ?? "",
            Cambio: skill.improvement,
            Tendencia: skill.trend,
          })),
        },
      ]);
      return new NextResponse(new Uint8Array(workbook), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="reporte-progreso-${report.athleteName}.xlsx"`,
        },
      });
    }

    // Generar PDF
    const pdfBuffer = await generateProgressPDF({
      title: `Reporte de Progreso - ${report.athleteName}`,
      academyName: academyName,
      athleteName: report.athleteName,
      totalAssessments: report.totalAssessments,
      overallImprovement: report.overallImprovement,
      skills: report.skills,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="reporte-progreso-${report.athleteName}.pdf"`,
      },
    });
  } catch (error: unknown) {
    logger.error("Error exporting progress report:", error);
    return apiError("EXPORT_FAILED", "Error al exportar los datos", 500);
  }
});
