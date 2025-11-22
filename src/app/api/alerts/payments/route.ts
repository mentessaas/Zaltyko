import { NextResponse } from "next/server";
import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { detectPaymentAlerts } from "@/lib/alerts/payment-alerts";

const querySchema = z.object({
  academyId: z.string().uuid(),
  daysOverdue: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return NextResponse.json({ error: "TENANT_REQUIRED" }, { status: 400 });
  }

  const url = new URL(request.url);
  const params = {
    academyId: url.searchParams.get("academyId"),
    daysOverdue: url.searchParams.get("daysOverdue"),
  };

  const validated = querySchema.parse({
    ...params,
    academyId: params.academyId || undefined,
  });

  if (!validated.academyId) {
    return NextResponse.json({ error: "ACADEMY_ID_REQUIRED" }, { status: 400 });
  }

  try {
    const daysOverdue = validated.daysOverdue ? parseInt(validated.daysOverdue) : 7;
    const alerts = await detectPaymentAlerts(
      validated.academyId,
      context.tenantId,
      daysOverdue
    );

    return NextResponse.json({ items: alerts });
  } catch (error: any) {
    console.error("Error detecting payment alerts:", error);
    return NextResponse.json(
      { error: "ALERTS_FAILED", message: error.message },
      { status: 500 }
    );
  }
});

