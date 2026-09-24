import { eq } from "drizzle-orm";

import { db } from "@/db";
import { athleteInvitations, academies } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";

// @route-auth public (opaque invitation state token is the authorization primitive)

/**
 * GET /api/athletes/invite/state/[stateToken]
 *
 * Endpoint PÚBLICO (sin auth) usado por la página /invite/athlete/magic
 * tras verifyOtp. Devuelve:
 *  - status de la invitación (pending|opened|profile_complete|...)
 *  - academy_id, tenant_id y nombre de la academia (públicos en este contexto)
 *  - email objetivo (para mostrar en el formulario)
 *
 * NO devuelve supabase_user_id, token crudo, ni athlete_id. Es seguro
 * exponer el email porque ya está en el correo que recibió el usuario.
 */
async function getInvitationState(_request: Request, ctx: { params: Promise<{ stateToken: string }> }) {
  const { stateToken } = await ctx.params;
  const parsedToken = z.string().min(16).max(512).safeParse(stateToken);
  if (!parsedToken.success) {
    return apiError("INVALID_STATE", "state inválido", 400);
  }

  const [row] = await db
    .select({
      id: athleteInvitations.id,
      academyId: athleteInvitations.academyId,
      tenantId: athleteInvitations.tenantId,
      email: athleteInvitations.email,
      status: athleteInvitations.status,
      expiresAt: athleteInvitations.expiresAt,
      openedAt: athleteInvitations.openedAt,
      profileCompletedAt: athleteInvitations.profileCompletedAt,
      athleteId: athleteInvitations.athleteId,
      academyName: academies.name,
    })
    .from(athleteInvitations)
    .innerJoin(academies, eq(athleteInvitations.academyId, academies.id))
    .where(eq(athleteInvitations.stateToken, parsedToken.data))
    .limit(1);

  if (!row) {
    return apiError("INVITATION_NOT_FOUND", "Invitación no encontrada", 404);
  }

  const expired = row.expiresAt < new Date() && row.status !== "profile_complete";

  return apiSuccess({
    invitation: {
      id: row.id,
      academyId: row.academyId,
      academyName: row.academyName,
      email: row.email,
      status: expired ? "expired" : row.status,
      expiresAt: row.expiresAt.toISOString(),
      openedAt: row.openedAt?.toISOString() ?? null,
      profileCompletedAt: row.profileCompletedAt?.toISOString() ?? null,
      athleteId: row.athleteId,
      requiresProfile: row.status === "opened",
      expired,
    },
  });
}

export const GET = withRateLimit(getInvitationState, {
  limit: RATE_LIMITS.STRICT.limit,
  window: RATE_LIMITS.STRICT.window,
});
