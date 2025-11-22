import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { detectAttendanceAlerts } from "@/lib/alerts/attendance-alerts";

const querySchema = z.object({
  academyId: z.string().uuid(),
  threshold: z.string().optional(),
  daysToCheck: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    threshold: url.searchParams.get("threshold"),
    daysToCheck: url.searchParams.get("daysToCheck"),
  };

  const validated = querySchema.parse({
    ...params,
    academyId: params.academyId || undefined,
  });

  if (!validated.academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const threshold = validated.threshold ? parseFloat(validated.threshold) : 70;
    const daysToCheck = validated.daysToCheck ? parseInt(validated.daysToCheck) : 30;
    const alerts = await detectAttendanceAlerts(
      validated.academyId,
      context.tenantId,
      threshold,
      daysToCheck
    );

    return NextResponse.json({ items: alerts });
  } catch (error: any) {
    console.error("Error detecting attendance alerts:", error);
    return NextResponse.json(
      { error: "ALERTS_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

