import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, profiles, subscriptions, plans } from "@/db/schema";
import { withTenant } from "@/lib/authz";
import { checkPlanLimitViolations } from "@/lib/limits";
import { sendEmail } from "@/lib/mailgun";
import { config } from "@/config";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({
  academyIdsToKeep: z.array(z.string().uuid()).optional(),
});

export const POST = withTenant(async (request, context) => {
  const body = BodySchema.parse(await request.json());

  if (!context.profile) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // Get user's current subscription
  const [subscription] = await db
    .select({
      planId: subscriptions.planId,
      planCode: plans.code,
    })
    .from(subscriptions)
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, context.profile.userId))
    .limit(1);

  if (!subscription || !subscription.planCode) {
    return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 400 });
  }

  // Check violations for current plan
  const violations = await checkPlanLimitViolations(
    context.profile.userId,
    subscription.planCode as "free" | "pro" | "premium"
  );

  if (!violations.requiresAction) {
    return NextResponse.json({ ok: true, message: "No se requieren acciones" });
  }

  // Handle academy limit violations
  const academyViolation = violations.violations.find((v) => v.resource === "academies");
  if (academyViolation && body.academyIdsToKeep) {
    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, context.profile.userId))
      .limit(1);

    if (profile) {
      // Get all owned academies
      const ownedAcademies = await db
        .select({ id: academies.id })
        .from(academies)
        .where(eq(academies.ownerId, profile.id));

      // Deactivate academies not in the keep list
      const academiesToDeactivate = ownedAcademies
        .filter((a) => !body.academyIdsToKeep!.includes(a.id))
        .map((a) => a.id);

      if (academiesToDeactivate.length > 0) {
        // Update activeAcademyId if it's being deactivated
        const currentActiveAcademy = ownedAcademies.find((a) => a.id === context.profile.activeAcademyId);
        if (currentActiveAcademy && academiesToDeactivate.includes(currentActiveAcademy.id)) {
          // Set first kept academy as active
          if (body.academyIdsToKeep.length > 0) {
            await db
              .update(profiles)
              .set({ activeAcademyId: body.academyIdsToKeep[0] })
              .where(eq(profiles.id, profile.id));
          } else {
            await db
              .update(profiles)
              .set({ activeAcademyId: null })
              .where(eq(profiles.id, profile.id));
          }
        }

        // Note: We're not deleting academies, just marking them as inactive
        // In a real system, you might want to add an `isActive` field to academies
        // For now, we'll just update the activeAcademyId
      }
    }
  }

  // Send notification email
  const adminClient = getSupabaseAdminClient();
  const { data: authUser } = await adminClient.auth.admin.getUserById(context.profile.userId);

  if (authUser?.user?.email) {
    try {
      await sendEmail({
        to: authUser.user.email,
        subject: "Ajustes de plan completados - Zaltyko",
        html: `
          <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0D47A1; font-family: Poppins, sans-serif; font-weight: 700;">Cambio de plan completado</h2>
            <p>Hola ${context.profile.name ?? "Usuario"},</p>
            <p>Has completado los ajustes necesarios para tu plan ${subscription.planCode.toUpperCase()}.</p>
            ${academyViolation && body.academyIdsToKeep ? `
              <p>Se han mantenido activas las siguientes academias:</p>
              <ul>
                ${body.academyIdsToKeep.map((id) => `<li>${id}</li>`).join("")}
              </ul>
            ` : ""}
            <p>Puedes continuar usando Zaltyko normalmente.</p>
            <p>Si tienes alguna pregunta, contacta a nuestro equipo de soporte.</p>
          </div>
        `,
        text: `Has completado los ajustes necesarios para tu plan ${subscription.planCode.toUpperCase()}. Puedes continuar usando Zaltyko normalmente.`,
        replyTo: config.mailgun.supportEmail,
      });
    } catch (error) {
      console.error("Error sending notification email", error);
    }
  }

  return NextResponse.json({ ok: true, message: "Ajustes aplicados correctamente" });
});

