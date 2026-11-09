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
import { recordAttendance } from "@/modules/attendance/application/attendance-service";
import {
  loadOwnerSessionAttendanceRoster,
  resolveSessionAttendanceAccess,
} from "@/modules/attendance/application/owner-session-attendance";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const paramsSchema = z.object({ sessionId: z.guid() });
const querySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
  })
  .strict();
const bodySchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
    enrollmentId: z.guid(),
    status: z.enum(["present", "absent", "excused", "late"]),
  })
  .strict();
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para consultar o registrar la asistencia.",
    type: "authentication-required",
  });
}

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: the verified session is resolved first; session organization/site, active membership, location scope and coach assignment are checked by resolveSessionAttendanceAccess, while writes repeat role/session/enrollment validation transactionally in recordAttendance.
export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
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
      title: "Parámetros inválidos",
      detail: "Selecciona una sesión, academia y sede válidas.",
      type: "invalid-session-attendance-query",
      errors: {
        ...(params.success ? {} : { params: params.error.flatten() }),
        ...(query.success ? {} : { query: query.error.flatten() }),
      },
    });
  }

  try {
    const access = await resolveSessionAttendanceAccess({
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
      sessionId: params.data.sessionId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        query.data.organizationId
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const items = await loadOwnerSessionAttendanceRoster(
      {
        organizationId: query.data.organizationId,
        locationId: query.data.locationId,
        sessionId: params.data.sessionId,
      },
      access
    );
    return withPrivateNoStore(apiSuccess({ items }));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: the actor is derived from the verified session and active organization membership; the operation rechecks location/role, coach assignment, session/enrollment relation, enrollment validity and idempotency inside the transactional service.
export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
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
      title: "Datos de asistencia incompletos",
      detail: "Comprueba la sesión, academia, sede, inscripción y estado.",
      type: "invalid-session-attendance-command",
      errors: {
        ...(params.success ? {} : { params: params.error.flatten() }),
        ...(parsedBody.success ? {} : { body: parsedBody.error.flatten() }),
        ...(idempotencyKey.success
          ? {}
          : { idempotencyKey: "Debe tener entre 8 y 180 caracteres." }),
      },
    });
  }

  try {
    const scope = await resolveSessionAttendanceAccess({
      userId: user.id,
      organizationId: parsedBody.data.organizationId,
      locationId: parsedBody.data.locationId,
      sessionId: params.data.sessionId,
    });
    const limit = await rateLimit({
      identifier: getVerifiedTenantRateLimitIdentifier(
        request,
        parsedBody.data.organizationId
      ),
      ...getLimitForRoute(new URL(request.url).pathname),
    });
    if (!limit.success) return rateLimitExceededResponse(limit);

    const attendance = await recordAttendance({
      organizationId: parsedBody.data.organizationId,
      expectedLocationId: parsedBody.data.locationId,
      sessionId: params.data.sessionId,
      enrollmentId: parsedBody.data.enrollmentId,
      status: parsedBody.data.status,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.memberId },
    });
    return withPrivateNoStore(
      apiCreated({
        id: attendance.id,
        sessionId: attendance.sessionId,
        enrollmentId: attendance.enrollmentId,
        status: attendance.status,
        recordedAt: attendance.recordedAt,
      })
    );
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
