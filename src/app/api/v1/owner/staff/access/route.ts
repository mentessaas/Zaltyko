import { apiSuccess } from "@/lib/api-response";
import { listCanonicalTeamAccess } from "@/modules/staff/application/canonical-team-access";
import { teamOrganizationSchema } from "@/modules/staff/domain/team-access-contract";
import { invalidTeamInput, teamFeatureUnavailableResponse, withTeamManager } from "@/app/api/v1/owner/staff/team-route-helpers";

// @auth-flexible route-guard-reason: withTeamManager authenticates with getCurrentUser and resolveOwnerScope, admitting only owner/admin with every site or a manager; the canonical transaction repeats that authorization after the command lock, narrows a manager to coaches in their own sites, and checks the locked invitation state and revision.
export async function GET(request: Request) {
  const unavailable = teamFeatureUnavailableResponse();
  if (unavailable) return unavailable;
  const input = teamOrganizationSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) return invalidTeamInput();
  return withTeamManager(request, input.data.organizationId, async actor => apiSuccess(await listCanonicalTeamAccess({ ...input.data, actor })));
}
