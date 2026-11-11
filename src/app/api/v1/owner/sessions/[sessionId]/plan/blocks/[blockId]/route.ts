import { z } from "zod";

import { apiSuccess } from "@/lib/api-response";
import { getCurrentUser } from "@/lib/auth/current-user";
import { markSessionPlanBlock } from "@/modules/session-plans/application/session-plan-service";
import { markBlockCommandSchema } from "@/modules/session-plans/domain/session-plan";

import {
  invalidInput,
  noStore,
  planError,
  resolvePlanActor,
  sameOriginProblem,
  unauthenticated,
} from "@/app/api/v1/owner/session-plan-http";

const paramsSchema = z.object({ sessionId: z.guid(), blockId: z.guid() }).strict();

// @auth-flexible route-guard-reason: same-origin cookie mutation from Pasar lista; resolveOwnerScope admits owner/admin/manager and coaches only for a site in their scope (coach_operations); markSessionPlanBlock requires the block in the plan of that session at that site, only once the session has started, is idempotent, and rechecks role, site and plan read-only inside one transaction.
export async function PUT(
  request: Request,
  context: { params: Promise<{ sessionId: string; blockId: string }> }
) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  const body = markBlockCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return invalidInput(
      "Indica la academia, la sede y si el bloque está hecho.",
      "invalid-session-plan-block",
      body.success ? undefined : body.error.flatten()
    );
  }

  try {
    const resolved = await resolvePlanActor(request, {
      userId: user.id,
      organizationId: body.data.organizationId,
      locationId: body.data.locationId,
      surface: "session",
    });
    if ("response" in resolved) return resolved.response;
    return noStore(
      apiSuccess(
        await markSessionPlanBlock({
          actor: resolved.actor,
          sessionId: params.data.sessionId,
          blockId: params.data.blockId,
          command: body.data,
        })
      )
    );
  } catch (error) {
    return planError(error);
  }
}
