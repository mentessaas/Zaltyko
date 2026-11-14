import type { NextResponse } from "next/server";
import { ZodError } from "zod";

import { apiError } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getClientIdentifier, rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { hasSameOrigin } from "@/modules/saas-billing/application/owner-access";
import { isFamilyAccessFlagOn } from "@/modules/family-access/domain/family-access-contract";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import type { OperationalActor } from "@/modules/shared/application/actor";

/**
 * Rutas del acceso de familias y de los avisos: bandera antes de nada,
 * usuario de la sesión validado por Supabase, mismo origen en escrituras,
 * límites por cuenta (y por red al abrir enlaces) y respuestas sin caché.
 * Nunca se refleja la entrada, el token ni el correo en una respuesta.
 */

export function familyNoStore<T extends NextResponse>(response: T): T {
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

export function familyRouteError(error: unknown): NextResponse {
  if (error instanceof OperationalError) return familyNoStore(apiError(error.code, error.message, error.status));
  if (error instanceof ZodError) {
    return familyNoStore(apiError("INVALID_FAMILY_ACCESS_COMMAND", "Revisa los datos enviados.", 400));
  }
  return familyNoStore(apiError("FEATURE_NOT_AVAILABLE", "El acceso de familias y los avisos no están disponibles. Inténtalo más tarde.", 503));
}

export function familyFeatureOff(): NextResponse | null {
  if (isFamilyAccessFlagOn()) return null;
  return familyNoStore(apiError("FEATURE_NOT_AVAILABLE", "El acceso de familias y los avisos todavía no están activados.", 503));
}

/** Abrir o aceptar un enlace: además del límite por cuenta, uno por red. */
export const FAMILY_INVITATION_LINK_LIMITS = {
  account: { limit: 10, window: 60 },
  network: { limit: 30, window: 60 },
} as const;
export const FAMILY_OWNER_COMMAND_LIMIT = { limit: 30, window: 60 } as const;
export const FAMILY_PORTAL_WRITE_LIMIT = { limit: 60, window: 60 } as const;

type Options = {
  mutation?: boolean;
  limit: { limit: number; window: number };
  invitationLink?: boolean;
};

export async function withFamilyUser(
  request: Request,
  options: Options,
  work: (userId: string) => Promise<NextResponse>
): Promise<NextResponse> {
  const off = familyFeatureOff();
  if (off) return off;
  try {
    if (options.mutation && !hasSameOrigin(request)) {
      return familyNoStore(apiError("INVALID_ORIGIN", "La petición debe proceder de la misma web.", 403));
    }
    const user = await getCurrentUser(request);
    if (!user) return familyNoStore(apiError("AUTHENTICATION_REQUIRED", "Inicia sesión para continuar.", 401));
    const pathname = new URL(request.url).pathname;
    const limited = await rateLimit({ identifier: `family-access:${pathname}:${user.id}`, ...options.limit });
    if (!limited.success) return familyNoStore(rateLimitExceededResponse(limited));
    if (options.invitationLink) {
      const network = await rateLimit({
        identifier: `family-invitation-link:${pathname}:${getClientIdentifier(request)}`,
        ...FAMILY_INVITATION_LINK_LIMITS.network,
      });
      if (!network.success) return familyNoStore(rateLimitExceededResponse(network));
    }
    return familyNoStore(await work(user.id));
  } catch (error) {
    return familyRouteError(error);
  }
}

/**
 * Miembro de la academia en /owner. El cuerpo se lee después de autenticar;
 * el servicio repite rol, sede y alcance dentro de cada transacción, después
 * del cerrojo del comando.
 */
export async function withFamilyManager(
  request: Request,
  options: Options,
  work: (actor: OperationalActor, body: Record<string, unknown>) => Promise<NextResponse>
): Promise<NextResponse> {
  return withFamilyUser(request, options, async (userId) => {
    const body = await readJson(request);
    if (!body || typeof body.organizationId !== "string") {
      throw new OperationalError("INVALID_RELATION", "Falta la academia.", 400);
    }
    const scope = await resolveOwnerScope({ userId, organizationId: body.organizationId });
    return work({ userId, memberId: scope.member.id }, body);
  });
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}
