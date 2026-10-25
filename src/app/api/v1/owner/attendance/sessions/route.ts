import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { getOwnerAttendanceSessionOptions } from "@/modules/attendance/application/owner-attendance-sessions";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const querySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
    cursor: z.string().min(1).max(500).optional(),
    sessionId: z.guid().optional(),
  })
  .strict();

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para consultar las sesiones de asistencia.",
    type: "authentication-required",
  });
}

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: getCurrentUser resolves the verified actor; resolveOwnerScope validates active owner/admin/manager membership and selected location before rate limiting, and getOwnerAttendanceSessionOptions reauthorizes that same organization/site on every keyset request. The cursor only denotes a position.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!query.success) {
    return problemResponse({
      status: 400,
      title: "Filtro de sesiones inválido",
      detail: "Selecciona una academia y sede válidas.",
      type: "invalid-attendance-session-filter",
      errors: query.error.flatten(),
    });
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organization.id
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const data = await getOwnerAttendanceSessionOptions({
      userId: user.id,
      organizationId: scope.organization.id,
      locationId: query.data.locationId,
      sessionId: query.data.sessionId,
      cursor: query.data.cursor,
    });
    return withPrivateNoStore(apiSuccess(data));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
