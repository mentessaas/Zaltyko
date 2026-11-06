import { apiSuccess } from "@/lib/api-response";
import { listCanonicalTeamAccess } from "@/modules/staff/application/canonical-team-access";
import { teamOrganizationSchema } from "@/modules/staff/domain/team-access-contract";
import { invalidTeamInput, teamFeatureUnavailableResponse, withTeamOwner } from "@/app/api/v1/owner/staff/team-route-helpers";

// @auth-flexible route-guard-reason: withTeamOwner uses getCurrentUser and resolveOwnerScope for active Owner-all; the canonical service rechecks organization membership, without a legacy tenant bridge.
export async function GET(request: Request) {
  const unavailable = teamFeatureUnavailableResponse();
  if (unavailable) return unavailable;
  const input = teamOrganizationSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) return invalidTeamInput();
  return withTeamOwner(request, input.data.organizationId, async actor => apiSuccess(await listCanonicalTeamAccess({ ...input.data, actor })));
}
