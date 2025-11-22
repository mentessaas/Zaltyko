import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { analyzeAthleteProgress, type ProgressReportFilters } from "@/lib/reports/progress-analyzer";
import { generateAttendancePDF } from "@/lib/reports/pdf-generator";

// Forzar ruta dinámica
export const dynamic = 'force-dynamic';

const exportSchema = z.object({
  academyId: z.string().uuid(),
  athleteId: z.string().uuid(),
  format: z.enum(["pdf"]).default("pdf"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    athleteId: url.searchParams.get("athleteId"),
    format: url.searchParams.get("format") || "pdf",
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
  };

  const validated = exportSchema.parse({
    ...params,
    academyId: params.academyId || undefined,
    athleteId: params.athleteId || undefined,
  });

  if (!validated.academyId || !validated.athleteId) {
    return NextResponse.json(
      { error: "ACADEMY_ID_AND_ATHLETE_ID_REQUIRED" },
      { status: 400 }
    );
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
      return NextResponse.json(
        { error: "NO_ASSESSMENTS_FOUND" },
        { status: 404 }
      );
    }

    // Generar PDF (placeholder hasta instalar jsPDF)
    const pdfBuffer = await generateAttendancePDF({
      title: `Reporte de Progreso - ${report.athleteName}`,
      academyName: "Academia", // TODO: obtener nombre real
      stats: {
        totalSessions: report.totalAssessments,
        present: report.areasOfImprovement.length,
        absent: report.areasOfConcern.length,
        late: 0,
        excused: 0,
        attendanceRate: report.overallImprovement,
      },
    });

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="reporte-progreso-${report.athleteName}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("Error exporting progress report:", error);
    return NextResponse.json(
      { error: "EXPORT_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

