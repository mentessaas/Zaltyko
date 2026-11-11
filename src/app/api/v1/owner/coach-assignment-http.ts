import { NextResponse } from "next/server";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { apiSuccess } from "@/lib/api-response";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { resolveSessionAttendanceAccess } from "@/modules/attendance/application/owner-session-attendance";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";

/**
 * Piezas comunes de las rutas de entrenadoras por clase y por sesión (O1).
 * Orden fijo: sesión (401), mismo origen en mutaciones (403), validación
 * (400), alcance de la academia y la sede (403/404), límite de peticiones
 * (429) y, por último, el servicio, que vuelve a autorizar rol, sede, plan y
 * disponibilidad del candidato (503) dentro de su transacción.
 */

export function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

export function unauthenticated(): NextResponse {
  return noStore(
    problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para ver las entrenadoras.",
      type: "authentication-required",
    })
  );
}

export function sameOriginProblem(request: Request): NextResponse | null {
  if (hasSameOrigin(request)) return null;
  return noStore(
    problemResponse({
      status: 403,
      title: "Origen no válido",
      detail: "La solicitud debe proceder de la misma web.",
      type: "invalid-origin",
    })
  );
}

export function invalidInput(detail: string, type: string, errors?: unknown): NextResponse {
  return noStore(problemResponse({ status: 400, title: "Datos no válidos", detail, type, errors }));
}

async function limited(request: Request, organizationId: string): Promise<NextResponse | null> {
  const limit = await rateLimit({
    identifier: getVerifiedTenantRateLimitIdentifier(request, organizationId),
    ...getLimitForRoute(new URL(request.url).pathname),
  });
  return limit.success ? null : noStore(rateLimitExceededResponse(limit));
}

/**
 * Dirección, administración y coordinación: superficie de gestión de
 * siempre. Un entrenador recibe 403 aquí, antes de llegar al servicio.
 */
export async function resolveManagementActor(
  request: Request,
  input: { userId: string; organizationId: string; locationId?: string | null }
): Promise<{ actor: OperationalActor } | { response: NextResponse }> {
  const scope = await resolveOwnerScope({
    userId: input.userId,
    organizationId: input.organizationId,
    ...(input.locationId ? { locationId: input.locationId } : {}),
  });
  const response = await limited(request, scope.organization.id);
  if (response) return { response };
  return { actor: { userId: input.userId, memberId: scope.member.id } };
}

/**
 * Lectura de una sesión: el mismo acceso que Pasar lista (la entrenadora solo
 * en su sede; fuera de ella, la sesión responde como inexistente).
 */
export async function resolveSessionReader(
  request: Request,
  input: { userId: string; organizationId: string; locationId: string; sessionId: string }
): Promise<{ actor: OperationalActor } | { response: NextResponse }> {
  const access = await resolveSessionAttendanceAccess(input);
  const response = await limited(request, access.organizationId);
  if (response) return { response };
  return { actor: { userId: input.userId, memberId: access.memberId } };
}

export function readResponse<T>(data: T): NextResponse {
  return noStore(apiSuccess(data));
}

export function coachAssignmentError(error: unknown): NextResponse {
  if (error instanceof OperationalError) return noStore(operationalProblem(error));
  throw error;
}
