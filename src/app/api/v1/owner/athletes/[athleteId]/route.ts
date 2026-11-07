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
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  getOwnerAthleteProfile,
  updateOwnerAthleteProfile,
} from "@/modules/athletes/application/owner-athlete-profile";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const paramsSchema = z.object({ athleteId: z.guid() }).strict();
const scopeSchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
  })
  .strict();
const newNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const expectedNameSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => value.trim().length > 0)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const updateBodySchema = scopeSchema
  .extend({
    expectedGivenName: expectedNameSchema,
    expectedFamilyName: expectedNameSchema,
    givenName: newNameSchema,
    familyName: newNameSchema,
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para gestionar las fichas de tu academia.",
    type: "authentication-required",
  });
}

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

async function resolveRateLimit(
  request: Request,
  userId: string,
  organizationId: string,
  locationId: string
) {
  const scope = await resolveOwnerScope({ userId, organizationId, locationId });
  const limit = await rateLimit({
    identifier: getVerifiedTenantRateLimitIdentifier(
      request,
      scope.organization.id
    ),
    ...getLimitForRoute(new URL(request.url).pathname),
  });
  return { scope, limit };
}

// @auth-flexible route-guard-reason: the request is authenticated first; resolveOwnerScope verifies the selected canonical organization and site, and the profile service rechecks every site where the global person record is used before returning names.
export async function GET(
  request: Request,
  context: { params: Promise<{ athleteId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const params = paramsSchema.safeParse(await context.params);
  const query = scopeSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!params.success || !query.success) {
    return problemResponse({
      status: 400,
      title: "Consulta inválida",
      detail: "La academia, sede y ficha son obligatorias.",
      type: "invalid-owner-athlete-profile-query",
      errors: {
        ...(params.success ? {} : { params: params.error.flatten() }),
        ...(query.success ? {} : { query: query.error.flatten() }),
      },
    });
  }

  try {
    const { scope, limit } = await resolveRateLimit(
      request,
      user.id,
      query.data.organizationId,
      query.data.locationId
    );
    if (!limit.success) return rateLimitExceededResponse(limit);
    const profile = await getOwnerAthleteProfile({
      organizationId: scope.organization.id,
      locationId: query.data.locationId,
      athleteId: params.data.athleteId,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(apiSuccess(profile));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: authentication and the selected site are resolved server-side; the transactional profile service enforces role, all affected site scopes, plan writability, expected-name concurrency, and idempotent replay.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ athleteId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const params = paramsSchema.safeParse(await context.params);
  const payload = await request.json().catch(() => null);
  const body = updateBodySchema.safeParse(payload);
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!params.success || !body.success || !idempotencyKey.success) {
    return problemResponse({
      status: 400,
      title: "Datos de la ficha incompletos",
      detail: "Revisa el nombre, los apellidos, la academia y la sede.",
      type: "invalid-owner-athlete-profile-command",
      errors: {
        ...(params.success ? {} : { params: params.error.flatten() }),
        ...(body.success ? {} : { body: body.error.flatten() }),
        ...(idempotencyKey.success
          ? {}
          : { idempotencyKey: "Debe tener entre 8 y 180 caracteres." }),
      },
    });
  }

  try {
    const { scope, limit } = await resolveRateLimit(
      request,
      user.id,
      body.data.organizationId,
      body.data.locationId
    );
    if (!limit.success) return rateLimitExceededResponse(limit);
    const profile = await updateOwnerAthleteProfile({
      ...body.data,
      athleteId: params.data.athleteId,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(apiSuccess(profile));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
