import { z } from "zod";

import { apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { updateAthleteObservation } from "@/modules/athlete-progress/application/athlete-progress-service";
import { updateObservationCommandSchema } from "@/modules/athlete-progress/domain/athlete-progress";

import {
  invalidInput,
  noStore,
  progressError,
  resolveProgressActor,
  sameOriginProblem,
  unauthenticated,
} from "@/app/api/v1/owner/athlete-progress-http";

const paramsSchema = z.object({ athleteId: z.guid(), observationId: z.guid() }).strict();

// @auth-flexible route-guard-reason: same-origin cookie mutation; resolveOwnerScope admits owner/admin/manager and coaches only for a site in their scope (coach_operations); updateAthleteObservation rechecks membership, role, site, athlete link, record site visibility, author rule for coaches, expected revision and plan read-only inside one transaction.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ athleteId: string; observationId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  const body = updateObservationCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return invalidInput(
      "Revisa la observación: entre 1 y 1000 caracteres, visibilidad y revisión.",
      "invalid-athlete-observation-update",
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
    const result = await updateAthleteObservation({
      actor: resolved.actor,
      athleteId: params.data.athleteId,
      observationId: params.data.observationId,
      command: body.data,
    });
    return noStore(apiSuccess(result));
  } catch (error) {
    return progressError(error);
  }
}
