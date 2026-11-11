import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createSessionObservation } from "@/modules/athlete-progress/application/athlete-progress-service";
import { sessionObservationCommandSchema } from "@/modules/athlete-progress/domain/athlete-progress";

import {
  invalidInput,
  progressError,
  resolveProgressActor,
  sameOriginProblem,
  unauthenticated,
  writeResponse,
} from "@/app/api/v1/owner/athlete-progress-http";

const paramsSchema = z.object({ sessionId: z.guid() }).strict();

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
