import { z } from "zod";

import { apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createSessionObservation,
  getSessionAthleteProgress,
} from "@/modules/athlete-progress/application/athlete-progress-service";
import {
  sessionAthleteProgressQuerySchema,
  sessionObservationCommandSchema,
} from "@/modules/athlete-progress/domain/athlete-progress";

import {
  invalidInput,
  noStore,
  progressError,
  resolveProgressActor,
  sameOriginProblem,
  unauthenticated,
  writeResponse,
} from "@/app/api/v1/owner/athlete-progress-http";

const paramsSchema = z.object({ sessionId: z.guid() }).strict();

// @auth-flexible route-guard-reason: cookie session read from Pasar lista; resolveOwnerScope admits owner/admin/manager and coaches only for a site in their scope (coach_operations); getSessionAthleteProgress requires the session at that site and the enrollment in that session's class, derives the athlete from the enrollment, and rechecks role, athlete link and per-record site visibility inside one transaction.
export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();

  const params = paramsSchema.safeParse(await context.params);
  const query = sessionAthleteProgressQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!params.success || !query.success) {
    return invalidInput(
      "Indica la academia, la sede y la inscripción de la sesión.",
      "invalid-session-athlete-progress-query",
      query.success ? undefined : query.error.flatten()
    );
  }

  try {
    const resolved = await resolveProgressActor(request, {
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
    });
    if ("response" in resolved) return resolved.response;
    const progress = await getSessionAthleteProgress({
      actor: resolved.actor,
      sessionId: params.data.sessionId,
      query: query.data,
    });
    return noStore(apiSuccess(progress));
  } catch (error) {
    return progressError(error);
  }
}

// @auth-flexible route-guard-reason: same-origin cookie mutation from Pasar lista; resolveOwnerScope admits owner/admin/manager and coaches only for a site in their scope (coach_operations); createSessionObservation requires the session at that site and the enrollment in that session's class, derives the athlete from the enrollment, and rechecks role, athlete link and plan read-only inside one transaction.
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  const body = sessionObservationCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return invalidInput(
      "Revisa la observación: entre 1 y 1000 caracteres.",
      "invalid-session-observation",
      body.success ? undefined : body.error.flatten()
    );
  }

  try {
    const resolved = await resolveProgressActor(request, {
      userId: user.id,
      organizationId: body.data.organizationId,
      locationId: body.data.locationId,
    });
    if ("response" in resolved) return resolved.response;
    return writeResponse(
      await createSessionObservation({ actor: resolved.actor, sessionId: params.data.sessionId, command: body.data })
    );
  } catch (error) {
    return progressError(error);
  }
}
