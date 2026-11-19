import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { saveElementNote } from "@/modules/element-library/application/element-library-service";
import { saveElementNoteCommandSchema } from "@/modules/element-library/domain/library-requests";
import { ELEMENT_NOTE_MAX } from "@/modules/element-library/domain/element-library";

import {
  apiSuccess,
  invalidInput,
  libraryUnauthenticated,
  noStore,
  progressError,
  resolveLibraryActor,
  sameOriginProblem,
} from "@/app/api/v1/owner/element-library-http";

const paramsSchema = z.object({ elementId: z.guid() }).strict();

// @auth-flexible route-guard-reason: same-origin cookie mutation; the team-operations scope admits owner/admin/manager and coaches only for a site in their scope (families are not members); saveElementNote rechecks both flags, the installed tables, membership, role, site, element visibility, expected revision and plan read-only inside one transaction, and only touches this academy's note.
export async function PUT(request: Request, context: { params: Promise<{ elementId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return libraryUnauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  const body = saveElementNoteCommandSchema.safeParse(await request.json().catch(() => null));
  if (!params.success || !body.success) {
    return invalidInput(
      `Revisa la nota: como mucho ${ELEMENT_NOTE_MAX} caracteres.`,
      "invalid-element-note",
      body.success ? undefined : body.error.flatten()
    );
  }

  try {
    const resolved = await resolveLibraryActor(request, {
      userId: user.id,
      organizationId: body.data.organizationId,
      locationId: body.data.locationId,
    });
    if ("response" in resolved) return resolved.response;
    return noStore(
      apiSuccess(await saveElementNote({ actor: resolved.actor, elementId: params.data.elementId, command: body.data }))
    );
  } catch (error) {
    return progressError(error);
  }
}
