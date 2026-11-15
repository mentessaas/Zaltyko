import { apiSuccess } from "@/lib/api-response";
import { acceptFamilyInvitation } from "@/modules/family-access/application/guardian-invitations";
import { familyTokenSchema } from "@/modules/family-access/domain/family-access-contract";
import {
  FAMILY_INVITATION_LINK_LIMITS,
  readJson,
  withFamilyUser,
} from "@/app/api/v1/family-access-route-helpers";

/** Acepta una invitación al portal: vincula la cuenta al tutor de la academia. */
// @auth-flexible route-guard-reason: withFamilyUser checks the flag, same origin, the session user (getCurrentUser) and per-account and per-network limits before reading the token; acceptance checks the verified Auth email, the guardian, the token hash and its expiry inside the locked transaction.
export async function POST(request: Request) {
  return withFamilyUser(request, { mutation: true, limit: FAMILY_INVITATION_LINK_LIMITS.account, invitationLink: true }, async (userId) => {
    const body = await readJson(request);
    const token = familyTokenSchema.parse(body?.token);
    return apiSuccess(await acceptFamilyInvitation({ userId, token }));
  });
}
