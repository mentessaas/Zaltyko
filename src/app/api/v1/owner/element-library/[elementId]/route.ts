import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getCatalogElement } from "@/modules/element-library/application/element-library-service";
import { catalogElementQuerySchema } from "@/modules/element-library/domain/library-requests";

import {
  apiSuccess,
  invalidInput,
  libraryUnauthenticated,
  noStore,
  progressError,
  resolveLibraryActor,
} from "@/app/api/v1/owner/element-library-http";

const paramsSchema = z.object({ elementId: z.guid() }).strict();

// @auth-flexible route-guard-reason: cookie session read; the team-operations scope admits owner/admin/manager and coaches only for a site in their scope (families are not members); getCatalogElement rechecks both flags, the installed tables, membership, role and site inside one transaction, answers 404 for any element the academy cannot see and returns only this academy's note.
export async function GET(request: Request, context: { params: Promise<{ elementId: string }> }) {
  const user = await getCurrentUser(request);
  if (!user) return libraryUnauthenticated();

  const params = paramsSchema.safeParse(await context.params);
  const query = catalogElementQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!params.success || !query.success) {
    return invalidInput("Indica la academia, la sede y el elemento.", "invalid-element-library-element-query");
  }

  try {
    const resolved = await resolveLibraryActor(request, {
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
    });
    if ("response" in resolved) return resolved.response;
    return noStore(
      apiSuccess(await getCatalogElement({ actor: resolved.actor, elementId: params.data.elementId, query: query.data }))
    );
  } catch (error) {
    return progressError(error);
  }
}
