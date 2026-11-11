import { apiCreated, apiSuccess } from "@/lib/api-response";
import { createCanonicalTeamInvitation } from "@/modules/staff/application/canonical-team-access";
import { createTeamInvitationSchema, teamIdempotencyKeySchema } from "@/modules/staff/domain/team-access-contract";
import { invalidTeamInput, teamFeatureUnavailableResponse, withTeamManager } from "@/app/api/v1/owner/staff/team-route-helpers";

// @auth-flexible route-guard-reason: withTeamManager authenticates with getCurrentUser and resolveOwnerScope, admitting only owner/admin with every site or a manager; the canonical transaction repeats that authorization after the command lock, narrows a manager to coaches in their own sites, and checks the locked invitation state and revision.
export async function POST(request: Request) {
  const unavailable = teamFeatureUnavailableResponse();
  if (unavailable) return unavailable;
  const input = createTeamInvitationSchema.safeParse(await request.json().catch(() => null));
  const key = teamIdempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!input.success || !key.success) return invalidTeamInput();
  return withTeamManager(request, input.data.organizationId, async actor => {
    const result = await createCanonicalTeamInvitation({ ...input.data, actor, idempotencyKey: key.data });
    return result.replayed ? apiSuccess(result) : apiCreated(result);
  });
}
