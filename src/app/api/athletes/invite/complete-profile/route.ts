import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import {
  athletes,
  athleteInvitations,
  profiles,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-error-handler";
import { withTransaction } from "@/lib/db-transactions";
import { markInvitationProfileComplete } from "@/lib/athletes/magic-link-invite-service";
import { logger } from "@/lib/logger";
import { trackEvent } from "@/lib/analytics";

const bodySchema = z.object({
  stateToken: z.string().min(16),
  name: z.string().trim().min(2).max(120),
  dob: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe ser YYYY-MM-DD")
    .optional()
    .nullable(),
  level: z.string().max(50).optional().nullable(),
  programCode: z.string().max(50).optional().nullable(),
  levelCode: z.string().max(50).optional().nullable(),
  categoryCode: z.string().max(50).optional().nullable(),
  primaryApparatus: z.string().max(80).optional().nullable(),
});

/**
 * POST /api/athletes/invite/complete-profile
 *
 * El usuario acaba de abrir el magic link (verifyOtp ya corrió en
 * /auth/callback → /invite/athlete/magic) y está autenticado.
 *
 * Body: { stateToken, name, dob?, level?, ... }
 *
 * Garantías:
 *  - El stateToken debe corresponder a una invitación `opened` y el email
 *    del usuario autenticado debe coincidir con invitation.email.
 *  - La transacción crea/actualiza `profiles` (rol=athlete, tenantId de la
 *    invitación) y crea `athletes` con academyId/tenantId correctos.
 *  - Marca la invitación como `profile_complete` con `athlete_id` linkeado.
 *  - Idempotente: si la invitación ya está profile_complete, devuelve la
 *    fila existente sin crear otra.
 *  - Trackea `athlete_confirmed` (NO `first_athlete_invited`, que se
 *    mantiene para distinguir invitación enviada vs confirmada).
 */
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHENTICATED", "Debes abrir el magic link primero", 401);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("INVALID_JSON", "JSON inválido", 400);
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return apiError("INVALID_PAYLOAD", "Payload inválido", 400, {
        issues: parsed.error.issues,
      });
    }

    const [invitation] = await db
      .select()
      .from(athleteInvitations)
      .where(eq(athleteInvitations.stateToken, parsed.data.stateToken))
      .limit(1);

    if (!invitation) {
      return apiError("INVITATION_NOT_FOUND", "Invitación no encontrada", 404);
    }
    if (invitation.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
      return apiError(
        "EMAIL_MISMATCH",
        "El email autenticado no coincide con la invitación",
        403
      );
    }
    if (invitation.expiresAt < new Date() && invitation.status !== "profile_complete") {
      return apiError("INVITATION_EXPIRED", "Esta invitación ha expirado", 400);
    }
    if (invitation.status === "cancelled") {
      return apiError("INVITATION_CANCELLED", "Invitación cancelada", 400);
    }
    if (invitation.status === "profile_complete") {
      // Idempotente: devolvemos la fila actual.
      return apiSuccess({
        alreadyComplete: true,
        athleteId: invitation.athleteId,
        academyId: invitation.academyId,
        redirectUrl: `/my-dashboard/athlete`,
      });
    }
    if (invitation.status !== "opened") {
      return apiError(
        "INVITATION_NOT_OPENED",
        "Debes abrir el magic link antes de completar tu perfil",
        400
      );
    }

    const result = await withTransaction(async (tx) => {
      // 1. Asegurar profile de tipo athlete con tenantId de la invitación.
      let [profile] = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.userId, user.id))
        .limit(1);

      if (!profile) {
        [profile] = await tx
          .insert(profiles)
          .values({
            userId: user.id,
            name: parsed.data.name,
            role: "athlete",
            tenantId: invitation.tenantId,
            activeAcademyId: invitation.academyId,
            canLogin: true,
          })
          .returning();
      } else {
        await tx
          .update(profiles)
          .set({
            name: parsed.data.name,
            role: "athlete",
            tenantId: invitation.tenantId,
            activeAcademyId: invitation.academyId,
          })
          .where(eq(profiles.id, profile.id));
      }

      // 2. Crear fila en athletes. Si ya existe una para este user_id +
      //    academy_id (por una invitación previa cancelada/reabierta),
      //    reusarla.
      const [existingAthlete] = await tx
        .select()
        .from(athletes)
        .where(
          and(
            eq(athletes.userId, user.id),
            eq(athletes.academyId, invitation.academyId)
          )
        )
        .limit(1);

      let athleteId: string;
      if (existingAthlete) {
        await tx
          .update(athletes)
          .set({
            name: parsed.data.name,
            dob: parsed.data.dob ?? null,
            level: parsed.data.level ?? null,
            programCode: parsed.data.programCode ?? null,
            levelCode: parsed.data.levelCode ?? null,
            categoryCode: parsed.data.categoryCode ?? null,
            primaryApparatus: parsed.data.primaryApparatus ?? null,
            status: "active",
            deletedAt: null,
          })
          .where(eq(athletes.id, existingAthlete.id));
        athleteId = existingAthlete.id;
      } else {
        const [created] = await tx
          .insert(athletes)
          .values({
            tenantId: invitation.tenantId,
            academyId: invitation.academyId,
            userId: user.id,
            name: parsed.data.name,
            dob: parsed.data.dob ?? null,
            level: parsed.data.level ?? null,
            programCode: parsed.data.programCode ?? null,
            levelCode: parsed.data.levelCode ?? null,
            categoryCode: parsed.data.categoryCode ?? null,
            primaryApparatus: parsed.data.primaryApparatus ?? null,
            status: "active",
          })
          .returning({ id: athletes.id });
        athleteId = created.id;
      }

      // 3. Marcar invitación profile_complete y linkear athlete.
      const [closed] = await tx
        .update(athleteInvitations)
        .set({
          status: "profile_complete",
          athleteId,
          profileCompletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(athleteInvitations.id, invitation.id),
            sql`${athleteInvitations.status} = 'opened'`
          )
        )
        .returning({ id: athleteInvitations.id });
      if (!closed) {
        throw new Error("INVITATION_RACE");
      }

      return { athleteId, profileId: profile.id };
    });

    // Mark outside tx (read-only) — idempotente, no afecta correctness.
    await markInvitationProfileComplete({
      invitationId: invitation.id,
      athleteId: result.athleteId,
    }).catch((err) => {
      logger.warn("[complete-profile] markInvitationProfileComplete ignored", {
        err: err instanceof Error ? err.message : String(err),
      });
    });

    await trackEvent("athlete_confirmed", {
      academyId: invitation.academyId,
      tenantId: invitation.tenantId,
      userId: user.id,
      metadata: {
        invitationId: invitation.id,
        // PII (email, name) no se manda a analytics.
      },
    });

    return apiSuccess({
      alreadyComplete: false,
      athleteId: result.athleteId,
      academyId: invitation.academyId,
      redirectUrl: `/my-dashboard/athlete`,
    });
  } catch (err) {
    logger.error("[complete-profile] error", {
      err: err instanceof Error ? err.message : String(err),
    });
    return handleApiError(err, {
      endpoint: "/api/athletes/invite/complete-profile",
      method: "POST",
    });
  }
}