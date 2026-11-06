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
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { getOwnerFamilyOptions } from "@/modules/families/application/owner-family-association";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const querySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
  })
  .strict();

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: getCurrentUser authenticates before query parsing; resolveOwnerScope and the service enforce organization and site membership.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para consultar las familias de tu academia.",
      type: "authentication-required",
    });
  }
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!query.success) {
    return problemResponse({
      status: 400,
      title: "Selecciona una sede",
      detail: "La academia y la sede son obligatorias.",
      type: "invalid-family-options-query",
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
    const data = await getOwnerFamilyOptions({
      ...query.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return noStore(apiSuccess(data));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
