import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { sendClassReminders } from "@/lib/alerts/class-reminders";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  academyId: z.string().uuid(),
  hoursBefore: z.coerce.number().int().min(0).max(168).default(24),
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }

  const body = await request.json().catch(() => ({}));
  const validated = querySchema.safeParse({
    academyId: body.academyId,
    hoursBefore: body.hoursBefore,
  });

  if (!validated.success) {
    return apiError("INVALID_QUERY", "Parámetros de recordatorios inválidos", 400);
  }

  try {
    await sendClassReminders(
      validated.data.academyId,
      context.tenantId,
      validated.data.hoursBefore
    );

    return apiSuccess({ ok: true });
  } catch (error: unknown) {
    logger.error("Error sending class reminders:", error);
    return apiError("REMINDERS_FAILED", "Error al enviar recordatorios", 500);
  }
});
