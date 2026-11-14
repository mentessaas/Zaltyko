import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { passSkillLevel } from "@/modules/skill-levels/application/skill-level-service";
import { passLevelCommandSchema } from "@/modules/skill-levels/domain/skill-levels";

import {
  invalidInput,
  progressError,
  resolveSkillActor,
  sameOriginProblem,
  skillUnauthenticated,
  skillWriteResponse,
} from "@/app/api/v1/owner/skill-levels-http";

const paramsSchema = z.object({ athleteId: z.guid() }).strict();

// @auth-flexible route-guard-reason: same-origin cookie mutation; the team-operations scope admits owner/admin/manager and coaches only for a site in their scope; passSkillLevel rechecks the flag, the installed tables, membership, role, site, athlete link, archived athlete, the level order and completeness rule and plan read-only inside one transaction, and replays by clientRequestId.
export async function POST(request: Request, context: { params: Promise<{ athleteId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return skillUnauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  const body = passLevelCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return invalidInput(
      "Indica la plantilla, el nivel y, si quieres, la fecha del paso de nivel.",
      "invalid-level-pass",
      body.success ? undefined : body.error.flatten()
    );
  }

  try {
    const resolved = await resolveSkillActor(request, {
      userId: user.id,
      organizationId: body.data.organizationId,
      locationId: body.data.locationId,
    });
    if ("response" in resolved) return resolved.response;
    return skillWriteResponse(
      await passSkillLevel({ actor: resolved.actor, athleteId: params.data.athleteId, command: body.data })
    );
  } catch (error) {
    return progressError(error);
  }
}
