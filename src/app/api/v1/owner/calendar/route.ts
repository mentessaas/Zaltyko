import { NextResponse } from "next/server";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { getOwnerCalendar } from "@/modules/scheduling/application/calendar-sessions";
import { ownerCalendarQuerySchema } from "@/modules/scheduling/domain/calendar-query";

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: getCurrentUser resolves the verified actor before the query is validated; resolveOwnerScope (management surface, coaches excluded) verifies the active owner/admin/manager membership and, when a site is requested, that it belongs to the member's scope, and getOwnerCalendar only reads the sites of that already-resolved scope. Read-only: no body, no actor from the client.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para consultar el calendario.",
      type: "authentication-required",
    });
  }

  const query = ownerCalendarQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!query.success) {
    return problemResponse({
      status: 400,
      title: "Rango de calendario inválido",
      detail:
        "Indica una academia y un rango de fechas válido de hasta 42 días.",
      type: "invalid-calendar-query",
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

    const data = await getOwnerCalendar({
      scope,
      from: query.data.from,
      to: query.data.to,
      locationId: query.data.locationId,
      groupId: query.data.groupId,
    });
    return withPrivateNoStore(apiSuccess(data));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
