import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { createAthleteObjective } from "@/modules/athlete-progress/application/athlete-progress-service";
import { createObjectiveCommandSchema } from "@/modules/athlete-progress/domain/athlete-progress";

import {
  invalidInput,
  progressError,
  resolveProgressActor,
  sameOriginProblem,
  unauthenticated,
  writeResponse,
} from "@/app/api/v1/owner/athlete-progress-http";

const paramsSchema = z.object({ athleteId: z.guid() }).strict();

// @auth-flexible route-guard-reason: same-origin cookie mutation; resolveOwnerScope admits owner/admin/manager and coaches only for a site in their scope (coach_operations); createAthleteObjective rechecks membership, role, site, athlete link, archived athlete and plan read-only inside one transaction, and replays by clientRequestId.
export async function POST(request: Request, context: { params: Promise<{ athleteId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  const body = createObjectiveCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return invalidInput(
      "Revisa el objetivo: título de 2 a 120 caracteres, aparato de su disciplina y fecha válida.",
      "invalid-athlete-objective",
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
      await createAthleteObjective({ actor: resolved.actor, athleteId: params.data.athleteId, command: body.data })
    );
  } catch (error) {
    return progressError(error);
  }
}
