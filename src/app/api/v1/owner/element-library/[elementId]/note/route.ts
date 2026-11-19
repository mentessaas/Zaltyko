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

/** Mensaje del 400 según lo que falla: el texto de la nota, la petición o el resto. */
function invalidNoteDetail(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): string {
  const fields = new Set(issues.map((issue) => issue.path[0]));
  if (fields.has("note")) {
    return `Revisa la nota: como mucho ${ELEMENT_NOTE_MAX} caracteres y sin caracteres de control.`;
  }
  if (fields.has("expectedRevision") || fields.has("clientRequestId")) {
    return "Falta la versión de la nota o el identificador del envío. Recarga la página y vuelve a intentarlo.";
  }
  return "Revisa los datos de la nota.";
}

// @auth-flexible route-guard-reason: same-origin cookie mutation; the team-operations scope admits owner/admin/manager and coaches only for a site in their scope (families are not members); saveElementNote rechecks both flags, the installed tables, membership, role, site, element visibility, expected revision and plan read-only inside one transaction, and only touches this academy's note.
export async function PUT(request: Request, context: { params: Promise<{ elementId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return libraryUnauthenticated();
  const origin = sameOriginProblem(request);
  if (origin) return origin;

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return invalidInput("El elemento indicado no es válido.", "invalid-element-note-element");
  }
  const body = saveElementNoteCommandSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return invalidInput(invalidNoteDetail(body.error.issues), "invalid-element-note", body.error.flatten());
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
