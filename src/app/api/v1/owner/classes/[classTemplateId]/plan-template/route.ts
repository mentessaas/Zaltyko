import { z } from "zod";

import { apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getClassPlanTemplate,
  saveClassPlanTemplate,
} from "@/modules/session-plans/application/session-plan-service";
import {
  classPlanTemplateQuerySchema,
  saveClassPlanTemplateCommandSchema,
} from "@/modules/session-plans/domain/session-plan";

import {
  invalidInput,
  noStore,
  planError,
  resolvePlanActor,
  sameOriginProblem,
  unauthenticated,
  writeResponse,
} from "@/app/api/v1/owner/session-plan-http";

const paramsSchema = z.object({ classTemplateId: z.guid() }).strict();

// @auth-flexible route-guard-reason: cookie session read; resolveOwnerScope on the management surface (owner/admin/manager, coaches denied); getClassPlanTemplate requires the class at that site and rechecks the management role and site inside one transaction.
export async function GET(request: Request, context: { params: Promise<{ classTemplateId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();

  const params = paramsSchema.safeParse(await context.params);
  const query = classPlanTemplateQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!params.success || !query.success) {
    return invalidInput(
      "Indica la academia y la sede de la clase.",
      "invalid-class-plan-template-query",
      query.success ? undefined : query.error.flatten()
    );
  }

  try {
    const resolved = await resolvePlanActor(request, {
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
      surface: "class_template",
    });
    if ("response" in resolved) return resolved.response;
    return noStore(
      apiSuccess(
        await getClassPlanTemplate({
          actor: resolved.actor,
          classTemplateId: params.data.classTemplateId,
          query: query.data,
        })
      )
    );
  } catch (error) {
    return planError(error);
  }
}

// @auth-flexible route-guard-reason: same-origin cookie mutation; resolveOwnerScope on the management surface (owner/admin/manager, coaches denied); saveClassPlanTemplate requires the class at that site and rechecks the management role, site and plan read-only inside one transaction.
export async function PUT(request: Request, context: { params: Promise<{ classTemplateId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  const body = saveClassPlanTemplateCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return invalidInput(
      "Revisa la plantilla: foco de hasta 200 caracteres, nota de hasta 1000 y como mucho 20 bloques.",
      "invalid-class-plan-template",
      body.success ? undefined : body.error.flatten()
    );
  }

  try {
    const resolved = await resolvePlanActor(request, {
      userId: user.id,
      organizationId: body.data.organizationId,
      locationId: body.data.locationId,
      surface: "class_template",
    });
    if ("response" in resolved) return resolved.response;
    return writeResponse(
      await saveClassPlanTemplate({
        actor: resolved.actor,
        classTemplateId: params.data.classTemplateId,
        command: body.data,
      })
    );
  } catch (error) {
    return planError(error);
  }
}
