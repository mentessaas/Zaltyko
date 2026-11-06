import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { apiSuccess } from "@/lib/api-response";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { transitionGroupMembership } from "@/modules/groups/application/group-membership-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const paramsSchema = z.object({
  groupId: z.guid(),
  membershipId: z.guid(),
});
const bodySchema = z
  .object({
    organizationId: z.guid(),
    expectedStatus: z.enum(["pending", "active", "paused"]),
    toStatus: z.enum(["active", "paused", "ended"]),
    effectiveOn: z.string().date(),
    reasonCode: z
      .enum([
        "academy_request",
        "family_request",
        "athlete_request",
        "schedule_change",
        "temporary_pause",
        "other",
      ])
      .nullable()
      .optional(),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(150);

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para actualizar la pertenencia al grupo.",
    type: "authentication-required",
  });
}

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: session and canonical organization membership are verified before the transaction; the service checks the expected state and assigned location and appends an immutable history event.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ groupId: string; membershipId: string }> }
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
      title: "Cambio de estado inválido",
      detail: "Comprueba el estado, la fecha y la clave de envío.",
      type: "invalid-group-membership-transition",
      errors: {
        ...(params.success ? {} : { params: params.error.flatten() }),
        ...(parsedBody.success ? {} : { body: parsedBody.error.flatten() }),
        ...(idempotencyKey.success
          ? {}
          : { idempotencyKey: "Debe tener entre 8 y 150 caracteres." }),
      },
    });
  }

  if (parsedBody.data.expectedStatus === parsedBody.data.toStatus) {
    return problemResponse({
      status: 422,
      title: "Cambio no permitido",
      detail: "Elige un estado distinto al actual.",
      type: "invalid-group-membership-transition",
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

    const membership = await transitionGroupMembership({
      organizationId: scope.organization.id,
      membershipId: params.data.membershipId,
      groupId: params.data.groupId,
      expectedStatus: parsedBody.data.expectedStatus,
      toStatus: parsedBody.data.toStatus,
      effectiveOn: parsedBody.data.effectiveOn,
      reasonCode: parsedBody.data.reasonCode,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(
      apiSuccess({
        id: membership.id,
        groupId: membership.groupId,
        status: membership.status,
        startsOn: membership.startsOn,
        endsOn: membership.endsOn,
      })
    );
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
