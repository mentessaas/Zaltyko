import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getGroupSkillRoster } from "@/modules/skill-levels/application/skill-level-service";
import { rosterQuerySchema } from "@/modules/skill-levels/domain/skill-levels";

import {
  apiSuccess,
  invalidInput,
  noStore,
  progressError,
  resolveSkillActor,
  skillUnauthenticated,
} from "@/app/api/v1/owner/skill-levels-http";

const paramsSchema = z.object({ groupId: z.guid() }).strict();

// @auth-flexible route-guard-reason: cookie session read; the team-operations scope admits owner/admin/manager and coaches only for a site in their scope; getGroupSkillRoster rechecks the flag, the installed tables, membership, role and that the group belongs to the requested site inside one transaction.
export async function GET(request: Request, context: { params: Promise<{ groupId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return skillUnauthenticated();

  const params = paramsSchema.safeParse(await context.params);
  const query = rosterQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!params.success || !query.success) {
    return invalidInput("Indica la academia, la sede, el grupo y la plantilla.", "invalid-group-skills-query");
  }

  try {
    const resolved = await resolveSkillActor(request, {
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
    });
    if ("response" in resolved) return resolved.response;
    return noStore(
      apiSuccess(await getGroupSkillRoster({ actor: resolved.actor, groupId: params.data.groupId, query: query.data }))
    );
  } catch (error) {
    return progressError(error);
  }
}
