import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import {
  calculateFinancialStats,
  calculateMonthlyRevenue,
  analyzeDelinquency,
  projectRevenue,
  type FinancialReportFilters,
} from "@/lib/reports/financial-calculator";

const reportSchema = z.object({
  academyId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  athleteId: z.string().uuid().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  const params = {
    academyId: url.searchParams.get("academyId"),
    startDate: url.searchParams.get("startDate"),
    endDate: url.searchParams.get("endDate"),
    athleteId: url.searchParams.get("athleteId"),
  };

  const validated = reportSchema.parse({
    ...params,
    academyId: params.academyId || undefined,
  });

  if (!validated.academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  const filters: FinancialReportFilters = {
    academyId: validated.academyId,
    tenantId: context.tenantId,
    startDate: validated.startDate ? new Date(validated.startDate) : undefined,
    endDate: validated.endDate ? new Date(validated.endDate) : undefined,
    athleteId: validated.athleteId,
  };

  try {
    if (path.includes("/monthly")) {
      const monthlyData = await calculateMonthlyRevenue(filters);
      return NextResponse.json({ data: monthlyData });
    }

    if (path.includes("/delinquency")) {
      const delinquencyData = await analyzeDelinquency(filters);
      return NextResponse.json({ data: delinquencyData });
    }

    if (path.includes("/projections")) {
      const months = parseInt(url.searchParams.get("months") || "3");
      const projections = await projectRevenue(filters, months);
      return NextResponse.json({ data: projections });
    }

    // Reporte general
    const stats = await calculateFinancialStats(filters);
    return NextResponse.json({ data: stats });
  } catch (error: any) {
    console.error("Error generating financial report:", error);
    return NextResponse.json(
      { error: "REPORT_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

