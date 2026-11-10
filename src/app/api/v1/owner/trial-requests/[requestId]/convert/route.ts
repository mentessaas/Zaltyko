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
import { convertTrialRequest } from "@/modules/admissions/application/admission-requests";
import { ownerTrialRequestConvertRouteSchema } from "@/modules/admissions/domain/trial-request";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const paramsSchema = z.object({ requestId: z.guid() }).strict();

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: same-origin cookie mutation; resolveOwnerScope plus an owner/admin all-sites check, then the canonical athlete intake and waitlist services recheck authorization in their own transactions with idempotency keys derived from the request id.
export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return noStore(
      problemResponse({
        status: 401,
        title: "Autenticación requerida",
        detail: "Inicia sesión para gestionar solicitudes.",
        type: "authentication-required",
      })
    );
  }
  if (!hasSameOrigin(request)) {
    return noStore(
      problemResponse({
        status: 403,
        title: "Origen no válido",
        detail: "La solicitud debe proceder de la misma web.",
        type: "invalid-origin",
      })
    );
  }

  const params = paramsSchema.safeParse(await context.params);
  const body = await request.json().catch(() => null);
  const parsed = ownerTrialRequestConvertRouteSchema.safeParse(body);
  if (!params.success || !parsed.success) {
    return noStore(
      problemResponse({
        status: 400,
        title: "Datos incompletos",
        detail:
          (!parsed.success &&
            parsed.error.issues.find((issue) => issue.code === "custom")?.message) ||
          "Indica los apellidos, el vínculo y el destino.",
        type: "invalid-trial-request-conversion",
      })
    );
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: parsed.data.organizationId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return noStore(rateLimitExceededResponse(limit));

    const result = await convertTrialRequest({
      scope,
      userId: user.id,
      requestId: params.data.requestId,
      command: parsed.data,
    });
    return noStore(apiSuccess(result));
  } catch (error) {
    if (error instanceof OperationalError) return noStore(operationalProblem(error));
    throw error;
  }
}
