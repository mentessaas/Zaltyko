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
import { updateAthleteProfileForGroup } from "@/modules/groups/application/group-membership-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const paramsSchema = z.object({
  groupId: z.string().uuid(),
  athleteId: z.string().uuid(),
});
const safeNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const optionalSafeNameSchema = z
  .string()
  .trim()
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value))
  .nullable();
const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    givenName: safeNameSchema,
    familyName: safeNameSchema,
    preferredName: optionalSafeNameSchema,
    expectedProfileVersion: z.string().datetime({ offset: true }),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function privateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: actor is derived from the authenticated canonical membership; the service checks the selected group, assigned location, Free writability and exact athlete membership inside the idempotent transaction.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ groupId: string; athleteId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para editar la ficha de la gimnasta.",
      type: "authentication-required",
    });
  }

  const params = paramsSchema.safeParse(await context.params);
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!params.success || !parsedBody.success || !idempotencyKey.success) {
    return problemResponse({
      status: 400,
      title: "Datos de la ficha incompletos",
      detail: "Comprueba el nombre, los apellidos y la versión de la ficha.",
      type: "invalid-athlete-profile-command",
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

    const data = await updateAthleteProfileForGroup({
      ...parsedBody.data,
      groupId: params.data.groupId,
      athleteId: params.data.athleteId,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return privateNoStore(apiSuccess(data));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
