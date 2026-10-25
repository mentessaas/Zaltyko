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
import { updateClassDetails } from "@/modules/scheduling/application/class-management-service";
import { MAX_CLASS_CAPACITY } from "@/modules/scheduling/domain/class-capacity";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const paramsSchema = z.object({ classTemplateId: z.string().uuid() });
const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    expectedUpdatedAt: z.string().datetime({ precision: 6 }),
    name: z.string().trim().min(2).max(120).optional(),
    capacity: z.number().int().positive().max(MAX_CLASS_CAPACITY).optional(),
  })
  .strict()
  .refine((input) => input.name !== undefined || input.capacity !== undefined);
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: authenticated owner scope supplies the actor; the transactional class service rechecks the class location, role, Free-plan writability, capacity lock, and optimistic version.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ classTemplateId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para actualizar una clase.",
      type: "authentication-required",
    });
  }

  const params = paramsSchema.safeParse(await context.params);
  const body = await request.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(body);
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!params.success || !parsedBody.success || !idempotencyKey.success) {
    return problemResponse({
      status: 400,
      title: "Cambio de clase no válido",
      detail: "Comprueba el nombre, las plazas y la versión de la clase.",
      type: "invalid-class-update",
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

    const classTemplate = await updateClassDetails({
      ...parsedBody.data,
      organizationId: scope.organization.id,
      classTemplateId: params.data.classTemplateId,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(
      apiSuccess({
        id: classTemplate.id,
        name: classTemplate.name,
        capacity: classTemplate.capacity,
        updatedAtVersion: classTemplate.updatedAtVersion,
      })
    );
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
