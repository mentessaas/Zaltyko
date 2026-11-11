import { apiSuccess } from "@/lib/api-response";
import { reissueCanonicalTeamInvitation } from "@/modules/staff/application/canonical-team-access";
import { teamIdempotencyKeySchema, teamInvitationIdSchema, teamOrganizationSchema, teamRevisionSchema } from "@/modules/staff/domain/team-access-contract";
import { invalidTeamInput, teamFeatureUnavailableResponse, withTeamManager } from "@/app/api/v1/owner/staff/team-route-helpers";

// @auth-flexible route-guard-reason: withTeamManager authenticates with getCurrentUser and resolveOwnerScope, admitting only owner/admin with every site or a manager; the canonical transaction repeats that authorization after the command lock, narrows a manager to coaches in their own sites, and checks the locked invitation state and revision.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unavailable = teamFeatureUnavailableResponse();
  if (unavailable) return unavailable;
  const input = teamOrganizationSchema.safeParse(await request.json().catch(() => null));
  const id = teamInvitationIdSchema.safeParse((await context.params).id);
  const key = teamIdempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  const revision = teamRevisionSchema.safeParse(request.headers.get("if-match"));
  if (!input.success || !id.success || !key.success || !revision.success) return invalidTeamInput();
  return withTeamManager(request, input.data.organizationId, async actor => apiSuccess(await reissueCanonicalTeamInvitation({
    ...input.data, invitationId: id.data, revision: revision.data, actor, idempotencyKey: key.data,
  })));
}
