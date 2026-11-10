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
import { manageAdmissionLink } from "@/modules/admissions/application/admission-requests";
import { ownerAdmissionLinkCommandSchema } from "@/modules/admissions/domain/trial-request";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: same-origin cookie mutation; resolveOwnerScope plus an owner/admin all-sites check, repeated inside the transaction that enables, disables or regenerates the academy's public link and writes the audit entry.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return noStore(
      problemResponse({
        status: 401,
        title: "Autenticación requerida",
        detail: "Inicia sesión para gestionar el enlace.",
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

  const body = await request.json().catch(() => null);
  const parsed = ownerAdmissionLinkCommandSchema.safeParse(body);
  if (!parsed.success) {
    return noStore(
      problemResponse({
        status: 400,
        title: "Cambio no válido",
        detail: "Indica la academia, la sede (o ninguna) y la acción.",
        type: "invalid-admission-link-command",
      })
    );
  }

  try {
    const scope = await resolveOwnerScope({ userId: user.id, organizationId: parsed.data.organizationId });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return noStore(rateLimitExceededResponse(limit));

    const link = await manageAdmissionLink({
      scope,
      userId: user.id,
      locationId: parsed.data.locationId,
      action: parsed.data.action,
    });
    return noStore(apiSuccess(link));
  } catch (error) {
    if (error instanceof OperationalError) return noStore(operationalProblem(error));
    throw error;
  }
}
