/**
 * Preferencia de cobro de una familia (manual o automático).
 *
 * GET ?organizationId=…&familyId=…                                   → preferencia actual.
 * PUT { organizationId, familyId, mode, expectedVersion } + idempotency-key → la cambia.
 *
 * Mismo patrón que el día de cobro (Fase 3): sesión aquí, mismo origen en el
 * PUT (contra CSRF) y límite por academia verificada (ROUTE_LIMITS, 20/min)
 * después de resolver el alcance; el servicio repite `resolveOwnerScope`
 * (propiedad, o administración con todas las sedes), la bandera y los
 * cerrojos.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
} from "@/lib/rate-limit";
import {
  getFamilyCollectionPreference,
  saveFamilyCollectionPreference,
} from "@/modules/billing/application/family-collection-preferences";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  organizationId: z.guid(),
  familyId: z.guid(),
});

const bodySchema = querySchema
  .extend({
    mode: z.enum(["manual", "automatic"]),
    expectedVersion: z.number().int().min(0),
  })
  .strict();

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para consultar la preferencia de cobro.",
    type: "authentication-required",
  });
}

/**
 * Límite por academia verificada: primero se resuelve el alcance (lanza
 * FORBIDDEN si la persona no es de la academia) y solo entonces la academia
 * entra en la clave. Devuelve la respuesta 429 o `null` si se puede seguir.
 */
async function preferenceRateLimitProblem(
  request: Request,
  userId: string,
  organizationId: string
): Promise<NextResponse | null> {
  const scope = await resolveOwnerScope({ userId, organizationId });
  const limit = await rateLimit({
    identifier: getVerifiedTenantRateLimitIdentifier(request, scope.organization.id),
    ...getLimitForRoute(new URL(request.url).pathname),
  });
  if (limit.success) return null;
  const response = problemResponse({
    status: 429,
    title: "Demasiados intentos",
    detail: "Has hecho demasiados intentos seguidos. Espera un minuto y vuelve a probar.",
    type: "rate-limit-exceeded",
  });
  response.headers.set("Retry-After", String(Math.max(0, limit.reset - Math.floor(Date.now() / 1000))));
  return response;
}

// @auth-flexible route-guard-reason: verified session here, then a per-verified-tenant rate limit after resolveOwnerScope; billing service resolves the active organization member, owner/admin role, full-organization location scope, and family visibility (open charges while automatic collection is closed; an active family of the academy once it is open) before accessing a family preference.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    organizationId: params.get("organizationId"),
    familyId: params.get("familyId"),
  });
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Familia o academia inválida",
      detail: "Selecciona una familia con cargos pendientes.",
      type: "invalid-family-collection-preference",
    });
  }

  try {
    const limited = await preferenceRateLimitProblem(request, user.id, parsed.data.organizationId);
    if (limited) return limited;
    const preference = await getFamilyCollectionPreference({
      ...parsed.data,
      userId: user.id,
    });
    return NextResponse.json(preference, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: validates a fresh human session and a same-origin check (hasSameOrigin, against CSRF) here, then a per-verified-tenant rate limit after resolveOwnerScope, and the active Owner/admin scope before accepting a preference; automatic is accepted only with this phase's flag on, the test-environment and non-production-database locks open and a paid plan (otherwise 409); writes retain CAS, audit, and outbox.
export async function PUT(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();
  if (!hasSameOrigin(request)) {
    return problemResponse({
      status: 403,
      title: "Origen no válido",
      detail: "El cambio debe hacerse desde la misma web.",
      type: "invalid-origin",
    });
  }

  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  if (
    !parsed.success ||
    idempotencyKey.trim().length < 8 ||
    idempotencyKey.trim().length > 150
  ) {
    return problemResponse({
      status: 400,
      title: "Preferencia incompleta",
      detail: "Indica la modalidad de esta familia y vuelve a cargar si cambió la versión.",
      type: "invalid-family-collection-preference",
      errors: {
        ...(parsed.success ? {} : { body: parsed.error.flatten() }),
        ...(idempotencyKey.trim().length >= 8 &&
        idempotencyKey.trim().length <= 150
          ? {}
          : { idempotencyKey: "Debe tener entre 8 y 150 caracteres." }),
      },
    });
  }

  try {
    const limited = await preferenceRateLimitProblem(request, user.id, parsed.data.organizationId);
    if (limited) return limited;
    const preference = await saveFamilyCollectionPreference({
      ...parsed.data,
      userId: user.id,
      idempotencyKey: idempotencyKey.trim(),
    });
    return NextResponse.json(preference, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
