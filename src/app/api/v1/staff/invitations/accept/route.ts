import { apiSuccess } from "@/lib/api-response";
import { acceptCanonicalTeamInvitation } from "@/modules/staff/application/canonical-team-access";
import { teamIdempotencyKeySchema, teamTokenBodySchema } from "@/modules/staff/domain/team-access-contract";
import { invalidTeamInput, teamFeatureUnavailableResponse, withTeamUser } from "@/app/api/v1/owner/staff/team-route-helpers";

// @auth-flexible route-guard-reason: withTeamUser authenticates with getCurrentUser; acceptance checks the confirmed Auth email, organization, inviter Owner-all, token, scopes and existing membership inside the locked canonical transaction.
export async function POST(request: Request) {
  const unavailable = teamFeatureUnavailableResponse();
  if (unavailable) return unavailable;
  const input = teamTokenBodySchema.safeParse(await request.json().catch(() => null));
  const key = teamIdempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!input.success || !key.success) return invalidTeamInput();
  return withTeamUser(request, async userId => apiSuccess(await acceptCanonicalTeamInvitation({ ...input.data, userId, idempotencyKey: key.data })), { invitationLink: true });
}
