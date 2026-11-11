import { z } from "zod";

import { apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { changeAthleteObjectiveStatus } from "@/modules/athlete-progress/application/athlete-progress-service";
import { changeObjectiveStatusCommandSchema } from "@/modules/athlete-progress/domain/athlete-progress";

import {
  invalidInput,
  noStore,
  progressError,
  resolveProgressActor,
  sameOriginProblem,
  unauthenticated,
} from "@/app/api/v1/owner/athlete-progress-http";

const paramsSchema = z.object({ athleteId: z.guid(), objectiveId: z.guid() }).strict();

// @auth-flexible route-guard-reason: same-origin cookie mutation; resolveOwnerScope admits owner/admin/manager and coaches only for a site in their scope (coach_operations); changeAthleteObjectiveStatus rechecks membership, role, site, athlete link, record site visibility, author rule for coaches, expected revision and plan read-only inside one transaction.
export async function POST(
  request: Request,
  context: { params: Promise<{ athleteId: string; objectiveId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  const body = changeObjectiveStatusCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return invalidInput(
      "Indica la academia, la sede, la revisión y el nuevo estado.",
      "invalid-athlete-objective-status",
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
    const result = await changeAthleteObjectiveStatus({
      actor: resolved.actor,
      athleteId: params.data.athleteId,
      objectiveId: params.data.objectiveId,
      command: body.data,
    });
    return noStore(apiSuccess(result));
  } catch (error) {
    return progressError(error);
  }
}
