import { apiCreated, apiSuccess } from "@/lib/api-response";
import { createCanonicalTeamInvitation } from "@/modules/staff/application/canonical-team-access";
import { createTeamInvitationSchema, teamIdempotencyKeySchema } from "@/modules/staff/domain/team-access-contract";
import { invalidTeamInput, teamFeatureUnavailableResponse, withTeamOwner } from "@/app/api/v1/owner/staff/team-route-helpers";

// @auth-flexible route-guard-reason: withTeamOwner authenticates with getCurrentUser/resolveOwnerScope; canonical transactions repeat active Owner-all authorization after the organization lock.
export async function POST(request: Request) {
  const unavailable = teamFeatureUnavailableResponse();
  if (unavailable) return unavailable;
  const input = createTeamInvitationSchema.safeParse(await request.json().catch(() => null));
  const key = teamIdempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!input.success || !key.success) return invalidTeamInput();
  return withTeamOwner(request, input.data.organizationId, async actor => {
    const result = await createCanonicalTeamInvitation({ ...input.data, actor, idempotencyKey: key.data });
    return result.replayed ? apiSuccess(result) : apiCreated(result);
  });
}
