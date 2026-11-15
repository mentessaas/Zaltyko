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
import { getOwnerTodayAttendance } from "@/modules/attendance/application/owner-today-attendance";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const querySchema = z.object({ organizationId: z.guid() }).strict();

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: getCurrentUser resolves the verified actor before the query is validated; resolveOwnerScope (coach_operations surface) verifies the active owner/admin/manager/coach membership of the requested organization and bounds the sites to the member's scope (a coach only gets their own sites), and getOwnerTodayAttendance only reads the sites of that already-resolved scope. Read-only: no body, no actor from the client.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para guardar la lista de hoy.",
      type: "authentication-required",
    });
  }

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!query.success) {
    return problemResponse({
      status: 400,
      title: "Academia inválida",
      detail: "Indica la academia de la que quieres guardar la lista de hoy.",
      type: "invalid-today-attendance-query",
      errors: query.error.flatten(),
    });
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: query.data.organizationId,
      surface: "coach_operations",
    }).catch((error: unknown) => {
      // Una academia ajena responde igual que una que no existe.
      if (error instanceof OperationalError && error.code === "FORBIDDEN") {
        throw new OperationalError("NOT_FOUND", "Academia no encontrada", 404);
      }
      throw error;
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organization.id
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const data = await getOwnerTodayAttendance({ userId: user.id, scope });
    return withPrivateNoStore(apiSuccess(data));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
