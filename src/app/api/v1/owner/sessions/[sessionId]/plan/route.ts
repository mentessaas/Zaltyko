import { z } from "zod";

import { apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSessionPlan, saveSessionPlan } from "@/modules/session-plans/application/session-plan-service";
import { saveSessionPlanCommandSchema, sessionPlanQuerySchema } from "@/modules/session-plans/domain/session-plan";

import {
  invalidInput,
  noStore,
  planError,
  resolvePlanActor,
  sameOriginProblem,
  unauthenticated,
  writeResponse,
} from "@/app/api/v1/owner/session-plan-http";

const paramsSchema = z.object({ sessionId: z.guid() }).strict();

// @auth-flexible route-guard-reason: cookie session read from Pasar lista; resolveOwnerScope admits owner/admin/manager and coaches only for a site in their scope (coach_operations, same criterion as Pasar lista, not session_staff); getSessionPlan requires the session at that site and rechecks role, site and per-objective site visibility inside one transaction.
export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();

  const params = paramsSchema.safeParse(await context.params);
  const query = sessionPlanQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!params.success || !query.success) {
    return invalidInput(
      "Indica la academia y la sede de la sesión.",
      "invalid-session-plan-query",
      query.success ? undefined : query.error.flatten()
    );
  }

  try {
    const resolved = await resolvePlanActor(request, {
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
      surface: "session",
    });
    if ("response" in resolved) return resolved.response;
    return noStore(
      apiSuccess(await getSessionPlan({ actor: resolved.actor, sessionId: params.data.sessionId, query: query.data }))
    );
  } catch (error) {
    return planError(error);
  }
}

// @auth-flexible route-guard-reason: same-origin cookie mutation from Pasar lista; resolveOwnerScope admits owner/admin/manager and coaches only for a site in their scope (coach_operations); saveSessionPlan requires the session at that site, links only objectives of athletes taking part in that session and visible to the member, and rechecks role, site and plan read-only inside one transaction.
export async function PUT(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  const body = saveSessionPlanCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return invalidInput(
      "Revisa el guion: foco de hasta 200 caracteres, nota de hasta 1000 y como mucho 20 bloques.",
      "invalid-session-plan",
      body.success ? undefined : body.error.flatten()
    );
  }

  try {
    const resolved = await resolvePlanActor(request, {
      userId: user.id,
      organizationId: body.data.organizationId,
      locationId: body.data.locationId,
      surface: "session",
    });
    if ("response" in resolved) return resolved.response;
    return writeResponse(
      await saveSessionPlan({ actor: resolved.actor, sessionId: params.data.sessionId, command: body.data })
    );
  } catch (error) {
    return planError(error);
  }
}
