import { NextResponse } from "next/server";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { apiCreated, apiSuccess } from "@/lib/api-response";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import type { OperationalActor } from "@/modules/shared/application/actor";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import type { SessionPlanWriteResult } from "@/modules/session-plans/domain/session-plan";

/**
 * Piezas comunes de las rutas de planificación (P2 #17, segunda parte).
 * Orden fijo: sesión (401), mismo origen en mutaciones (403), validación (400),
 * alcance de la academia y la sede (403/404), límite de peticiones (429) y,
 * por último, el servicio, que vuelve a autorizar rol, sede, sesión o clase y
 * plan dentro de su transacción.
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
      detail: "Inicia sesión para ver la planificación.",
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

/**
 * Plan de una sesión: superficie operativa, como Pasar lista. La dirección,
 * administración y coordinación entran como siempre; el entrenador solo con
 * una sede de su alcance.
 * Plantilla de la clase: superficie de gestión (sin entrenador).
 */
export async function resolvePlanActor(
  request: Request,
  input: { userId: string; organizationId: string; locationId: string; surface: "session" | "class_template" }
): Promise<{ actor: OperationalActor } | { response: NextResponse }> {
  const scope = await resolveOwnerScope({
    userId: input.userId,
    organizationId: input.organizationId,
    locationId: input.locationId,
    ...(input.surface === "session" ? { surface: "coach_operations" as const } : {}),
  });
  const limit = await rateLimit({
    identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
    ...getLimitForRoute(new URL(request.url).pathname),
  });
  if (!limit.success) return { response: noStore(rateLimitExceededResponse(limit)) };
  return { actor: { userId: input.userId, memberId: scope.member.id } };
}

export function writeResponse(result: SessionPlanWriteResult): NextResponse {
  return noStore(result.replayed ? apiSuccess(result) : apiCreated(result));
}

export function planError(error: unknown): NextResponse {
  if (error instanceof OperationalError) return noStore(operationalProblem(error));
  throw error;
}
