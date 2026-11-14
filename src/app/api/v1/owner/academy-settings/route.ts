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
import {
  academyLegalNameSchema,
  academyNameSchema,
  getOwnerAcademySettings,
  updateOwnerAcademyProfile,
} from "@/modules/organizations/application/owner-academy-settings";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const querySchema = z.object({ organizationId: z.guid() }).strict();
const updateBodySchema = z
  .object({
    organizationId: z.guid(),
    expectedUpdatedAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u),
    name: academyNameSchema,
    legalName: academyLegalNameSchema.nullable(),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function noStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

function unauthenticated() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para gestionar los ajustes de tu academia.",
    type: "authentication-required",
  });
}

async function scopeAndLimit(request: Request, userId: string, organizationId: string) {
  const scope = await resolveOwnerScope({ userId, organizationId });
  const limit = await rateLimit({
    identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
    ...getLimitForRoute(new URL(request.url).pathname),
  });
  return { scope, limit };
}

// @auth-flexible route-guard-reason: sesión y pertenencia activa se resuelven en el servidor; el servicio vuelve a exigir rol owner con acceso a todas las sedes dentro de la transacción.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!query.success) {
    return problemResponse({
      status: 400,
      title: "Consulta inválida",
      detail: "Indica la academia.",
      type: "invalid-academy-settings-query",
      errors: query.error.flatten(),
    });
  }
  try {
    const { scope, limit } = await scopeAndLimit(request, user.id, query.data.organizationId);
    if (!limit.success) return rateLimitExceededResponse(limit);
    const data = await getOwnerAcademySettings({
      organizationId: scope.organization.id,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return noStore(apiSuccess(data));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: el actor sale de la sesión autenticada; mismo origen, clave de idempotencia y versión esperada obligatorios, y el servicio revalida rol owner y alcance total en la transacción.
export async function PATCH(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();
  if (!hasSameOrigin(request)) {
    return noStore(
      problemResponse({
        status: 403,
        title: "Origen no válido",
        detail: "La edición debe proceder de la misma web.",
        type: "invalid-origin",
      })
    );
  }
  const body = updateBodySchema.safeParse(await request.json().catch(() => null));
  const key = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key") ?? "");
  if (!body.success || !key.success) {
    return problemResponse({
      status: 400,
      title: "Datos de la academia incompletos",
      detail: "Indica un nombre de entre 2 y 120 caracteres y una razón social válida o déjala vacía.",
      type: "invalid-academy-settings-command",
      errors: {
        ...(body.success ? {} : { body: body.error.flatten() }),
        ...(key.success ? {} : { idempotencyKey: "Debe tener entre 8 y 180 caracteres." }),
      },
    });
  }
  try {
    const { scope, limit } = await scopeAndLimit(request, user.id, body.data.organizationId);
    if (!limit.success) return rateLimitExceededResponse(limit);
    const data = await updateOwnerAcademyProfile({
      ...body.data,
      idempotencyKey: key.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return noStore(apiSuccess(data));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
