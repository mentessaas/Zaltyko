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
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { operationalProblem, problemResponse } from "@/app/api/v1/problem";
import { getCurrentUser } from "@/lib/auth/current-user";
import { logger } from "@/lib/logger";
import {
  getConnectStatus,
  startConnectOnboarding,
} from "@/modules/payments-connect/application/connect-onboarding-service";
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

// @auth-flexible route-guard-reason: verified session here; the payments-connect service resolves the owner/admin full-scope member with resolveOwnerScope and the availability gates before reading any connected account.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    organizationId: params.get("organizationId"),
  });
  if (!parsed.success) return invalidOrganizationResponse();

  try {
    const state = await getConnectStatus({
      userId: user.id,
      organizationId: parsed.data.organizationId,
      refresh: params.get("refresh") === "1",
    });
    return NextResponse.json(state, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof OperationalError) return operationalProblem(error);
    throw error;
  }
}

// @auth-flexible route-guard-reason: verified session here; the payments-connect service resolves the owner/admin full-scope member with resolveOwnerScope and requires full availability before creating the connected account or a Stripe link.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticatedResponse();

  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) return invalidOrganizationResponse();

  try {
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
