import { apiSuccess } from "@/lib/api-response";
import { inspectFamilyInvitation } from "@/modules/family-access/application/guardian-invitations";
import { familyTokenSchema } from "@/modules/family-access/domain/family-access-contract";
import {
  FAMILY_INVITATION_LINK_LIMITS,
  readJson,
  withFamilyUser,
} from "@/app/api/v1/family-access-route-helpers";

/** Revisa una invitación al portal sin consumirla. */
// @auth-flexible route-guard-reason: withFamilyUser checks the flag, same origin, the session user (getCurrentUser) and per-account and per-network limits before reading the token; the service compares the verified Auth email with the invitation inside a transaction.
export async function POST(request: Request) {
  return withFamilyUser(request, { mutation: true, limit: FAMILY_INVITATION_LINK_LIMITS.account, invitationLink: true }, async (userId) => {
    const body = await readJson(request);
    const token = familyTokenSchema.parse(body?.token);
    return apiSuccess(await inspectFamilyInvitation({ userId, token }));
  });
}
