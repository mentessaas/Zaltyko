import { eq, and, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { invitations, profiles, memberships, roleMembers } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { apiSuccess, apiError } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-error-handler";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";
import { logger } from "@/lib/logger";
import { withTransaction } from "@/lib/db-transactions";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string(),
  name: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    // Get authenticated user from session
    const cookieStore = await cookies();
    const supabase = await createClient(cookieStore);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return apiError("UNAUTHENTICATED", "Debes iniciar sesión para aceptar la invitación", 401);
    }

    // Parse and validate body
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

    const { token, name } = parsed.data;

    // Find the invitation by token
    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.token, token))
      .limit(1);

    if (!invitation) {
      return apiError("INVITATION_NOT_FOUND", "Invitación no encontrada", 404);
    }

    // Check invitation status
    if (invitation.status !== "pending") {
      return apiError(
        "INVITATION_ALREADY_USED",
        "Esta invitación ya fue aceptada o cancelada",
        400
      );
    }

    // Check if invitation is expired
    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      return apiError("INVITATION_EXPIRED", "Esta invitación ha expirado", 400);
    }

    // Verify the user's email matches the invitation email
    const userEmail = user.email?.toLowerCase();
    const invitationEmail = invitation.email.toLowerCase();

    if (userEmail !== invitationEmail) {
      return apiError(
        "EMAIL_MISMATCH",
        "El email de la invitación no coincide con tu cuenta",
        403
      );
    }

    const accepted = await withTransaction(async (tx) => {
      // La transición pending -> processing es el claim de uso único. Dos
      // aceptaciones concurrentes no pueden crear memberships duplicados.
      const [claimed] = await tx
        .update(invitations)
        .set({ status: "processing", supabaseUserId: user.id })
        .where(
          and(
            eq(invitations.id, invitation.id),
            eq(invitations.status, "pending"),
            gt(invitations.expiresAt, new Date())
          )
        )
        .returning();
      if (!claimed) return false;

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
            name: name || user.email?.split("@")[0] || "Usuario",
            role: claimed.role,
            tenantId: claimed.tenantId,
            activeAcademyId: claimed.defaultAcademyId || claimed.academyIds?.[0] || null,
            canLogin: true,
          })
          .returning();
      } else if (!profile.tenantId) {
        await tx
          .update(profiles)
          .set({
            tenantId: claimed.tenantId,
            activeAcademyId:
              claimed.defaultAcademyId || claimed.academyIds?.[0] || profile.activeAcademyId,
          })
          .where(eq(profiles.id, profile.id));
      }

      const academyIds = claimed.academyIds || [];
      for (const academyId of academyIds) {
        const membershipRole: "owner" | "coach" | "viewer" =
          claimed.role === "owner" ? "owner" : claimed.role === "coach" ? "coach" : "viewer";

        await tx
          .insert(memberships)
          .values({ userId: user.id, academyId, role: membershipRole })
          .onConflictDoNothing({ target: [memberships.userId, memberships.academyId] });

        if (claimed.roleId) {
          await tx
            .delete(roleMembers)
            .where(
              and(eq(roleMembers.userId, user.id), eq(roleMembers.academyId, academyId))
            );
          await tx.insert(roleMembers).values({
            roleId: claimed.roleId,
            userId: user.id,
            academyId,
            memberRole: membershipRole,
            customPermissions: claimed.permissions ?? null,
            assignedBy: claimed.invitedBy,
          });
        }
      }

      await tx
        .update(invitations)
        .set({ status: "accepted", acceptedAt: new Date(), supabaseUserId: user.id })
        .where(and(eq(invitations.id, claimed.id), eq(invitations.status, "processing")));
      return true;
    });

    if (!accepted) {
      return apiError("INVITATION_ALREADY_USED", "Esta invitación ya fue utilizada", 400);
    }

    const home = await resolveUserHome({
      userId: user.id,
      email: user.email,
    });

    return apiSuccess({
      success: true,
      role: invitation.role,
      academyId: home.activeAcademyId,
      redirectUrl: home.redirectUrl,
    });
  } catch (error) {
    logger.error("Error accepting invitation:", error);
    return handleApiError(error, { endpoint: "/api/invitations/complete", method: "POST" });
  }
}
