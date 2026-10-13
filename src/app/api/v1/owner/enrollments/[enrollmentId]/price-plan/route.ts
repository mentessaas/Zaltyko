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
import { assignEnrollmentPrice } from "@/modules/enrollments/application/enrollment-price-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const paramsSchema = z.object({ enrollmentId: z.string().uuid() });
const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    locationId: z.string().uuid(),
    pricePlanId: z.string().uuid(),
    startsOn: z.string().date(),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para asignar una tarifa a esta inscripción.",
    type: "authentication-required",
  });
}

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: identity is derived from the authenticated session and the transactional service checks active membership, role, location, enrollment and plan.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ enrollmentId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const params = paramsSchema.safeParse(await context.params);
  const body = await request.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(body);
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!params.success || !parsedBody.success || !idempotencyKey.success) {
    return problemResponse({
      status: 400,
      title: "Asignación de tarifa no válida",
      detail: "Comprueba la sede, la tarifa y la fecha efectiva.",
      type: "invalid-enrollment-price-assignment",
      errors: {
        ...(params.success ? {} : { params: params.error.flatten() }),
        ...(parsedBody.success ? {} : { body: parsedBody.error.flatten() }),
        ...(idempotencyKey.success
          ? {}
          : { idempotencyKey: "Debe tener entre 8 y 180 caracteres." }),
      },
    });
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: parsedBody.data.organizationId,
      locationId: parsedBody.data.locationId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organization.id
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const assignment = await assignEnrollmentPrice({
      ...parsedBody.data,
      enrollmentId: params.data.enrollmentId,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(
      apiSuccess({
        id: assignment.id,
        enrollmentId: assignment.enrollmentId,
        pricePlanId: assignment.pricePlanId,
        unitAmountCents: assignment.unitAmountCents,
        currency: assignment.currency,
        startsOn: assignment.startsOn,
        endsOn: assignment.endsOn,
      })
    );
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
