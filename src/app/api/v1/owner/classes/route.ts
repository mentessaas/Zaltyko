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
  createScheduledClass,
  getOwnerClassesPageData,
} from "@/modules/scheduling/application/class-management-service";
import { MAX_CLASS_CAPACITY } from "@/modules/scheduling/domain/class-capacity";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const querySchema = z.object({
  organizationId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
});

const bodySchema = z
  .object({
    organizationId: z.string().uuid(),
    locationId: z.string().uuid(),
    programId: z.string().uuid().nullable(),
    name: z.string().trim().min(2).max(120),
    capacity: z.number().int().positive().max(MAX_CLASS_CAPACITY),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().nullable(),
    schedule: z
      .array(
        z.object({
          isoWeekday: z.number().int().min(1).max(7),
          startsAtLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          endsAtLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        })
      )
      .min(1)
      .max(14),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveTo"],
        message: "La fecha de fin debe ser posterior al inicio.",
      });
    }
    const overlaps = input.schedule.some((slot, index) =>
      input.schedule
        .slice(index + 1)
        .some(
          (next) =>
            slot.isoWeekday === next.isoWeekday &&
            slot.startsAtLocal < next.endsAtLocal &&
            next.startsAtLocal < slot.endsAtLocal
        )
    );
    if (overlaps) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schedule"],
        message: "No superpongas horarios del mismo día.",
      });
    }
    input.schedule.forEach((slot, index) => {
      if (slot.endsAtLocal <= slot.startsAtLocal) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["schedule", index, "endsAtLocal"],
          message: "La hora de fin debe ser posterior a la de inicio.",
        });
      }
    });
  });

const idempotencyKeySchema = z.string().trim().min(8).max(150);

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para gestionar las clases de tu academia.",
    type: "authentication-required",
  });
}

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: canonical organization membership is the tenant boundary; resolveOwnerScope checks active owner/admin/manager access and allowed locations, then the transactional class service repeats location authorization.
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
      detail: "Selecciona una academia o sede válida.",
      type: "invalid-class-filter",
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

    const data = await getOwnerClassesPageData({
      userId: user.id,
      organizationId: scope.organization.id,
      locationId: query.data.locationId,
    });
    return withPrivateNoStore(apiSuccess(data));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: session and active owner/admin/manager membership are resolved server-side; actor identity is derived from the session and scope, and the class service authorizes the location in the same transaction as creation.
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
      title: "Datos de la clase incompletos",
      detail:
        "Indica actividad, sede, nombre, plazas, fecha de inicio y al menos un horario semanal.",
      type: "invalid-class-command",
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

    const result = await createScheduledClass({
      ...parsedBody.data,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(
      apiCreated({
        id: result.classTemplate.id,
        name: result.classTemplate.name,
        sessionCount: result.sessionCount,
        generatedThrough: result.generatedThrough,
      })
    );
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
