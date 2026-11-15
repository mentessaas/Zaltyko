import { z } from "zod";

import { apiSuccess } from "@/lib/api-response";
import { changeSessionAndNotify } from "@/modules/family-access/application/family-notices";
import { familyIdempotencyKeySchema } from "@/modules/family-access/domain/family-access-contract";
import {
  FAMILY_OWNER_COMMAND_LIMIT,
  withFamilyManager,
} from "@/app/api/v1/family-access-route-helpers";

const paramsSchema = z.object({ sessionId: z.guid() }).strict();

/**
 * Cancela o cambia de hora una sesión futura y avisa a las familias de las
 * gimnastas inscritas (portal y correo, según sus preferencias).
 */
// @auth-flexible route-guard-reason: withFamilyManager checks the flag, same origin and the session user (getCurrentUser) and resolves the member with resolveOwnerScope; the service repeats owner/admin/manager with access to the session's site inside the locked transaction.
export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  return withFamilyManager(request, { mutation: true, limit: FAMILY_OWNER_COMMAND_LIMIT }, async (actor, body) => {
    const params = paramsSchema.parse(await context.params);
    const key = familyIdempotencyKeySchema.parse(request.headers.get("idempotency-key") ?? "");
    return apiSuccess(await changeSessionAndNotify({ actor, sessionId: params.sessionId, command: body, idempotencyKey: key }));
  });
}
