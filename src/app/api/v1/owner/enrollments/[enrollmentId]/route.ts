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
import { transitionEnrollment } from "@/modules/enrollments/application/enrollment-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const paramsSchema = z.object({ enrollmentId: z.string().uuid() });
const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    expectedVersion: z.number().int().positive(),
    toStatus: z.enum(["active", "paused", "cancelled", "completed"]),
    effectiveOn: z.string().date(),
    reasonCode: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para actualizar esta inscripción.",
    type: "authentication-required",
  });
}

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: the actor is derived from the authenticated session; organization membership is checked before rate limiting and the transactional service revalidates target-location access, version and legal status transition.
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
      title: "Cambio de inscripción no válido",
      detail: "Comprueba el estado, la fecha y la versión de la inscripción.",
      type: "invalid-enrollment-transition",
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
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organization.id
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const enrollment = await transitionEnrollment({
      organizationId: scope.organization.id,
      enrollmentId: params.data.enrollmentId,
      expectedVersion: parsedBody.data.expectedVersion,
      toStatus: parsedBody.data.toStatus,
      effectiveOn: parsedBody.data.effectiveOn,
      reasonCode: parsedBody.data.reasonCode ?? null,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(
      apiSuccess({
        id: enrollment.id,
        status: enrollment.status,
        startsOn: enrollment.startsOn,
        endsOn: enrollment.endsOn,
        version: enrollment.version,
      })
    );
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
