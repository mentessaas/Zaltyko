import { NextResponse } from "next/server";
import { withTenant } from "@/lib/authz";
import { calculateAdvancedMetrics } from "@/lib/dashboard/metrics-calculator";

export const GET = withTenant(async (_request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const academyId = (context.params as { academyId?: string } | undefined)?.academyId;

  if (!academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const metrics = await calculateAdvancedMetrics(academyId, context.tenantId);
    return NextResponse.json({ data: metrics });
  } catch (error: any) {
    console.error("Error calculating advanced metrics:", error);
    return NextResponse.json(
      { error: "METRICS_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

