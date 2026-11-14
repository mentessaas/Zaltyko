import { apiSuccess } from "@/lib/api-response";
import { markFamilyNoticesRead } from "@/modules/family-access/application/family-notice-reads";
import {
  FAMILY_PORTAL_WRITE_LIMIT,
  readJson,
  withFamilyUser,
} from "@/app/api/v1/family-access-route-helpers";

/** Marca como leídos avisos de la propia cuenta en el portal de familias. */
// @auth-flexible route-guard-reason: withFamilyUser checks the flag, same origin, the session user (getCurrentUser) and a per-account limit; the update carries the SQL guard bound to that user, so another family's notices never change.
export async function POST(request: Request) {
  return withFamilyUser(request, { mutation: true, limit: FAMILY_PORTAL_WRITE_LIMIT }, async (userId) =>
    apiSuccess(await markFamilyNoticesRead({ userId, body: await readJson(request) }))
  );
}
