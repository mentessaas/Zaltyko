/**
 * Conectar Stripe: enlace nuevo (refresh_url de Stripe).
 *
 * Stripe envía aquí el navegador cuando el enlace de alta caducó o ya se usó.
 * Se pide un enlace nuevo y se redirige (303) a Stripe. Si algo falla, se
 * vuelve a la tarjeta de ajustes con `stripe=error`, nunca a una pantalla de
 * error.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { logger } from "@/lib/logger";
import {
  CONNECT_RETURN_PATH,
  startConnectOnboarding,
} from "@/modules/payments-connect/application/connect-onboarding-service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  organizationId: z.guid(),
});

function settingsUrl(request: Request, organizationId: string | null, error: boolean): URL {
  const url = new URL(CONNECT_RETURN_PATH, request.url);
  if (organizationId) url.searchParams.set("organizationId", organizationId);
  if (error) url.searchParams.set("stripe", "error");
  url.hash = "cobro-automatico";
  return url;
}

function redirect303(target: URL | string): NextResponse {
  const response = NextResponse.redirect(target, 303);
  response.headers.set("cache-control", "private, no-store");
  return response;
}

// @auth-flexible route-guard-reason: verified session here; the payments-connect service resolves the owner/admin full-scope member with resolveOwnerScope and requires full availability before asking Stripe for a new link.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    organizationId: params.get("organizationId"),
  });
  // Un organizationId no válido no se devuelve en la redirección.
  const organizationId = parsed.success ? parsed.data.organizationId : null;

  // Sin sesión: la página de ajustes se encarga de pedir el inicio de sesión.
  if (!user) return redirect303(settingsUrl(request, organizationId, false));
  if (!organizationId) return redirect303(settingsUrl(request, null, true));

  try {
    const { url } = await startConnectOnboarding({ userId: user.id, organizationId });
    return redirect303(url);
  } catch (error) {
    logger.warn("Conectar Stripe: no se pudo generar un enlace nuevo", {
      organizationId,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return redirect303(settingsUrl(request, organizationId, true));
  }
}
