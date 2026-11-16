/**
 * Pago automático de las familias (cobro automático, Fase 2): la academia deja
 * sin efecto el pago automático de una familia.
 *
 * POST { organizationId, authorizationId } → { outcome: "revoked" | "none" }
 *
 * Mismo patrón que Conectar Stripe (Fase 1): sesión y mismo origen aquí;
 * límite por academia verificada (ROUTE_LIMITS, 20/min) después de resolver
 * el alcance; el servicio repite `resolveOwnerScope` (propiedad, o
 * administración con todas las sedes) y los cerrojos de entorno, base y
 * almacenamiento antes de revocar. No exige la bandera de esta fase: con la
 * función cerrada, la academia tiene que poder revocar lo ya guardado.
 * Revocar no anula los cobros ya enviados.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logger } from "@/lib/logger";
import {
  getLimitForRoute,
  getVerifiedTenantRateLimitIdentifier,
  rateLimit,
} from "@/lib/rate-limit";
import { revokeFamilyPaymentMethodByOwner } from "@/modules/family-payment-methods/application/family-payment-methods-service";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" } as const;

const bodySchema = z
  .object({
    organizationId: z.guid(),
    authorizationId: z.guid(),
  })
  .strict();

/**
 * Límite por academia verificada: primero se resuelve el alcance (lanza
 * FORBIDDEN si la persona no es de la academia) y solo entonces la academia
 * entra en la clave. Devuelve la respuesta 429 o `null` si se puede seguir.
 */
async function revokeRateLimitProblem(
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

// @auth-flexible route-guard-reason: verified session and same-origin check (hasSameOrigin, against CSRF) here, then a per-verified-tenant rate limit after resolveOwnerScope (revoking works with this phase's flag off); the family-payment-methods service resolves the owner or full-scope admin with resolveOwnerScope and the test-environment and non-production-database locks before revoking an authorization of that academy's connected account.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para gestionar los pagos automáticos.",
      type: "authentication-required",
    });
  }
  if (!hasSameOrigin(request)) {
    return problemResponse({
      status: 403,
      title: "Origen no válido",
      detail: "La petición debe hacerse desde la misma web.",
      type: "invalid-origin",
    });
  }

  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return problemResponse({
      status: 400,
      title: "Datos no válidos",
      detail: "Revisa los datos enviados y vuelve a intentarlo.",
      type: "invalid-family-payment-method-request",
    });
  }

  try {
    const limited = await revokeRateLimitProblem(request, user.id, parsed.data.organizationId);
    if (limited) return limited;
    const { outcome } = await revokeFamilyPaymentMethodByOwner({
      userId: user.id,
      organizationId: parsed.data.organizationId,
      authorizationId: parsed.data.authorizationId,
    });
    return NextResponse.json({ outcome }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    // Solo ids en el log, nunca el cuerpo del error.
    logger.warn("Pago automático de las familias: la academia no pudo revocar", {
      organizationId: parsed.data.organizationId,
      authorizationId: parsed.data.authorizationId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return problemResponse({
      status: 503,
      title: "No se pudo completar",
      detail: "No se pudo dejar de cobrar automáticamente. Vuelve a intentarlo en un momento.",
      // Mismo tipo que OperationalError FAMILY_PAYMENT_REVOKE_FAILED.
      type: "family-payment-revoke-failed",
    });
  }
}
