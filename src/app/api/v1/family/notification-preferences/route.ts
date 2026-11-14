import { apiSuccess } from "@/lib/api-response";
import { setFamilyNotificationPreferences } from "@/modules/family-access/application/family-notice-reads";
import {
  FAMILY_PORTAL_WRITE_LIMIT,
  readJson,
  withFamilyUser,
} from "@/app/api/v1/family-access-route-helpers";

/** Preferencias de correo de los avisos, por academia. */
// @auth-flexible route-guard-reason: withFamilyUser checks the flag, same origin, the session user (getCurrentUser) and a per-account limit; the write carries the SQL guard bound to that user and that academy.
export async function PUT(request: Request) {
  return withFamilyUser(request, { mutation: true, limit: FAMILY_PORTAL_WRITE_LIMIT }, async (userId) =>
    apiSuccess(await setFamilyNotificationPreferences({ userId, body: await readJson(request) }))
  );
}
