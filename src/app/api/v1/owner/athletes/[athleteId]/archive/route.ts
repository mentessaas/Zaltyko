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
import { archiveOwnerAthlete } from "@/modules/athletes/application/owner-athlete-archive";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const paramsSchema = z.object({ athleteId: z.guid() }).strict();
const bodySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: same-origin authenticated cookie mutation; the route resolves the canonical organization and the transaction rechecks active Owner/Admin membership, full-organization scope, site, athlete identity, and the idempotent archive receipt.
export async function POST(
  request: Request,
  context: { params: Promise<{ athleteId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) {
    return noStore(
      problemResponse({
        status: 401,
        title: "Autenticación requerida",
        detail: "Inicia sesión para archivar una ficha.",
        type: "authentication-required",
      })
    );
  }
  if (!hasSameOrigin(request)) {
    return noStore(
      problemResponse({
        status: 403,
        title: "Origen no válido",
        detail: "La solicitud de archivo debe proceder de la misma web.",
        type: "invalid-origin",
      })
    );
  }

  const params = paramsSchema.safeParse(await context.params);
  const body = await request.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(body);
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!params.success || !parsedBody.success || !idempotencyKey.success) {
    return noStore(
      problemResponse({
        status: 400,
        title: "Solicitud de archivo incompleta",
        detail: "La academia, sede, ficha y clave de envío son obligatorias.",
        type: "invalid-owner-athlete-archive-command",
        errors: {
          ...(params.success ? {} : { params: params.error.flatten() }),
          ...(parsedBody.success ? {} : { body: parsedBody.error.flatten() }),
          ...(idempotencyKey.success
            ? {}
            : { idempotencyKey: "Debe tener entre 8 y 180 caracteres." }),
        },
      })
    );
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
    if (!limit.success) return noStore(rateLimitExceededResponse(limit));

    const archived = await archiveOwnerAthlete({
      userId: user.id,
      organizationId: scope.organization.id,
      locationId: parsedBody.data.locationId,
      athleteId: params.data.athleteId,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return noStore(apiSuccess(archived));
  } catch (error) {
    if (error instanceof OperationalError) {
      return noStore(operationalProblem(error));
    }
    throw error;
  }
}
