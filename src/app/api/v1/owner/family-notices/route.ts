import { apiSuccess } from "@/lib/api-response";
import { sendManualNotice } from "@/modules/family-access/application/family-notices";
import { familyIdempotencyKeySchema } from "@/modules/family-access/domain/family-access-contract";
import {
  FAMILY_OWNER_COMMAND_LIMIT,
  withFamilyManager,
} from "@/app/api/v1/family-access-route-helpers";

/** Aviso manual de la academia a las familias de una clase o de un grupo. */
// @auth-flexible route-guard-reason: withFamilyManager checks the flag, same origin and the session user (getCurrentUser) and resolves the member with resolveOwnerScope; the service repeats owner/admin/manager with access to the class or group site inside the locked transaction.
export async function POST(request: Request) {
  return withFamilyManager(request, { mutation: true, limit: FAMILY_OWNER_COMMAND_LIMIT }, async (actor, body) => {
    const key = familyIdempotencyKeySchema.parse(request.headers.get("idempotency-key") ?? "");
    return apiSuccess(await sendManualNotice({ actor, command: body, idempotencyKey: key }));
  });
}
