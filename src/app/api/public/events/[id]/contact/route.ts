import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { events } from "@/db/schema";
import { handleApiError } from "@/lib/api-error-handler";
import { withRateLimit, getClientIdentifier } from "@/lib/rate-limit";

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
async function contactHandler(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Verificar que el evento existe y es público
    const [event] = await db
      .select({
        id: events.id,
        title: events.title,
        contactEmail: events.contactEmail,
      })
      .from(events)
      .where(
        and(
          eq(events.id, id),
          eq(events.isPublic, true)
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

    // TODO: Integrar con servicio de email (Mailgun, SendGrid, etc.)
    // Por ahora, solo retornamos éxito
    // En producción, aquí se enviaría el email al organizador del evento

    // Log del contacto (opcional, para debugging)
    console.log("Event contact form submitted:", {
      eventId: id,
      eventTitle: event.title,
      contactName: name,
      contactEmail: email,
      contactPhone: phone,
      message,
      eventContactEmail: event.contactEmail,
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

