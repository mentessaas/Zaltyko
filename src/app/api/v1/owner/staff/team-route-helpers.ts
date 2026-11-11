import type { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getClientIdentifier, getLimitForRoute, rateLimit, rateLimitExceededResponse } from "@/lib/rate-limit";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { assertTeamAccessEnabled } from "@/modules/staff/application/canonical-team-access";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import type { OperationalActor } from "@/modules/shared/application/actor";

export function teamNoStore<T extends NextResponse>(response: T): T {
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

export function invalidTeamInput(): NextResponse {
  // Never reflect the input, Zod diagnostics, token or email into a response.
  return teamNoStore(apiError("INVALID_TEAM_COMMAND", "Revisa los datos, la revisión y la clave de idempotencia.", 400));
}

export function teamFeatureUnavailableResponse(): NextResponse | null {
  try { assertTeamAccessEnabled(); return null; }
  catch (error) { return teamRouteError(error); }
}

export function teamRouteError(error: unknown): NextResponse {
  if (error instanceof OperationalError) return teamNoStore(apiError(error.code, error.message, error.status));
  return teamNoStore(apiError("FEATURE_NOT_AVAILABLE", "El acceso de equipo no está disponible. Inténtalo más tarde.", 503));
}

/** Opening or accepting a link: also limited per network origin, across accounts. */
export const TEAM_INVITATION_LINK_IP_LIMIT = { limit: 30, window: 60 } as const;

export async function withTeamUser(request: Request, work: (userId: string) => Promise<NextResponse>, options: { invitationLink?: boolean } = {}): Promise<NextResponse> {
  try {
    assertTeamAccessEnabled();
    const user = await getCurrentUser(request);
    if (!user) return teamNoStore(apiError("AUTHENTICATION_REQUIRED", "Inicia sesión para continuar.", 401));
    // Separate counters per route: managing the panel never spends the budget
    // for opening or accepting links, and vice versa.
    const pathname = new URL(request.url).pathname;
    const limit = await rateLimit({ identifier: `team-access:${pathname}:${user.id}`, ...getLimitForRoute(pathname) });
    if (!limit.success) return teamNoStore(rateLimitExceededResponse(limit));
    if (options.invitationLink) {
      const network = await rateLimit({ identifier: `team-invitation-link:${pathname}:${getClientIdentifier(request)}`, ...TEAM_INVITATION_LINK_IP_LIMIT });
      if (!network.success) return teamNoStore(rateLimitExceededResponse(network));
    }
    return teamNoStore(await work(user.id));
  } catch (error) { return teamRouteError(error); }
}

/**
 * Invitation managers (O3): owner or admin with every site, or a manager. The
 * service narrows a manager to coaches in their own sites and repeats this
 * authorization inside each transaction after the command lock.
 */
export async function withTeamManager(request: Request, organizationId: string, work: (actor: OperationalActor) => Promise<NextResponse>): Promise<NextResponse> {
  return withTeamUser(request, async userId => {
    const scope = await resolveOwnerScope({ userId, organizationId });
    const role = scope.member.role;
    const allowed = ((role === "owner" || role === "admin") && scope.member.locationScopeMode === "all") || role === "manager";
    if (!allowed) throw new OperationalError("FORBIDDEN", "Solo la dirección, la administración o la coordinación pueden gestionar las invitaciones del equipo.", 403);
    return work({ userId, memberId: scope.member.id });
  });
}
