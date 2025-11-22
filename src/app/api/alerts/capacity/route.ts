import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { detectCapacityAlerts } from "@/lib/alerts/capacity-alerts";

const querySchema = z.object({
  academyId: z.string().uuid(),
  threshold: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    threshold: url.searchParams.get("threshold"),
  };

  const validated = querySchema.parse({
    ...params,
    academyId: params.academyId || undefined,
  });

  if (!validated.academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const threshold = validated.threshold ? parseFloat(validated.threshold) : 90;
    const alerts = await detectCapacityAlerts(
      validated.academyId,
      context.tenantId,
      threshold
    );

    return NextResponse.json({ items: alerts });
  } catch (error: any) {
    console.error("Error detecting capacity alerts:", error);
    return NextResponse.json(
      { error: "ALERTS_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

