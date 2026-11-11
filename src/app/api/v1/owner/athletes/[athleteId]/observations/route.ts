import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createAthleteObservation } from "@/modules/athlete-progress/application/athlete-progress-service";
import { createObservationCommandSchema } from "@/modules/athlete-progress/domain/athlete-progress";

import {
  invalidInput,
  progressError,
  resolveProgressActor,
  sameOriginProblem,
  unauthenticated,
  writeResponse,
} from "@/app/api/v1/owner/athlete-progress-http";

const paramsSchema = z.object({ athleteId: z.guid() }).strict();

// @auth-flexible route-guard-reason: same-origin cookie mutation; resolveOwnerScope admits owner/admin/manager and coaches only for a site in their scope (coach_operations); createAthleteObservation rechecks membership, role, site, athlete link, archived athlete, session/objective ownership and plan read-only inside one transaction, and replays by clientRequestId.
export async function POST(request: Request, context: { params: Promise<{ athleteId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  const body = createObservationCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return invalidInput(
      "Revisa la observación: entre 1 y 1000 caracteres y una fecha válida.",
      "invalid-athlete-observation",
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
      await createAthleteObservation({ actor: resolved.actor, athleteId: params.data.athleteId, command: body.data })
    );
  } catch (error) {
    return progressError(error);
  }
}
