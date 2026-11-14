import { getCurrentUser } from "@/lib/auth/current-user";
import { evaluateSkills } from "@/modules/skill-levels/application/skill-level-service";
import { evaluateSkillsCommandSchema } from "@/modules/skill-levels/domain/skill-levels";

import {
  apiSuccess,
  invalidInput,
  noStore,
  progressError,
  resolveSkillActor,
  sameOriginProblem,
  skillUnauthenticated,
} from "@/app/api/v1/owner/skill-levels-http";

// @auth-flexible route-guard-reason: same-origin cookie mutation; the team-operations scope admits owner/admin/manager and coaches only for a site in their scope; evaluateSkills rechecks the flag, the installed tables, membership, role, site, the link of every athlete (open enrollment or group at that site for coaches), archived athletes and plan read-only inside one transaction, and replays by clientRequestId.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return skillUnauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const body = evaluateSkillsCommandSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return invalidInput(
      "Indica la plantilla, las gimnastas, los elementos y el estado (como mucho 400 marcas por envío).",
      "invalid-skill-evaluation",
      body.error.flatten()
    );
  }

  try {
    const resolved = await resolveSkillActor(request, {
      userId: user.id,
      organizationId: body.data.organizationId,
      locationId: body.data.locationId,
    });
    if ("response" in resolved) return resolved.response;
    return noStore(apiSuccess(await evaluateSkills({ actor: resolved.actor, command: body.data })));
  } catch (error) {
    return progressError(error);
  }
}
