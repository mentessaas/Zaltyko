import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { sendClassReminders } from "@/lib/alerts/class-reminders";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  academyId: z.string().uuid(),
  hoursBefore: z.string().optional(),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const body = await request.json().catch(() => ({}));
  const validated = querySchema.parse({
    academyId: body.academyId,
    hoursBefore: body.hoursBefore,
  });

  if (!validated.academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "academyId requerido", 400);
  }

  try {
    const hoursBefore = validated.hoursBefore ? parseInt(validated.hoursBefore) : 24;
    await sendClassReminders(validated.academyId, context.tenantId, hoursBefore);

    return apiSuccess({ ok: true });
  } catch (error: any) {
    logger.error("Error sending class reminders:", error);
    return apiError("REMINDERS_FAILED", error.message, 500);
  }
});
