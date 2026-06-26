import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { apiError as standardizedApiError } from "./api-response";
import { isAppError, AppError } from "./errors";
import { logger } from "./logger";

export interface ApiError {
  error: string;
  message?: string;
  details?: unknown;
}

/**
 * Wrapper para manejar errores de manera consistente en todos los endpoints.
 * AppError primero (status code explicito), luego Zod, luego genericos.
 */
export function handleApiError(
  error: unknown,
  context?: { endpoint?: string; method?: string }
): NextResponse<ApiError> {
  if (isAppError(error)) {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      logger.error(`AppError ${error.code}`, error, context);
    } else {
      logger.warn(`AppError ${error.code}`, { ...context, message: error.message });
    }
    return standardizedApiError(
      error.code ?? "APP_ERROR",
      error.message,
      status,
      error.details
    );
  }

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

  if (error && typeof error === "object" && "status" in error && typeof (error as Record<string, unknown>).status === "number") {
    const status = (error as Record<string, unknown>).status as number;
    const message = "message" in error ? String((error as Record<string, unknown>).message) : undefined;

    if (status >= 500) {
      logger.error(`API error with status ${status}`, error, context);
    } else {
      logger.warn(`API error with status ${status}`, { ...context, message });
    }

    return standardizedApiError(message ?? "UNKNOWN_ERROR", message ?? "Error de API", status);
  }

  if (error instanceof Error) {
    logger.apiError(context?.endpoint ?? "unknown", context?.method ?? "unknown", error, context);

    return standardizedApiError("INTERNAL_ERROR", "Error interno del servidor", 500);
  }

  logger.error("Unknown API error", error, context);
  return standardizedApiError("UNKNOWN_ERROR", "Ha ocurrido un error desconocido", 500);
}

type RouteContext<P = Record<string, string | string[]>> = { params: Promise<P> };

type Handler<P> = (
  request: NextRequest,
  context: RouteContext<P>
) => Promise<Response>;

/**
 * Wrapper para endpoints Next.js que envuelve GET/POST/PUT/PATCH/DELETE
 * y captura cualquier excepcion devolviendo una respuesta estandarizada.
 *
 * @example
 *   export const GET = withErrorHandler(async (req, ctx) => {
 *     return apiSuccess({ items: [] });
 *   });
 */
export function withErrorHandler<P = Record<string, string | string[]>>(
  handler: Handler<P>
): Handler<P> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return handleApiError(error, {
        endpoint: request.nextUrl.pathname,
        method: request.method,
      });
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
  return NextResponse.json({ error, message }, { status });
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

// Re-exports para evitar tree-shaking agresivo de AppError.
export { AppError };

