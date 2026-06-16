import { NextResponse } from "next/server";

/**
 * Estandariza las respuestas de la API.
 * Usar estos helpers para consistencia: { ok, data, error }
 */

export interface ResponseMeta {
  total?: number;
  page?: number;
  pageSize?: number;
}

export interface ApiSuccessResponse<T = unknown> {
  ok: true;
  data?: T;
  id?: string;
  message?: string;
  meta?: ResponseMeta;
}

export interface ApiErrorResponse {
  ok: false;
  error: string;
  code?: string;
  message?: string;
  details?: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================
// NEW standardized helpers (recommended)
// ============================================

/**
 * Standard success response for GET, PUT, PATCH operations
 * Usage: return apiSuccess({ user: ... }, { total: 100, page: 1 })
 */
export function apiSuccess<T>(data: T, meta?: ResponseMeta): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({
    ok: true,
    data,
    ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
  } as ApiSuccessResponse<T>);
}

/**
 * Success response for POST operations that create resources
 * Usage: return apiCreated({ id: ... }, { total: 1 })
 */
export function apiCreated<T>(data: T, meta?: ResponseMeta): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      ok: true,
      data,
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    } as ApiSuccessResponse<T>,
    { status: 201 }
  );
}

/**
 * Error response with code, message, HTTP status and optional details
 * Usage: return apiError('NOT_FOUND', 'Resource not found', 404)
 *        return apiError('VALIDATION_ERROR', 'Invalid data', 400, { field: 'email' })
 */
export function apiError(code: string, message: string, status: number, details?: unknown): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      ok: false,
      error: code,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    } as ApiErrorResponse,
    { status }
  );
}

// ============================================
// Legacy helpers (for backward compatibility)
// ============================================

/**
 * Crea una respuesta exitosa con datos opcionales
 * @deprecated Usar apiSuccess() en su lugar
 */
export function apiOk(): NextResponse<ApiSuccessResponse> {
  return NextResponse.json({ ok: true });
}

/**
 * Crea una respuesta de error (legacy signature)
 * @deprecated Usar apiError(code, message, status) en su lugar
 */
export function apiErrorLegacy(
  error: string,
  message?: string,
  status: number = 400,
  details?: unknown
): NextResponse<ApiErrorResponse> {
  const body: ApiErrorResponse = {
    ok: false,
    error,
  };
  if (message) body.message = message;
  if (details !== undefined) body.details = details;
  return NextResponse.json(body, { status });
}

/**
 * Convierte respuestas legacy con { success: true } a { ok: true }
 * Esta función puede usarse para migrar endpoints gradualmente
 * @deprecated Usar apiSuccess() en su lugar
 */
export function normalizeLegacyResponse<T extends { success?: boolean; ok?: boolean }>(
  response: T
): T & { ok: true } {
  if (response.success !== undefined && response.ok === undefined) {
    return { ...response, ok: response.success } as T & { ok: true };
  }
  return { ...response, ok: true } as T & { ok: true };
}