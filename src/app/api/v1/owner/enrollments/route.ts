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
import { createEnrollment } from "@/modules/enrollments/application/enrollment-service";
import { searchOwnerEnrollmentCandidates } from "@/modules/enrollments/application/enrollment-query-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const querySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
    classTemplateId: z.guid(),
    q: z.string().trim().min(2).max(80),
  })
  .strict();

const bodySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
    athleteId: z.guid(),
    classTemplateId: z.guid(),
    startsOn: z.string().date(),
    pricePlanId: z.guid().nullable().optional(),
  })
  .strict();

const idempotencyKeySchema = z.string().trim().min(8).max(180);

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para gestionar las inscripciones de tu academia.",
    type: "authentication-required",
  });
}

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: the session resolves an active owner/admin/manager membership and the query service rechecks the requested site and class before returning minimal candidate names.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!query.success) {
    return problemResponse({
      status: 400,
      title: "Búsqueda incompleta",
      detail: "Selecciona sede y clase, y escribe al menos dos letras.",
      type: "invalid-enrollment-candidate-search",
      errors: query.error.flatten(),
    });
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organization.id
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const items = await searchOwnerEnrollmentCandidates({
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
      classTemplateId: query.data.classTemplateId,
      query: query.data.q,
    });
    return withPrivateNoStore(apiSuccess({ items }));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: actor identity and member scope come only from the authenticated session; creation status is fixed to pending and the transactional service rechecks tenant, role, location, class capacity and idempotency.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const body = await request.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(body);
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!parsedBody.success || !idempotencyKey.success) {
    return problemResponse({
      status: 400,
      title: "Datos de inscripción incompletos",
      detail: "Elige una persona, una clase y una fecha de inicio válida.",
      type: "invalid-enrollment-command",
      errors: {
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

    const enrollment = await createEnrollment({
      ...parsedBody.data,
      status: "pending",
      source: "owner",
      sourceEntityId: null,
      pricePlanId: parsedBody.data.pricePlanId ?? null,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(
      apiCreated({
        id: enrollment.id,
        status: enrollment.status,
        startsOn: enrollment.startsOn,
        pricePlanId: enrollment.pricePlanId,
        version: enrollment.version,
      })
    );
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
