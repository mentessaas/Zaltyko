/**
 * Día de cobro de la academia (cobro automático de cuotas, Fase 3, P2).
 *
 * GET ?organizationId=…                                  → ajuste actual.
 * PUT { organizationId, collectionDayOfMonth, expectedVersion } → lo cambia.
 *
 * `collectionDayOfMonth`: null = el día que vence cada cuota; 1..31 = ese día
 * del mes. Mismo patrón que Conectar Stripe (Fase 1): sesión aquí, mismo
 * origen en el PUT y límite por academia verificada (ROUTE_LIMITS, 20/min)
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
  COLLECTION_DAY_RANGE,
  getCollectionSettings,
  saveCollectionSettings,
} from "@/modules/family-collection/application/collection-settings-service";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" } as const;

const querySchema = z.object({
  organizationId: z.guid(),
});

const bodySchema = z
  .object({
    organizationId: z.guid(),
    collectionDayOfMonth: z
      .number()
      .int()
      .min(COLLECTION_DAY_RANGE.min)
      .max(COLLECTION_DAY_RANGE.max)
      .nullable(),
    expectedVersion: z.number().int().min(0),
  })
  .strict();

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para consultar el día de cobro.",
    type: "authentication-required",
  });
}

/**
 * Límite por academia verificada: primero se resuelve el alcance (lanza
 * FORBIDDEN si la persona no es de la academia) y solo entonces la academia
 * entra en la clave. Devuelve la respuesta 429 o `null` si se puede seguir.
 */
async function settingsRateLimitProblem(
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

// @auth-flexible route-guard-reason: verified session here, then a per-verified-tenant rate limit after resolveOwnerScope; the family-collection settings service resolves the owner or full-scope admin with resolveOwnerScope and requires this phase's flag, the test-environment and non-production-database locks and its storage before reading the academy's collection day.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const parsed = querySchema.safeParse({
    organizationId: new URL(request.url).searchParams.get("organizationId"),
  });
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Academia inválida",
      detail: "Selecciona tu academia y vuelve a intentarlo.",
      type: "invalid-collection-settings-request",
    });
  }

  try {
    const limited = await settingsRateLimitProblem(request, user.id, parsed.data.organizationId);
    if (limited) return limited;
    const settings = await getCollectionSettings({
      userId: user.id,
      organizationId: parsed.data.organizationId,
    });
    return NextResponse.json(settings, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: verified session and same-origin check (hasSameOrigin, against CSRF) here, then a per-verified-tenant rate limit after resolveOwnerScope; the family-collection settings service resolves the owner or full-scope admin with resolveOwnerScope, requires the flag, locks and storage, and writes with an optimistic version and an audit entry.
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
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Día de cobro no válido",
      detail: "Elige el día de vencimiento o un día del 1 al 31.",
      type: "invalid-collection-settings-request",
    });
  }

  try {
    const limited = await settingsRateLimitProblem(request, user.id, parsed.data.organizationId);
    if (limited) return limited;
    const settings = await saveCollectionSettings({
      userId: user.id,
      organizationId: parsed.data.organizationId,
      collectionDayOfMonth: parsed.data.collectionDayOfMonth,
      expectedVersion: parsed.data.expectedVersion,
    });
    return NextResponse.json(settings, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}
