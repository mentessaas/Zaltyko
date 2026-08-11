import { z } from "zod";

import { withTenant } from "@/lib/authz";
import { apiError, apiSuccess } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-error-handler";
import { cancelAthleteInvitation } from "@/lib/athletes/magic-link-invite-service";
import { verifyAcademyAccess } from "@/lib/permissions";

const bodySchema = z.object({
  academyId: z.string().uuid(),
});

/**
 * POST /api/athletes/invite/cancel/[invitationId]
 *
 * Body: { academyId }
 *
 * Cancela una invitación pendiente. NO afecta a las que ya están en
 * `opened` o `profile_complete` — para esas, el owner debe pedir al
 * invitado que cierre sesión o un admin elimina el atleta vía flujo staff.
 */
export const POST = withTenant(async (request, context) => {
  if (!context.tenantId) {
    return apiError("TENANT_REQUIRED", "Tenant requerido", 400);
  }
  if (!["owner", "admin", "super_admin"].includes(context.profile.role)) {
    return apiError("FORBIDDEN", "Prohibido", 403);
  }

  const url = new URL(request.url);
  const invitationId = url.pathname.split("/").pop();
  if (!invitationId || invitationId === "route.ts") {
    return apiError("INVITATION_REQUIRED", "invitationId requerido", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_JSON", "JSON inválido", 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("INVALID_PAYLOAD", "Payload inválido", 400);
  }

  const access = await verifyAcademyAccess(parsed.data.academyId, context.tenantId);
  if (!access.allowed) {
    return apiError("FORBIDDEN", access.reason ?? "Prohibido", 403);
  }

  try {
    const cancelled = await cancelAthleteInvitation(invitationId, context.tenantId);
    if (!cancelled) {
      return apiError(
        "INVITATION_NOT_CANCELLABLE",
        "La invitación no existe, no es de este tenant o ya no está activa",
        400
      );
    }
    return apiSuccess({ cancelled: true, invitationId });
  } catch (err) {
    return handleApiError(err, {
      endpoint: `/api/athletes/invite/cancel/${invitationId}`,
      method: "POST",
    });
  }
});