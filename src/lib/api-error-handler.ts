import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { apiError as standardizedApiError } from "./api-response";
import { logger } from "./logger";

export interface ApiError {
  error: string;
  message?: string;
  details?: unknown;
}

/**
 * Wrapper para manejar errores de manera consistente en todos los endpoints
 */
export function handleApiError(error: unknown, context?: { endpoint?: string; method?: string }): NextResponse<ApiError> {
  // Error de validación Zod
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));

    logger.warn("Validation error", {
      ...context,
      issues,
    });

    return standardizedApiError("VALIDATION_ERROR", "Los datos proporcionados no son válidos", 400, issues);
  }

  // Error con status code personalizado
  if (error && typeof error === "object" && "status" in error) {
    const status = typeof error.status === "number" ? error.status : 500;
    const message = "message" in error ? String(error.message) : undefined;

    if (status >= 500) {
      logger.error(`API error with status ${status}`, error, context);
    } else {
      logger.warn(`API error with status ${status}`, { ...context, message });
    }

    return standardizedApiError(message ?? "UNKNOWN_ERROR", message ?? "Error de API", status);
  }

  // Error estándar de JavaScript
  if (error instanceof Error) {
    logger.apiError(context?.endpoint ?? "unknown", context?.method ?? "unknown", error, context);
    
    // En desarrollo, incluir más detalles del error
    const errorDetails: ApiError = {
      error: "INTERNAL_ERROR",
      message: error.message,
    };
    
    if (process.env.NODE_ENV === "development") {
      (errorDetails as any).stack = error.stack;
      (errorDetails as any).name = error.name;
      if ("code" in error) {
        (errorDetails as any).code = (error as any).code;
      }
      if ("detail" in error) {
        (errorDetails as any).detail = (error as any).detail;
      }
    }
    
    return standardizedApiError("INTERNAL_ERROR", error.message, 500, errorDetails);
  }

  // Error desconocido
  logger.error("Unknown API error", error, context);
  return standardizedApiError("UNKNOWN_ERROR", "Ha ocurrido un error desconocido", 500);
}

/**
 * Wrapper para endpoints que maneja errores automáticamente
 */
export function withErrorHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error as Error);
    }
  };
}

/**
 * Helper para crear respuestas de error consistentes
 */
export function createErrorResponse(
  error: string,
  message?: string,
  status: number = 400
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error,
      message,
    },
    { status }
  );
}

/**
 * Helper para crear respuestas de éxito consistentes
 */
export function createSuccessResponse<T = unknown>(
  data: T,
  status: number = 200
): NextResponse<{ ok: true; data: T }> {
  return NextResponse.json({ ok: true, data }, { status });
}
