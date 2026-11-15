import { NextResponse } from "next/server";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

export function unauthenticatedResponse(): NextResponse {
  return noStore(problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para gestionar las fichas del equipo.",
    type: "authentication-required",
  }));
}

export async function getStaffRouteUser(request: Request) {
  return getCurrentUser(request);
}

export async function requireOwnerAllScope(userId: string, organizationId: string) {
  const scope = await resolveOwnerScope({ userId, organizationId });
  if (scope.member.role !== "owner" || scope.member.locationScopeMode !== "all") {
    throw new OperationalError(
      "FORBIDDEN",
      "Solo la dirección con acceso a toda la academia puede gestionar estas fichas",
      403
    );
  }
  return scope;
}

export async function limitStaffRoute(request: Request, organizationId: string) {
  const limit = await rateLimit({
    identifier: getVerifiedTenantRateLimitIdentifier(request, organizationId),
    ...getLimitForRoute(new URL(request.url).pathname),
  });
  return limit.success ? null : noStore(rateLimitExceededResponse(limit));
}

export function handleStaffRouteError(error: unknown): NextResponse | null {
  if (error instanceof OperationalError) return noStore(operationalProblem(error));
  return noStore(problemResponse({
    status: 500,
    title: "No se pudo completar la operación",
    detail: "Inténtalo de nuevo más tarde.",
    type: "staff-operation-failed",
  }));
}

export function invalidStaffInput(detail: string, errors?: unknown): NextResponse {
  return noStore(problemResponse({
    status: 400,
    title: "Datos del perfil inválidos",
    detail,
    type: "invalid-staff-profile-command",
    ...(errors ? { errors } : {}),
  }));
}
