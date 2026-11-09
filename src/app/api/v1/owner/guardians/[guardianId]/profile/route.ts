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
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import {
  getOwnerGuardianProfile,
  updateOwnerGuardianProfile,
} from "@/modules/families/application/owner-guardian-profile";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const paramsSchema = z.object({ guardianId: z.guid() }).strict();
const scopeSchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
  })
  .strict();
const storedNameSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => value.trim().length > 0)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const nextNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const versionSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u)
  .refine((value) => Number.isFinite(Date.parse(value)));
const updateBodySchema = scopeSchema
  .extend({
    expectedGivenName: storedNameSchema,
    expectedFamilyName: storedNameSchema,
    expectedUpdatedAt: versionSchema,
    givenName: nextNameSchema,
    familyName: nextNameSchema,
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para gestionar el perfil del tutor.",
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

// @auth-flexible route-guard-reason: authentication and selected organization/site are checked here; the transaction service rechecks owner/admin/manager membership, full all-site scope, and the guardian's active family/site link before returning PII or writing.
export async function GET(
  request: Request,
  context: { params: Promise<{ guardianId: string }> }
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
      detail: "La academia, sede y tutor son obligatorios.",
      type: "invalid-owner-guardian-profile-query",
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
    const profile = await getOwnerGuardianProfile({
      organizationId: scope.organization.id,
      locationId: query.data.locationId,
      guardianId: params.data.guardianId,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(apiSuccess(profile));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: actor is derived from the authenticated session and the transaction revalidates all-site scope plus active guardian linkage before command replay or write.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ guardianId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();
  if (!hasSameOrigin(request)) {
    return withPrivateNoStore(problemResponse({
      status: 403,
      title: "Origen no válido",
      detail: "La edición del perfil debe proceder de la misma web.",
      type: "invalid-origin",
    }));
  }

  const params = paramsSchema.safeParse(await context.params);
  const payload = await request.json().catch(() => null);
  const body = updateBodySchema.safeParse(payload);
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!params.success || !body.success || !idempotencyKey.success) {
    return problemResponse({
      status: 400,
      title: "Datos del perfil incompletos",
      detail: "Revisa la academia, sede, nombres y versión del perfil.",
      type: "invalid-owner-guardian-profile-command",
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
    const profile = await updateOwnerGuardianProfile({
      ...body.data,
      guardianId: params.data.guardianId,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(apiSuccess(profile));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
