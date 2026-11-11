import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getClassCoaches, setClassCoaches } from "@/modules/coach-assignment/application/coach-assignment-service";
import {
  classCoachesQuerySchema,
  setClassCoachesCommandSchema,
} from "@/modules/coach-assignment/domain/coach-assignment";

import {
  coachAssignmentError,
  invalidInput,
  readResponse,
  resolveManagementActor,
  sameOriginProblem,
  unauthenticated,
} from "@/app/api/v1/owner/coach-assignment-http";

const paramsSchema = z.object({ classTemplateId: z.guid() }).strict();

// @auth-flexible route-guard-reason: cookie session read; resolveOwnerScope (management surface) admits only owner/admin/manager with the requested site in scope; getClassCoaches rechecks membership, role, the class site and dormant-candidate availability (503) inside one transaction.
export async function GET(request: Request, context: { params: Promise<{ classTemplateId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();

  const params = paramsSchema.safeParse(await context.params);
  const query = classCoachesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!params.success || !query.success) {
    return invalidInput(
      "Indica la academia y la clase.",
      "invalid-class-coaches-query",
      query.success ? undefined : query.error.flatten()
    );
  }

  try {
    const resolved = await resolveManagementActor(request, {
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
    });
    if ("response" in resolved) return resolved.response;
    return readResponse(
      await getClassCoaches({ actor: resolved.actor, classTemplateId: params.data.classTemplateId, query: query.data })
    );
  } catch (error) {
    return coachAssignmentError(error);
  }
}

// @auth-flexible route-guard-reason: same-origin cookie mutation; resolveOwnerScope (management surface) admits only owner/admin/manager; setClassCoaches rechecks role, the class site, plan read-only mode, coach eligibility (coach role and site access), the expected list (409) and replays by clientRequestId inside one transaction.
export async function PUT(request: Request, context: { params: Promise<{ classTemplateId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  const body = setClassCoachesCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return invalidInput(
      "Revisa las entrenadoras: como máximo 6 y sin repetir.",
      "invalid-class-coaches",
      body.success ? undefined : body.error.flatten()
    );
  }

  try {
    const resolved = await resolveManagementActor(request, {
      userId: user.id,
      organizationId: body.data.organizationId,
      locationId: body.data.locationId,
    });
    if ("response" in resolved) return resolved.response;
    return readResponse(
      await setClassCoaches({ actor: resolved.actor, classTemplateId: params.data.classTemplateId, command: body.data })
    );
  } catch (error) {
    return coachAssignmentError(error);
  }
}
