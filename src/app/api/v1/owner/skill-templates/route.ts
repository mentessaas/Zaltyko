import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createSkillTemplate,
  listSkillTemplates,
} from "@/modules/skill-levels/application/skill-level-service";
import {
  createTemplateCommandSchema,
  templatesQuerySchema,
} from "@/modules/skill-levels/domain/skill-levels";

import {
  apiSuccess,
  invalidInput,
  noStore,
  progressError,
  resolveSkillActor,
  sameOriginProblem,
  skillUnauthenticated,
  skillWriteResponse,
} from "@/app/api/v1/owner/skill-levels-http";

// @auth-flexible route-guard-reason: cookie session read; the team-operations scope admits owner/admin/manager and coaches only for a site in their scope; listSkillTemplates rechecks the flag, the installed tables, membership, role and site inside one transaction.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return skillUnauthenticated();

  const query = templatesQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.success) {
    return invalidInput("Indica la academia y la sede.", "invalid-skill-templates-query", query.error.flatten());
  }

  try {
    const resolved = await resolveSkillActor(request, {
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
    });
    if ("response" in resolved) return resolved.response;
    return noStore(apiSuccess(await listSkillTemplates({ actor: resolved.actor, query: query.data })));
  } catch (error) {
    return progressError(error);
  }
}

// @auth-flexible route-guard-reason: same-origin cookie mutation; the team-operations scope admits owner/admin/manager and coaches only for a site in their scope; createSkillTemplate rechecks the flag, the installed tables, membership, management role, site and plan read-only inside one transaction, and replays by clientRequestId.
export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return skillUnauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const body = createTemplateCommandSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return invalidInput(
      "Revisa la plantilla: nombre de 2 a 80 caracteres y la disciplina o la plantilla de origen.",
      "invalid-skill-template",
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
    return skillWriteResponse(await createSkillTemplate({ actor: resolved.actor, command: body.data }));
  } catch (error) {
    return progressError(error);
  }
}
