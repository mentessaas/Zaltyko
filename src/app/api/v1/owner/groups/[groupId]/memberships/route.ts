import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { apiCreated, apiSuccess } from "@/lib/api-response";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import {
  addGroupMembership,
  createAthleteForGroup,
} from "@/modules/groups/application/group-membership-service";
import { searchGroupAthleteOptions } from "@/modules/groups/application/group-management-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const paramsSchema = z.object({ groupId: z.guid() });
const querySchema = z.object({
  organizationId: z.guid(),
  q: z.string().trim().min(2).max(80),
});
const existingAthleteBodySchema = z
  .object({
    organizationId: z.guid(),
    athleteId: z.guid(),
    startsOn: z.string().date(),
    status: z.enum(["pending", "active"]),
  })
  .strict();
const newAthleteBodySchema = z
  .object({
    organizationId: z.guid(),
    newAthlete: z
      .object({
        givenName: z.string().trim().min(1).max(100),
        familyName: z.string().trim().min(1).max(100),
      })
      .strict(),
  })
  .strict();
const bodySchema = z.union([existingAthleteBodySchema, newAthleteBodySchema]);
const idempotencyKeySchema = z.string().trim().min(8).max(150);

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para gestionar las pertenencias del grupo.",
    type: "authentication-required",
  });
}

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: this canonical route verifies active owner/admin/manager membership and the group's assigned location before exposing minimal athlete names; all membership writes repeat authorization transactionally.
export async function GET(
  request: Request,
  context: { params: Promise<{ groupId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();
  const params = paramsSchema.safeParse(await context.params);
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!params.success || !query.success) {
    return problemResponse({
      status: 400,
      title: "Búsqueda inválida",
      detail: "Escribe al menos dos letras y selecciona un grupo válido.",
      type: "invalid-group-athlete-search",
    });
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: query.data.organizationId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organization.id
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const results = await searchGroupAthleteOptions({
      userId: user.id,
      organizationId: scope.organization.id,
      groupId: params.data.groupId,
      query: query.data.q,
    });
    return withPrivateNoStore(apiSuccess({ items: results }));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: the actor is derived from the authenticated user's active canonical organization membership; tenant, role, program and location are checked before and inside the idempotent transaction.
export async function POST(
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
      title: "Datos de la pertenencia incompletos",
      detail:
        "Elige una ficha existente o indica el nombre y los apellidos de la nueva gimnasta.",
      type: "invalid-group-membership-command",
      errors: {
        ...(params.success ? {} : { params: params.error.flatten() }),
        ...(parsedBody.success ? {} : { body: parsedBody.error.flatten() }),
        ...(idempotencyKey.success
          ? {}
          : { idempotencyKey: "Debe tener entre 8 y 150 caracteres." }),
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

    const actor = { userId: user.id, memberId: scope.member.id };
    const membership =
      "newAthlete" in parsedBody.data
        ? await createAthleteForGroup({
            organizationId: scope.organization.id,
            groupId: params.data.groupId,
            givenName: parsedBody.data.newAthlete.givenName,
            familyName: parsedBody.data.newAthlete.familyName,
            idempotencyKey: idempotencyKey.data,
            actor,
          })
        : await addGroupMembership({
            organizationId: scope.organization.id,
            groupId: params.data.groupId,
            athleteId: parsedBody.data.athleteId,
            startsOn: parsedBody.data.startsOn,
            status: parsedBody.data.status,
            idempotencyKey: idempotencyKey.data,
            actor,
          });
    return withPrivateNoStore(
      apiCreated({
        id: membership.id,
        groupId: membership.groupId,
        athleteId: membership.athleteId,
        startsOn: membership.startsOn,
        status: membership.status,
      })
    );
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
