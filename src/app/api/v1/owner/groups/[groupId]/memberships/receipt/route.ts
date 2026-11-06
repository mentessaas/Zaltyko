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
import { recoverCreatedAthleteForGroup } from "@/modules/groups/application/group-membership-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const paramsSchema = z.object({ groupId: z.string().uuid() });
const querySchema = z.object({
  organizationId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(150),
});

function privateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: resolves the active Owner membership and the application service validates the matching outbox pair, audit actor, group relation, and assigned location before exposing an ID-only receipt.
export async function GET(
  request: Request,
  context: { params: Promise<{ groupId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para comprobar el alta pendiente.",
      type: "authentication-required",
    });
  }

  const params = paramsSchema.safeParse(await context.params);
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!params.success || !query.success) {
    return problemResponse({
      status: 400,
      title: "Comprobación inválida",
      detail: "No se ha podido validar el grupo o la clave de la operación.",
      type: "invalid-group-membership-receipt-query",
    });
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: query.data.organizationId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const membership = await recoverCreatedAthleteForGroup({
      organizationId: scope.organization.id,
      groupId: params.data.groupId,
      idempotencyKey: query.data.idempotencyKey,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return privateNoStore(apiSuccess(membership
      ? {
          status: "complete" as const,
          receipt: {
            id: membership.id,
            groupId: membership.groupId,
            athleteId: membership.athleteId,
            startsOn: membership.startsOn,
            status: membership.status,
          },
        }
      : { status: "none" as const }));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
