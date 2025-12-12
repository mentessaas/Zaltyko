import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { analyzeAthleteProgress, compareAssessments, type ProgressReportFilters } from "@/lib/reports/progress-analyzer";

const reportSchema = z.object({
  academyId: z.string().uuid(),
  athleteId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  skillId: z.string().uuid().optional(),
  compare: z.enum(["true", "false"]).optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    athleteId: url.searchParams.get("athleteId"),
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
    skillId: url.searchParams.get("skillId"),
    compare: url.searchParams.get("compare"),
  };

  const validated = reportSchema.parse({
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
    skillId: validated.skillId,
  };

  try {
    if (validated.compare === "true") {
      // Comparar dos períodos
      const endDate = validated.endDate ? new Date(validated.endDate) : new Date();
      const period1End = new Date(endDate);
      period1End.setMonth(period1End.getMonth() - 3);
      const period1Start = new Date(period1End);
      period1Start.setMonth(period1Start.getMonth() - 3);

      const comparison = await compareAssessments(
        filters,
        { start: period1Start, end: period1End },
        { start: period1End, end: endDate }
      );

      return NextResponse.json({ type: "comparison", data: comparison });
    } else {
      const report = await analyzeAthleteProgress(filters);

      if (!report) {
        return NextResponse.json(
          { error: "NO_ASSESSMENTS_FOUND" },
          { status: 404 }
        );
      }

      // Convertir fechas a strings para JSON
      return NextResponse.json({
        type: "progress",
        data: {
          ...report,
          period: {
            start: report.period.start.toISOString(),
            end: report.period.end.toISOString(),
          },
        },
      });
    }
  } catch (error: any) {
    console.error("Error generating progress report:", error);
    return NextResponse.json(
      { error: "REPORT_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

