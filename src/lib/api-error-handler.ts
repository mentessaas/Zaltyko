import { NextResponse } from "next/server";
import { ZodError } from "zod";
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

    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: "Los datos proporcionados no son válidos",
        details: issues,
      },
      { status: 400 }
    );
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

    return NextResponse.json(
      {
        error: message ?? "UNKNOWN_ERROR",
        message: message,
      },
      { status }
    );
  }

  // Error estándar de JavaScript
  if (error instanceof Error) {
    logger.apiError(context?.endpoint ?? "unknown", context?.method ?? "unknown", error, context);
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: process.env.NODE_ENV === "development" ? error.message : "Ha ocurrido un error interno",
      },
      { status: 500 }
    );
  }

  // Error desconocido
  logger.error("Unknown API error", error, context);
  return NextResponse.json(
    {
      error: "UNKNOWN_ERROR",
      message: "Ha ocurrido un error desconocido",
    },
    { status: 500 }
  );
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
      return handleApiError(error);
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

