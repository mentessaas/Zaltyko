import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { detectAttendanceAlerts } from "@/lib/alerts/attendance-alerts";
import { apiSuccess, apiError } from "@/lib/api-response";

const querySchema = z.object({
  academyId: z.string().uuid(),
  threshold: z.string().optional(),
  daysToCheck: z.string().optional(),
});

export const GET = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
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
    return apiError("ACADEMY_ID_REQUIRED", "academyId requerido", 400);
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

    return apiSuccess({ items: alerts });
  } catch (error: any) {
    console.error("Error detecting attendance alerts:", error);
    return apiError("ALERTS_FAILED", error.message, 500);
  }
});
