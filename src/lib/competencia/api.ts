import type { z } from "zod";

import { apiError } from "@/lib/api-response";
import { logAdminAction } from "@/lib/admin-logs";
import { logger } from "@/lib/logger";

import {
  CompetenciaNotFoundError,
  CompetenciaReferenceError,
} from "./mutations";
import {
  isCheckViolation,
  isForeignKeyViolation,
  isMissingTableError,
  isUniqueViolation,
} from "./pg-errors";

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
  if (error instanceof CompetenciaReferenceError) {
    return apiError("INVALID_REFERENCE", error.message, 400);
  }
  if (isUniqueViolation(error)) {
    return apiError("ALREADY_EXISTS", duplicateMessage, 409);
  }
  if (isForeignKeyViolation(error)) {
    return apiError(
      "INVALID_REFERENCE",
      "Uno de los registros vinculados no existe",
      400
    );
  }
  if (isCheckViolation(error)) {
    return apiError(
      "VALIDATION_ERROR",
      "Algún dato no cumple las reglas de la base de datos",
      400
    );
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

/**
 * Registro de auditoría posterior al commit. Si falla, el cambio ya está
 * guardado (y tiene su evento en `ci_change_events`): se registra el fallo y no
 * se devuelve un 500 que haría creer al usuario que no se guardó.
 */
export async function logCompetenciaAction(params: {
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string | null;
  description: string;
}) {
  try {
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
  } catch (error) {
    logger.error(
      "competencia: no se pudo registrar la acción en admin logs",
      error,
      {
        action: `competencia.${params.action}`,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
      }
    );
  }
}
