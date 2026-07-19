export const dynamic = 'force-dynamic';

import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { academies, profiles } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";
import { authUsers } from "@/db/schema";
import { sendEmail } from "@/lib/brevo";
import { config } from "@/config";
import { escapeHtml } from "@/lib/email/escape-html";
import { withRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const ContactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().min(10).max(1000),
});

/**
 * POST /api/public/academies/[id]/contact
 * 
 * Envía un formulario de contacto a una academia.
 * Endpoint público con rate limiting para prevenir spam.
 * 
 * Body:
 * - name: Nombre del contacto
 * - email: Email del contacto
 * - phone: Teléfono (opcional)
 * - message: Mensaje
 */
async function contactHandler(request: Request, context?: { params?: Promise<{ id: string }> }) {
  try {
    const params = context?.params ? await context.params : { id: new URL(request.url).pathname.split('/').pop() || '' };
    const { id } = params;

    // Verificar que la academia existe y es pública
    const [academy] = await db
      .select({
        id: academies.id,
        name: academies.name,
        ownerId: academies.ownerId,
      })
      .from(academies)
      .where(
        and(
          eq(academies.id, id),
          eq(academies.isPublic, true),
          eq(academies.isSuspended, false)
        )
      )
      .limit(1);

    if (!academy) {
      return NextResponse.json(
        { error: "ACADEMY_NOT_FOUND", message: "Academia no encontrada o no pública" },
        { status: 404 }
      );
    }

    // Parsear y validar body
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "INVALID_JSON", message: "El cuerpo de la solicitud no es JSON válido" },
        { status: 400 }
      );
    }

    const parsed = ContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Los datos proporcionados no son válidos",
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { name, email, phone, message } = parsed.data;

    // Obtener email del propietario de la academia desde Supabase Auth
    const [ownerProfile] = await db
      .select({
        name: profiles.name,
        email: authUsers.email,
      })
      .from(profiles)
      .innerJoin(authUsers, eq(authUsers.id, profiles.userId))
      .where(eq(profiles.id, academy.ownerId))
      .limit(1);

    const recipient = ownerProfile?.email || config.brevo.supportEmail;
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(phone || "No indicado");
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");

    await sendEmail({
      to: recipient,
      replyTo: email,
      subject: `Nuevo contacto para ${academy.name}`,
      text: `Academia: ${academy.name}\nNombre: ${name}\nEmail: ${email}\nTeléfono: ${phone || "No indicado"}\n\n${message}`,
      html: `<h2>Nuevo contacto para ${escapeHtml(academy.name)}</h2><p><strong>Nombre:</strong> ${safeName}</p><p><strong>Email:</strong> ${safeEmail}</p><p><strong>Teléfono:</strong> ${safePhone}</p><p><strong>Mensaje:</strong><br />${safeMessage}</p>`,
    });

    // Log del contacto (opcional, para debugging)
    logger.info("Contact form submitted", {
      academyId: id,
      academyName: academy.name,
      contactName: name,
      contactEmail: email,
      contactPhone: phone,
      message,
      ownerName: ownerProfile?.name,
    });

    return NextResponse.json({
      success: true,
      message: "Tu mensaje ha sido enviado. La academia te contactará pronto.",
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/public/academies/[id]/contact", method: "POST" });
  }
}

// Aplicar rate limiting: máximo 5 requests por minuto por IP
export const POST = async (request: Request, context: { params: Promise<{ id: string }> }) => {
  return withRateLimit(
    async (req: Request) => {
      return await contactHandler(req, { params: context.params });
    },
    {
      identifier: getClientIdentifier,
    }
  )(request as any, { params: context.params });
};
