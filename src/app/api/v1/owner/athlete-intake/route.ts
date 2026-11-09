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
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  createOwnerAthleteIntake,
  getOwnerAthleteIntake,
  ownerAthleteIntakePayloadSchema,
} from "@/modules/athletes/application/owner-athlete-intake";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const querySchema = z
  .object({
    organizationId: z.guid(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(150);

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

function unauthenticatedResponse(): NextResponse {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para acceder a la bandeja organizativa.",
    type: "authentication-required",
  });
}

function assertRouteOwnerScope(scope: Awaited<ReturnType<typeof resolveOwnerScope>>) {
  if (!(["owner", "admin"] as string[]).includes(scope.member.role)) {
    throw new OperationalError(
      "FORBIDDEN",
      "La bandeja organizativa requiere un Owner o Admin activo",
      403
    );
  }
  if (scope.member.locationScopeMode !== "all") {
    throw new OperationalError(
      "LOCATION_SCOPE_DENIED",
      "La bandeja requiere acceso a todas las sedes de la academia",
      403
    );
  }
}

// @auth-flexible route-guard-reason: the route authenticates a cookie session, resolves the requested canonical organization, and the application transaction independently rechecks active Owner/Admin all-sites membership. It does not use legacy tenant tables.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return noStore(unauthenticatedResponse());

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!query.success) {
    return noStore(
      problemResponse({
        status: 400,
        title: "Filtro inválido",
        detail: "Indica la organización y una página válida.",
        type: "invalid-athlete-intake-query",
        errors: query.error.flatten(),
      })
    );
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: query.data.organizationId,
    });
    assertRouteOwnerScope(scope);
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organization.id
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return noStore(rateLimitExceededResponse(limit));

    const result = await getOwnerAthleteIntake({
      ...query.data,
      organizationId: scope.organization.id,
      userId: user.id,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return noStore(
      apiSuccess(result, {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      })
    );
  } catch (error) {
    if (error instanceof OperationalError) {
      return noStore(operationalProblem(error));
    }
    throw error;
  }
}

// @auth-flexible route-guard-reason: the same-origin cookie mutation derives the actor from the authenticated session; the service repeats Owner/Admin all-sites authorization and all writes are in one transaction.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return noStore(unauthenticatedResponse());
  if (!hasSameOrigin(request)) {
    return noStore(
      problemResponse({
        status: 403,
        title: "Origen no válido",
        detail: "La solicitud debe proceder de la misma web.",
        type: "invalid-origin",
      })
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = ownerAthleteIntakePayloadSchema.safeParse(body);
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!parsedBody.success || !idempotencyKey.success) {
    return noStore(
      problemResponse({
        status: 400,
        title: "Alta incompleta",
        detail: "Indica el nombre, apellidos y vínculo familiar explícito.",
        type: "invalid-athlete-intake-command",
        errors: {
          ...(parsedBody.success ? {} : { body: parsedBody.error.flatten() }),
          ...(idempotencyKey.success
            ? {}
            : { idempotencyKey: "Debe tener entre 8 y 150 caracteres." }),
        },
      })
    );
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: parsedBody.data.organizationId,
    });
    assertRouteOwnerScope(scope);
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organization.id
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return noStore(rateLimitExceededResponse(limit));

    const result = await createOwnerAthleteIntake({
      ...parsedBody.data,
      organizationId: scope.organization.id,
      userId: user.id,
      actor: { userId: user.id, memberId: scope.member.id },
      idempotencyKey: idempotencyKey.data,
    });
    return noStore(result.replayed ? apiSuccess(result) : apiCreated(result));
  } catch (error) {
    if (error instanceof OperationalError) {
      return noStore(operationalProblem(error));
    }
    throw error;
  }
}
