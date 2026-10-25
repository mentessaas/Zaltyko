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
import { updateOperationalGroupDetails } from "@/modules/groups/application/group-management-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const paramsSchema = z.object({ groupId: z.string().uuid() });
const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    expectedUpdatedAt: z.string().datetime({ precision: 6 }),
    name: z.string().trim().min(2).max(120).optional(),
    capacity: z.number().int().positive().max(5000).nullable().optional(),
  })
  .strict()
  .refine((input) => input.name !== undefined || input.capacity !== undefined, {
    message: "Indica el nuevo nombre o la nueva capacidad.",
  });
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para actualizar un grupo.",
    type: "authentication-required",
  });
}

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: resolveOwnerScope derives the active tenant role from the session, and the transactional group service rechecks the group location, write policy, capacity lock, and version.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ groupId: string }> }
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
      title: "Cambio de grupo no válido",
      detail: "Comprueba el nombre, la capacidad y la versión del grupo.",
      type: "invalid-group-update",
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

    const group = await updateOperationalGroupDetails({
      ...parsedBody.data,
      organizationId: scope.organization.id,
      groupId: params.data.groupId,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(
      apiSuccess({
        id: group.id,
        name: group.name,
        capacity: group.capacity,
        updatedAtVersion: group.updatedAtVersion,
      })
    );
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
