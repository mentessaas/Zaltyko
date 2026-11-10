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
import { listOwnerTrialRequests } from "@/modules/admissions/application/admission-requests";
import { ownerTrialRequestListQuerySchema } from "@/modules/admissions/domain/trial-request";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: cookie session read; resolveOwnerScope admits only active owner/admin/manager members (never coaches) and returns their authorized sites; every query filters by that organization and those sites.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return noStore(
      problemResponse({
        status: 401,
        title: "Autenticación requerida",
        detail: "Inicia sesión para ver las solicitudes.",
        type: "authentication-required",
      })
    );
  }

  const query = ownerTrialRequestListQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!query.success) {
    return noStore(
      problemResponse({
        status: 400,
        title: "Filtro inválido",
        detail: "Indica la academia, la sede y una página válidas.",
        type: "invalid-trial-request-query",
        errors: query.error.flatten(),
      })
    );
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: query.data.organizationId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return noStore(rateLimitExceededResponse(limit));

    const result = await listOwnerTrialRequests({
      scope,
      locationId: query.data.locationId ?? null,
      view: query.data.view,
      page: query.data.page,
      pageSize: query.data.pageSize,
    });
    return noStore(
      apiSuccess(result, {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      })
    );
  } catch (error) {
    if (error instanceof OperationalError) return noStore(operationalProblem(error));
    throw error;
  }
}
