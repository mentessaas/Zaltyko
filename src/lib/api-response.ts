import { NextResponse } from "next/server";

/**
 * Estandariza las respuestas de la API.
 * Usar estos helpers para consistencia: { ok, data, error }
 */

export interface ApiSuccessResponse<T = unknown> {
  ok: true;
  data?: T;
  id?: string;
  message?: string;
}

export interface ApiErrorResponse {
  ok: false;
  error: string;
  message?: string;
  details?: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Crea una respuesta exitosa con datos opcionales
 */
export function apiSuccess<T = unknown>(
  data?: T,
  options?: { id?: string; message?: string }
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({
    ok: true,
    ...(data !== undefined && { data }),
    ...(options?.id && { id: options.id }),
    ...(options?.message && { message: options.message }),
  } as ApiSuccessResponse<T>);
}

/**
 * Crea una respuesta exitosa simple (sin datos)
 */
export function apiOk(): NextResponse<ApiSuccessResponse> {
  return NextResponse.json({ ok: true });
}

/**
 * Crea una respuesta de error
 */
export function apiError(
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
