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
import {
  getOwnerGuardianContacts,
  normalizeOwnerGuardianContact,
  updateOwnerGuardianContact,
} from "@/modules/families/application/owner-guardian-contacts";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const paramsSchema = z.object({ guardianId: z.guid() }).strict();
const scopeSchema = z
  .object({
    organizationId: z.guid(),
    locationId: z.guid(),
  })
  .strict();
const expectedTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u)
  .refine((value) => Number.isFinite(Date.parse(value)));
const updateBodySchema = scopeSchema
  .extend({
    kind: z.enum(["email", "phone"]),
    expectedContactId: z.guid().nullable(),
    expectedValue: z.string().min(1).max(254).nullable(),
    expectedUpdatedAt: expectedTimestampSchema.nullable(),
    value: z.string().trim().min(1).max(254),
  })
  .strict()
  .superRefine((body, context) => {
    const expectedValues = [
      body.expectedContactId,
      body.expectedValue,
      body.expectedUpdatedAt,
    ];
    if (
      expectedValues.some((value) => value === null) &&
      expectedValues.some((value) => value !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedContactId"],
        message: "Los campos de versión deben ser nulos o estar completos.",
      });
    }
    const contact = normalizeOwnerGuardianContact(body.kind, body.value);
    if (!contact.success) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Indica un correo válido o un teléfono con prefijo internacional.",
      });
    }
  });
const idempotencyKeySchema = z.string().trim().min(8).max(180);

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para gestionar los contactos de tu academia.",
    type: "authentication-required",
  });
}

function withPrivateNoStore(response: NextResponse): NextResponse {
  response.headers.set("cache-control", "private, no-store");
  return response;
}

async function resolveRateLimit(
  request: Request,
  userId: string,
  organizationId: string,
  locationId: string
) {
  const scope = await resolveOwnerScope({ userId, organizationId, locationId });
  const limit = await rateLimit({
    identifier: getVerifiedTenantRateLimitIdentifier(
      request,
      scope.organization.id
    ),
    ...getLimitForRoute(new URL(request.url).pathname),
  });
  return { scope, limit };
}

// @auth-flexible route-guard-reason: authentication and the selected organization/site are resolved here; the transactional contact service rechecks role, active guardian linkage, global all-site scope, plan writability, and idempotency.
export async function GET(
  request: Request,
  context: { params: Promise<{ guardianId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const params = paramsSchema.safeParse(await context.params);
  const query = scopeSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!params.success || !query.success) {
    return problemResponse({
      status: 400,
      title: "Consulta inválida",
      detail: "La academia, sede y tutor son obligatorios.",
      type: "invalid-owner-guardian-contacts-query",
      errors: {
        ...(params.success ? {} : { params: params.error.flatten() }),
        ...(query.success ? {} : { query: query.error.flatten() }),
      },
    });
  }

  try {
    const { scope, limit } = await resolveRateLimit(
      request,
      user.id,
      query.data.organizationId,
      query.data.locationId
    );
    if (!limit.success) return rateLimitExceededResponse(limit);
    const contacts = await getOwnerGuardianContacts({
      organizationId: scope.organization.id,
      locationId: query.data.locationId,
      guardianId: params.data.guardianId,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(apiSuccess(contacts));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: authentication and selected-site resolution are server-side; the transaction service revalidates full all-site PII scope and the canonical contact snapshot before any write.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ guardianId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const params = paramsSchema.safeParse(await context.params);
  const payload = await request.json().catch(() => null);
  const body = updateBodySchema.safeParse(payload);
  const idempotencyKey = idempotencyKeySchema.safeParse(
    request.headers.get("idempotency-key") ?? ""
  );
  if (!params.success || !body.success || !idempotencyKey.success) {
    return problemResponse({
      status: 400,
      title: "Datos de contacto incompletos",
      detail: "Revisa la academia, sede, tipo y valor del contacto.",
      type: "invalid-owner-guardian-contact-command",
      errors: {
        ...(params.success ? {} : { params: params.error.flatten() }),
        ...(body.success ? {} : { body: body.error.flatten() }),
        ...(idempotencyKey.success
          ? {}
          : { idempotencyKey: "Debe tener entre 8 y 180 caracteres." }),
      },
    });
  }

  try {
    const { scope, limit } = await resolveRateLimit(
      request,
      user.id,
      body.data.organizationId,
      body.data.locationId
    );
    if (!limit.success) return rateLimitExceededResponse(limit);
    const contacts = await updateOwnerGuardianContact({
      ...body.data,
      guardianId: params.data.guardianId,
      idempotencyKey: idempotencyKey.data,
      actor: { userId: user.id, memberId: scope.member.id },
    });
    return withPrivateNoStore(apiSuccess(contacts));
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
