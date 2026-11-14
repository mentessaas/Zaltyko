import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { apiCreated } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from "@/lib/rate-limit";
import {
  createOwnerLocation,
  locationNameSchema,
  locationTimezoneSchema,
} from "@/modules/organizations/application/owner-academy-settings";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const bodySchema = z
  .object({
    organizationId: z.guid(),
    name: locationNameSchema,
    timezone: locationTimezoneSchema,
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: el actor sale de la sesión autenticada; mismo origen e idempotencia obligatorios, y el servicio revalida rol owner, alcance total, solo lectura y límite de sedes del plan dentro de la transacción.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para añadir una sede.",
      type: "authentication-required",
    });
  }
  if (!hasSameOrigin(request)) {
    return noStore(
      problemResponse({
        status: 403,
        title: "Origen no válido",
        detail: "La alta de la sede debe proceder de la misma web.",
        type: "invalid-origin",
      })
    );
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  const key = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key") ?? "");
  if (!body.success || !key.success) {
    return problemResponse({
      status: 400,
      title: "Datos de la sede incompletos",
      detail: "Indica un nombre de entre 2 y 120 caracteres y una zona horaria.",
      type: "invalid-location-command",
      errors: {
        ...(body.success ? {} : { body: body.error.flatten() }),
        ...(key.success ? {} : { idempotencyKey: "Debe tener entre 8 y 180 caracteres." }),
      },
    });
  }
  try {
    const scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: body.data.organizationId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);
    const location = await createOwnerLocation({
      ...body.data,
      idempotencyKey: key.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return noStore(apiCreated(location));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
