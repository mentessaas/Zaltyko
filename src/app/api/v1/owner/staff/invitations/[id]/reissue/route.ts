import { apiSuccess } from "@/lib/api-response";
import { reissueCanonicalTeamInvitation } from "@/modules/staff/application/canonical-team-access";
import { teamIdempotencyKeySchema, teamInvitationIdSchema, teamOrganizationSchema, teamRevisionSchema } from "@/modules/staff/domain/team-access-contract";
import { invalidTeamInput, teamFeatureUnavailableResponse, withTeamOwner } from "@/app/api/v1/owner/staff/team-route-helpers";

// @auth-flexible route-guard-reason: withTeamOwner requires a verified current user and active Owner-all; the transaction repeats authorization and checks the locked invitation revision.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const unavailable = teamFeatureUnavailableResponse();
  if (unavailable) return unavailable;
  const input = teamOrganizationSchema.safeParse(await request.json().catch(() => null));
  const id = teamInvitationIdSchema.safeParse((await context.params).id);
  const key = teamIdempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  const revision = teamRevisionSchema.safeParse(request.headers.get("if-match"));
  if (!input.success || !id.success || !key.success || !revision.success) return invalidTeamInput();
  return withTeamOwner(request, input.data.organizationId, async actor => apiSuccess(await reissueCanonicalTeamInvitation({
    ...input.data, invitationId: id.data, revision: revision.data, actor, idempotencyKey: key.data,
  })));
}
