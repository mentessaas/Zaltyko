import { apiSuccess } from "@/lib/api-response";
import { runFamilyAccessCommand } from "@/modules/family-access/application/guardian-invitations";
import { familyIdempotencyKeySchema } from "@/modules/family-access/domain/family-access-contract";
import {
  FAMILY_OWNER_COMMAND_LIMIT,
  withFamilyManager,
} from "@/app/api/v1/family-access-route-helpers";

/**
 * Comandos de la academia sobre el acceso de familias al portal: invitar a un
 * tutor o a todos los que tienen correo, reenviar, revocar y retirar acceso.
 * Retirar acceso funciona también con la bandera apagada (si el candidato
 * está instalado), para que apagar la función nunca deje cuentas viendo datos.
 */
// @auth-flexible route-guard-reason: withFamilyManager checks the flag, same origin and the session user (getCurrentUser) reads the body only after authentication and resolves the member with resolveOwnerScope; the service repeats owner/admin/manager with all sites inside the locked transaction.
export async function POST(request: Request) {
  return withFamilyManager(request, { mutation: true, limit: FAMILY_OWNER_COMMAND_LIMIT, allowWhenFlagOff: true }, async (actor, body) => {
    const key = familyIdempotencyKeySchema.parse(request.headers.get("idempotency-key") ?? "");
    return apiSuccess(await runFamilyAccessCommand({ actor, command: body, idempotencyKey: key }));
  });
}
