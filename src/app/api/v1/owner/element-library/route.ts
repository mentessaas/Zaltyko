import { getCurrentUser } from "@/lib/auth/current-user";
import { searchCatalogElements } from "@/modules/element-library/application/element-library-service";
import { catalogSearchQuerySchema } from "@/modules/element-library/domain/library-requests";

import {
  apiSuccess,
  invalidInput,
  libraryUnauthenticated,
  noStore,
  progressError,
  resolveLibraryActor,
} from "@/app/api/v1/owner/element-library-http";

// @auth-flexible route-guard-reason: cookie session read; the team-operations scope admits owner/admin/manager and coaches only for a site in their scope (families are not members); searchCatalogElements rechecks both flags, the installed tables, membership, role and site inside one transaction and returns only reviewed elements of a published edition that are not withdrawn.
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return libraryUnauthenticated();

  const query = catalogSearchQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (!query.success) {
    return invalidInput(
      "Indica la academia, la sede y la disciplina, y revisa los filtros.",
      "invalid-element-library-query",
      query.error.flatten()
    );
  }

  try {
    const resolved = await resolveLibraryActor(request, {
      userId: user.id,
      organizationId: query.data.organizationId,
      locationId: query.data.locationId,
    });
    if ("response" in resolved) return resolved.response;
    return noStore(apiSuccess(await searchCatalogElements({ actor: resolved.actor, query: query.data })));
  } catch (error) {
    return progressError(error);
  }
}
