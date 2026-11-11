import { z } from "zod";

import { apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAthleteProgress } from "@/modules/athlete-progress/application/athlete-progress-service";
import { athleteProgressQuerySchema } from "@/modules/athlete-progress/domain/athlete-progress";

import {
  invalidInput,
  noStore,
  progressError,
  resolveProgressActor,
  unauthenticated,
} from "@/app/api/v1/owner/athlete-progress-http";

const paramsSchema = z.object({ athleteId: z.guid() }).strict();

// @auth-flexible route-guard-reason: cookie session read; resolveOwnerScope admits owner/admin/manager and, through the explicit coach_operations surface, coaches only for a site in their scope; getAthleteProgress rechecks membership, role, site, athlete link (open enrollment or group at that site for coaches) and per-record site visibility inside one transaction.
export async function GET(request: Request, context: { params: Promise<{ athleteId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();

  const params = paramsSchema.safeParse(await context.params);
  const query = athleteProgressQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!params.success || !query.success) {
    return invalidInput(
      "Indica la academia, la sede y la gimnasta.",
      "invalid-athlete-progress-query",
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
    const progress = await getAthleteProgress({
      actor: resolved.actor,
      athleteId: params.data.athleteId,
      query: query.data,
    });
    return noStore(apiSuccess(progress));
  } catch (error) {
    return progressError(error);
  }
}
