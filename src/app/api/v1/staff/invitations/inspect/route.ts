import { apiSuccess } from "@/lib/api-response";
import { inspectCanonicalTeamInvitation } from "@/modules/staff/application/canonical-team-access";
import { teamTokenBodySchema } from "@/modules/staff/domain/team-access-contract";
import { invalidTeamInput, teamFeatureUnavailableResponse, withTeamUser } from "@/app/api/v1/owner/staff/team-route-helpers";

// @auth-flexible route-guard-reason: withTeamUser uses getCurrentUser, then the read-only canonical service requires the real confirmed auth.users email to match the token's invitation. No legacy membership bridge.
export async function POST(request: Request) {
  const unavailable = teamFeatureUnavailableResponse();
  if (unavailable) return unavailable;
  const input = teamTokenBodySchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return invalidTeamInput();
  return withTeamUser(request, async userId => apiSuccess(await inspectCanonicalTeamInvitation({ ...input.data, userId })), { invitationLink: true });
}
