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
  createOperationalGroup,
  getOwnerGroupsPageData,
} from "@/modules/groups/application/group-management-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";

const querySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
  groupId: z.guid().optional(),
});

const bodySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
    programId: z.guid(),
    name: z.string().trim().min(2).max(120),
    capacity: z.number().int().positive().max(5000).nullable(),
  })
  .strict();

const idempotencyKeySchema = z.string().trim().min(8).max(150);

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para gestionar los grupos de tu academia.",
    type: "authentication-required",
  });
}

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: canonical organization membership is the tenant boundary; resolveOwnerScope verifies organization role and allowed locations before the operation, and the transactional service repeats location authorization.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!query.success) {
    return problemResponse({
      status: 400,
      title: "Filtro inválido",
      detail: "Selecciona una organización, sede o grupo válido.",
      type: "invalid-group-filter",
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

    const data = await getOwnerGroupsPageData({
      userId: user.id,
      organizationId: scope.organization.id,
      locationId: query.data.locationId,
      groupId: query.data.groupId,
    });
    return withPrivateNoStore(apiSuccess(data));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: session and active owner/admin/manager membership are resolved server-side; no client-supplied actor or role is accepted, and the group service verifies program, tenant and site transactionally.
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
      title: "Datos del grupo incompletos",
      detail:
        "Indica un nombre, actividad, sede y una capacidad válida o déjala vacía.",
      type: "invalid-group-command",
      errors: {
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

    const group = await createOperationalGroup({
      ...parsedBody.data,
      capacity: parsedBody.data.capacity,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(
      apiCreated({
        id: group.id,
        name: group.name,
        locationId: group.locationId,
        programId: group.programId,
        capacity: group.capacity,
      })
    );
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
