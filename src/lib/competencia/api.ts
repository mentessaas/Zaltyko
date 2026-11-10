import type { z } from "zod";

import { apiError } from "@/lib/api-response";
import { logAdminAction } from "@/lib/admin-logs";

import { CompetenciaNotFoundError } from "./mutations";
import { isMissingTableError, isUniqueViolation } from "./storage";

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

export function validationError(error: z.ZodError) {
  return apiError(
    "VALIDATION_ERROR",
    error.issues[0]?.message ?? "Datos inválidos",
    400
  );
}

/** Traduce errores conocidos del dominio a respuestas estándar; el resto se propaga. */
export function competenciaErrorResponse(
  error: unknown,
  duplicateMessage = "Ya existe un registro con esos datos"
) {
  if (error instanceof CompetenciaNotFoundError) {
    return apiError("NOT_FOUND", error.message, 404);
  }
  if (isUniqueViolation(error)) {
    return apiError("ALREADY_EXISTS", duplicateMessage, 409);
  }
  if (isMissingTableError(error)) {
    return apiError(
      "COMPETENCIA_UNAVAILABLE",
      "El panel de competencia no está disponible: falta aplicar la migración candidata.",
      503
    );
  }
  throw error;
}

export async function logCompetenciaAction(params: {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string | null;
  description: string;
}) {
  await logAdminAction({
    userId: params.userId,
    tenantId: null,
    action: `competencia.${params.action}`,
    module: "admin",
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    resourceName: params.resourceName ?? null,
    description: params.description,
  });
}
