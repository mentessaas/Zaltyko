/**
 * ZAL-138 [D-006 v0] — endpoint público (con sesión Supabase) para que la
 * atleta complete su perfil tras abrir el magic link. Cierra el gate 1 de
 * D-006 v0: profile_completed_at queda seteado.
 *
 * Verifica:
 *  - La sesión Supabase existe (no se permite acceso anónimo).
 *  - El email de la sesión coincide con la invitación.
 *  - La invitación está en estado `opened` (magic link ya abierto).
 *
 * Idempotente: si ya estaba `completed`, devuelve el estado actual sin error.
 */
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { athleteInvitations } from "@/db/schema";
import {
  CompleteAthleteProfileBodySchema,
  completeAthleteProfile,
} from "@/lib/athletes/invitations";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  rateLimit,
  getClientIdentifier,
  getLimitForRoute,
} from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function handleProfile(request: Request, invitationId: string) {
  const limit = getLimitForRoute("/api/athlete-invitations/profile");
  const limited = await rateLimit({
    identifier: getClientIdentifier(request),
    ...limit,
  });
  if (!limited.success) {
    return apiError(
      "RATE_LIMIT_EXCEEDED",
      "Demasiados intentos. Vuelve a probar en unos minutos.",
      429
    );
  }

  // Auth vía Supabase session (la atleta abrió el magic link previamente).
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return apiError(
      "UNAUTHENTICATED",
      "Debes abrir el magic link antes de completar el perfil",
      401
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiError("INVALID_PAYLOAD", "JSON inválido", 400);
  }

  const parsed = CompleteAthleteProfileBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return apiError(
      "INVALID_PROFILE_PAYLOAD",
      parsed.error.issues[0]?.message ?? "Datos inválidos",
      400,
      { issues: parsed.error.issues.slice(0, 5) }
    );
  }

  // Defensa: verificar que la invitación corresponde al email autenticado.
  // Sin esto, alguien con sesión Supabase válida podría enviar invitaciónId
  // ajeno y completar el perfil de otra atleta.
  const [invitation] = await db
    .select({
      id: athleteInvitations.id,
      tenantId: athleteInvitations.tenantId,
      email: athleteInvitations.email,
      status: athleteInvitations.status,
    })
    .from(athleteInvitations)
    .where(eq(athleteInvitations.id, invitationId))
    .limit(1);

  if (!invitation) {
    return apiError("INVITATION_NOT_FOUND", "Invitación no encontrada", 404);
  }

  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    return apiError(
      "INVITATION_EMAIL_MISMATCH",
      "Esta invitación no corresponde a tu cuenta",
      403
    );
  }

  if (
    invitation.status !== "opened" &&
    invitation.status !== "completed"
  ) {
    return apiError(
      "INVITATION_NOT_OPENED",
      "Debes abrir el magic link antes de completar el perfil",
      409
    );
  }

  // Ya completed → idempotente: devolvemos el estado actual.
  if (invitation.status === "completed") {
    return apiSuccess({ status: "completed", alreadyCompleted: true });
  }

  const result = await completeAthleteProfile(
    invitationId,
    invitation.tenantId,
    parsed.data
  );

  if (!result.ok) {
    if (result.code === "TENANT_MISMATCH") {
      return apiError("TENANT_MISMATCH", "Tenant inválido", 403);
    }
    if (result.code === "ATHLETE_NOT_FOUND") {
      return apiError(
        "ATHLETE_NOT_FOUND",
        "No hay atleta vinculado a esta invitación",
        409
      );
    }
    return apiError("INVITATION_NOT_FOUND", "Invitación no encontrada", 404);
  }

  return apiSuccess({
    status: "completed",
    athleteId: result.data.athleteId,
    profileCompletedAt: result.data.profileCompletedAt.toISOString(),
  });
}

export const POST = async (
  request: Request,
  context: { params?: Promise<{ invitationId: string }> | { invitationId: string } }
) => {
  const params = context.params
    ? await Promise.resolve(context.params)
    : ({} as { invitationId: string });
  return handleProfile(request, params.invitationId);
};
