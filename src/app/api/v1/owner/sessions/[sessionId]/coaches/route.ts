import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getSessionCoaches, setSessionCoaches } from "@/modules/coach-assignment/application/coach-assignment-service";
import { notifySessionSubstitution } from "@/modules/family-access/application/family-notices";
import {
  sessionCoachesQuerySchema,
  setSessionCoachesCommandSchema,
} from "@/modules/coach-assignment/domain/coach-assignment";

import {
  coachAssignmentError,
  invalidInput,
  readResponse,
  resolveManagementActor,
  resolveSessionReader,
  sameOriginProblem,
  unauthenticated,
} from "@/app/api/v1/owner/coach-assignment-http";

const paramsSchema = z.object({ sessionId: z.guid() }).strict();

// @auth-flexible route-guard-reason: cookie session read; resolveSessionAttendanceAccess admits owner/admin/manager and coaches only for a session of a site in their scope (other sites answer 404, as in Pasar lista); getSessionCoaches rechecks membership, role, site and dormant-candidate availability (503) inside one transaction and lists assignable coaches only to management roles.
export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();

  const params = paramsSchema.safeParse(await context.params);
  const query = sessionCoachesQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries())
  );
  if (!params.success || !query.success) {
    return invalidInput(
      "Indica la academia, la sede y la sesión.",
      "invalid-session-coaches-query",
      query.success ? undefined : query.error.flatten()
    );
  }

  try {
    const resolved = await resolveSessionReader(request, {
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
      sessionId: params.data.sessionId,
    });
    if ("response" in resolved) return resolved.response;
    return readResponse(
      await getSessionCoaches({ actor: resolved.actor, sessionId: params.data.sessionId, query: query.data })
    );
  } catch (error) {
    return coachAssignmentError(error);
  }
}

// @auth-flexible route-guard-reason: same-origin cookie mutation; resolveOwnerScope (management surface) admits only owner/admin/manager with the site in scope, so a coach gets 403; setSessionCoaches rechecks role, site, plan read-only mode, coach eligibility, the expected list (409) and replays by clientRequestId inside one transaction, without touching the class.
export async function PUT(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return unauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  const body = setSessionCoachesCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return invalidInput(
      "Revisa las entrenadoras de la sesión: como máximo 6, sin repetir y con un motivo válido.",
      "invalid-session-coaches",
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
    const result = await setSessionCoaches({ actor: resolved.actor, sessionId: params.data.sessionId, command: body.data });
    // Avisos a familias: tras guardar una sustitución, aviso en el portal y por
    // correo. Sin la función activa no hace nada y nunca falla la sustitución.
    if (!result.replayed && result.substitution) {
      await notifySessionSubstitution({
        actor: resolved.actor,
        organizationId: body.data.organizationId,
        sessionId: result.sessionId,
        staffProfileIds: result.coaches.map((coach) => coach.staffProfileId),
        substitutionChangedAt: result.substitution.changedAt,
      });
    }
    return readResponse(result);
  } catch (error) {
    return coachAssignmentError(error);
  }
}
