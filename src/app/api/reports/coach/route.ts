export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { calculateCoachReport, type CoachReportFilters } from "@/lib/reports/coach-report";

const reportSchema = z.object({
  academyId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  coachId: z.string().uuid().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
    coachId: url.searchParams.get("coachId"),
  };

  const validated = reportSchema.parse({
    ...params,
    academyId: params.academyId || undefined,
  });

  if (!validated.academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  const filters: CoachReportFilters = {
    academyId: validated.academyId,
    tenantId: context.tenantId,
    startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    endDate: validated.endDate ? new Date(validated.endDate) : undefined,
    coachId: validated.coachId,
  };

  try {
    const stats = await calculateCoachReport(filters);
    return NextResponse.json({ data: stats });
  } catch (error: any) {
    console.error("Error generating coach report:", error);
    return NextResponse.json(
      { error: "REPORT_FAILED", message: error.message },
      { status: 500 }
    );
  }
});
