import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { apiCreated, apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  assignOwnerAthleteIntakePayloadSchema,
  assignOwnerAthleteToFirstGroup,
} from "@/modules/athletes/application/owner-athlete-intake";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const paramsSchema = z.object({ athleteId: z.guid() }).strict();
const idempotencyKeySchema = z.string().trim().min(8).max(150);

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: same-origin cookie mutation; the actor is derived from the authenticated session and the service rechecks Owner/Admin all-sites scope, athlete, group, location, capacity and idempotency within one transaction.
export async function POST(
  request: Request,
  context: { params: Promise<{ athleteId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return noStore(
      problemResponse({
        status: 401,
        title: "Autenticación requerida",
        detail: "Inicia sesión para asignar la ficha a un grupo.",
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
  const parsedBody = assignOwnerAthleteIntakePayloadSchema.safeParse(body);
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!params.success || !parsedBody.success || !idempotencyKey.success) {
    return noStore(
      problemResponse({
        status: 400,
        title: "Asignación incompleta",
        detail: "Indica la academia, un grupo real, la fecha de inicio y la clave de envío.",
        type: "invalid-athlete-intake-assignment",
        errors: {
          ...(params.success ? {} : { params: params.error.flatten() }),
          ...(parsedBody.success ? {} : { body: parsedBody.error.flatten() }),
          ...(idempotencyKey.success
            ? {}
            : { idempotencyKey: "Debe tener entre 8 y 150 caracteres." }),
        },
      })
    );
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: parsedBody.data.organizationId,
    });
    if (
      !(["owner", "admin"] as string[]).includes(scope.member.role) ||
      scope.member.locationScopeMode !== "all"
    ) {
      throw new OperationalError(
        scope.member.locationScopeMode === "all" ? "FORBIDDEN" : "LOCATION_SCOPE_DENIED",
        "La primera asignación requiere un Owner o Admin con acceso a todas las sedes",
        403
      );
    }
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organization.id
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return noStore(rateLimitExceededResponse(limit));

    const result = await assignOwnerAthleteToFirstGroup({
      ...parsedBody.data,
      organizationId: scope.organization.id,
      athleteId: params.data.athleteId,
      userId: user.id,
      actor: { userId: user.id, memberId: scope.member.id },
      idempotencyKey: idempotencyKey.data,
    });
    return noStore(result.replayed ? apiSuccess(result) : apiCreated(result));
  } catch (error) {
    if (error instanceof OperationalError) {
      return noStore(operationalProblem(error));
    }
    throw error;
  }
}
