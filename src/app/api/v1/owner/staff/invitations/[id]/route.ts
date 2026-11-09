import { apiSuccess } from "@/lib/api-response";
import { revokeCanonicalTeamInvitation } from "@/modules/staff/application/canonical-team-access";
import { teamIdempotencyKeySchema, teamInvitationIdSchema, teamOrganizationSchema, teamRevisionSchema } from "@/modules/staff/domain/team-access-contract";
import { invalidTeamInput, teamFeatureUnavailableResponse, withTeamOwner } from "@/app/api/v1/owner/staff/team-route-helpers";

// @auth-flexible route-guard-reason: withTeamOwner authenticates and requires active Owner-all; the canonical transaction locks the organization before rechecking authorization and invitation state.
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const unavailable = teamFeatureUnavailableResponse();
  if (unavailable) return unavailable;
  const input = teamOrganizationSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const id = teamInvitationIdSchema.safeParse((await context.params).id);
  const key = teamIdempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  const revision = teamRevisionSchema.safeParse(request.headers.get("if-match"));
  if (!input.success || !id.success || !key.success || !revision.success) return invalidTeamInput();
  return withTeamOwner(request, input.data.organizationId, async actor => apiSuccess(await revokeCanonicalTeamInvitation({
    ...input.data, invitationId: id.data, revision: revision.data, actor, idempotencyKey: key.data,
  })));
}
