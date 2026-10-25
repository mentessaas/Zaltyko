import { NextResponse } from "next/server";
import { z } from "zod";

import { apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { updateOwnerFamilyPayerProfile } from "@/modules/families/application/owner-family-management";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const paramsSchema = z.object({ familyPayerId: z.string().uuid() });
const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    locationId: z.string().uuid(),
    expectedProfileVersion: z.string().datetime({ precision: 6 }),
    givenName: z.string().trim().min(1).max(100),
    familyName: z.string().trim().min(1).max(100),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: getCurrentUser authenticates before parsing; resolveOwnerScope and the transactional family service verify owner/admin role, location, plan writability, and payer membership.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ familyPayerId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para actualizar el responsable de la familia.",
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
      title: "Datos del responsable no válidos",
      detail: "Comprueba el nombre y actualiza la familia antes de reintentar.",
      type: "invalid-family-payer-profile",
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

    const profile = await updateOwnerFamilyPayerProfile({
      ...parsedBody.data,
      organizationId: scope.organization.id,
      familyPayerId: params.data.familyPayerId,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return noStore(
      apiSuccess({
        familyPayerId: profile.familyPayerId,
        givenName: profile.givenName,
        familyName: profile.familyName,
        profileVersion: profile.profileVersion,
        replayed: profile.replayed,
      })
    );
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
