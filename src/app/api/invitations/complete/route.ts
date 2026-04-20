import { eq, and } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/db";
import { invitations, profiles, memberships } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { apiSuccess, apiError } from "@/lib/api-response";
import { handleApiError } from "@/lib/api-error-handler";

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

    // Find or create profile for the user
    let [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, user.id))
      .limit(1);

    if (!profile) {
      // Create new profile
      const tenantId = invitation.tenantId;

      [profile] = await db
        .insert(profiles)
        .values({
          userId: user.id,
          name: name || user.email?.split("@")[0] || "Usuario",
          role: invitation.role,
          tenantId: tenantId,
          activeAcademyId: invitation.defaultAcademyId || invitation.academyIds?.[0] || null,
          canLogin: true,
        })
        .returning();
    } else {
      // Update existing profile with invitation role if needed
      if (!profile.tenantId) {
        await db
          .update(profiles)
          .set({
            tenantId: invitation.tenantId,
            activeAcademyId: invitation.defaultAcademyId || invitation.academyIds?.[0] || profile.activeAcademyId,
          })
          .where(eq(profiles.id, profile.id));
      }
    }

    // Create memberships for each academy in the invitation
    const academyIds = invitation.academyIds || [];
    if (academyIds.length > 0) {
      for (const academyId of academyIds) {
        // Check if membership already exists
        const [existingMembership] = await db
          .select()
          .from(memberships)
          .where(
            and(
              eq(memberships.userId, user.id),
              eq(memberships.academyId, academyId)
            )
          )
          .limit(1);

        if (!existingMembership) {
          // Map invitation role to membership role
          // owner → owner, admin → owner (since memberships don't have admin), coach → coach, parent/athlete → viewer
          let membershipRole: "owner" | "coach" | "viewer" = "viewer";
          if (invitation.role === "owner") {
            membershipRole = "owner";
          } else if (invitation.role === "coach") {
            membershipRole = "coach";
          }
          // admin, parent, athlete → viewer

          await db.insert(memberships).values({
            userId: user.id,
            academyId: academyId,
            role: membershipRole,
          });
        }
      }
    }

    // Update invitation status
    await db
      .update(invitations)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
        supabaseUserId: user.id,
      })
      .where(eq(invitations.id, invitation.id));

    // Get the primary academy for redirect
    const primaryAcademyId = invitation.defaultAcademyId || academyIds[0];

    return apiSuccess({
      success: true,
      role: invitation.role,
      academyId: primaryAcademyId,
      redirectUrl: primaryAcademyId
        ? `/app/${primaryAcademyId}/dashboard`
        : "/dashboard/academies",
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    return handleApiError(error, { endpoint: "/api/invitations/complete", method: "POST" });
  }
}
