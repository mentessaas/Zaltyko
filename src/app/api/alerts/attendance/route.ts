import { z } from "zod";
import { withTenant } from "@/lib/authz";
import { detectAttendanceAlerts } from "@/lib/alerts/attendance-alerts";
import { apiSuccess, apiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";

const querySchema = z.object({
  academyId: z.string().uuid(),
  threshold: z.coerce.number().finite().min(0).max(100).optional(),
  daysToCheck: z.coerce.number().int().min(1).max(3660).optional(),
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

  const validated = querySchema.safeParse({
    ...params,
    academyId: params.academyId || undefined,
    threshold: params.threshold || undefined,
    daysToCheck: params.daysToCheck || undefined,
  });

  if (!validated.success) {
    return apiError("INVALID_QUERY", "Parámetros de alertas inválidos", 400);
  }

  if (!validated.data.academyId) {
    return apiError("ACADEMY_ID_REQUIRED", "academyId requerido", 400);
  }

  try {
    const threshold = validated.data.threshold ?? 70;
    const daysToCheck = validated.data.daysToCheck ?? 30;
    const alerts = await detectAttendanceAlerts(
      validated.data.academyId,
      context.tenantId,
      threshold,
      daysToCheck
    );

    return apiSuccess({ items: alerts });
  } catch (error: unknown) {
    logger.error("Error detecting attendance alerts:", error);
    // Un error de datos no equivale a "sin riesgo". Devolver 200 vacío
    // ocultaba incidencias de base de datos y hacía que el dashboard pareciera
    // saludable cuando no había podido consultar la asistencia.
    return apiError(
      "ATTENDANCE_ALERTS_FAILED",
      "No se pudo analizar la asistencia. Inténtalo de nuevo.",
      500,
    );
  }
});
