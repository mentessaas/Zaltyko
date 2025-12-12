import { NextResponse } from "next/server";
import { z } from "zod";

import { withSuperAdmin } from "@/lib/authz";
import { sendEmail } from "@/lib/mailgun";
import { config } from "@/config";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({
  profileId: z.string().uuid(),
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  type: z.enum(["email", "notification"]).default("email"),
});

export const POST = withSuperAdmin(async (request, context) => {
  const body = BodySchema.parse(await request.json());

  // Get target user profile
  const [targetProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, body.profileId))
    .limit(1);

  if (!targetProfile) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  // Get user email from Supabase Auth
  const adminClient = getSupabaseAdminClient();
  const { data: authUser } = await adminClient.auth.admin.getUserById(targetProfile.userId);

  if (!authUser?.user?.email) {
    return NextResponse.json({ error: "USER_EMAIL_NOT_FOUND" }, { status: 400 });
  }

  if (body.type === "email") {
    try {
      await sendEmail({
        to: authUser.user.email,
        subject: body.subject,
        html: `
          <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0D47A1; font-family: Poppins, sans-serif; font-weight: 700;">Mensaje de Zaltyko</h2>
            <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${body.message.replace(/\n/g, "<br>")}
            </div>
            <p style="color: #6b7280; font-size: 12px;">
              Este mensaje fue enviado por el equipo de soporte de Zaltyko.
            </p>
            <p style="color: #6b7280; font-size: 12px;">
              Si tienes alguna pregunta, puedes responder a este correo o contactarnos en ${config.mailgun.supportEmail}
            </p>
          </div>
        `,
        text: body.message,
        replyTo: config.mailgun.supportEmail,
      });

      return NextResponse.json({ ok: true, message: "Correo enviado correctamente" });
    } catch (error: any) {
      console.error("Error sending email", error);
      return NextResponse.json(
        { error: "EMAIL_SEND_FAILED", message: error?.message ?? "Error al enviar el correo" },
        { status: 500 }
      );
    }
  }

  // For notifications, we could store them in a notifications table
  // For now, we'll just send an email
  return NextResponse.json({ error: "NOTIFICATION_TYPE_NOT_IMPLEMENTED" }, { status: 400 });
});

