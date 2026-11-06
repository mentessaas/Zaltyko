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
import { associateOwnerFamily } from "@/modules/families/application/owner-family-association";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const bodySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
    familyId: z.guid().optional(),
    athleteIds: z.array(z.guid()).min(1).max(50),
    effectiveFrom: z.string().date(),
    payer: z
      .object({
        familyPayerId: z.guid().optional(),
        givenName: z.string().trim().min(1).max(100).optional(),
        familyName: z.string().trim().min(1).max(100).optional(),
        relationship: z
          .enum(["parent", "legal_guardian", "foster_guardian", "other"])
          .optional(),
        confirmPrimaryPayerChange: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: getCurrentUser authenticates before JSON parsing; the association service validates owner/admin/manager role, site scope, family and athlete links transactionally.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para vincular una familia.",
      type: "authentication-required",
    });
  }
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!parsed.success || !idempotencyKey.success) {
    return problemResponse({
      status: 400,
      title: "Asociación familiar incompleta",
      detail: "Elige gimnasta(s), fecha efectiva y responsable explícito.",
      type: "invalid-family-association",
      errors: {
        ...(parsed.success ? {} : { body: parsed.error.flatten() }),
        ...(idempotencyKey.success
          ? {}
          : { idempotencyKey: "Debe tener entre 8 y 180 caracteres." }),
      },
    });
  }

  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: parsed.data.organizationId,
      locationId: parsed.data.locationId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        scope.organization.id
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);
    const result = await associateOwnerFamily({
      ...parsed.data,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    const data = {
      familyId: result.family.id,
      familyPayerId: result.familyPayerId,
    };
    return noStore(result.replayed ? apiSuccess(data) : apiCreated(data));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
