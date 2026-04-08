import { apiSuccess, apiError } from "@/lib/api-response";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { classes } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { generateRecurringSessions } from "@/lib/sessions-generator";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  classId: z.string().uuid(),
  startDate: z.string().min(1), // ISO date string
  endDate: z.string().min(1), // ISO date string
});

export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant ID is required", 400);
  }

  const body = bodySchema.parse(await request.json());

  // Validar que la clase existe y pertenece al tenant
  const [classRow] = await db
    .select({
      id: classes.id,
      name: classes.name,
    })
    .from(classes)
    .where(and(eq(classes.id, body.classId), eq(classes.tenantId, context.tenantId)))
    .limit(1);

  if (!classRow) {
    return apiError("CLASS_NOT_FOUND", "Class not found", 404);
  }

  // Validar fechas
  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return apiError("INVALID_DATE_FORMAT", "Invalid date format", 400);
  }

  if (startDate > endDate) {
    return apiError("INVALID_DATE_RANGE", "La fecha de inicio debe ser anterior a la fecha de fin", 400);
  }

  try {
    const result = await generateRecurringSessions({
      classId: body.classId,
      tenantId: context.tenantId,
      startDate,
      endDate,
    });

    return apiSuccess({
      ok: true,
      ...result,
      className: classRow.name,
    });
  } catch (error: any) {
    logger.error("Error generating sessions", error);

    if (error.message === "CLASS_NOT_FOUND") {
      return apiError("CLASS_NOT_FOUND", "Class not found", 404);
    }

    if (error.message === "CLASS_HAS_NO_WEEKDAY") {
      return apiError("CLASS_HAS_NO_WEEKDAY", error.message, 400);
    }

    if (error.message?.includes("RANGE_TOO_LARGE")) {
      return apiError("RANGE_TOO_LARGE", error.message, 400);
    }

    return apiError("GENERATION_FAILED", error.message ?? "Error al generar sesiones", 500);
  }
});

