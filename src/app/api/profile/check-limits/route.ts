import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { profiles, subscriptions, plans } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { checkPlanLimitViolations } from "@/lib/limits";
import { sendEmail } from "@/lib/mailgun";
import { config } from "@/config";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect("/dashboard");
  }

  // Get current subscription
  const [subscription] = await db
    .select({
      planId: subscriptions.planId,
      planCode: plans.code,
    })
    .from(subscriptions)
    .leftJoin(plans, eq(subscriptions.planId, plans.id))
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  if (!subscription || !subscription.planCode) {
    return Response.json({ violations: null, requiresAction: false });
  }

  // Check for violations
  const violations = await checkPlanLimitViolations(
    user.id,
    subscription.planCode as "free" | "pro" | "premium"
  );

  // Send notification email if violations exist
  if (violations.requiresAction) {
    const adminClient = getSupabaseAdminClient();
    const { data: authUser } = await adminClient.auth.admin.getUserById(user.id);

    if (authUser?.user?.email) {
      try {
        const academyViolation = violations.violations.find((v) => v.resource === "academies");
        const athleteViolation = violations.violations.find((v) => v.resource === "athletes");
        const classViolation = violations.violations.find((v) => v.resource === "classes");
        const groupViolation = violations.violations.find((v) => v.resource === "groups");

        await sendEmail({
          to: authUser.user.email,
          subject: "⚠️ Ajustes necesarios en tu plan - GymnaSaaS",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #f59e0b;">Ajustes necesarios en tu plan</h2>
              <p>Hola ${profile.name ?? "Usuario"},</p>
              <p>Tu plan actual <strong>${subscription.planCode.toUpperCase()}</strong> tiene límites que están siendo excedidos. Para continuar usando GymnaSaaS, necesitas ajustar los siguientes recursos:</p>
              
              ${academyViolation ? `
                <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0;">
                  <h3 style="color: #92400e; margin-top: 0;">Academias</h3>
                  <p style="color: #78350f;">Tienes <strong>${academyViolation.currentCount}</strong> academias, pero tu plan solo permite <strong>${academyViolation.limit}</strong>.</p>
                  <p style="color: #78350f; font-size: 14px;">Debes elegir qué academias mantener activas.</p>
                </div>
              ` : ""}
              
              ${athleteViolation ? `
                <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0;">
                  <h3 style="color: #92400e; margin-top: 0;">Atletas</h3>
                  <p style="color: #78350f;">Tienes <strong>${athleteViolation.currentCount}</strong> atletas, pero tu plan solo permite <strong>${athleteViolation.limit}</strong>.</p>
                  <p style="color: #78350f; font-size: 14px;">Debes reducir el número de atletas activos.</p>
                </div>
              ` : ""}
              
              ${classViolation ? `
                <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0;">
                  <h3 style="color: #92400e; margin-top: 0;">Clases</h3>
                  <p style="color: #78350f;">Tienes <strong>${classViolation.currentCount}</strong> clases, pero tu plan solo permite <strong>${classViolation.limit}</strong>.</p>
                  <p style="color: #78350f; font-size: 14px;">Debes reducir el número de clases activas.</p>
                </div>
              ` : ""}
              
              ${groupViolation ? `
                <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 15px 0;">
                  <h3 style="color: #92400e; margin-top: 0;">Grupos</h3>
                  <p style="color: #78350f;">Tienes <strong>${groupViolation.currentCount}</strong> grupos, pero tu plan solo permite <strong>${groupViolation.limit}</strong>.</p>
                  <p style="color: #78350f; font-size: 14px;">Debes reducir el número de grupos activos.</p>
                </div>
              ` : ""}
              
              <div style="background-color: #dbeafe; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #1e40af; margin-top: 0;">¿Qué hacer ahora?</h3>
                <ol style="color: #1e3a8a; padding-left: 20px;">
                  <li>Visita tu <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/plan-limits" style="color: #2563eb; font-weight: bold;">panel de ajustes de plan</a></li>
                  <li>Revisa los recursos que exceden los límites</li>
                  <li>Elige qué mantener activo según tu plan</li>
                  <li>O considera <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard" style="color: #2563eb; font-weight: bold;">actualizar tu plan</a> para mantener todos tus recursos</li>
                </ol>
              </div>
              
              <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
                Si tienes alguna pregunta, contacta a nuestro equipo de soporte en ${config.mailgun.supportEmail}
              </p>
            </div>
          `,
          text: `Tu plan ${subscription.planCode.toUpperCase()} tiene límites que están siendo excedidos. Visita tu panel para ajustar los recursos.`,
          replyTo: config.mailgun.supportEmail,
        });
      } catch (error) {
        console.error("Error sending violation notification email", error);
      }
    }
  }

  return Response.json(violations);
}

