import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getSkillTemplate,
  saveSkillTemplate,
} from "@/modules/skill-levels/application/skill-level-service";
import {
  saveTemplateCommandSchema,
  templateQuerySchema,
} from "@/modules/skill-levels/domain/skill-levels";

import {
  apiSuccess,
  invalidInput,
  noStore,
  progressError,
  resolveSkillActor,
  sameOriginProblem,
  skillUnauthenticated,
} from "@/app/api/v1/owner/skill-levels-http";

const paramsSchema = z.object({ templateId: z.guid() }).strict();

// @auth-flexible route-guard-reason: cookie session read; the team-operations scope admits owner/admin/manager and coaches only for a site in their scope; getSkillTemplate rechecks the flag, the installed tables, membership, role and site inside one transaction.
export async function GET(request: Request, context: { params: Promise<{ templateId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return skillUnauthenticated();

  const params = paramsSchema.safeParse(await context.params);
  const query = templateQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!params.success || !query.success) {
    return invalidInput("Indica la academia, la sede y la plantilla.", "invalid-skill-template-query");
  }

  try {
    const resolved = await resolveSkillActor(request, {
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
    });
    if ("response" in resolved) return resolved.response;
    return noStore(
      apiSuccess(await getSkillTemplate({ actor: resolved.actor, templateId: params.data.templateId, query: query.data }))
    );
  } catch (error) {
    return progressError(error);
  }
}

// @auth-flexible route-guard-reason: same-origin cookie mutation; the team-operations scope admits owner/admin/manager and coaches only for a site in their scope; saveSkillTemplate rechecks the flag, the installed tables, membership, management role, site, expected revision and plan read-only inside one transaction.
export async function PUT(request: Request, context: { params: Promise<{ templateId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return skillUnauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  const body = saveTemplateCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return invalidInput(
      "Revisa la plantilla: al menos un nivel, nombres válidos y aparatos de su disciplina.",
      "invalid-skill-template-structure",
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
    return noStore(
      apiSuccess(await saveSkillTemplate({ actor: resolved.actor, templateId: params.data.templateId, command: body.data }))
    );
  } catch (error) {
    return progressError(error);
  }
}
