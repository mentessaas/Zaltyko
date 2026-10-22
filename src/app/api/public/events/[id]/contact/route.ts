import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { academies, events } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";
import { config } from "@/config";
import { escapeHtml } from "@/lib/email/escape-html";
import { sendEmailWithLogging } from "@/lib/email/email-service";
import { withRateLimit, getClientIdentifier } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const ContactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  message: z.string().min(10).max(1000),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/public/events/[id]/contact
 * 
 * Envía un formulario de contacto sobre un evento.
 * Endpoint público con rate limiting para prevenir spam.
 */
// @auth-flexible route-guard-reason: public contact form; published/public event is validated before accepting contact data.
async function contactHandler(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "INVALID_EVENT_ID" }, { status: 400 });
    }

    // Verificar que el evento existe y es público
    const [event] = await db
      .select({
        id: events.id,
        title: events.title,
        contactEmail: events.contactEmail,
        academyId: academies.id,
        tenantId: academies.tenantId,
      })
      .from(events)
      .innerJoin(academies, eq(events.academyId, academies.id))
      .where(
        and(
          eq(events.id, id),
          eq(events.isPublic, true),
          eq(events.status, "published"),
          eq(academies.isPublic, true),
          eq(academies.isSuspended, false),
          inArray(academies.status, ["active", "trial"])
        )
      )
      .limit(1);

    if (!event) {
      return NextResponse.json(
        { error: "EVENT_NOT_FOUND", message: "Evento no encontrado o no público" },
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

    const recipient = event.contactEmail || config.brevo.supportEmail;
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(phone || "No indicado");
    const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");

    await sendEmailWithLogging({
      to: recipient,
      replyTo: email,
      subject: `Nuevo contacto sobre el evento: ${event.title}`,
      text: `Nombre: ${name}\nEmail: ${email}\nTeléfono: ${phone || "No indicado"}\n\n${message}`,
      html: `<h2>Nuevo contacto sobre el evento</h2><p><strong>Evento:</strong> ${escapeHtml(event.title)}</p><p><strong>Nombre:</strong> ${safeName}</p><p><strong>Email:</strong> ${safeEmail}</p><p><strong>Teléfono:</strong> ${safePhone}</p><p><strong>Mensaje:</strong><br />${safeMessage}</p>`,
      template: "public-event-contact",
      tenantId: event.tenantId,
      academyId: event.academyId,
    });

    // Registrar solo metadatos mínimos; nunca almacenar PII ni el contenido.
    logger.info("Event contact form submitted", {
      eventId: id,
      eventTitle: event.title,
    });

    return NextResponse.json({
      success: true,
      message: "Tu mensaje ha sido enviado. Los organizadores te contactarán pronto.",
    });
  } catch (error) {
    return handleApiError(error, { endpoint: "/api/public/events/[id]/contact", method: "POST" });
  }
}

// Aplicar rate limiting: máximo 5 requests por minuto por IP
export const POST = async (request: Request, context: RouteContext) => {
  return withRateLimit(
    async (req: Request) => {
      return await contactHandler(req, context);
    },
    {
      identifier: getClientIdentifier,
    }
  )(request as any);
};
