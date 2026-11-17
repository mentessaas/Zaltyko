/**
 * Cobro automático de cuotas (Fase 3): acciones de la academia sobre el cobro
 * automático de una factura.
 *
 * POST { action: "cancel", organizationId, invoiceId }
 *   → «Cancelar el cobro automático».
 * POST { action: "mark_reviewed", organizationId, invoiceId, checkedInStripe: true }
 *   → «Marcar como revisado» (la persona confirma que lo comprobó en Stripe).
 * Respuesta: { outcome: "canceled" | "reviewed" | "collected" }.
 *
 * Mismo patrón que Conectar Stripe (Fase 1): sesión y mismo origen aquí;
 * límite por academia verificada (ROUTE_LIMITS, 10/min: puede llamar a
 * Stripe) después de resolver el alcance; el servicio repite
 * `resolveOwnerScope` (propiedad, o administración con todas las sedes), los
 * cerrojos de entorno y base y las tablas. No exige la bandera de esta fase.
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
import {
  cancelAutomaticCollection,
  markAutomaticCollectionReviewed,
} from "@/modules/family-collection/application/family-collection-academy-actions";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" } as const;

const bodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("cancel"),
      organizationId: z.guid(),
      invoiceId: z.guid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("mark_reviewed"),
      organizationId: z.guid(),
      invoiceId: z.guid(),
      checkedInStripe: z.literal(true),
    })
    .strict(),
]);

/**
 * Límite por academia verificada: primero se resuelve el alcance (lanza
 * FORBIDDEN si la persona no es de la academia) y solo entonces la academia
 * entra en la clave. Devuelve la respuesta 429 o `null` si se puede seguir.
 */
async function actionRateLimitProblem(
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

// @auth-flexible route-guard-reason: verified session and same-origin check (hasSameOrigin, against CSRF) here, then a per-verified-tenant rate limit after resolveOwnerScope (works with this phase's flag off); the family-collection academy-actions service resolves the owner or full-scope admin with resolveOwnerScope, the test-environment and non-production-database locks and its storage before canceling or closing an attempt of that academy's invoice.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    return problemResponse({
      status: 401,
      title: "Autenticación requerida",
      detail: "Inicia sesión para gestionar los cobros automáticos.",
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
      type: "invalid-automatic-collection-request",
    });
  }

  const body = parsed.data;
  try {
    const limited = await actionRateLimitProblem(request, user.id, body.organizationId);
    if (limited) return limited;
    const { outcome } =
      body.action === "cancel"
        ? await cancelAutomaticCollection({
            userId: user.id,
            organizationId: body.organizationId,
            invoiceId: body.invoiceId,
          })
        : await markAutomaticCollectionReviewed({
            userId: user.id,
            organizationId: body.organizationId,
            invoiceId: body.invoiceId,
            checkedInStripe: body.checkedInStripe,
          });
    return NextResponse.json({ outcome }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    // Solo ids en el log, nunca el cuerpo del error.
    logger.warn("Cobro automático: la academia no pudo completar una acción", {
      organizationId: body.organizationId,
      invoiceId: body.invoiceId,
      action: body.action,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return problemResponse({
      status: 503,
      title: "No se pudo completar",
      detail: "No se pudo completar la acción sobre el cobro automático. Vuelve a intentarlo en un momento.",
      type: "automatic-collection-action-failed",
    });
  }
}
