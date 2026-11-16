/**
 * Conectar Stripe (cobro automático de cuotas, Fase 1).
 *
 * GET  ?organizationId=…&refresh=1 → estado para la tarjeta de ajustes.
 * POST { organizationId }          → enlace de Stripe para conectar o seguir.
 *
 * La sesión se comprueba aquí; el servicio resuelve el alcance de owner/admin
 * con todas las sedes (`resolveOwnerScope`) y la disponibilidad (bandera,
 * entorno, almacenamiento, país y plan). Un `CONNECT_UNAVAILABLE` llega como
 * 409 con el motivo en `errors.reason`.
 *
 * Límite de frecuencia por academia verificada (ROUTE_LIMITS, 10/min) en el
 * POST y en el GET con refresh, que son los que llaman a Stripe: la clave
 * se comparte con la facturación SaaS. Se comprueba después de resolver el
 * alcance, para que la academia no salga del cliente sin verificar.
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
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  getConnectStatus,
  startConnectOnboarding,
} from "@/modules/payments-connect/application/connect-onboarding-service";
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
  })
  .strict();

function unauthenticatedResponse() {
  return problemResponse({
    status: 401,
    title: "Autenticación requerida",
    detail: "Inicia sesión para conectar Stripe.",
    type: "authentication-required",
  });
}

function invalidOrganizationResponse() {
  return problemResponse({
    status: 400,
    title: "Academia inválida",
    detail: "Selecciona tu academia y vuelve a intentarlo.",
    type: "invalid-connect-request",
  });
}

/**
 * Límite por academia verificada: primero se resuelve el alcance (lanza
 * FORBIDDEN si la persona no es de la academia) y solo entonces la academia
 * entra en la clave. Devuelve la respuesta 429 o `null` si se puede seguir.
 */
async function connectRateLimitProblem(
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

// @auth-flexible route-guard-reason: verified session here; the payments-connect service resolves the owner/admin full-scope member with resolveOwnerScope and the availability gates before reading any connected account. A refresh (which calls Stripe) is rate-limited per verified tenant after resolveOwnerScope.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    organizationId: params.get("organizationId"),
  });
  if (!parsed.success) return invalidOrganizationResponse();

  const refresh = params.get("refresh") === "1";
  try {
    // Sin refresh no se llama a Stripe: solo se lee lo guardado.
    if (refresh) {
      const limited = await connectRateLimitProblem(request, user.id, parsed.data.organizationId);
      if (limited) return limited;
    }
    const state = await getConnectStatus({
      userId: user.id,
      organizationId: parsed.data.organizationId,
      refresh,
    });
    return NextResponse.json(state, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: verified session and same-origin check (hasSameOrigin, against CSRF) here, then a per-verified-tenant rate limit after resolveOwnerScope; the payments-connect service resolves the owner/admin full-scope member with resolveOwnerScope and requires full availability before creating the connected account or a Stripe link.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();
  // Contra CSRF: el POST que crea la cuenta conectada solo se acepta desde la
  // propia web (el navegador pone la cabecera Origin en el fetch de la tarjeta).
  if (!hasSameOrigin(request)) {
    return problemResponse({
      status: 403,
      title: "Origen no válido",
      detail: "La conexión debe hacerse desde la misma web.",
      type: "invalid-origin",
    });
  }

  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return invalidOrganizationResponse();

  try {
    const limited = await connectRateLimitProblem(request, user.id, parsed.data.organizationId);
    if (limited) return limited;
    const { url } = await startConnectOnboarding({
      userId: user.id,
      organizationId: parsed.data.organizationId,
    });
    return NextResponse.json({ url }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    // Stripe no respondió o rechazó la petición: la academia puede reintentar.
    // Solo ids en el log, nunca el cuerpo del error del proveedor.
    logger.warn("Conectar Stripe: no se pudo abrir el enlace de Stripe", {
      organizationId: parsed.data.organizationId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return problemResponse({
      status: 502,
      title: "No hemos podido abrir Stripe",
      detail: "No hemos podido abrir Stripe. Inténtalo de nuevo.",
      type: "connect-provider-unavailable",
    });
  }
}
